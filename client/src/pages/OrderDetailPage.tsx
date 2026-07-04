import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
    ArrowLeft,
    ShoppingBag,
    FileText,
    Layers,
    RefreshCcw,
    Heart,
    Printer,
    Sparkles,
    CreditCard,
    ThumbsUp,
    Loader2,
    XCircle,
    Plus,
    Calendar,
    Clock,
    Hash,
    Search,
    Image as ImageIcon,
    DollarSign,
    CheckCircle2,
    Info,
    Send
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import type { DropResult } from '@hello-pangea/dnd';

import { orderItemsApi, requestsApi } from '@/lib/api';
import { uploadFile } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

import { useAuth } from '@/contexts/AuthContext';
import { useOrders } from '@/hooks/useOrders';
import { useViewActionForRoles } from '@/hooks/useViewAction';
import type { OrderItem } from '@/hooks/useOrders';
import { useDepartments } from '@/hooks/useDepartments';
import { useUsers } from '@/hooks/useUsers';

// Direct imports from files to avoid circularity via index.ts
import { useOrderDetail } from './OrderDetailPage/hooks/useOrderDetail';
import { useOrderActions } from './OrderDetailPage/hooks/useOrderActions';
import { useWorkflowKanban } from './OrderDetailPage/hooks/useWorkflowKanban';
import { DetailTab } from './OrderDetailPage/tabs/DetailTab';
import { SalesTab } from './OrderDetailPage/tabs/SalesTab';
import { WorkflowTab } from './OrderDetailPage/tabs/WorkflowTab';
import { AftersaleTab } from './OrderDetailPage/tabs/AftersaleTab';
import { CareTab } from './OrderDetailPage/tabs/CareTab';
import { TECH_ROOMS } from '@/components/orders/constants';
import { columns, getAfterSaleStageLabel, getCareWarrantyStageLabel } from './OrderDetailPage/constants';
import { getStatusVariant, getSLADisplay } from './OrderDetailPage/utils';
import { cn } from '@/lib/utils';

// Specific Dialogs
import { PrintQRDialog } from '@/components/orders/PrintQRDialog';
import { PrintThermalInvoiceDialog } from '@/components/orders/PrintThermalInvoiceDialog';
import { PaymentDialog } from '@/components/orders/PaymentDialog';
import { PaymentRecordDialog } from '@/components/orders/PaymentRecordDialog';
import { AssignTechnicianDialog } from './OrderDetailPage/dialogs/AssignTechnicianDialog';
import { AssignSalesPersonDialog } from './OrderDetailPage/dialogs/AssignSalesPersonDialog';
import { MoveStepDialog } from '@/components/orders/workflow/MoveStepDialog';
import { FailDialog } from '@/components/orders/workflow/FailDialog';
import { ConfirmDoneDialog } from '@/components/orders/workflow/ConfirmDoneDialog';
import { ProductDetailDialog } from './OrderDetailPage/dialogs/ProductDetailDialog';
import { UpsellDialog } from '@/components/orders/UpsellDialog';
import { OrderDetailMobileHeader } from './OrderDetailPage/components/OrderDetailMobileHeader';

const toNumberOrNull = (value: unknown): number | null => {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};

const getOrderPaymentRecords = (order: any): any[] => {
    if (Array.isArray(order?.payments)) return order.payments;
    if (Array.isArray(order?.payment_records)) return order.payment_records;
    if (Array.isArray(order?.transactions)) return order.transactions;
    return [];
};

const resolveOrderPaidAmount = (order: any): number => {
    const paymentRecords = getOrderPaymentRecords(order);
    const paidFromRecords = paymentRecords.reduce((sum: number, record: any) => {
        const amount = toNumberOrNull(record?.amount ?? record?.payment_amount ?? record?.paid_amount);
        return sum + (amount ?? 0);
    }, 0);

    const totalAmount = toNumberOrNull(order?.total_amount) ?? 0;
    const remainingDebt = toNumberOrNull(order?.remaining_debt);
    const paidFromRemaining = remainingDebt !== null ? Math.max(0, totalAmount - remainingDebt) : null;

    const candidates = [
        toNumberOrNull(order?.paid_amount),
        toNumberOrNull(order?.total_paid),
        toNumberOrNull(order?.amount_paid),
        paidFromRemaining,
        paidFromRecords,
    ].filter((value): value is number => value !== null);

    if (candidates.length === 0) return 0;
    return Math.max(0, ...candidates);
};

const resolveOrderRemainingDebt = (order: any, paidAmount: number): number => {
    const explicitRemainingDebt = toNumberOrNull(order?.remaining_debt);
    if (explicitRemainingDebt !== null) return explicitRemainingDebt;

    const totalAmount = toNumberOrNull(order?.total_amount) ?? 0;
    return Math.max(0, totalAmount - paidAmount);
};

export function PhotoUpload({ label, value, onChange, disabled }: { label: string; value: string[]; onChange: (urls: string[]) => void; disabled?: boolean }) {
    const [uploading, setUploading] = useState(false);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        setUploading(true);
        try {
            const uploadedUrls: string[] = [];
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const { url, error } = await uploadFile('orders', 'accessories', file);
                if (error) throw error;
                if (url) uploadedUrls.push(url);
            }
            onChange([...value, ...uploadedUrls]);
            toast.success('Đã tải ảnh lên thành công');
        } catch (error) {
            console.error('Upload error:', error);
            toast.error('Lỗi upload ảnh');
        } finally {
            setUploading(false);
        }
    };

    const removePhoto = (index: number) => {
        const newValue = [...value];
        newValue.splice(index, 1);
        onChange(newValue);
    };

    return (
        <div className="space-y-2">
            <Label className="text-[11px] font-bold text-slate-500 uppercase tracking-tight">{label}</Label>
            <div className="grid grid-cols-4 gap-2">
                {value?.map((url, i) => (
                    <div key={i} className="group relative aspect-square rounded-lg overflow-hidden border bg-white shadow-sm">
                        <img src={url} alt="" className="w-full h-full object-cover" />
                        {!disabled && (
                            <button onClick={() => removePhoto(i)} className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Plus className="w-3 h-3 rotate-45" />
                            </button>
                        )}
                    </div>
                ))}
                {!disabled && (
                    <label className={`aspect-square rounded-lg border-2 border-dashed border-slate-200 flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
                        {uploading ? <Loader2 className="w-5 h-5 animate-spin text-primary" /> : <ImageIcon className="w-6 h-6 text-slate-300" />}
                        <span className="text-[10px] font-medium text-slate-400 mt-1">Tải ảnh</span>
                        <input type="file" multiple accept="image/*" className="hidden" onChange={handleFileChange} />
                    </label>
                )}
            </div>
        </div>
    );
}

export function OrderDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const location = useLocation();
    const { user } = useAuth();
    const { fetchOrders } = useOrders();

    // Custom Hooks
    const {
        order,
        loading,
        allWorkflowSteps,
        stepsLoading,
        productStatusSummary,
        setProductStatusSummary,
        salesLogs,
        workflowLogs,
        aftersaleLogs,
        careLogs,
        reloadOrder,
        fetchKanbanLogs,
    } = useOrderDetail(id);

    const {
        updateOrderItemStatus,
        updateOrderStatus,
        updateOrderAfterSale,
        updateItemAfterSaleData,
        handleApproveOrder,
        handlePaymentSuccess,
    } = useOrderActions(id, fetchOrders, reloadOrder);

    const {
        getItemCurrentStep,
        getGroupCurrentTechRoom,
        workflowKanbanGroups,
        getStepDeadlineDisplay,
    } = useWorkflowKanban(order, allWorkflowSteps, salesLogs);

    const totalCount = React.useMemo(() => {
        return workflowKanbanGroups?.length || 0;
    }, [workflowKanbanGroups]);

    const salesCount = React.useMemo(() => {
        return workflowKanbanGroups?.filter(g => {
            const leadItem = g.product || g.services?.[0];
            return (leadItem as any)?.current_phase === 'sales';
        }).length || 0;
    }, [workflowKanbanGroups]);

    const workflowCount = React.useMemo(() => {
        return workflowKanbanGroups?.filter(g => {
            const leadItem = g.product || g.services?.[0];
            return (leadItem as any)?.current_phase === 'workflow';
        }).length || 0;
    }, [workflowKanbanGroups]);

    const aftersaleCount = React.useMemo(() => {
        return workflowKanbanGroups?.filter(g => {
            const leadItem = g.product || g.services?.[0];
            return (leadItem as any)?.current_phase === 'after_sale';
        }).length || 0;
    }, [workflowKanbanGroups]);

    const careCount = React.useMemo(() => {
        return workflowKanbanGroups?.filter(g => {
            const leadItem = g.product || g.services?.[0];
            return (leadItem as any)?.current_phase === 'care' || (leadItem as any)?.current_phase === 'warranty';
        }).length || 0;
    }, [workflowKanbanGroups]);

    // Dialog & UI States
    const [activeTab, setActiveTab] = useState('detail');
    const [showPrintDialog, setShowPrintDialog] = useState(false);
    const [showInvoicePrintDialog, setShowInvoicePrintDialog] = useState(false);
    const [showPaymentDialog, setShowPaymentDialog] = useState(false);
    const [showPaymentRecordDialog, setShowPaymentRecordDialog] = useState(false);

    const [showAssignDialog, setShowAssignDialog] = useState(false);
    const [showSaleAssignDialog, setShowSaleAssignDialog] = useState(false);
    const [selectedItem, setSelectedItem] = useState<OrderItem | null>(null);

    const [showAccessoryDialog, setShowAccessoryDialog] = useState(false);
    const [accessoryItem, setAccessoryItem] = useState<OrderItem | null>(null);
    const [newItemName, setNewItemName] = useState('');
    const [newItemQuantity, setNewItemQuantity] = useState('1');
    const [newItemPrice, setNewItemPrice] = useState('');
    const [newItemOrderCode, setNewItemOrderCode] = useState('');
    const [newItemNotes, setNewItemNotes] = useState('');
    const [newItemPhotos, setNewItemPhotos] = useState<string[]>([]);
    const [accessoryLoading, setAccessoryLoading] = useState(false);

    const [showPartnerDialog, setShowPartnerDialog] = useState(false);
    const [partnerItem, setPartnerItem] = useState<OrderItem | null>(null);
    const [, setPartnerStatus] = useState('');
    const [partnerNotes, setPartnerNotes] = useState('');
    const [partnerLoading, setPartnerLoading] = useState(false);

    const [showExtensionDialog, setShowExtensionDialog] = useState(false);
    const [extensionItem, setExtensionItem] = useState<OrderItem | null>(null);
    const [extensionReason, setExtensionReason] = useState('');
    const [extensionCustomerResult] = useState('');
    const [extensionNewDueAt, setExtensionNewDueAt] = useState('');
    const [extensionValidReason] = useState(false);
    const [extensionLoading, setExtensionLoading] = useState(false);

    // Step confirm states
    const [showMoveStepDialog, setShowMoveStepDialog] = useState(false);
    const [moveStepItemId, setMoveStepItemId] = useState<string>('');
    const [moveStepTargetRoom, setMoveStepTargetRoom] = useState<any>({});
    const [moveStepInitialTechId, setMoveStepInitialTechId] = useState<string>('');
    const [showFailDialog, setShowFailDialog] = useState(false);
    const [failItemId, setFailItemId] = useState<string>('');
    const [showConfirmDoneDialog, setShowConfirmDoneDialog] = useState(false);
    const [confirmDoneItemIds, setConfirmDoneItemIds] = useState<string[]>([]);
    const [isV2ServiceForDone, setIsV2ServiceForDone] = useState(false);

    const [showProductDialog, setShowProductDialog] = useState(false);
    const [showUpsellDialog, setShowUpsellDialog] = useState(false);
    const [selectedProductGroup, setSelectedProductGroup] = useState<any>(null);
    const [currentRoomId, setCurrentRoomId] = useState('');
    const [highlightMessageId, setHighlightMessageId] = useState<string | undefined>(undefined);
    // Pending move callback: được set khi drag fail validation — sau khi user confirm dialog sẽ tự chuyển trạng thái
    const [pendingMoveCallback, setPendingMoveCallback] = useState<(() => Promise<void>) | null>(null);
    const [isPhoneView, setIsPhoneView] = useState<boolean>(() => window.innerWidth < 768);

    // Departments and Technicians/Sales
    const { fetchDepartments } = useDepartments();
    const { technicians, salesPersons, fetchTechnicians, fetchSales } = useUsers();
    const { canEdit: canEditOrder } = useViewActionForRoles('orders', [
        'admin',
        'manager',
        'accountant',
        'sale',
    ]);

    useEffect(() => {
        if (!id) {
            navigate('/orders');
            return;
        }
        fetchTechnicians();
        fetchSales();
        fetchDepartments();

        // Set active tab from navigation state if present
        const stateTab = (location.state as any)?.activeTab;
        if (stateTab) {
            setActiveTab(stateTab);
        }
    }, [id, navigate, fetchTechnicians, fetchSales, fetchDepartments, location.state]);

    useEffect(() => {
        const onResize = () => setIsPhoneView(window.innerWidth < 768);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    // Tab switching logic for completed orders
    useEffect(() => {
        // Only auto-switch to aftersale if we just COMPLETED the items (handled in ConfirmDoneDialog onSuccess)
        // No longer forcing users out of workflow tab if status is done, so they can view history.
    }, [order?.status, activeTab]);

    // Fetch product status summary for V2 products
    useEffect(() => {
        const fetchProductStatusSummary = async () => {
            if (!order?.items) return;
            const v2Product = order.items.find((item: any) =>
                item.is_customer_item && item.item_type === 'product'
            );
            if (!v2Product || !v2Product.id) return;

            try {
                // Assuming orderProductsApi exists
                // const response = await orderProductsApi.getStatusSummary(v2Product.id);
                // if (response.data?.data) {
                //     setProductStatusSummary(response.data.data);
                // }
            } catch (error) {
                console.error('Error fetching status summary:', error);
            }
        };
        fetchProductStatusSummary();
    }, [order?.items, setProductStatusSummary]);

    // Auto-open product dialog from mention notification navigation state
    useEffect(() => {
        const chatState = (location.state as any)?.openChat;
        if (!chatState || !order || !workflowKanbanGroups.length) return;

        const { entityId, roomId, messageId } = chatState;
        // Find the matching group by entity id
        const group = workflowKanbanGroups.find((g: any) =>
            g.product?.id === entityId ||
            g.services?.some((s: any) => s.id === entityId)
        );
        if (group) {
            setSelectedProductGroup(group);
            setCurrentRoomId(roomId || '');
            setHighlightMessageId(messageId);
            setShowProductDialog(true);
            // Clear the navigation state so dialog doesn't re-open on refresh
            navigate(location.pathname, { replace: true, state: {} });
        }
    }, [location.state, order, workflowKanbanGroups]);

    useEffect(() => {
        if (showProductDialog && selectedProductGroup && workflowKanbanGroups.length > 0) {
            const groupId = selectedProductGroup.product?.id || selectedProductGroup.services?.[0]?.id;
            const currentGroup = workflowKanbanGroups.find(g =>
                (g.product?.id === groupId) ||
                (g.services && g.services.length > 0 && g.services[0].id === groupId)
            );
            if (currentGroup) {
                setSelectedProductGroup(currentGroup);
            }
        }
    }, [workflowKanbanGroups, showProductDialog]);

    // Handlers
    const handleOpenAssignDialog = (item: OrderItem) => {
        setSelectedItem(item);
        setShowAssignDialog(true);
    };

    const handleOpenSaleAssignDialog = (item: OrderItem) => {
        setSelectedItem(item);
        setShowSaleAssignDialog(true);
    };

    const handleSubmitAccessory = async () => {
        if (!accessoryItem || !order) return;
        if (!newItemName.trim()) {
            toast.error('Vui lòng nhập tên linh kiện / sản phẩm');
            return;
        }

        setAccessoryLoading(true);
        try {
            let order_item_id = undefined;
            let order_product_id = undefined;
            let order_product_service_id = undefined;

            if ((accessoryItem as any).is_customer_item) {
                if ((accessoryItem as any).item_type === 'product') {
                    order_product_id = accessoryItem.id;
                } else {
                    order_product_service_id = accessoryItem.id;
                    order_product_id = (accessoryItem as any).order_product_id || (accessoryItem as any).order_product?.id;
                }
            } else {
                order_item_id = accessoryItem.id;
            }

            const payload = {
                status: 'requested',
                notes: newItemNotes,
                metadata: {
                    item_name: newItemName,
                    quantity: newItemQuantity,
                    price_estimate: newItemPrice,
                    photos: newItemPhotos,
                    order_code: newItemOrderCode || order.order_code,
                    order_product_id,
                    order_product_code: (accessoryItem as any).product_code || (accessoryItem as any).order_product?.product_code,
                },
                order_item_id,
                order_product_id,
                order_product_service_id
            };

            await requestsApi.createAccessory(payload);
            toast.success('Đã tạo yêu cầu mua phụ kiện');
            await reloadOrder();
            setShowAccessoryDialog(false);
        } catch (e: any) {
            toast.error(e?.response?.data?.message || 'Lỗi tạo yêu cầu');
        } finally {
            setAccessoryLoading(false);
        }
    };

    const handleOpenAccessory = (item: OrderItem) => {
        setAccessoryItem(item);
        setNewItemName('');
        setNewItemQuantity('1');
        setNewItemPrice('');
        setNewItemNotes('');
        setNewItemPhotos([]);

        let relatedCode = order?.order_code || '';
        if ((item as any).product?.product_code) {
            relatedCode = (item as any).product.product_code;
        } else if (item.item_code) {
            relatedCode = item.item_code;
        } else if ((item as any).order_product?.product_code) {
            relatedCode = (item as any).order_product.product_code;
        }

        setNewItemOrderCode(relatedCode);
        setShowAccessoryDialog(true);
    };

    const handleOpenPartner = (item: OrderItem) => {
        setPartnerItem(item);
        setPartnerStatus((item as any).partner?.status || 'ship_to_partner');
        setPartnerNotes((item as any).partner?.status === 'rejected' ? '' : ((item as any).partner?.notes || ''));
        setShowPartnerDialog(true);
    };

    const handleSubmitPartner = async () => {
        if (!partnerItem || !order) return;
        setPartnerLoading(true);
        try {
            let order_product_id: string | undefined;
            if ((partnerItem as any).is_customer_item) {
                if ((partnerItem as any).item_type === 'product') {
                    order_product_id = partnerItem.id;
                } else {
                    order_product_id =
                        (partnerItem as any).order_product_id || (partnerItem as any).order_product?.id;
                }
            }

            await orderItemsApi.updatePartner(partnerItem.id, {
                status: 'requested',
                notes: partnerNotes || undefined,
                metadata: {
                    item_name: partnerItem.item_name,
                    order_code: order.order_code,
                    order_product_id,
                    order_product_code:
                        (partnerItem as any).product_code || (partnerItem as any).order_product?.product_code,
                },
            });
            toast.success('Đã cập nhật trạng thái gửi đối tác');
            await reloadOrder();
            setShowPartnerDialog(false);
        } catch (e: any) {
            toast.error(e?.response?.data?.message || 'Lỗi cập nhật');
        } finally {
            setPartnerLoading(false);
        }
    };

    const handleOpenExtension = (item: OrderItem | any) => {
        const currentRequest = (item as any).extension_request;
        setExtensionItem(item);
        setExtensionReason(currentRequest?.status === 'rejected' ? '' : (currentRequest?.reason || ''));
        setExtensionNewDueAt(currentRequest?.status === 'rejected' ? '' : (currentRequest?.new_due_at ? currentRequest.new_due_at.slice(0, 16) : ''));
        setShowExtensionDialog(true);
    };

    const handleSubmitExtension = async () => {
        if (!order?.id || !extensionItem) return;
        setExtensionLoading(true);
        try {
            const currentRequest = (extensionItem as any).extension_request;

            if (currentRequest?.id && currentRequest.status !== 'rejected') {
                const payload: any = {};
                if (user?.role === 'sale' || user?.role === 'manager' || user?.role === 'admin') {
                    payload.customer_result = extensionCustomerResult;
                    if (extensionCustomerResult) payload.status = 'sale_contacted';
                }
                if (user?.role === 'manager' || user?.role === 'admin') {
                    if (extensionNewDueAt) payload.new_due_at = new Date(extensionNewDueAt).toISOString();
                    payload.valid_reason = extensionValidReason;
                    if (extensionNewDueAt) payload.status = 'manager_approved';
                }
                await requestsApi.updateExtension(currentRequest.id, payload);
                toast.success('Đã cập nhật yêu cầu gia hạn');
            } else {
                if (!extensionReason.trim()) {
                    toast.error('Vui lòng chọn hoặc nhập lý do gia hạn');
                    setExtensionLoading(false);
                    return;
                }
                if (!extensionNewDueAt) {
                    toast.error('Vui lòng chọn thời gian đề xuất gia hạn');
                    setExtensionLoading(false);
                    return;
                }

                const extensionData = {
                    reason: extensionReason.trim(),
                    new_due_at: new Date(extensionNewDueAt).toISOString()
                };

                await orderItemsApi.createExtensionRequest(extensionItem.id, extensionData);

                toast.success('Đã gửi yêu cầu gia hạn.');
            }
            await reloadOrder();
            setShowExtensionDialog(false);
        } catch (e: any) {
            toast.error(e?.response?.data?.message || 'Lỗi gửi yêu cầu gia hạn');
        } finally {
            setExtensionLoading(false);
        }
    };

    const onWorkflowDragEnd = (result: DropResult) => {
        if (!result.destination || result.destination.droppableId === result.source.droppableId) return;

        const draggableId = result.draggableId;
        const targetRoomId = result.destination.droppableId;

        const group = workflowKanbanGroups.find(g => (g.product?.id ?? g.services.map(s => s.id).join('-')) === draggableId);
        if (!group) return;

        const leadItem = group.services.find((s) => getItemCurrentStep(s.id)) ?? group.services[0];
        if (!leadItem) return;

        if (targetRoomId === 'done') {
            const itemIds = [...group.services.map(s => s.id)];
            if (group.product?.id) itemIds.push(group.product.id);
            setConfirmDoneItemIds(itemIds);
            setIsV2ServiceForDone(group.services.some(s => s.item_type === 'service' || s.item_type === 'package'));
            setShowConfirmDoneDialog(true);
        } else if (targetRoomId === 'fail') {
            setFailItemId(leadItem.id);
            setShowFailDialog(true);
        } else {
            const room = [...TECH_ROOMS].find(r => r.id === targetRoomId);
            if (room) {
                setMoveStepItemId(leadItem.id);
                setMoveStepTargetRoom(room);
                const currentStep = getItemCurrentStep(leadItem.id);
                setMoveStepInitialTechId(currentStep?.technician_id || '');
                setShowMoveStepDialog(true);
            }
        }
    };

    const handleOpenProductDialog = (group: any, roomId: string) => {
        setSelectedProductGroup(group);
        setCurrentRoomId(roomId);
        setPendingMoveCallback(null); // xóa pending move khi mở dialog bình thường
        setShowProductDialog(true);
    };

    /** Mở ProductDetailDialog kèm callback move — sau khi user xác nhận, card tự chuyển và dialog tự đóng */
    const handleOpenProductDialogWithMove = (group: any, roomId: string, moveCallback: () => Promise<void>) => {
        setSelectedProductGroup(group);
        setCurrentRoomId(roomId);
        setPendingMoveCallback(() => moveCallback); // store callback in state
        setShowProductDialog(true);
    };

    if (loading) {
        return (
            <div className="min-h-[60vh] flex items-center justify-center">
                <div className="text-center">
                    <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
                    <p className="mt-4 text-muted-foreground">Đang tải thông tin đơn hàng...</p>
                </div>
            </div>
        );
    }

    if (!order) {
        return (
            <div className="min-h-[60vh] flex items-center justify-center">
                <div className="text-center">
                    <XCircle className="h-16 w-16 text-red-400 mx-auto mb-4" />
                    <h2 className="text-xl font-semibold mb-2">Không tìm thấy đơn hàng</h2>
                    <Button onClick={() => navigate('/orders')}>Quay lại</Button>
                </div>
            </div>
        );
    }

    const canApproveOrder =
        (user?.role === 'manager' || user?.role === 'admin') &&
        !!order.items?.some((item) => (item as { status?: string }).status === 'step4');

    const resolvedPaidAmount = resolveOrderPaidAmount(order);
    const resolvedRemainingDebt = resolveOrderRemainingDebt(order, resolvedPaidAmount);
    const resolvedPaymentStatus = resolvedRemainingDebt <= 0
        ? 'paid'
        : resolvedPaidAmount > 0
            ? 'partial'
            : 'unpaid';

    const pendingEditApprovalFromState = Boolean((location.state as any)?.pendingEditApproval);

    const accessoryRejectionReason =
        (accessoryItem as any)?.accessory?.status === 'rejected'
            ? ((accessoryItem as any)?.accessory?.notes || 'Không có lý do')
            : '';
    const partnerRejectionReason =
        (partnerItem as any)?.partner?.status === 'rejected'
            ? ((partnerItem as any)?.partner?.notes || 'Không có lý do')
            : '';
    const activeExtensionRequest = (extensionItem as any)?.extension_request || order.extension_request;
    const extensionRejected = activeExtensionRequest?.status === 'rejected';
    const extensionRejectionReason = extensionRejected
        ? (activeExtensionRequest?.customer_result || activeExtensionRequest?.reason || 'Không có lý do')
        : '';
    const canCreateExtensionRequest = !activeExtensionRequest || extensionRejected;

    const hasPendingOrderEditApproval = (() => {
        if (pendingEditApprovalFromState) return true;

        const editStatus =
            (order as any)?.edit_request_status ||
            (order as any)?.edit_status ||
            (order as any)?.metadata?.edit_request_status ||
            (order as any)?.metadata?.order_edit_status;

        if (typeof editStatus === 'string') {
            const normalizedStatus = editStatus.toLowerCase();
            if (['pending', 'requested', 'waiting_approval', 'waiting_manager_approval'].includes(normalizedStatus)) {
                return true;
            }
        }

        const pendingTickets = (order as any)?.pending_tickets || (order as any)?.upsell_tickets || (order as any)?.tickets;
        if (!Array.isArray(pendingTickets)) return false;

        return pendingTickets.some((ticket: any) => {
            const status = (ticket?.status || ticket?.ticket_status || '').toLowerCase();
            const type = (
                ticket?.ticket_type ||
                ticket?.type ||
                ticket?.request_type ||
                ticket?.data?.ticket_type ||
                ticket?.data?.request_type ||
                ticket?.data?.flow_type ||
                ticket?.data?.flow ||
                ''
            ).toLowerCase();

            return status === 'pending' && ['order_edit', 'edit_order', 'order_update'].includes(type);
        });
    })();

    const handleOpenOrderEdit = () => {
        if (hasPendingOrderEditApproval) {
            toast.warning('Đơn đang chờ quản lý duyệt sửa. Vui lòng liên hệ quản lý để tiếp tục.');
            return;
        }

        navigate(`/orders/${order.id}/edit`, {
            state: {
                requireManagerApprovalAfterEdit: true,
                requestType: 'order_edit',
                existingPaidAmount: resolvedPaidAmount,
                existingPaymentMethod: (order as any)?.payment_method
            }
        });
    };

    return (
        <div className="animate-fade-in w-full min-w-0 max-w-full space-y-0 overflow-x-hidden bg-muted/30 md:space-y-6 md:bg-transparent">
            <OrderDetailMobileHeader
                order={order}
                canEdit={canEditOrder}
                canApprove={!!canApproveOrder}
                onUpsell={() => setShowUpsellDialog(true)}
                onPrintQr={() => setShowPrintDialog(true)}
                onPrintInvoice={() => setShowInvoicePrintDialog(true)}
                onEdit={handleOpenOrderEdit}
                onPayment={() => setShowPaymentRecordDialog(true)}
                onApprove={() => handleApproveOrder(order)}
            />

            {/* Header — desktop */}
            <div className="hidden md:flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start sm:items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="-ml-2 shrink-0">
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div>
                        <h1 className="text-xl sm:text-2xl font-bold flex flex-wrap items-center gap-2 sm:gap-3">
                            <ShoppingBag className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
                            <span className="truncate max-w-[200px] sm:max-w-none">{order.order_code}</span>
                            <Badge variant={getStatusVariant(order.status) as any}>
                                {columns.find(c => c.id === order.status)?.title || order.status}
                            </Badge>
                        </h1>
                        <div className="text-muted-foreground text-sm flex items-center gap-2">
                            <span>Chi tiết đơn hàng</span>
                        </div>
                        {hasPendingOrderEditApproval && (
                            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                                <Clock className="h-3.5 w-3.5" />
                                Đơn đang chờ quản lý duyệt yêu cầu sửa
                            </div>
                        )}
                    </div>
                </div>
                <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                    <Button variant="outline" onClick={() => setShowUpsellDialog(true)} className="flex-1 sm:flex-none">
                        <Sparkles className="h-4 w-4 mr-2 text-purple-500" />
                        Upsell
                    </Button>
                    <Button variant="outline" onClick={() => setShowPrintDialog(true)} className="flex-1 sm:flex-none">
                        <Printer className="h-4 w-4 mr-2" />
                        In phiếu QR
                    </Button>
                    <Button variant="outline" onClick={() => setShowInvoicePrintDialog(true)} className="flex-1 sm:flex-none">
                        <FileText className="h-4 w-4 mr-2" />
                        In hóa đơn
                    </Button>
                    {order.status !== 'after_sale' && order.status !== 'cancelled' && (
                        <Button
                            variant="outline"
                            onClick={handleOpenOrderEdit}
                            disabled={hasPendingOrderEditApproval}
                            className="flex-1 sm:flex-none"
                        >
                            <Sparkles className="h-4 w-4 mr-2" />
                            {hasPendingOrderEditApproval ? 'Chờ duyệt sửa đơn' : 'Sửa đơn'}
                        </Button>
                    )}
                    <Button
                        className={resolvedPaymentStatus === 'paid' 
                            ? "bg-green-50 text-green-700 border-green-200 hover:bg-green-100 flex-1 sm:flex-none" 
                            : "bg-green-600 hover:bg-green-700 flex-1 sm:flex-none"
                        }
                        onClick={() => setShowPaymentRecordDialog(true)}
                    >
                        {resolvedPaymentStatus === 'paid' ? (
                            <>
                                <CheckCircle2 className="h-4 w-4 mr-2 text-green-600" />
                                Đã thanh toán
                            </>
                        ) : (
                            <>
                                <CreditCard className="h-4 w-4 mr-2" />
                                Thanh toán
                            </>
                        )}
                    </Button>
                    {canApproveOrder && (
                            <Button
                                className="bg-red-600 hover:bg-red-700 flex-1 sm:flex-none"
                                onClick={() => handleApproveOrder(order)}
                            >
                                <ThumbsUp className="h-4 w-4 mr-2" />
                                Phê duyệt đơn
                            </Button>
                        )}
                </div>
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full min-w-0 max-w-full md:space-y-0">
                <TabsList className="mb-0 flex h-auto w-full min-w-0 max-w-full justify-start gap-0 overflow-x-auto rounded-none border-b bg-white px-1 no-scrollbar md:mb-4 md:mt-0 md:h-10 md:w-auto md:gap-1 md:rounded-lg md:border-0 md:bg-muted/50 md:p-1">
                    <TabsTrigger
                        value="detail"
                        className="shrink-0 gap-1 rounded-none border-b-2 border-transparent px-3 py-2.5 text-xs font-medium text-muted-foreground data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:font-bold data-[state=active]:text-foreground data-[state=active]:shadow-none md:rounded-md md:border-0 md:px-2.5 md:py-1.5 md:data-[state=active]:bg-white md:gap-2 md:text-sm"
                    >
                        <FileText className="h-3.5 w-3.5 md:h-4 md:w-4" />
                        Chi tiết
                        {totalCount > 0 && (
                            <Badge className={cn(
                                "ml-1.5 px-1.5 py-0 text-[10px] font-bold rounded-full min-w-[18px] h-4.5 flex items-center justify-center transition-colors border-none",
                                activeTab === 'detail'
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                            )}>
                                {totalCount}
                            </Badge>
                        )}
                    </TabsTrigger>
                    <TabsTrigger
                        value="sales"
                        className="shrink-0 gap-1 rounded-none border-b-2 border-transparent px-3 py-2.5 text-xs font-medium text-muted-foreground data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:font-bold data-[state=active]:text-foreground data-[state=active]:shadow-none md:rounded-md md:border-0 md:px-2.5 md:py-1.5 md:data-[state=active]:bg-white md:gap-2 md:text-sm"
                    >
                        <ShoppingBag className="h-3.5 w-3.5 md:h-4 md:w-4" />
                        <span className="md:hidden">Sales</span>
                        <span className="hidden md:inline">Lên đơn (Sales)</span>
                        {salesCount > 0 && (
                            <Badge className={cn(
                                "ml-1.5 px-1.5 py-0 text-[10px] font-bold rounded-full min-w-[18px] h-4.5 flex items-center justify-center transition-colors border-none",
                                activeTab === 'sales'
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                            )}>
                                {salesCount}
                            </Badge>
                        )}
                    </TabsTrigger>
                    <TabsTrigger
                        value="workflow"
                        className="shrink-0 gap-1 rounded-none border-b-2 border-transparent px-3 py-2.5 text-xs font-medium text-muted-foreground data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:font-bold data-[state=active]:text-foreground data-[state=active]:shadow-none md:rounded-md md:border-0 md:px-2.5 md:py-1.5 md:data-[state=active]:bg-white md:gap-2 md:text-sm"
                    >
                        <Layers className="h-3.5 w-3.5 md:h-4 md:w-4" />
                        <span className="md:hidden">Quy trình</span>
                        <span className="hidden md:inline">Tiến trình / Quy trình</span>
                        {workflowCount > 0 && (
                            <Badge className={cn(
                                "ml-1.5 px-1.5 py-0 text-[10px] font-bold rounded-full min-w-[18px] h-4.5 flex items-center justify-center transition-colors border-none",
                                activeTab === 'workflow'
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                            )}>
                                {workflowCount}
                            </Badge>
                        )}
                    </TabsTrigger>
                    <TabsTrigger
                        value="aftersale"
                        className="shrink-0 gap-1 rounded-none border-b-2 border-transparent px-3 py-2.5 text-xs font-medium text-muted-foreground data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:font-bold data-[state=active]:text-foreground data-[state=active]:shadow-none md:rounded-md md:border-0 md:px-2.5 md:py-1.5 md:data-[state=active]:bg-white md:gap-2 md:text-sm"
                    >
                        <RefreshCcw className="h-3.5 w-3.5 md:h-4 md:w-4" />
                        <span className="md:hidden">After</span>
                        <span className="hidden md:inline">After sale</span>
                        {aftersaleCount > 0 && (
                            <Badge className={cn(
                                "ml-1.5 px-1.5 py-0 text-[10px] font-bold rounded-full min-w-[18px] h-4.5 flex items-center justify-center transition-colors border-none",
                                activeTab === 'aftersale'
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                            )}>
                                {aftersaleCount}
                            </Badge>
                        )}
                    </TabsTrigger>
                    <TabsTrigger
                        value="care"
                        className="shrink-0 gap-1 rounded-none border-b-2 border-transparent px-3 py-2.5 text-xs font-medium text-muted-foreground data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:font-bold data-[state=active]:text-foreground data-[state=active]:shadow-none md:rounded-md md:border-0 md:px-2.5 md:py-1.5 md:data-[state=active]:bg-white md:gap-2 md:text-sm"
                    >
                        <Heart className="h-3.5 w-3.5 md:h-4 md:w-4" />
                        <span className="md:hidden">CS/BH</span>
                        <span className="hidden md:inline">Chăm sóc / Bảo hành</span>
                        {careCount > 0 && (
                            <Badge className={cn(
                                "ml-1.5 px-1.5 py-0 text-[10px] font-bold rounded-full min-w-[18px] h-4.5 flex items-center justify-center transition-colors border-none",
                                activeTab === 'care'
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                            )}>
                                {careCount}
                            </Badge>
                        )}
                    </TabsTrigger>
                </TabsList>

                <DetailTab
                    order={order}
                    productStatusSummary={productStatusSummary}
                    isPhoneView={isPhoneView}
                    canEdit={canEditOrder}
                    hasPendingEditApproval={hasPendingOrderEditApproval}
                    onReload={reloadOrder}
                    onShowPrintDialog={() => setShowPrintDialog(true)}
                    onShowInvoicePrintDialog={() => setShowInvoicePrintDialog(true)}
                    onShowPaymentDialog={() => setShowPaymentDialog(true)}
                    onEditOrder={handleOpenOrderEdit}
                />

                <SalesTab
                    order={order}
                    isPhoneView={isPhoneView}
                    salesLogs={salesLogs}
                    updateOrderItemStatus={updateOrderItemStatus}
                    updateOrderStatus={updateOrderStatus}
                    reloadOrder={reloadOrder}
                    fetchKanbanLogs={fetchKanbanLogs}
                    onProductCardClick={handleOpenProductDialog}
                    workflowKanbanGroups={workflowKanbanGroups}
                    onTabChange={setActiveTab}
                    onOpenProductDialogWithMove={handleOpenProductDialogWithMove}
                />

                <WorkflowTab
                    order={order}
                    isPhoneView={isPhoneView}
                    stepsLoading={stepsLoading}
                    allWorkflowSteps={allWorkflowSteps}
                    workflowKanbanGroups={workflowKanbanGroups}
                    workflowLogs={workflowLogs}
                    salesLogs={salesLogs}
                    onWorkflowDragEnd={onWorkflowDragEnd}
                    getGroupCurrentTechRoom={getGroupCurrentTechRoom}
                    getItemCurrentStep={getItemCurrentStep}
                    getStepDeadlineDisplay={(itemId: string) => getStepDeadlineDisplay(itemId)}
                    handleOpenAccessory={handleOpenAccessory}
                    handleOpenPartner={handleOpenPartner}
                    handleOpenExtension={handleOpenExtension}
                    handleOpenAssignDialog={handleOpenAssignDialog}
                    handleOpenSaleAssignDialog={handleOpenSaleAssignDialog}
                    onProductCardClick={handleOpenProductDialog}
                    updateOrderItemStatus={updateOrderItemStatus}
                    fetchKanbanLogs={fetchKanbanLogs}
                />

                <AftersaleTab
                    order={order}
                    groups={workflowKanbanGroups}
                    aftersaleLogs={aftersaleLogs}
                    updateOrderAfterSale={updateOrderAfterSale}
                    reloadOrder={reloadOrder}
                    fetchKanbanLogs={fetchKanbanLogs}
                    setActiveTab={setActiveTab}
                    getSLADisplay={getSLADisplay}
                    getAfterSaleStageLabel={getAfterSaleStageLabel}
                    getGroupCurrentTechRoom={getGroupCurrentTechRoom}
                    onProductCardClick={handleOpenProductDialog}
                    onOpenProductDialogWithMove={handleOpenProductDialogWithMove}
                    isPhoneView={isPhoneView}
                />

                <CareTab
                    order={order}
                    groups={workflowKanbanGroups}
                    careLogs={careLogs}
                    updateOrderAfterSale={updateOrderAfterSale}
                    reloadOrder={reloadOrder}
                    fetchKanbanLogs={fetchKanbanLogs}
                    getCareWarrantyStageLabel={getCareWarrantyStageLabel}
                    onProductCardClick={handleOpenProductDialog}
                    onUpdateItemAfterSaleData={updateItemAfterSaleData}
                    isPhoneView={isPhoneView}
                />
            </Tabs>

            {/* Dialogs */}
            <PrintQRDialog
                order={order}
                open={showPrintDialog}
                onClose={() => setShowPrintDialog(false)}
            />

            <PrintThermalInvoiceDialog
                order={order}
                open={showInvoicePrintDialog}
                onClose={() => setShowInvoicePrintDialog(false)}
            />

            <PaymentDialog
                order={showPaymentDialog ? order : null}
                open={showPaymentDialog}
                onClose={() => setShowPaymentDialog(false)}
                onSuccess={handlePaymentSuccess}
            />

            <PaymentRecordDialog
                open={showPaymentRecordDialog}
                onOpenChange={setShowPaymentRecordDialog}
                orderId={order.id}
                orderCode={order.order_code}
                remainingDebt={resolvedRemainingDebt}
                onSuccess={reloadOrder}
            />

            {/* Technician Assignment Dialog */}
            {selectedItem && (
                <AssignTechnicianDialog
                    open={showAssignDialog}
                    onOpenChange={setShowAssignDialog}
                    selectedItem={selectedItem}
                    technicians={technicians}
                    onSuccess={reloadOrder}
                />
            )}

            {/* Sales Assignment Dialog */}
            {selectedItem && (
                <AssignSalesPersonDialog
                    open={showSaleAssignDialog}
                    onOpenChange={setShowSaleAssignDialog}
                    selectedItem={selectedItem}
                    salesPersons={salesPersons}
                    onSuccess={reloadOrder}
                />
            )}

            {/* Accessory Dialog */}
            <Dialog open={showAccessoryDialog} onOpenChange={setShowAccessoryDialog}>
                <DialogContent className="max-w-md p-0 overflow-hidden rounded-2xl border-none shadow-2xl">
                    <DialogHeader className="p-6 pb-4 bg-slate-50/50 border-b">
                        <DialogTitle className="text-xl font-bold flex items-center gap-2">
                            <Plus className="w-6 h-6 text-primary" />
                            Tạo yêu cầu mua phụ kiện
                        </DialogTitle>
                    </DialogHeader>
                    <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                        {accessoryRejectionReason && (
                            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                                <div className="mb-1 flex items-center gap-2 font-bold">
                                    <XCircle className="h-4 w-4" />
                                    Yêu cầu trước bị từ chối
                                </div>
                                <p className="text-xs leading-relaxed">{accessoryRejectionReason}</p>
                            </div>
                        )}
                        <div className="space-y-1.5">
                            <Label className="text-xs font-bold text-slate-500">Tên phụ kiện *</Label>
                            <Input
                                value={newItemName}
                                onChange={(e) => setNewItemName(e.target.value)}
                                placeholder=""
                                className="h-11 rounded-xl"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label className="text-xs font-bold text-slate-500">Số lượng</Label>
                                <div className="relative">
                                    <Input
                                        value={newItemQuantity}
                                        onChange={(e) => setNewItemQuantity(e.target.value)}
                                        placeholder="1"
                                        className="h-11 rounded-xl pl-10"
                                    />
                                    <Hash className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs font-bold text-slate-500">Giá dự kiến</Label>
                                <div className="relative">
                                    <Input
                                        value={newItemPrice}
                                        onChange={(e) => {
                                            const digits = e.target.value.replace(/\D/g, '');
                                            if (!digits) setNewItemPrice('');
                                            else setNewItemPrice(new Intl.NumberFormat('en-US').format(Number(digits)));
                                        }}
                                        placeholder="1,500,000"
                                        className="h-11 rounded-xl pl-10"
                                    />
                                    <DollarSign className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-bold text-slate-500">Mã sản phẩm / đơn hàng</Label>
                            <div className="relative">
                                <Input
                                    value={newItemOrderCode}
                                    readOnly disabled
                                    className="h-11 rounded-xl pl-10 bg-slate-50"
                                />
                                <Search className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-bold text-slate-500">Ghi chú chi tiết</Label>
                            <Textarea
                                value={newItemNotes}
                                onChange={(e) => setNewItemNotes(e.target.value)}
                                placeholder="Mô tả tình trạng, yêu cầu đặc biệt..."
                                className="min-h-[80px] rounded-xl resize-none"
                            />
                        </div>

                        <PhotoUpload
                            label="Ảnh phụ kiện mẫu / Link sản phẩm"
                            value={newItemPhotos}
                            onChange={setNewItemPhotos}
                        />
                    </div>
                    <DialogFooter className="p-6 bg-slate-50/50 border-t flex items-center justify-between gap-3">
                        <Button variant="ghost" onClick={() => setShowAccessoryDialog(false)} className="rounded-xl px-6">Hủy</Button>
                        <Button
                            onClick={handleSubmitAccessory}
                            disabled={accessoryLoading || !newItemName}
                            className="rounded-xl px-10 font-bold shadow-lg shadow-primary/20"
                        >
                            {accessoryLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                            Gửi yêu cầu
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Partner Dialog */}
            <Dialog open={showPartnerDialog} onOpenChange={setShowPartnerDialog}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Gửi đối tác</DialogTitle></DialogHeader>
                    {partnerItem && (
                        <div className="space-y-4">
                            <div className="p-3 bg-muted rounded-lg"><p className="font-medium">{partnerItem.item_name}</p></div>
                            {partnerRejectionReason && (
                                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                                    <div className="mb-1 flex items-center gap-2 font-bold">
                                        <XCircle className="h-4 w-4" />
                                        Yêu cầu trước bị từ chối
                                    </div>
                                    <p className="text-xs leading-relaxed">{partnerRejectionReason}</p>
                                </div>
                            )}
                            <div className="space-y-2">
                                <div className="p-2.5 border rounded-lg bg-amber-50 text-amber-800 font-medium text-sm">
                                    Xác nhận gửi đối tác
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>Ghi chú</Label>
                                <Textarea value={partnerNotes} onChange={e => setPartnerNotes(e.target.value)} />
                            </div>
                            <DialogFooter>
                                <Button onClick={handleSubmitPartner} disabled={partnerLoading}>
                                    {partnerLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Xác nhận
                                </Button>
                            </DialogFooter>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Extension Dialog */}
            <Dialog open={showExtensionDialog} onOpenChange={setShowExtensionDialog}>
                <DialogContent className="max-w-md rounded-2xl p-0 overflow-hidden border-none shadow-2xl">
                    <DialogHeader className="p-6 bg-slate-50 border-b">
                        <DialogTitle className="text-xl font-bold text-slate-800 flex items-center gap-2">
                            <Clock className="w-5 h-5 text-primary" />
                            {canCreateExtensionRequest
                                ? 'Yêu cầu gia hạn sản phẩm'
                                : 'Thông tin yêu cầu gia hạn'}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="p-6 space-y-5">
                        {canCreateExtensionRequest ? (
                            <>
                                {extensionItem && (
                                    <div className="p-4 bg-primary/5 rounded-xl border border-primary/10">
                                        <p className="text-sm font-bold text-primary flex items-center gap-2">
                                            <Layers className="h-4 w-4" />
                                            {extensionItem.item_name}
                                        </p>
                                    </div>
                                )}
                                {extensionRejectionReason && (
                                    <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                                        <div className="mb-1 flex items-center gap-2 font-bold">
                                            <XCircle className="h-4 w-4" />
                                            Yêu cầu trước bị từ chối
                                        </div>
                                        <p className="text-xs leading-relaxed">{extensionRejectionReason}</p>
                                    </div>
                                )}
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Lý do xin gia hạn</Label>
                                    <Select value={['MẤT ĐIỆN', 'HẾT NVL', 'QUÊN CHƯA LÀM'].includes(extensionReason) ? extensionReason : extensionReason ? 'other' : ''} onValueChange={(val) => {
                                        if (val === 'other') setExtensionReason('');
                                        else setExtensionReason(val);
                                    }}>
                                        <SelectTrigger className="h-11 rounded-xl">
                                            <SelectValue placeholder="Chọn lý do phổ biến..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="MẤT ĐIỆN">1. Mất điện</SelectItem>
                                            <SelectItem value="HẾT NVL">2. Hết nguyên vật liệu</SelectItem>
                                            <SelectItem value="QUÊN CHƯA LÀM">3. Quên chưa làm</SelectItem>
                                            <SelectItem value="other">Lý do khác...</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    {(extensionReason === '' || !['MẤT ĐIỆN', 'HẾT NVL', 'QUÊN CHƯA LÀM'].includes(extensionReason)) && (
                                        <Textarea
                                            placeholder="Nhập lý do chi tiết..."
                                            value={extensionReason}
                                            onChange={e => setExtensionReason(e.target.value)}
                                            className="min-h-[100px] rounded-xl mt-3 resize-none border-slate-200"
                                        />
                                    )}
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                                        THỜI GIAN ĐỀ XUẤT XIN GIA HẠN <span className="text-red-500 text-base">*</span>
                                    </Label>
                                    <div className="relative">
                                        <Input
                                            type="datetime-local"
                                            required
                                            value={extensionNewDueAt}
                                            onChange={e => setExtensionNewDueAt(e.target.value)}
                                            className="h-11 rounded-xl"
                                        />
                                    </div>
                                    <p className="text-[10px] text-slate-400 italic">Hệ thống sẽ chuyển yêu cầu tới Sale và Manager để xử lý.</p>
                                </div>
                            </>
                        ) : (
                            <div className="space-y-6">
                                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100 space-y-4 shadow-inner">
                                    <div className="space-y-1">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Lý do kỹ thuật viên đưa ra</span>
                                        <p className="text-sm font-medium text-slate-700 leading-relaxed border-l-2 border-primary/30 pl-3 py-1">
                                            {order.extension_request?.reason || (extensionItem as any)?.extension_request?.reason}
                                        </p>
                                    </div>
                                    
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Hạn đề xuất</span>
                                            <div className="flex items-center gap-2 text-slate-600">
                                                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                                <span className="text-sm font-semibold italic">
                                                    {(() => {
                                                        const due = order.extension_request?.new_due_at || (extensionItem as any)?.extension_request?.new_due_at;
                                                        return due ? format(new Date(due), 'dd/MM/yyyy HH:mm') : 'N/A';
                                                    })()}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="space-y-1 text-right">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Trạng thái</span>
                                            <div>
                                                <Badge className={`rounded-lg px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                                                    (() => {
                                                        const status = order.extension_request?.status || (extensionItem as any)?.extension_request?.status;
                                                        if (status === 'manager_approved') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
                                                        if (status === 'requested' || status === 'pending') return 'bg-amber-100 text-amber-700 border-amber-200 animate-pulse';
                                                        return 'bg-slate-100 text-slate-600';
                                                    })()
                                                }`}>
                                                    {(() => {
                                                        const status = order.extension_request?.status || (extensionItem as any)?.extension_request?.status;
                                                        if (status === 'manager_approved') return 'Đã phê duyệt';
                                                        if (status === 'sale_contacted') return 'Đã liên hệ khách';
                                                        if (status === 'requested' || status === 'pending') return 'Đang xin gia hạn';
                                                        return status;
                                                    })()}
                                                </Badge>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {(order.extension_request?.customer_result || (extensionItem as any)?.extension_request?.customer_result) && (
                                    <div className="space-y-1.5 px-1">
                                        <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Ghi chú từ Sale</Label>
                                        <p className="text-sm text-slate-600 bg-white p-3 rounded-xl border border-slate-100 italic">
                                            "{order.extension_request?.customer_result || (extensionItem as any)?.extension_request?.customer_result}"
                                        </p>
                                    </div>
                                )}
                                
                                <div className="p-4 bg-amber-50 rounded-xl border border-amber-100 flex items-start gap-3">
                                    <div className="bg-amber-100 p-1.5 rounded-lg mt-0.5">
                                        <Info className="w-4 h-4 text-amber-600" />
                                    </div>
                                    <p className="text-[11px] text-amber-800 leading-relaxed font-medium">
                                        Yêu cầu này đang được Sale và Quản lý thẩm định. Vui lòng theo dõi trạng thái hoặc liên hệ trực tiếp nếu cần gấp.
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                    <DialogFooter className="p-6 bg-slate-50/50 border-t flex items-center justify-between gap-3">
                        {canCreateExtensionRequest ? (
                            <>
                                <Button variant="ghost" onClick={() => setShowExtensionDialog(false)} className="rounded-xl px-6">Hủy</Button>
                                <Button 
                                    onClick={handleSubmitExtension} 
                                    disabled={extensionLoading}
                                    className="rounded-xl px-10 font-bold shadow-lg shadow-primary/20"
                                >
                                    {extensionLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                                    Gửi yêu cầu
                                </Button>
                            </>
                        ) : (
                            <Button 
                                onClick={() => setShowExtensionDialog(false)} 
                                className="w-full rounded-xl h-11 font-bold bg-slate-800 hover:bg-slate-900 shadow-xl"
                            >
                                Đóng thông tin
                            </Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Workflow Kanban Dialogs */}
            <MoveStepDialog
                open={showMoveStepDialog}
                onOpenChange={setShowMoveStepDialog}
                itemId={moveStepItemId}
                targetRoomId={moveStepTargetRoom?.id}
                targetRoomName={moveStepTargetRoom?.title}
                technicians={technicians}
                initialTechnicianId={moveStepInitialTechId}
                onSuccess={() => {
                    reloadOrder();
                    if (order?.id) fetchKanbanLogs(order.id);
                }}
            />

            <FailDialog
                open={showFailDialog}
                onOpenChange={setShowFailDialog}
                itemId={failItemId}
                onSuccess={() => {
                    reloadOrder();
                    if (order?.id) fetchKanbanLogs(order.id);
                }}
            />

            <ConfirmDoneDialog
                open={showConfirmDoneDialog}
                onOpenChange={setShowConfirmDoneDialog}
                itemIds={confirmDoneItemIds}
                isV2Service={isV2ServiceForDone}
                onSuccess={async () => {
                    const updated = await reloadOrder();
                    if (updated?.id) {
                        fetchKanbanLogs(updated.id);
                        // Synchronize overall order status – items now enter after_sale flow
                        const allDone = updated.items?.every((i: any) => 
                            i.status === 'completed' || i.status === 'cancelled' || i.status === 'aftersale_stored'
                        );
                        if (allDone && updated.status !== 'done' && updated.status !== 'after_sale') {
                            await updateOrderStatus(updated.id, 'after_sale');
                        }
                    }
                    setActiveTab('aftersale');
                }}
            />

            <ProductDetailDialog
                open={showProductDialog}
                onOpenChange={(open) => {
                    setShowProductDialog(open);
                    if (!open) {
                        setHighlightMessageId(undefined);
                        setPendingMoveCallback(null); // xóa pending move khi dialog đóng
                    }
                }}
                group={selectedProductGroup}
                roomId={currentRoomId}
                currentUserId={user?.id}
                order={order}
                onUpdateOrder={updateOrderAfterSale}
                onUpdateItemAfterSaleData={updateItemAfterSaleData}
                onReloadOrder={reloadOrder}
                setActiveTab={setActiveTab}
                highlightMessageId={highlightMessageId}
                salesLogs={salesLogs}
                workflowLogs={workflowLogs}
                aftersaleLogs={aftersaleLogs}
                careLogs={careLogs}
                fetchKanbanLogs={fetchKanbanLogs}
                onConfirmAndMove={pendingMoveCallback || undefined}
                onRoomChange={setCurrentRoomId}
            />

            <UpsellDialog
                open={showUpsellDialog}
                onOpenChange={setShowUpsellDialog}
                orderId={order.id}
                order={order}
                onSuccess={async () => {
                    await reloadOrder();
                }}
            />
        </div>
    );
}
