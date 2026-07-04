import React, { useState, useEffect, useMemo } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog';
import {
    ShoppingBag, Tag, FileText, Package, Truck, Wrench, Camera,
    User as UserIcon, MessageSquare, BookOpen,
    History, Save, Loader2, Heart, ShieldCheck, ClipboardList, Sparkles,
    ThumbsUp, ThumbsDown, Calendar, XCircle, Maximize2, Clock
} from 'lucide-react';
import { WorkflowLogDetailDialog } from '@/components/orders/workflow/WorkflowLogDetailDialog';
import { BackwardMoveDialog } from '@/components/orders/BackwardMoveDialog';
import { UpsellDialog } from '@/components/orders/UpsellDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { ProductChat } from '@/components/orders/workflow/ProductChat';
import type { Order, OrderItem } from '@/hooks/useOrders';
import { cn, formatCurrency, formatDateTime, formatDate } from '@/lib/utils';
import {
    SALES_STATUS_LABELS,
    getCareWarrantyStageLabel,
    getAfterSaleStageLabel,
    getSalesStatusLabel,
    getItemAfterSaleStage as resolveItemAfterSaleStage,
    pickOrderLevelAfterSalePatch,
} from '../constants';
import {
    getAfter1DebtToAfter2ValidationErrors,
    getAfter1ToDebtValidationErrors,
    showAfterSaleValidationToast,
} from '../afterSaleValidation';
import { getWorkflowRequestLogDisplay, isWorkflowRequestLogAction } from '../workflowRequestLog';
import { orderItemsApi, orderProductsApi, productChatsApi } from '@/lib/api';
import { toast } from 'sonner';
import { ImageUpload } from '@/components/products/ImageUpload';
import { useUsers } from '@/hooks/useUsers';
import { uploadFile } from '@/lib/supabase';
import { DELIVERY_CARRIER_OPTIONS } from '@/constants/deliveryCarriers';
import { useAuth } from '@/contexts/AuthContext';
import { canOperateWorkflow } from '@/lib/sensitivePermissions';
import { getAssignedSaleNames, getAssignedTechnicianNames } from '../utils/staff';
import { StaffNameSelect } from '@/components/common/StaffNameSelect';

function parsePhotoUrls(photos: unknown): string[] {
    if (Array.isArray(photos)) {
        return photos.filter((url): url is string => typeof url === 'string' && url.length > 0);
    }
    if (typeof photos === 'string') {
        if (photos.startsWith('[')) {
            try {
                const parsed = JSON.parse(photos);
                return Array.isArray(parsed)
                    ? parsed.filter((url): url is string => typeof url === 'string' && url.length > 0)
                    : [];
            } catch {
                return [];
            }
        }
        if (photos.length > 0) return [photos];
    }
    return [];
}

/** Ảnh/video lúc nhận đồ — ưu tiên bằng chứng bước 1 (Nhận đồ & Chụp ảnh). */
function getReceivedProductImages(item: unknown): string[] {
    if (!item || typeof item !== 'object') return [];
    const row = item as Record<string, unknown>;
    const stepData = (row.sales_step_data || {}) as Record<string, unknown>;
    const urls = [
        ...parsePhotoUrls(stepData.step1_evidence_photos),
        ...parsePhotoUrls(row.product_images),
        ...parsePhotoUrls(row.images),
    ];
    const catalogImage = (row.product as { image?: string } | undefined)?.image;
    if (catalogImage) urls.push(catalogImage);
    return [...new Set(urls)];
}


interface ProductDetailDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    group: { product: OrderItem | null; services: OrderItem[] } | null;
    roomId: string;
    currentUserId?: string;
    order?: Order | null;
    onUpdateOrder?: (patch: Partial<Order>) => Promise<void>;
    onUpdateItemAfterSaleData?: (itemId: string, isCustomerItem: boolean, data: any) => Promise<void>;
    onReloadOrder?: () => void | Promise<void>;
    setActiveTab?: (tab: string) => void;
    highlightMessageId?: string;
    salesLogs?: any[];
    workflowLogs?: any[];
    aftersaleLogs?: any[];
    careLogs?: any[];
    fetchKanbanLogs?: (orderId: string) => Promise<void>;
    /** Callback được gọi sau khi xác nhận thành công — dùng để tự động chuyển trạng thái card */
    onConfirmAndMove?: () => Promise<void>;
    onRoomChange?: (roomId: string) => void;
}

export function MultiMediaUpload({ value, onChange, disabled, bucket = 'orders', folder = 'step1' }: { value: string[]; onChange: (urls: string[]) => void; disabled?: boolean; bucket?: string; folder?: string }) {
    const [uploading, setUploading] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        setUploading(true);
        try {
            const uploadedUrls: string[] = [];
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const { url, error } = await uploadFile(bucket, folder, file);
                if (error) throw error;
                if (url) uploadedUrls.push(url);
            }
            onChange([...value, ...uploadedUrls]);
            toast.success(
                uploadedUrls.length > 1
                    ? `Đã tải lên ${uploadedUrls.length} ảnh/video`
                    : 'Đã tải lên thành công'
            );
        } catch (error) {
            console.error('Upload error:', error);
            toast.error('Lỗi upload file');
        } finally {
            setUploading(false);
            e.target.value = '';
        }
    };

    const removeFile = (index: number) => {
        const newValue = [...value];
        newValue.splice(index, 1);
        onChange(newValue);
    };

    return (
        <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 mt-2">
            {value?.map((url, i) => {
                const isVideo = url.match(/\.(mp4|webm|ogg|mov|m4v)$|^data:video/i) || url.includes('/video/');
                return (
                    <div 
                        key={i} 
                        className="group relative aspect-square rounded-xl overflow-hidden border bg-white shadow-sm ring-1 ring-gray-100 cursor-zoom-in group"
                        onClick={() => setPreviewUrl(url)}
                    >
                        {isVideo ? (
                            <video src={url} className="w-full h-full object-cover" />
                        ) : (
                            <img src={url} alt="" className="w-full h-full object-cover" />
                        )}
                        
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                            <Maximize2 className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-md" />
                        </div>

                        {!disabled && (
                            <button 
                                onClick={(e) => { e.stopPropagation(); removeFile(i); }} 
                                className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                            >
                                <XCircle className="w-3.5 h-3.5" />
                            </button>
                        )}
                        {isVideo && (
                            <div className="absolute bottom-1 left-1 bg-black/40 px-1 rounded text-[8px] text-white font-bold uppercase">Video</div>
                        )}
                    </div>
                );
            })}
            {!disabled && (
                <label className={cn(
                    "aspect-square rounded-xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all shadow-sm",
                    uploading ? "opacity-50 pointer-events-none" : ""
                )}>
                    {uploading ? <Loader2 className="w-5 h-5 animate-spin text-primary" /> : <Camera className="w-6 h-6 text-slate-300" />}
                    <span className="text-[9px] font-bold text-slate-400 mt-1 uppercase">Tải lên</span>
                    <input type="file" multiple accept="image/*,video/*" className="hidden" onChange={handleFileChange} />
                </label>
            )}

            <Dialog open={!!previewUrl} onOpenChange={(open) => !open && setPreviewUrl(null)}>
                <DialogContent className="max-w-4xl p-0 overflow-hidden bg-transparent border-none shadow-none flex items-center justify-center">
                    <DialogTitle className="sr-only">Xem phương tiện</DialogTitle>
                    {previewUrl && (
                        previewUrl.match(/\.(mp4|webm|ogg|mov|m4v)$|^data:video/i) || previewUrl.includes('/video/') ? (
                            <video src={previewUrl} controls autoPlay className="max-w-full max-h-[90vh] rounded-lg shadow-2xl bg-black" />
                        ) : (
                            <img src={previewUrl} alt="" className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl bg-white" />
                        )
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}

export function ProductDetailDialog({
    open,
    onOpenChange,
    group,
    roomId,
    currentUserId,
    order,
    onUpdateOrder,
    onUpdateItemAfterSaleData,
    onReloadOrder,
    setActiveTab,
    highlightMessageId,
    salesLogs = [],
    workflowLogs = [],
    aftersaleLogs = [],
    careLogs = [],
    fetchKanbanLogs,
    onConfirmAndMove,
    onRoomChange,
}: ProductDetailDialogProps) {
    /** Strip Vietnamese diacritics so 'dung' matches 'Dũng', 'huong' matches 'Hương', etc. */
    const normalizeVn = (str: string): string => {
        if (!str) return '';
        return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase();
    };

    const [activeImageIdx, setActiveImageIdx] = useState(0);
    const [saving, setSaving] = useState(false);
    const [showUpsellDialog, setShowUpsellDialog] = useState(false);
    const [optimisticAfterSaleStages, setOptimisticAfterSaleStages] = useState<Record<string, string>>({});
    const { users, fetchUsers, fetchSales, fetchTechnicians } = useUsers();
    const { user } = useAuth();

    const [mentionSearch, setMentionSearch] = useState('');
    const [showMentionList, setShowMentionList] = useState(false);
    const [mentionInputType, setMentionInputType] = useState<'step3_technician_name' | null>(null);

    useEffect(() => {
        if (open) {
            fetchUsers();
            fetchSales();
            fetchTechnicians();
            // Reset scroll position to top when dialog opens or room changes
            const viewport = document.querySelector('.product-detail-scroll-area');
            if (viewport) viewport.scrollTop = 0;
        }
    }, [open, fetchUsers, fetchSales, fetchTechnicians, roomId]);

    // Local form state
    const [formData, setFormData] = useState<Partial<Order>>({});
    const [dueAt, setDueAt] = useState<string>('');
    const [selectedLogDetail, setSelectedLogDetail] = useState<any>(null);
    const [showLogDetailDialog, setShowLogDetailDialog] = useState(false);
    const [viewLogData, setViewLogData] = useState<{
        reason?: string;
        photos?: string[];
        notes?: string;
        itemName?: string;
    } | null>(null);
    const [mainPreviewUrl, setMainPreviewUrl] = useState<string | null>(null);

    // Extension Request dialog states
    const [showExtensionRequestDialog, setShowExtensionRequestDialog] = useState(false);
    const [extensionReasonInput, setExtensionReasonInput] = useState('');
    const [proposedDueDate, setProposedDueDate] = useState<string>('');

    // Initialize form data when the dialog is opened or order ID changes
    useEffect(() => {
        if (open && order) {
            const parsePhotos = (photos: any) => {
                if (Array.isArray(photos)) return photos;
                if (typeof photos === 'string' && photos.startsWith('[')) {
                    try { return JSON.parse(photos); } catch { return []; }
                }
                return [];
            };

            const item = group?.product || group?.services?.[0];
            const itemCompPhotos = parsePhotos((item as any)?.completion_photos);
            const itemPackPhotos = parsePhotos((item as any)?.packaging_photos);

            setFormData({
                debt_checked: order.debt_checked || false,
                debt_checked_notes: order.debt_checked_notes || '',
                debt_checked_by_name: order.debt_checked_by_name || '',
                aftersale_receiver_name: order.aftersale_receiver_name || '',
                delivery_type: (item as any)?.delivery_type || order.delivery_type || 'ship',
                delivery_carrier: (item as any)?.delivery_carrier || order.delivery_carrier || '',
                delivery_code: (item as any)?.delivery_code || order.delivery_code || '',
                delivery_fee: order.delivery_fee || 0,
                aftersale_return_user_name: order.aftersale_return_user_name || '',
                delivery_address: order.delivery_address || '',
                delivery_notes: order.delivery_notes || '',
                delivery_creator_name: order.delivery_creator_name || '',
                delivery_shipper_phone: order.delivery_shipper_phone || '',
                delivery_staff_name: order.delivery_staff_name || '',
                delivery_received_at: order.delivery_received_at ? new Date(order.delivery_received_at).toISOString().slice(0, 16) : '',
                hd_sent: order.hd_sent || false,
                hd_sent_photos: order.hd_sent_photos || [],
                feedback_requested: order.feedback_requested || false,
                feedback_requested_photos: order.feedback_requested_photos || [],
                notes: order.notes || '',
                // Strict separation: Only use item-specific photos
                completion_photos: itemCompPhotos,
                packaging_photos: itemPackPhotos,
                sales_step_data: (item as any)?.sales_step_data || {},
                delivery_payment_method: (item as any)?.delivery_payment_method || order.delivery_payment_method || 'cash',
                debt_collect_amount: 0,
                debt_payment_method: 'cash',
                debt_payment_photos: parsePhotos((order as any).debt_payment_photos),
                accessories_returned_checked: !!((item as any)?.sales_step_data?.after2_accessories_returned_checked),
            } as any);
            
            setActiveImageIdx(0);
            setOptimisticAfterSaleStages({});
        }
    }, [open, order?.id, group?.product?.id, group?.services?.[0]?.id]); // Only re-init when dialog opens or identity changes

    useEffect(() => {
        if (open) {
            const item = (group?.product || group?.services?.[0]) as any;
            const existingPickupAt = item?.sales_step_data?.pickup_appointment_at;
            const existingDueAt = item?.due_at;
            
            const initialDate = existingDueAt || existingPickupAt;
            setDueAt(initialDate ? new Date(initialDate).toISOString().slice(0, 16) : '');
        }
    }, [open, group?.product?.id, group?.services?.[0]?.id]);

    const product = group?.product;
    const services = group?.services || [];
    const productName = product?.item_name ?? services[0]?.item_name ?? '—';
    const productItem = product as any;
    const assignedSaleNames = getAssignedSaleNames(services);
    const assignedTechnicianNames = getAssignedTechnicianNames(services);

    const entityId = product?.id ?? services[0]?.id;
    const groupEntityIds = new Set([
        product?.id,
        ...services.map((service) => service.id),
    ].filter(Boolean));
    const entityType = product ? 'order_product' : 'order_item';
    const isAftersale = roomId.startsWith('after');
    const isCareFlow = roomId.startsWith('care') || roomId.startsWith('war');
    const isSalesStep = roomId.startsWith('step');

    const isAssignedTech = 
        productItem?.technician_id === user?.id ||
        productItem?.technician?.id === user?.id ||
        services.some(s => (s as any).technician_id === user?.id || (s as any).technician?.id === user?.id);

    const isSaleOfOrder = 
        (order?.sales_id && order.sales_id === user?.id) ||
        (order?.sales_user?.id && order.sales_user.id === user?.id);

    const isAdminOrManager = user?.role === 'admin' || user?.role === 'manager';
    const canOperateTech = canOperateWorkflow(user);
    const isTechnicalRoom = !isSalesStep && !isAftersale && !isCareFlow;

    const canEditDueDate = isAdminOrManager || isSaleOfOrder || isAssignedTech;
    const canEditTechnicalFields = canOperateTech || isAssignedTech || isAdminOrManager;

    const currentExtensionRequest = (product as any)?.extension_request || (services[0] as any)?.extension_request;
    const hasPendingRequest = currentExtensionRequest?.status === 'requested';
    const isInputDisabled =
        hasPendingRequest ||
        (isTechnicalRoom ? !canEditTechnicalFields : !canEditDueDate);

    // Build image lists — ảnh lúc nhận lấy từ step1_evidence_photos (bước Nhận đồ & Chụp ảnh)
    const leadItemForPhotos = product || services[0];
    const originalImages = getReceivedProductImages(leadItemForPhotos);
    let completionImages: string[] = [];
    let packagingImages: string[] = [];

    if (isAftersale || isCareFlow) {
        const item = product || services[0];
        const parsePhotos = (photos: any) => {
            if (Array.isArray(photos)) return photos;
            if (typeof photos === 'string' && photos.startsWith('[')) {
                try { return JSON.parse(photos); } catch { return []; }
            }
            return [];
        };

        const itemCompPhotos = parsePhotos((item as any)?.completion_photos);
        const itemPackPhotos = parsePhotos((item as any)?.packaging_photos);

        completionImages = (formData.completion_photos?.length ? formData.completion_photos : itemCompPhotos) as string[];
        packagingImages = (formData.packaging_photos?.length ? formData.packaging_photos : itemPackPhotos) as string[];
    }

    // Total ordered list for big preview navigation
    const allImages = [...originalImages];
    [...completionImages, ...packagingImages].forEach(img => {
        if (img && typeof img === 'string' && !allImages.includes(img)) {
            allImages.push(img);
        }
    });

    // Sales step data state
    const [stepData, setStepData] = useState<Record<string, any>>({});
    const [savingStepData, setSavingStepData] = useState(false);
    const [showAccessoriesWarning, setShowAccessoriesWarning] = useState(false);
    const [showAccessoriesReturnWarning, setShowAccessoriesReturnWarning] = useState(false);

    const pendingMoveValidationErrors = useMemo(() => {
        if (!onConfirmAndMove || !isAftersale) return [];
        const item = product || services[0];
        if (roomId === 'after1') {
            return getAfter1ToDebtValidationErrors(order, item, {
                aftersale_receiver_name: formData.aftersale_receiver_name ?? undefined,
                completion_photos: Array.isArray(formData.completion_photos) ? formData.completion_photos : [],
            });
        }
        if (roomId === 'after1_debt') {
            return getAfter1DebtToAfter2ValidationErrors(order, {
                debt_checked: formData.debt_checked,
                debt_checked_by_name: formData.debt_checked_by_name ?? undefined,
            });
        }
        return [];
    }, [
        onConfirmAndMove,
        isAftersale,
        roomId,
        order,
        product,
        services,
        formData.aftersale_receiver_name,
        formData.completion_photos,
        formData.debt_checked,
        formData.debt_checked_by_name,
    ]);

    // Load sales_step_data from item when opening or when data updates
    useEffect(() => {
        if (open && isSalesStep) {
            // Try to get existing sales_step_data from the item
            const item = product || services[0];
            const existing = (item as any)?.sales_step_data || {};
            setStepData(existing);
        }
    }, [open, roomId, isSalesStep, product?.id, services?.[0]?.id]); // Only re-init when dialog opens or identity changes

    const handleSaveStepData = async () => {
        const itemId = product?.id || services[0]?.id;
        if (!itemId) return false;

        // Validation for step1
        if (roomId === 'step1') {
            if (!stepData.step1_receiver_name) {
                toast.error('Vui lòng chọn nhân viên Sale nhận');
                return false;
            }
            if (stepData.step1_shipping_fee > 0 && !stepData.step1_payment_method) {
                toast.error('Vui lòng chọn phương thức thanh toán cho tiền ship');
                return false;
            }
            if (!stepData.step1_evidence_photos || stepData.step1_evidence_photos.length === 0) {
                toast.error('Vui lòng tải ảnh/video làm bằng chứng trước khi kỹ thuật làm');
                return false;
            }
            if (!stepData.step1_accessories_checked) {
                setShowAccessoriesWarning(true);
                return false;
            }
        }

        // Validation for step2
        if (roomId === 'step2') {
            if (!stepData.step2_tags_photos || stepData.step2_tags_photos.length === 0) {
                toast.error('Vui lòng tải ảnh chứng minh đã gắn tags');
                return false;
            }
            if (!stepData.step2_form_photos || stepData.step2_form_photos.length === 0) {
                toast.error('Vui lòng tải ảnh đã gắn Form túi hoặc shoestree');
                return false;
            }
        }

        setSavingStepData(true);
        try {
            let savedStepData = { ...stepData };
            await orderItemsApi.updateSalesStepData(itemId, savedStepData);
            toast.success('Đã lưu thông tin thành công');

            // Send notifications if Step 3 and mentions exist
            if (roomId === 'step3' && stepData.step3_technician_name && order) {
                const mentionIds: string[] = [];
                users.forEach(u => {
                    if (stepData.step3_technician_name.includes(`@${u.name}`)) {
                        mentionIds.push(u.id);
                    }
                });

                if (mentionIds.length > 0) {
                    try {
                        const workDetails = stepData.step3_work_details ? `\nNội dung: ${stepData.step3_work_details}` : '';
                        const location = stepData.step3_work_location ? `\nVị trí: ${stepData.step3_work_location}` : '';
                        
                        await productChatsApi.sendMessage({
                            order_id: order.id,
                            entity_id: entityId,
                            entity_type: entityType,
                            room_id: 'unified',
                            content: `🔔 GIAO VIỆC: ${stepData.step3_technician_name}${workDetails}${location}\n(Đã xác nhận trong bước Trao đổi KT)`,
                            mentions: mentionIds
                        });
                    } catch (err) {
                        console.error('Lỗi gửi notification KT:', err);
                    }
                }
            }

            if (roomId === 'step1' && Number(stepData.step1_shipping_fee) > 0 && order && !stepData.step1_shipping_expense_transaction_id) {
                const { transactionsApi } = await import('@/lib/api');
                const response = await transactionsApi.create({
                    type: 'expense',
                    category: 'Phí ship nhận hàng',
                    amount: Number(stepData.step1_shipping_fee),
                    notes: `Tiền ship nhận đồ cho đơn ${order.order_code || order.id}`,
                    order_id: order.id,
                    order_code: order.order_code,
                    order_product_id: product?.id,
                    date: new Date().toISOString().split('T')[0],
                    payment_method: stepData.step1_payment_method || 'cash',
                    status: 'approved',
                    metadata: {
                        source: 'sales_step1_shipping_fee',
                        item_id: itemId,
                        product_name: productName,
                    },
                });

                const transaction = response.data?.data?.transaction;
                savedStepData = {
                    ...savedStepData,
                    step1_shipping_expense_transaction_id: transaction?.id || true,
                    step1_shipping_expense_transaction_code: transaction?.code,
                };
                await orderItemsApi.updateSalesStepData(itemId, savedStepData);
                setStepData(savedStepData);
                toast.success('Đã tạo phiếu chi cho tiền ship');
            }

            // Nếu có pending move (drag-and-drop yêu cầu thông tin), chỉ chuyển bước sau khi phiếu chi đã tạo thành công
            if (onConfirmAndMove) {
                await onConfirmAndMove();
            }

            if (onReloadOrder) await onReloadOrder();
            if (onConfirmAndMove) {
                onOpenChange(false);
            }
            return true;
        } catch (error: any) {
            toast.error(error?.response?.data?.message || 'Lỗi khi lưu thông tin');
            return false;
        } finally {
            setSavingStepData(false);
        }
    };

    const handleSaveDueDate = async () => {
        const itemId = product?.id || services[0]?.id;
        if (!itemId) return;

        // Check if the date actually changed
        const item = (group?.product || group?.services?.[0]) as any;
        const existingPickupAt = item?.sales_step_data?.pickup_appointment_at;
        const existingDueAt = item?.due_at;
        const initialDate = existingDueAt || existingPickupAt;
        const currentDbDateStr = initialDate ? new Date(initialDate).toISOString().slice(0, 16) : '';
        const isDateChanged = dueAt !== currentDbDateStr;

        if (!isDateChanged) {
            toast.info('Lịch hẹn không thay đổi');
            return;
        }

        if (!canEditDueDate) {
            toast.error('Bạn không có quyền chỉnh sửa ngày hẹn trả sản phẩm.');
            return;
        }

        // Everyone must submit an extension request
        if (!dueAt) {
            toast.error('Không thể bỏ trống ngày hẹn trả khi gửi yêu cầu gia hạn.');
            return;
        }
        setProposedDueDate(dueAt);
        setExtensionReasonInput('');
        setShowExtensionRequestDialog(true);
    };

    const handleSubmitExtensionRequest = async () => {
        // For V2 products, the request must be bound to the order_product_services ID (services[0]?.id)
        // rather than the order_products ID (product?.id), to match backend V2 routing.
        const itemId = services[0]?.id;
        if (!itemId) return;

        if (!extensionReasonInput.trim()) {
            toast.error('Vui lòng nhập lý do gia hạn.');
            return;
        }

        setSaving(true);
        try {
            const extensionData = {
                reason: extensionReasonInput.trim(),
                new_due_at: new Date(proposedDueDate).toISOString()
            };

            await orderItemsApi.createExtensionRequest(itemId, extensionData);
            toast.success('Đã gửi yêu cầu gia hạn và đang chờ quản lý duyệt.');
            setShowExtensionRequestDialog(false);
            if (onReloadOrder) onReloadOrder();
        } catch (error: any) {
            toast.error(error?.response?.data?.message || 'Lỗi gửi yêu cầu gia hạn');
        } finally {
            setSaving(false);
        }
    };

    const handleSave = async () => {
        const itemForValidation = product || services[0];

        if (isAftersale && onConfirmAndMove) {
            if (roomId === 'after1') {
                const errors = getAfter1ToDebtValidationErrors(order, itemForValidation, {
                    aftersale_receiver_name: formData.aftersale_receiver_name ?? undefined,
                    completion_photos: Array.isArray(formData.completion_photos)
                        ? formData.completion_photos
                        : [],
                });
                if (errors.length > 0) {
                    showAfterSaleValidationToast(errors);
                    return;
                }
            }

            if (roomId === 'after1_debt') {
                const errors = getAfter1DebtToAfter2ValidationErrors(order, {
                    debt_checked: formData.debt_checked,
                    debt_checked_by_name: formData.debt_checked_by_name ?? undefined,
                });
                if (errors.length > 0) {
                    showAfterSaleValidationToast(errors);
                    return;
                }
            }
        }

        // Kiểm nợ: bắt buộc tick xác nhận trước khi lưu / chuyển bước
        if (isAftersale && roomId.startsWith('after1_debt')) {
            if (!formData.debt_checked) {
                toast.error('Vui lòng tick "Xác nhận đã kiểm nợ" trước khi lưu hoặc chuyển bước');
                return;
            }
            if (!formData.debt_checked_by_name?.trim()) {
                toast.error('Vui lòng chọn Người thu tiền');
                return;
            }
        }

        // Validation: Require payment proof photos when collecting debt
        if (isAftersale) {
            if ((formData as any).debt_collect_amount && (formData as any).debt_collect_amount > 0) {
                const hasPaymentPhotos = (formData as any).debt_payment_photos && (formData as any).debt_payment_photos.length > 0;
                if (!hasPaymentPhotos) {
                    toast.error("Vui lòng chụp ảnh khách đã chuyển khoản hoặc chụp tiền mặt làm bằng chứng thu tiền");
                    return;
                }
            }
        }

        // Validation: xác nhận trả đủ phụ kiện khi đóng gói / giao hàng
        if (isAftersale && roomId.startsWith('after2') && !(formData as any).accessories_returned_checked) {
            setShowAccessoriesReturnWarning(true);
            return;
        }

        setSaving(true);
        try {
            if ((isAftersale || isCareFlow) && onUpdateItemAfterSaleData) {
                const itemId = product?.id || services[0]?.id;
                if (itemId) {
                    await onUpdateItemAfterSaleData(itemId, !!product, {
                        completion_photos: formData.completion_photos,
                        packaging_photos: formData.packaging_photos,
                        shipping_photos: formData.packaging_photos, // mapping alias if needed
                        delivery_carrier: formData.delivery_carrier,
                        delivery_code: formData.delivery_code,
                        delivery_type: formData.delivery_type,
                        delivery_creator_name: formData.delivery_creator_name,
                        delivery_shipper_phone: formData.delivery_shipper_phone,
                        delivery_staff_name: formData.delivery_staff_name,
                        delivery_received_at: formData.delivery_received_at,
                    });
                }
            }

            // Also update the general order data (debt, receiver, etc)
            // But exclude photos from order-level update to keep them strictly at item-level
            if (onUpdateOrder) {
                const orderData = pickOrderLevelAfterSalePatch(
                    Object.fromEntries(
                        Object.entries(formData).filter(
                            ([key]) => key !== 'completion_photos' && key !== 'packaging_photos'
                        )
                    )
                );
                if (Object.keys(orderData).length > 0) {
                    await onUpdateOrder(orderData as Partial<Order>);
                }
            }

            const itemId = product?.id || services[0]?.id;
            if (itemId && roomId.startsWith('after2')) {
                const item = (group?.product || group?.services?.[0]) as any;
                const existingStepData = item?.sales_step_data || {};
                await orderItemsApi.updateSalesStepData(itemId, {
                    ...existingStepData,
                    after2_accessories_returned_checked: !!(formData as any).accessories_returned_checked,
                });
            }

            // Nếu có pending move (drag-and-drop yêu cầu thông tin), tự động chuyển trạng thái trước khi tạo phiếu thu
            if (onConfirmAndMove) {
                await onConfirmAndMove();
                onOpenChange(false);
            }
            
            // Nếu có phí ship và đang ở các bước liên quan đến giao hàng thì tạo phiếu thu
            if (formData.delivery_fee && formData.delivery_fee > 0 && order && (roomId.startsWith('after2') || roomId.startsWith('after4'))) {
                const { ordersApi } = await import('@/lib/api');
                try {
                    await ordersApi.createPayment(order.id, {
                        content: 'Phí giao hàng',
                        amount: formData.delivery_fee,
                        notes: `Phí ship giao đồ cho đơn ${order.order_code || order.id}${formData.delivery_carrier ? `. Đơn vị VC: ${formData.delivery_carrier}` : ''}`,
                        payment_method: (formData as any).delivery_payment_method || 'cash',
                    });
                    toast.success('Đã tạo phiếu thu cho phí ship');
                } catch (error) {
                    console.error('Lỗi tạo phiếu thu ship:', error);
                }
            }

            // Tạo phiếu thu khi có số tiền thu ở bất kỳ bước hậu mãi nào
            if ((formData as any).debt_collect_amount && (formData as any).debt_collect_amount > 0 && order && isAftersale) {
                const { ordersApi } = await import('@/lib/api');
                try {
                    await ordersApi.createPayment(order.id, {
                        content: 'Thanh toán đơn hàng',
                        amount: (formData as any).debt_collect_amount,
                        notes: `Thu nợ cho đơn ${order.order_code || order.id} (Bước: ${getAfterSaleStageLabel(roomId)})`,
                        payment_method: (formData as any).debt_payment_method || 'cash',
                        image_url: ((formData as any).debt_payment_photos || [])[0] || undefined,
                        order_product_id: product?.id,
                    });
                    toast.success('Đã tạo phiếu thu nợ và cập nhật công nợ');
                    setFormData(prev => ({ ...prev, debt_collect_amount: 0 } as any));
                } catch (error) {
                    console.error('Lỗi tạo phiếu thu nợ:', error);
                    toast.error('Lỗi khi tạo phiếu thu nợ. Vui lòng thử lại trước khi chuyển bước.');
                    return;
                }
            }

            toast.success('Đã cập nhật thông tin thành công');
            if (onReloadOrder) await onReloadOrder();
        } catch (error: any) {
            toast.error(error?.message || 'Lỗi khi cập nhật thông tin');
        } finally {
            setSaving(false);
        }
    };

    const handleFeedbackAction = async (isPositive: boolean) => {
        if (!entityId || !onUpdateItemAfterSaleData) return;

        try {
            setSaving(true);

            // 1. Both move the item to 'after4' (Lưu trữ) stage AND set item-level care/warranty flow
            await onUpdateItemAfterSaleData(entityId, !!product, {
                stage: 'after4',
                care_warranty_flow: isPositive ? 'care' : 'warranty',
                care_warranty_stage: isPositive ? 'care6' : 'war1'
            });

            if (isPositive) {
                toast.success('Đã ghi nhận Feedback và chuyển sản phẩm sang mục Chăm sóc & Lưu trữ');
            } else {
                toast.success('Đã chuyển sản phẩm sang mục Bảo hành và Lưu trữ');
            }

            onOpenChange(false);
            if (setActiveTab) setActiveTab('care');

        } catch (error) {
            console.error('Feedback action error:', error);
            toast.error('Lỗi khi thực hiện thao tác');
        } finally {
            setSaving(false);
        }
    };

    const getStageTitle = () => {
        if (!roomId) return 'Chi tiết sản phẩm';
        if (roomId.startsWith('after')) {
            switch (roomId) {
                case 'after1': return 'Ảnh hoàn thiện';
                case 'after1_debt': return 'Kiểm nợ';
                case 'after2': return 'Đóng gói & Giao hàng';
                case 'after3': return 'Nhắn HD & Feedback';
                case 'after4': return 'Lưu Trữ';
                default: return 'Sau bán hàng';
            }
        }
        if (roomId.startsWith('war')) return 'Quy trình Bảo hành';
        if (roomId.startsWith('care')) return 'Chăm sóc khách hàng';
        if (isSalesStep) return SALES_STATUS_LABELS[roomId] || 'Lên đơn';
        return 'Chi tiết sản phẩm';
    };

    const getRoomLogs = () => {
        const filteredWorkflowLogs = workflowLogs.filter(log =>
            log.action === 'assigned'
            || log.action === 'completed'
            || log.action === 'failed'
            || isWorkflowRequestLogAction(log.action)
        );
        const requestStatusLogs = [product, ...services].flatMap((item: any) => {
            if (!item?.id) return [];
            const logs: any[] = [];
            const accessory = item.accessory;
            const partner = item.partner;

            if (accessory?.status) {
                const action = accessory.status === 'requested' ? 'accessory_requested' : `accessory_${accessory.status}`;
                logs.push({
                    id: `request-accessory-${accessory.id || item.id}-${accessory.status}`,
                    entity_id: item.id,
                    action,
                    step_name: 'Mua phụ kiện',
                    notes: accessory.notes || accessory.metadata?.item_name || 'Cập nhật mua phụ kiện',
                    created_at: accessory.updated_at || accessory.created_at || new Date().toISOString(),
                    created_by_user: accessory.updated_by_user || accessory.created_by_user,
                    _synthetic: true,
                });
            }

            if (partner?.status) {
                const action = partner.status === 'requested' ? 'partner_requested' : `partner_${partner.status}`;
                logs.push({
                    id: `request-partner-${partner.id || item.id}-${partner.status}`,
                    entity_id: item.id,
                    action,
                    step_name: 'Gửi đối tác',
                    notes: partner.notes || partner.metadata?.partner_name || 'Cập nhật gửi đối tác',
                    created_at: partner.updated_at || partner.created_at || new Date().toISOString(),
                    created_by_user: partner.updated_by_user || partner.created_by_user,
                    _synthetic: true,
                });
            }

            return logs;
        });
        const allLogs = [...salesLogs, ...filteredWorkflowLogs, ...requestStatusLogs, ...aftersaleLogs, ...careLogs];
        const sortedLogs = allLogs
            .filter((log) => {
                if (log.order_item_step_id) {
                    return !log.entity_id || groupEntityIds.has(log.entity_id);
                }
                if (log.entity_id) {
                    return groupEntityIds.has(log.entity_id);
                }
                // Legacy order-level care/aftersale logs (no entity_id)
                return log.from_stage != null || log.to_stage != null;
            })
            .filter((log, index, arr) => {
                if (!log._synthetic) return true;
                return !arr.some((candidate) => !candidate._synthetic && candidate.entity_id === log.entity_id && candidate.action === log.action);
            })
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

        const requestTypeMap: Record<string, string> = {
            accessory_requested: 'accessory',
            partner_requested: 'partner',
            extension_requested: 'extension',
        };

        return sortedLogs.map((log: any) => {
            const requestType = requestTypeMap[log.action];
            if (!requestType) return log;

            const approvedLog = sortedLogs.find((candidate: any) => candidate.action === `${requestType}_approved` && candidate.entity_id === log.entity_id);
            const rejectedLog = sortedLogs.find((candidate: any) => candidate.action === `${requestType}_rejected` && candidate.entity_id === log.entity_id);

            if (approvedLog || rejectedLog) {
                return {
                    ...log,
                    _outcome: rejectedLog ? 'rejected' : 'approved',
                };
            }

            const relatedItem = [product, ...services].find((item: any) => item?.id === log.entity_id) as any;
            if (relatedItem) {
                if (requestType === 'accessory') {
                    const status = relatedItem.accessory?.status;
                    if (status === 'rejected' || status === 'cancelled') return { ...log, _outcome: 'rejected' };
                    if (status && status !== 'requested') return { ...log, _outcome: 'approved' };
                }

                if (requestType === 'partner') {
                    const status = relatedItem.partner?.status;
                    if (status === 'rejected' || status === 'cancelled') return { ...log, _outcome: 'rejected' };
                    if (status && status !== 'requested') return { ...log, _outcome: 'approved' };
                }

                if (requestType === 'extension') {
                    const status = relatedItem.extension_request?.status;
                    if (status === 'rejected') return { ...log, _outcome: 'rejected' };
                    if (status === 'manager_approved' || status === 'notified_tech') return { ...log, _outcome: 'approved' };
                }
            }

            return { ...log, _outcome: 'pending' };
        });
    };

    const roomLogs = getRoomLogs();

    const getLogStepLabel = (val: string | null | undefined) => {
        if (!val || val === 'START') return 'Bắt đầu';
        if (val.startsWith('step')) return getSalesStatusLabel(val);
        if (val.startsWith('after')) return getAfterSaleStageLabel(val);
        if (val.startsWith('war') || val.startsWith('care')) return getCareWarrantyStageLabel(val);
        return val;
    };

    const renderRequestOutcomeBadge = (log: any) => {
        if (log._outcome === 'rejected') {
            return <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700">Bị từ chối</span>;
        }
        if (log._outcome === 'approved') {
            return <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">Đã duyệt</span>;
        }
        return null;
    };

    const getWorkflowRequestIcon = (action: string) => {
        if (action.startsWith('accessory_')) return <ShoppingBag className="h-3.5 w-3.5" />;
        if (action.startsWith('partner_')) return <Truck className="h-3.5 w-3.5" />;
        return <Clock className="h-3.5 w-3.5" />;
    };

    const renderWorkflowRequestBox = (log: any, config: { icon: React.ReactNode; label: string; className: string }) => (
        <div className={cn('mt-1.5 rounded-xl border p-3 shadow-sm', config.className)}>
            <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-white/70 text-current shadow-sm ring-1 ring-black/5">
                        {config.icon}
                    </span>
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold leading-none">{config.label}</span>
                            {renderRequestOutcomeBadge(log)}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                            <span>{formatDateTime(log.created_at)}</span>
                            <span>•</span>
                            <span>{log.created_by_user?.name || 'Hệ thống'}</span>
                        </div>
                        {log.notes && <div className="mt-2 text-xs leading-relaxed text-slate-700">{log.notes}</div>}
                    </div>
                </div>
            </div>
        </div>
    );

    const openLogDetail = (log: any) => {
        const item = (product || services[0]) as { sales_step_data?: Record<string, unknown> } | undefined;
        setSelectedLogDetail({
            ...log,
            _sales_step_data: item?.sales_step_data || null,
        });
        setShowLogDetailDialog(true);
    };

    const renderLogItem = (log: any) => {
        const isWorkflowRequestLog = isWorkflowRequestLogAction(log.action);

        return (
        <div key={log.id} className="text-[11px] border-b border-gray-50 pb-3 last:border-0">
            {!isWorkflowRequestLog && (
                <div className="flex justify-between items-start gap-2 mb-1">
                    <span className="font-bold text-gray-700 uppercase min-w-0">
                        {log.order_item_step_id ? (
                            <span className={log.action === 'failed' ? "text-red-500" : "text-blue-700"}>
                                {log.action === 'failed' && <span className="mr-1">THẤT BẠI:</span>}
                                {log.step_name}
                            </span>
                        ) : (
                            <span className="text-gray-600">
                                {getLogStepLabel(log.from_status || log.from_stage)} 
                                <span className="mx-1 text-gray-300">→</span> 
                                {getLogStepLabel(log.to_status || log.to_stage)}
                            </span>
                        )}
                    </span>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className="text-[9px] text-gray-400 tabular-nums">{formatDateTime(log.created_at)}</span>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-[10px] text-primary hover:bg-primary/10 font-bold border border-primary/20 rounded-md"
                            onClick={(e) => {
                                e.stopPropagation();
                                openLogDetail(log);
                            }}
                        >
                            <Maximize2 className="h-3 w-3 mr-1" />
                            Xem chi tiết
                        </Button>
                    </div>
                </div>
            )}
            {!isWorkflowRequestLog && (
                <div className="flex items-center gap-1.5 text-gray-500 mb-1">
                    <div className="h-3 w-3 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-[8px] font-bold">
                        {log.created_by_user?.name?.charAt(0) || '?'}
                    </div>
                    {log.created_by_user?.name || 'Hệ thống'}
                </div>
            )}

            {log.action === 'assigned' && (
                <div className="mt-1.5 space-y-1 bg-blue-50/50 p-2 rounded-lg border border-blue-50">
                    {log.reason && (
                        <div className="flex gap-2">
                            <span className="font-semibold text-gray-500 min-w-[65px]">Lý do:</span>
                            <span className="text-gray-700">{log.reason}</span>
                        </div>
                    )}
                    <div className="flex gap-2">
                        <span className="font-semibold text-gray-500 min-w-[65px]">KTV:</span>
                        <span className="font-medium text-blue-700">{log.assigned_tech?.name || 'Chưa phân công'}</span>
                    </div>
                    {log.deadline_days > 0 && (
                        <div className="flex gap-2">
                            <span className="font-semibold text-gray-500 min-w-[65px]">Hạn:</span>
                            <span className="text-gray-700">{log.deadline_days} ngày</span>
                        </div>
                    )}
                    {log.notes && (
                        <div className="flex gap-2 mt-1 pt-1 border-t border-blue-100/50">
                            <span className="font-semibold text-gray-500 min-w-[65px]">Ghi chú:</span>
                            <span className="text-gray-700 italic">{log.notes}</span>
                        </div>
                    )}
                    {log.photos && log.photos.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1 pt-1 border-t border-blue-100/50">
                            {log.photos.map((url: string, idx: number) => (
                                <a key={idx} href={url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>
                                    <img src={url} alt={`Evidence ${idx}`} className="h-8 w-8 object-cover rounded shadow-sm border border-gray-200" />
                                </a>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {log.action === 'failed' && log.notes && (
                <div className="mt-1.5 bg-red-50 p-2 rounded-lg border border-red-100 text-red-700 italic">
                    {log.notes}
                    {log.photos && log.photos.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5 pt-1.5 border-t border-red-100">
                            {log.photos.map((url: string, idx: number) => (
                                <a key={idx} href={url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>
                                    <img src={url} alt={`Evidence ${idx}`} className="h-8 w-8 object-cover rounded shadow-sm border border-red-200" />
                                </a>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {isWorkflowRequestLog && (() => {
                const display = getWorkflowRequestLogDisplay(log.action);
                if (!display) return null;
                return (
                    <div className="space-y-2">
                        {renderWorkflowRequestBox(log, {
                            icon: getWorkflowRequestIcon(log.action),
                            label: display.label,
                            className: display.boxClass,
                        })}
                        <div className="flex justify-end">
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-[10px] text-primary hover:bg-primary/10 font-bold border border-primary/20 rounded-md"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    openLogDetail(log);
                                }}
                            >
                                <Maximize2 className="h-3 w-3 mr-1" />
                                Xem chi tiết
                            </Button>
                        </div>
                    </div>
                );
            })()}
        </div>
        );
    };

    const [timeLeft, setTimeLeft] = useState<string>('');

    useEffect(() => {
        if (!open || !dueAt) return;

        const updateCountdown = () => {
            const now = new Date().getTime();
            const target = new Date(dueAt).getTime();
            const diff = target - now;

            if (diff <= 0) {
                setTimeLeft('ĐÃ QUÁ HẠN');
                return;
            }

            const hours = Math.floor(diff / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((diff % (1000 * 60)) / 1000);

            setTimeLeft(`${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
        };

        updateCountdown();
        const timer = setInterval(updateCountdown, 1000);
        return () => clearInterval(timer);
    }, [open, dueAt]);

    const getStageInstructions = () => {
        if (roomId === 'step1') return "Kiểm tra kỹ tình trạng đồ của khách, chụp ảnh các vết trầy xước hoặc hư hỏng trước khi nhận.";
        if (roomId === 'step2') return "Gắn Tag định danh cho từng sản phẩm. Đảm bảo Tag không làm hỏng chất liệu sản phẩm.";
        if (roomId === 'step3') return "Trao đổi kỹ với bộ phận Kỹ thuật về phương án xử lý. Ghi chú lại các yêu cầu đặc biệt của khách.";
        if (roomId === 'after1') return "Chụp ảnh sản phẩm sau khi đã hoàn thiện để gửi khách.";
        if (roomId === 'after1_debt') return "Kiểm tra lại nợ cũ của khách và xác nhận đã kiểm nợ.";
        if (roomId.startsWith('after2')) return "Đóng gói cẩn thận, dán mã vận đơn rõ ràng. Chụp ảnh gói hàng trước khi giao shipper.";
        return "Hoàn thành các nhiệm vụ trong giai đoạn này và cập nhật trạng thái.";
    };

    const getAllUniqueItems = () => {
        if (!order) return [];
        const allItems = [
            ...(order.customer_items || []),
            ...(order.sale_items || []),
            ...(order.items || [])
        ];
        return Array.from(new Map(allItems.map(item => [item.id, item])).values());
    };

    const uniqueItems = getAllUniqueItems();

    const getItemAfterSaleStage = (item: any) =>
        optimisticAfterSaleStages[item.id] ?? resolveItemAfterSaleStage(item);
    const isItemReadyToReturn = (item: any) => ['after2', 'after3', 'after4'].includes(getItemAfterSaleStage(item));

    const handoffEligibleProducts = useMemo(
        () =>
            uniqueItems.filter(
                (item) =>
                    (item as any).is_customer_item &&
                    item.item_type !== 'service' &&
                    ['after1_debt', 'after2', 'after3', 'after4'].includes(getItemAfterSaleStage(item))
            ),
        [uniqueItems, optimisticAfterSaleStages]
    );

    const invoiceProductDetails = useMemo(() => {
        if (!order) return [];

        const buildDetail = (item: any, services: any[], name: string, code?: string) => {
            const serviceLines = services.map((service: any) => {
                const quantity = Number(service.quantity || 1);
                const amount = Number(service.total_price ?? service.unit_price ?? service.service?.price ?? service.package?.price ?? 0) * quantity;
                const deposit = Math.max(0, Number(service.deposit_amount) || 0);
                return {
                    id: service.id,
                    name: service.item_name || service.service?.name || service.package?.name || 'Dịch vụ',
                    amount,
                    deposit,
                    collectDue: Math.max(0, amount - deposit),
                };
            });
            const serviceTotal = serviceLines.reduce((sum, s) => sum + s.amount, 0);
            const depositTotal = serviceLines.reduce((sum, s) => sum + s.deposit, 0);
            const surchargeTotal = Number(item.surcharge_amount || 0);
            const total = serviceTotal + surchargeTotal;

            return {
                id: item.id,
                name,
                code,
                afterSaleStage: getItemAfterSaleStage(item),
                services: serviceLines,
                surchargeTotal,
                depositTotal,
                total,
                collectDue: Math.max(0, total - depositTotal),
            };
        };

        if (Array.isArray(order.customer_items) && order.customer_items.length > 0) {
            return order.customer_items.map((item: any) => {
                const services = Array.isArray(item.services) ? item.services : [];
                return buildDetail(
                    item,
                    services,
                    item.name || item.item_name || 'Sản phẩm',
                    item.product_code || item.item_code
                );
            });
        }

        const customerProducts = uniqueItems.filter(item => (item as any).is_customer_item && item.item_type !== 'service');
        return customerProducts.map((item: any) => {
            const services = uniqueItems.filter((service: any) =>
                service.item_type === 'service' &&
                (service.product?.id === item.id || service.item_name?.includes(`(${item.item_name})`))
            );
            return buildDetail(item, services, item.item_name || 'Sản phẩm', item.item_code);
        });
    }, [order, uniqueItems, optimisticAfterSaleStages]);

    const handoffCollectAmount = useMemo(() => {
        return invoiceProductDetails
            .filter((detail) => ['after2', 'after3', 'after4'].includes(detail.afterSaleStage))
            .reduce((sum, detail) => sum + detail.collectDue, 0);
    }, [invoiceProductDetails]);

    const handoffSelectedCount = useMemo(() => {
        return invoiceProductDetails.filter((detail) => ['after2', 'after3', 'after4'].includes(detail.afterSaleStage)).length;
    }, [invoiceProductDetails]);

    useEffect(() => {
        if (!open || (!roomId.startsWith('after1_debt') && roomId !== 'after4')) return;
        setFormData((prev) => ({ ...prev, debt_collect_amount: handoffCollectAmount } as any));
    }, [open, roomId, handoffCollectAmount]);

    const getRemainingItemsCount = () => {
        return uniqueItems.filter(item => 
            (item as any).is_customer_item &&
            item.item_type !== 'service' &&
            !isItemReadyToReturn(item) && 
            item.status !== 'cancelled' &&
            item.status !== 'delivered'
        ).length;
    };

    const remainingItemsCount = getRemainingItemsCount();

    if (!group) return null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-none w-screen h-screen p-0 overflow-hidden flex flex-col rounded-none border-none">
                <DialogHeader className="shrink-0 p-3 md:p-4 border-b">
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 md:gap-3 min-w-0">
                            <div className="bg-primary/10 p-1.5 md:p-2 rounded-lg shrink-0">
                                <ShoppingBag className="h-4 w-4 md:h-5 md:w-5 text-primary" />
                            </div>
                            <div className="space-y-0.5 min-w-0">
                                <DialogTitle className="text-base md:text-xl font-bold tracking-tight truncate">
                                    {productName}
                                </DialogTitle>
                                <DialogDescription className="text-xs">
                                    {isAftersale || isCareFlow || isSalesStep ? getStageTitle() : 'Thông tin chi tiết sản phẩm và trao đổi nội bộ'}
                                </DialogDescription>
                            </div>
                        </div>

                        <div className="flex items-center gap-6">
                            {dueAt && (
                                <div className="text-right hidden sm:block">
                                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-none mb-1">Hạn trả sản phẩm</div>
                                    <div className="flex items-center gap-2">
                                        <Badge variant="outline" className="font-mono text-sm border-orange-200 text-orange-700 bg-orange-50 px-2 py-0.5">
                                            {formatDate(dueAt)}
                                        </Badge>
                                        <Badge className={cn(
                                            "font-mono text-sm px-2 py-0.5",
                                            timeLeft === 'ĐÃ QUÁ HẠN' ? "bg-red-500 hover:bg-red-600" : "bg-blue-600 hover:bg-blue-700"
                                        )}>
                                            {timeLeft}
                                        </Badge>
                                    </div>
                                </div>
                            )}
                            {product?.status && (
                                <Badge variant="secondary" className="capitalize text-[10px] font-bold px-2 py-1">
                                    {product.status}
                                </Badge>
                            )}
                        </div>
                    </div>
                </DialogHeader>

                <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
                    {/* Product Info - compact on mobile, sidebar on desktop */}
                    <div className="product-detail-info-panel shrink-0 md:w-[38%] md:max-w-[440px] min-h-0 overflow-y-auto overflow-x-hidden overscroll-y-contain touch-pan-y p-3 md:p-4 border-b md:border-b-0 md:border-r">
                        <div className="space-y-3 md:space-y-4">
                            {allImages?.length > 0 && (
                                <>
                                {/* Mobile: compact horizontal thumbnails */}
                                <div className="flex md:hidden gap-2 overflow-x-auto touch-pan-x overscroll-x-contain pb-1 -mx-1 px-1">
                                    {allImages.map((img: string, idx: number) => (
                                        <button
                                            key={`mob-${idx}`}
                                            type="button"
                                            onClick={() => { setActiveImageIdx(idx); setMainPreviewUrl(img); }}
                                            className={cn(
                                                "w-14 h-14 shrink-0 rounded-lg overflow-hidden border-2 transition-all",
                                                activeImageIdx === idx ? "border-primary ring-2 ring-primary/20" : "border-gray-100 opacity-70"
                                            )}
                                        >
                                            <img src={img} alt="" className="w-full h-full object-cover" />
                                        </button>
                                    ))}
                                </div>
                                <div className="hidden md:flex flex-col xl:flex-row gap-4">
                                    {/* Main Large Image */}
                                    <div 
                                        className="flex-[3] rounded-2xl overflow-hidden border-4 border-white shadow-xl bg-gray-50 max-h-[220px] lg:max-h-[280px] aspect-video relative group shrink-0 cursor-zoom-in"
                                        onClick={() => setMainPreviewUrl(allImages[activeImageIdx])}
                                    >
                                        <img
                                            src={allImages[activeImageIdx]}
                                            alt={`${productName}-${activeImageIdx}`}
                                            className="w-full h-full object-contain transition-transform group-hover:scale-105 duration-700"
                                        />
                                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                                            <Maximize2 className="w-10 h-10 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-2xl" />
                                        </div>
                                    </div>

                                    {/* Scrollable Thumbnails Right Side */}
                                    <div className="flex-1 space-y-4 max-h-[220px] lg:max-h-[280px] overflow-y-auto pr-2 custom-scrollbar">
                                        {/* Row 1: Original Product Photos */}
                                        {originalImages.length > 0 && (
                                            <div className="space-y-1.5">
                                                <div className="flex items-center gap-1.5 text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">
                                                    <ShoppingBag className="h-3 w-3" /> Ảnh sản phẩm lúc nhận
                                                </div>
                                                <div className="flex flex-wrap gap-2">
                                                    {originalImages.map((img: string, idx: number) => {
                                                        const globalIdx = allImages.indexOf(img);
                                                        return (
                                                            <button
                                                                key={`orig-${idx}`}
                                                                onClick={() => setActiveImageIdx(globalIdx)}
                                                                className={cn(
                                                                    "w-16 h-16 rounded-xl overflow-hidden border-2 transition-all",
                                                                    activeImageIdx === globalIdx ? "border-primary ring-2 ring-primary/20 scale-95" : "border-gray-100 opacity-60 hover:opacity-100"
                                                                )}
                                                            >
                                                                <img src={img} alt="" className="w-full h-full object-cover" />
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        {/* Row 2: Completion Photos */}
                                        {completionImages.length > 0 && (
                                            <div className="space-y-1.5">
                                                <div className="flex items-center gap-1.5 text-[10px] font-black text-purple-400 uppercase tracking-widest pl-1">
                                                    <Camera className="h-3 w-3" /> Ảnh hoàn thiện
                                                </div>
                                                <div className="flex flex-wrap gap-2">
                                                    {completionImages.map((img: string, idx: number) => {
                                                        const globalIdx = allImages.indexOf(img);
                                                        return (
                                                            <button
                                                                key={`comp-${idx}`}
                                                                onClick={() => setActiveImageIdx(globalIdx)}
                                                                className={cn(
                                                                    "w-16 h-16 rounded-xl overflow-hidden border-2 transition-all",
                                                                    activeImageIdx === globalIdx ? "border-purple-500 ring-2 ring-purple-500/20 scale-95" : "border-purple-50 opacity-60 hover:opacity-100"
                                                                )}
                                                            >
                                                                <img src={img} alt="" className="w-full h-full object-cover" />
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        {/* Row 3: Packaging Photos */}
                                        {packagingImages.length > 0 && (
                                            <div className="space-y-1.5">
                                                <div className="flex items-center gap-1.5 text-[10px] font-black text-blue-400 uppercase tracking-widest pl-1">
                                                    <Package className="h-3 w-3" /> Ảnh đóng gói
                                                </div>
                                                <div className="flex flex-wrap gap-2">
                                                    {packagingImages.map((img: string, idx: number) => {
                                                        const globalIdx = allImages.indexOf(img);
                                                        return (
                                                            <button
                                                                key={`pack-${idx}`}
                                                                onClick={() => setActiveImageIdx(globalIdx)}
                                                                className={cn(
                                                                    "w-16 h-16 rounded-xl overflow-hidden border-2 transition-all",
                                                                    activeImageIdx === globalIdx ? "border-blue-500 ring-2 ring-blue-500/20 scale-95" : "border-blue-50 opacity-60 hover:opacity-100"
                                                                )}
                                                            >
                                                                <img src={img} alt="" className="w-full h-full object-cover" />
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                </>
                            )}

                            <div className="space-y-3 max-md:hidden">
                                <h3 className="font-semibold text-xs uppercase tracking-[0.2em] text-gray-400">Thông tin chi tiết</h3>
                                <div className="grid grid-cols-1 gap-3 text-sm bg-gray-50/50 p-3 rounded-xl border border-gray-100">
                                    {productItem?.product_type && (
                                        <div className="flex items-center gap-3">
                                            <Tag className="h-4 w-4 text-primary/60 shrink-0" />
                                            <span className="text-gray-500 min-w-[70px]">Loại:</span>
                                            <span className="font-bold text-gray-800 tracking-tight capitalize">{productItem.product_type}</span>
                                        </div>
                                    )}
                                    {productItem?.product_brand && (
                                        <div className="flex items-center gap-3">
                                            <Tag className="h-4 w-4 text-primary/60 shrink-0" />
                                            <span className="text-gray-500 min-w-[70px]">Hãng:</span>
                                            <span className="font-bold text-gray-800 tracking-tight capitalize">{productItem.product_brand}</span>
                                        </div>
                                    )}
                                    {productItem?.product_color && (
                                        <div className="flex items-center gap-3">
                                            <div className="h-4 w-4 rounded-full border-2 border-white shadow-sm shrink-0" style={{ backgroundColor: productItem.product_color }} />
                                            <span className="text-gray-500 min-w-[70px]">Màu sắc:</span>
                                            <span className="font-bold text-gray-800 tracking-tight capitalize">{productItem.product_color}</span>
                                        </div>
                                    )}
                                    {productItem?.product_notes && (
                                        <div className="flex items-start gap-3">
                                            <FileText className="h-4 w-4 text-primary/60 shrink-0 mt-0.5" />
                                            <span className="text-gray-500 min-w-[70px]">Ghi chú:</span>
                                            <span className="font-medium text-gray-700 leading-relaxed italic pr-2">{productItem.product_notes}</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Staff Info Card */}
                            <div className="space-y-3 max-md:hidden">
                                <h3 className="font-semibold text-xs uppercase tracking-[0.2em] text-gray-400">Nhân sự phụ trách</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm flex items-center gap-3">
                                        <div className="h-8 w-8 rounded-lg bg-orange-50 flex items-center justify-center shrink-0">
                                            <UserIcon className="h-4 w-4 text-orange-500" />
                                        </div>
                                        <div className="flex flex-col min-w-0">
                                            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-tight">HĐ TẠO BỞI</span>
                                            <span className="text-xs font-bold text-gray-800 truncate">{(order as any).created_by_user?.name || 'Hệ thống'}</span>
                                        </div>
                                    </div>
                                    <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm flex items-center gap-3">
                                        <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                                            <ShieldCheck className="h-4 w-4 text-blue-500" />
                                        </div>
                                        <div className="flex flex-col min-w-0">
                                            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-tight">SALE CHỐT</span>
                                            <span className="text-xs font-bold text-gray-800 truncate">{assignedSaleNames || 'Chưa gán'}</span>
                                        </div>
                                    </div>
                                    {assignedTechnicianNames && (
                                        <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm flex items-center gap-3 sm:col-span-2">
                                            <div className="h-8 w-8 rounded-lg bg-purple-50 flex items-center justify-center shrink-0">
                                                <Wrench className="h-4 w-4 text-purple-500" />
                                            </div>
                                            <div className="flex flex-col min-w-0">
                                                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-tight">KỸ THUẬT VIÊN</span>
                                                <span className="text-xs font-bold text-gray-800 truncate">
                                                    {assignedTechnicianNames}
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Stage Instructions Card */}
                            <div className="bg-primary/5 p-4 rounded-xl border border-primary/10 space-y-2 max-md:hidden">
                                <div className="flex items-center gap-2">
                                    <Sparkles className="h-4 w-4 text-primary" />
                                    <h3 className="font-bold text-xs uppercase tracking-tight text-primary">Hướng dẫn Giai đoạn này</h3>
                                </div>
                                <p className="text-xs text-gray-600 leading-relaxed font-medium">
                                    {getStageInstructions()}
                                </p>
                            </div>

                            <div className="space-y-3 max-md:hidden">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-7 text-[10px] font-bold border-purple-200 hover:bg-purple-50 hover:text-purple-700 bg-purple-50/30 gap-1.5"
                                        onClick={() => setShowUpsellDialog(true)}
                                    >
                                        <Sparkles className="h-3 w-3 text-purple-500" />
                                        UPSALE
                                    </Button>
                                </div>
                                <div className="space-y-2 max-md:hidden">
                                    {services.map((svc) => (
                                        <div key={svc.id} className="p-3.5 rounded-xl border bg-white shadow-sm hover:shadow-md transition-shadow group">
                                            <div className="flex items-center gap-2.5 font-bold text-sm text-gray-800">
                                                <div className="h-8 w-8 rounded-lg bg-primary/5 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                                                    <Wrench className="h-4 w-4 text-primary" />
                                                </div>
                                                {svc.item_name}
                                            </div>
                                            {(svc as any).technician && (
                                                <div className="flex items-center gap-2 mt-2.5 ml-10.5 text-[11px] text-gray-500">
                                                    <UserIcon className="h-3 w-3" />
                                                    <span className="font-medium">Kỹ thuật viên: <span className="text-gray-800">{(svc as any).technician.name}</span></span>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                            </div>
                        </div>
                    </div>

                    {/* Form panel — takes remaining height, especially on mobile */}
                    <div className="product-detail-form-panel flex-1 min-h-0 flex flex-col overflow-hidden bg-gray-50/40 md:min-w-0">
                        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-y-contain touch-pan-y product-detail-scroll-area">
                        <div className="p-3 md:p-4 flex flex-col gap-3 md:gap-4 min-h-0 pb-6">
                            {/* Consolidated Due Date / Pickup Block */}
                            <div className={cn(
                                "product-detail-form-card p-3 md:p-4 rounded-2xl border shadow-sm space-y-3 shrink-0",
                                isAftersale ? "bg-blue-50/50 border-blue-100" : "bg-white border-gray-100"
                            )}>
                                <div className={cn(
                                    "flex items-center gap-2 text-[11px] font-black uppercase tracking-tight",
                                    isAftersale ? "text-blue-900" : "text-gray-400 font-bold tracking-widest text-xs"
                                )}>
                                    <div className={cn(
                                        "h-6 w-6 rounded-lg flex items-center justify-center",
                                        isAftersale ? "bg-blue-100" : "bg-gray-100"
                                    )}>
                                        <Calendar className={cn("h-3.5 w-3.5", isAftersale ? "text-blue-600" : "text-gray-400")} />
                                    </div>
                                    {isAftersale ? "LỊCH HẸN TRẢ ĐỒ (PICKUP)" : "Hẹn trả sản phẩm này"}
                                </div>
                                <div className="flex gap-2">
                                    <Input
                                        type="datetime-local"
                                        className={cn(
                                            "h-9 text-xs rounded-xl",
                                            isAftersale ? "bg-white border-blue-200" : "bg-white border-gray-200"
                                        )}
                                        value={dueAt}
                                        onChange={(e) => setDueAt(e.target.value)}
                                        disabled={isInputDisabled}
                                    />
                                    <Button
                                        size="sm"
                                        className={cn(
                                            "h-9 px-3 rounded-xl gap-2 font-bold",
                                            isAftersale ? "bg-blue-600 hover:bg-blue-700 text-white" : "border-slate-200"
                                        )}
                                        onClick={handleSaveDueDate}
                                        disabled={saving || isInputDisabled}
                                    >
                                        {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : (isAftersale ? 'LƯU' : <Save className="h-4 w-4" />)}
                                    </Button>
                                </div>
                                {hasPendingRequest && currentExtensionRequest && (
                                    <div className="bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded-xl text-xs space-y-1.5 mt-2 shadow-sm">
                                        <div className="flex items-center gap-1.5 font-bold text-amber-900">
                                            <span className="relative flex h-2 w-2">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-450 opacity-75"></span>
                                                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                                            </span>
                                            Yêu cầu gia hạn đang chờ duyệt
                                        </div>
                                        <p className="text-[11px] text-amber-800">
                                            <strong>Hạn mới đề xuất:</strong> {formatDateTime(currentExtensionRequest.new_due_at)}
                                        </p>
                                        <p className="text-[11px] text-amber-700 leading-tight">
                                            <strong>Lý do:</strong> {currentExtensionRequest.reason}
                                        </p>
                                    </div>
                                )}
                                {!canEditDueDate && (
                                    <p className="text-[10px] text-rose-500 italic pl-1 leading-normal">
                                        * Bạn không có quyền chỉnh sửa ngày hẹn trả sản phẩm này.
                                    </p>
                                )}
                                {isAftersale ? (
                                    <p className="text-[10px] text-blue-500 italic leading-tight">
                                        * Hệ thống sẽ gửi tin nhắn nhắc nhở tự động 1 lần/ngày nếu khách quá hẹn chưa qua lấy đồ.
                                    </p>
                                ) : (
                                    <p className="text-[10px] text-muted-foreground italic pl-1">
                                        * Mặc định sẽ lấy hạn trả của toàn đơn nếu để trống.
                                    </p>
                                )}
                            </div>

                            {isAftersale && order ? (
                                <div className="flex-1 flex flex-col gap-4">
                                    {pendingMoveValidationErrors.length > 0 && (
                                        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                                            <p className="font-bold mb-1.5">Cần hoàn thành trước khi chuyển bước:</p>
                                            <ul className="list-disc pl-4 space-y-0.5">
                                                {pendingMoveValidationErrors.map((line) => (
                                                    <li key={line}>{line}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                    {(roomId.startsWith('after1') || roomId.startsWith('after4')) && (
                                        <div className="space-y-3">
                                            {/* Received Product Photos */}
                                            <div className="bg-blue-50/50 p-4 rounded-2xl border border-blue-100 shadow-sm space-y-3">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <div className="h-7 w-7 rounded-lg bg-blue-100 flex items-center justify-center">
                                                            <Camera className="h-4 w-4 text-blue-600" />
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <span className="text-[11px] font-black text-blue-900 uppercase tracking-tight">ẢNH SẢN PHẨM LÚC NHẬN</span>
                                                            <span className="text-[9px] text-blue-500 font-medium italic">Đối chiếu góc chụp trước khi chụp ảnh hoàn thiện</span>
                                                        </div>
                                                    </div>
                                                    <Badge variant="outline" className="text-[9px] bg-white text-blue-600 border-blue-200">
                                                        {originalImages.length} ảnh/video
                                                    </Badge>
                                                </div>

                                                {originalImages.length > 0 ? (
                                                    <MultiMediaUpload
                                                        value={originalImages}
                                                        onChange={() => undefined}
                                                        disabled
                                                        bucket="orders"
                                                        folder="received"
                                                    />
                                                ) : (
                                                    <div className="rounded-xl border border-dashed border-blue-100 bg-white/70 p-4 text-center text-[10px] font-semibold text-blue-300">
                                                        Chưa có ảnh sản phẩm lúc nhận
                                                    </div>
                                                )}
                                            </div>

                                            {/* Proof Photos */}
                                            <div className="bg-purple-50/50 p-4 rounded-2xl border border-purple-100 shadow-sm space-y-3">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <div className="h-7 w-7 rounded-lg bg-purple-100 flex items-center justify-center">
                                                            <Camera className="h-4 w-4 text-purple-600" />
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <span className="text-[11px] font-black text-purple-900 uppercase tracking-tight">ẢNH HOÀN THIỆN</span>
                                                            <span className="text-[9px] text-purple-500 font-medium italic">Chụp ảnh sản phẩm đã hoàn thiện</span>
                                                        </div>
                                                    </div>
                                                    <Badge variant="outline" className="text-[9px] bg-white text-purple-600 border-purple-200">
                                                        {(formData.completion_photos?.length || 0)} ảnh/video
                                                    </Badge>
                                                </div>

                                                <MultiMediaUpload
                                                    value={Array.isArray(formData.completion_photos) ? formData.completion_photos : []}
                                                    onChange={(urls) => setFormData(prev => ({ ...prev, completion_photos: urls }))}
                                                    bucket="orders"
                                                    folder="completion"
                                                />
                                            </div>

                                            <div className="space-y-2">
                                                <Label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1.5">
                                                    Người chụp After
                                                    {(roomId === 'after1' || roomId === 'after4') && <span className="text-rose-500">*</span>}
                                                </Label>
                                                <StaffNameSelect
                                                    className="bg-white h-9"
                                                    value={formData.aftersale_receiver_name || ''}
                                                    onValueChange={(val) => setFormData(prev => ({ ...prev, aftersale_receiver_name: val }))}
                                                    users={users}
                                                    placeholder="Chọn nhân viên..."
                                                    disabled={isInputDisabled}
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {(roomId.startsWith('after1_debt') || roomId.startsWith('after4')) && (
                                        <div className="space-y-3">
                                            <h3 className="font-semibold text-xs uppercase tracking-[0.2em] text-purple-800">Thông tin thanh toán (Kiểm nợ)</h3>
                                            <div className="bg-white p-4 rounded-2xl border border-purple-100 shadow-sm space-y-4">
                                                <div className="flex justify-between items-center bg-purple-50/50 p-2.5 rounded-xl border border-purple-50">
                                                    <span className="text-xs font-semibold text-purple-700">NGƯỜI TRẢ ĐỒ:</span>
                                                    <Badge className="bg-purple-600 font-bold hover:bg-purple-700 transition-colors text-white">
                                                        {order.sales_user?.name || 'Sale'}
                                                    </Badge>
                                                </div>

                                                <div className="space-y-3.5 px-1">
                                                    <div className="flex justify-between items-center text-sm">
                                                        <span className="text-gray-500">Tổng đơn:</span>
                                                        <span className="font-bold text-gray-900">{formatCurrency(order.total_amount)}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center text-sm">
                                                        <span className="text-gray-500 font-medium">Đã thanh toán:</span>
                                                        <span className="font-bold text-green-600">{formatCurrency(order.paid_amount || 0)}</span>
                                                    </div>

                                                    <div className="space-y-2 pt-2 border-t border-purple-50">
                                                        <Label className="text-[10px] font-black text-purple-700 uppercase">Chi tiết hóa đơn theo sản phẩm:</Label>
                                                        <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1 custom-scrollbar">
                                                            {invoiceProductDetails.length > 0 ? invoiceProductDetails.map(item => (
                                                                <div key={item.id} className="rounded-xl border border-purple-100 bg-purple-50/20 p-2.5 space-y-2">
                                                                    <div className="flex items-start justify-between gap-2">
                                                                        <div className="min-w-0">
                                                                            <div className="text-[11px] font-black text-gray-900 uppercase truncate">{item.name}</div>
                                                                            {item.code && <div className="text-[9px] font-bold text-gray-400 uppercase">{item.code}</div>}
                                                                        </div>
                                                                        <div className="flex flex-col items-end gap-1 shrink-0">
                                                                            <span className="text-xs font-black text-purple-700 tabular-nums">{formatCurrency(item.total)}</span>
                                                                            <Badge className={cn(
                                                                                "text-[9px] h-4 px-1 whitespace-nowrap",
                                                                                ['after2', 'after3', 'after4'].includes(item.afterSaleStage) ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                                                                            )}>
                                                                                {['after2', 'after3', 'after4'].includes(item.afterSaleStage) ? 'Sắp trả' : 'Chờ trả'}
                                                                            </Badge>
                                                                        </div>
                                                                    </div>

                                                                    {item.services.length > 0 ? (
                                                                        <div className="space-y-1 border-t border-purple-100 pt-1.5">
                                                                            {item.services.map((service: { id: string; name: string; amount: number; deposit?: number; collectDue?: number }) => (
                                                                                <div key={service.id} className="space-y-0.5 text-[11px]">
                                                                                    <div className="flex justify-between gap-2">
                                                                                        <span className="text-gray-500 truncate">{service.name}</span>
                                                                                        <span className="font-bold text-gray-800 tabular-nums whitespace-nowrap">{formatCurrency(service.amount)}</span>
                                                                                    </div>
                                                                                    {(service.deposit ?? 0) > 0 && (
                                                                                        <div className="flex justify-between gap-2 pl-2 text-[10px] text-amber-700">
                                                                                            <span>Đã cọc</span>
                                                                                            <span className="tabular-nums">−{formatCurrency(service.deposit!)}</span>
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            ))}
                                                                            {item.depositTotal > 0 && (
                                                                                <div className="flex justify-between gap-2 border-t border-purple-100 pt-1 text-[10px] font-bold text-purple-800">
                                                                                    <span>Cần thu SP này</span>
                                                                                    <span className="tabular-nums">{formatCurrency(item.collectDue)}</span>
                                                                                </div>
                                                                            )}
                                                                            {item.surchargeTotal > 0 && (
                                                                                <div className="flex justify-between gap-2 text-[11px]">
                                                                                    <span className="text-gray-500 truncate">Phụ thu</span>
                                                                                    <span className="font-bold text-gray-800 tabular-nums whitespace-nowrap">{formatCurrency(item.surchargeTotal)}</span>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    ) : (
                                                                        <div className="text-[10px] font-semibold text-gray-400 italic border-t border-purple-100 pt-1.5">
                                                                            Chưa có dịch vụ tính tiền cho sản phẩm này
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )) : (
                                                                <div className="rounded-xl border border-dashed border-purple-100 bg-purple-50/20 p-3 text-center text-[11px] font-semibold text-gray-400">
                                                                    Chưa có chi tiết hóa đơn theo sản phẩm
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="flex justify-between items-center text-sm pt-1 pb-1">
                                                        <span className="text-red-500 font-bold uppercase text-[10px]">CÒN CHƯA TRẢ KHÁCH:</span>
                                                        <Badge variant="destructive" className="font-bold h-5 px-1.5 text-[10px]">{remainingItemsCount} sản phẩm</Badge>
                                                    </div>

                                                    <div className="space-y-2 mb-2 pt-2 border-t border-purple-50">
                                                        <Label className="text-[10px] font-black text-blue-600 uppercase">Danh sách bàn giao đợt này:</Label>
                                                        <p className="text-[10px] text-muted-foreground leading-snug">
                                                            Chỉ hiện SP đã qua Kiểm nợ. SP khác trên đơn vẫn ở Ảnh hoàn thiện cho đến khi chuyển bước riêng.
                                                        </p>
                                                        <div className="space-y-1.5 max-h-[150px] overflow-y-auto pr-1 custom-scrollbar">
                                                            {handoffEligibleProducts.length === 0 ? (
                                                                <p className="text-[10px] text-gray-400 italic py-2 text-center">
                                                                    Chưa có SP nào ở bước Kiểm nợ để bàn giao đợt này.
                                                                </p>
                                                            ) : null}
                                                            {handoffEligibleProducts.map(item => (
                                                                <div key={item.id} className="flex items-center justify-between p-2 rounded-lg border bg-blue-50/20 hover:bg-white transition-colors group">
                                                                    <div className="flex items-center gap-2 min-w-0">
                                                                        <Checkbox 
                                                                            id={`item-sent-${item.id}`}
                                                                            checked={isItemReadyToReturn(item)}
                                                                            onCheckedChange={async (checked) => {
                                                                                const currentStage = getItemAfterSaleStage(item);
                                                                                if (checked && currentStage === 'after1') {
                                                                                    toast.error('Sản phẩm chưa qua Kiểm nợ — hoàn thành ảnh hoàn thiện và chuyển sang Kiểm nợ trước');
                                                                                    return;
                                                                                }
                                                                                if (checked) {
                                                                                    if (!formData.debt_checked) {
                                                                                        toast.error('Vui lòng tick "Xác nhận đã kiểm nợ" trước khi bàn giao sản phẩm');
                                                                                        return;
                                                                                    }
                                                                                    if (!formData.debt_checked_by_name?.trim()) {
                                                                                        toast.error('Vui lòng chọn Người thu tiền');
                                                                                        return;
                                                                                    }
                                                                                }
                                                                                const nextStage = checked ? 'after2' : 'after1_debt';
                                                                                const previousStage = currentStage;

                                                                                setOptimisticAfterSaleStages(prev => ({ ...prev, [item.id]: nextStage }));

                                                                                // Cập nhật ghi chú kiểm nợ
                                                                                const noteLine = `Đã trả ${item.item_name} cho khách`.toUpperCase();
                                                                                let currentNotes = (formData as any).debt_checked_notes || '';
                                                                                if (checked) {
                                                                                    if (!currentNotes.toUpperCase().includes(noteLine)) {
                                                                                        currentNotes = currentNotes ? `${currentNotes}\n${noteLine}` : noteLine;
                                                                                    }
                                                                                } else {
                                                                                    currentNotes = currentNotes.split('\n').filter((line: string) => line.trim().toUpperCase() !== noteLine).join('\n');
                                                                                }
                                                                                setFormData(prev => ({ ...prev, debt_checked_notes: currentNotes } as any));

                                                                                if (!onUpdateItemAfterSaleData) return;

                                                                                try {
                                                                                    if (checked && onUpdateOrder) {
                                                                                        await onUpdateOrder(
                                                                                            pickOrderLevelAfterSalePatch({
                                                                                                debt_checked: formData.debt_checked,
                                                                                                debt_checked_notes: formData.debt_checked_notes,
                                                                                                debt_checked_by_name: formData.debt_checked_by_name,
                                                                                            }),
                                                                                        );
                                                                                    }
                                                                                    await onUpdateItemAfterSaleData(item.id, !!(item as any).is_customer_item, { stage: nextStage });
                                                                                    onReloadOrder?.();
                                                                                } catch (error) {
                                                                                    console.error('Update handoff item error:', error);
                                                                                    setOptimisticAfterSaleStages(prev => ({ ...prev, [item.id]: previousStage }));
                                                                                    toast.error('Không cập nhật được trạng thái bàn giao');
                                                                                }
                                                                            }}
                                                                        />
                                                                        <Label htmlFor={`item-sent-${item.id}`} className="text-[11px] font-bold truncate cursor-pointer uppercase">
                                                                            {item.item_name}
                                                                        </Label>
                                                                    </div>
                                                                    <Badge className={cn(
                                                                        "text-[9px] h-4 px-1 whitespace-nowrap",
                                                                        isItemReadyToReturn(item) ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                                                                    )}>
                                                                        {isItemReadyToReturn(item) ? 'Sắp trả' : 'Chờ trả'}
                                                                    </Badge>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    <div className="pt-3 mt-1 border-t-2 border-dashed border-purple-100 space-y-3">
                                                        <div className="rounded-xl border border-blue-200 bg-blue-50/50 px-3 py-2 text-[11px]">
                                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                                <span className="font-bold text-blue-800">
                                                                    SP bàn giao đợt này: {handoffSelectedCount}
                                                                </span>
                                                                <span className="font-black text-blue-900 tabular-nums">
                                                                    Thu: {formatCurrency(handoffCollectAmount)}
                                                                </span>
                                                            </div>
                                                            <p className="mt-1 text-[10px] text-blue-600/90 leading-snug">
                                                                Tự động = tổng (giá SP − cọc từng dịch vụ) của các SP đã tick bàn giao.
                                                            </p>
                                                        </div>
                                                        <div className="grid grid-cols-2 gap-3">
                                                            <div className="space-y-1.5">
                                                                <Label className="text-[10px] font-black text-purple-900 uppercase">SỐ TIỀN THU (ĐIỀU CHỈNH):</Label>
                                                                <div className="relative">
                                                                    <Input
                                                                        type="text"
                                                                        className="h-10 text-lg font-black text-red-600 bg-white border-red-200"
                                                                        value={(formData as any).debt_collect_amount?.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".") || "0"}
                                                                        onChange={(e) => {
                                                                            const val = e.target.value.replace(/\./g, "");
                                                                            if (/^\d*$/.test(val)) {
                                                                                setFormData(prev => ({ ...prev, debt_collect_amount: val ? parseInt(val, 10) : 0 } as any));
                                                                            }
                                                                        }}
                                                                    />
                                                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 font-bold text-gray-400">đ</span>
                                                                </div>
                                                            </div>
                                                            <div className="space-y-1.5">
                                                                <Label className="text-[10px] font-bold text-gray-500 uppercase">PT THANH TOÁN:</Label>
                                                                <Select 
                                                                    value={(formData as any).debt_payment_method || 'cash'}
                                                                    onValueChange={(val) => setFormData(prev => ({ ...prev, debt_payment_method: val } as any))}
                                                                >
                                                                    <SelectTrigger className="bg-white h-10 border-purple-200">
                                                                        <SelectValue />
                                                                    </SelectTrigger>
                                                                    <SelectContent>
                                                                        <SelectItem value="cash">Tiền mặt</SelectItem>
                                                                        <SelectItem value="transfer">Chuyển khoản</SelectItem>
                                                                        <SelectItem value="zalopay">Zalo Pay</SelectItem>
                                                                    </SelectContent>
                                                                </Select>
                                                            </div>
                                                        </div>

                                                        <div className="flex justify-between items-center">
                                                            <span className="text-xs font-black text-purple-900 uppercase tracking-tight">Cần thu còn lại:</span>
                                                            <span className="font-black text-lg text-gray-500">
                                                                {formatCurrency((order.remaining_debt ?? (order.total_amount - (order.paid_amount || 0))) - ((formData as any).debt_collect_amount || 0))}
                                                            </span>
                                                        </div>

                                                        <div className="space-y-1.5 pt-2">
                                                            <Label className="text-[10px] font-black text-purple-900 uppercase flex items-center gap-1.5">
                                                                <Camera className="h-3.5 w-3.5 text-purple-500" />
                                                                ẢNH THU TIỀN <span className="text-rose-500">*</span>
                                                            </Label>
                                                            <p className="text-[9px] text-purple-500 font-medium italic leading-tight">
                                                                Chụp ảnh khách đã chuyển khoản hoặc chụp tiền mặt làm bằng chứng
                                                            </p>
                                                            <MultiMediaUpload
                                                                value={(formData as any).debt_payment_photos || []}
                                                                onChange={(urls) => setFormData(prev => ({ ...prev, debt_payment_photos: urls } as any))}
                                                                bucket="orders"
                                                                folder="debt-payment"
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="space-y-3 pt-1">
                                                <div className="flex items-center space-x-2 bg-white p-3 rounded-xl border shadow-sm">
                                                    <Checkbox
                                                        id="debt_checked"
                                                        checked={formData.debt_checked}
                                                        onCheckedChange={(checked) => setFormData(prev => ({ ...prev, debt_checked: !!checked }))}
                                                    />
                                                    <Label htmlFor="debt_checked" className="text-sm font-semibold cursor-pointer">Xác nhận đã kiểm nợ</Label>
                                                </div>
                                                <div className="space-y-2">
                                                    <Label className="text-xs font-bold text-gray-500 uppercase">Ghi chú kiểm nợ</Label>
                                                    <Textarea
                                                        placeholder="Nhập ghi chú kiểm nợ nếu có..."
                                                        className="bg-white min-h-[80px]"
                                                        value={formData.debt_checked_notes || ''}
                                                        onChange={(e) => setFormData(prev => ({ ...prev, debt_checked_notes: e.target.value }))}
                                                    />
                                                </div>

                                                <div className="space-y-2">
                                                    <Label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1.5">
                                                        Người thu tiền
                                                        {(roomId.startsWith('after1_debt') || roomId === 'after4') && <span className="text-rose-500">*</span>}
                                                    </Label>
                                                    <StaffNameSelect
                                                        className="bg-white h-9"
                                                        value={formData.debt_checked_by_name || ''}
                                                        onValueChange={(val) => setFormData(prev => ({ ...prev, debt_checked_by_name: val }))}
                                                        users={users}
                                                        placeholder="Chọn nhân viên..."
                                                        disabled={isInputDisabled}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Delivery Info */}
                                    {(roomId.startsWith('after2') || roomId.startsWith('after4')) && (
                                        <div className="space-y-3">
                                            <h3 className="font-semibold text-xs uppercase tracking-[0.2em] text-blue-800">Giao hàng</h3>
                                            <div className="bg-white p-4 rounded-2xl border border-blue-50 shadow-sm space-y-4">
                                                {roomId.startsWith('after2') ? (
                                                    <div className="space-y-4">
                                                        <div className="flex p-1 bg-gray-100 rounded-xl">
                                                            <button
                                                                type="button"
                                                                onClick={() => setFormData(p => ({ ...p, delivery_type: 'ship' }))}
                                                                className={cn(
                                                                    "flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-bold transition-all",
                                                                    formData.delivery_type !== 'pickup' ? "bg-white shadow text-blue-600 scale-100" : "text-gray-500 hover:text-gray-700"
                                                                )}
                                                            >
                                                                <Truck className="h-4 w-4" />
                                                                Ship tận nơi
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => setFormData(p => ({ ...p, delivery_type: 'pickup' }))}
                                                                className={cn(
                                                                    "flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-bold transition-all",
                                                                    formData.delivery_type === 'pickup' ? "bg-white shadow text-blue-600 scale-100" : "text-gray-500 hover:text-gray-700"
                                                                )}
                                                            >
                                                                <UserIcon className="h-4 w-4" />
                                                                Khách đến lấy
                                                            </button>
                                                        </div>

                                                        {formData.delivery_type === 'pickup' ? (
                                                            <div className="space-y-4">
                                                                <div className="grid grid-cols-1 gap-4">
                                                                    <div className="space-y-2">
                                                                        <Label className="text-[10px] font-black text-blue-600 uppercase tracking-tight flex items-center gap-1">
                                                                            SĐT LIÊN HỆ <span className="text-red-500">*</span>
                                                                        </Label>
                                                                        <Input
                                                                            placeholder="Nhập SĐT..."
                                                                            className="h-9"
                                                                            value={formData.delivery_shipper_phone || ''}
                                                                            onChange={(e) => setFormData(prev => ({ ...prev, delivery_shipper_phone: e.target.value }))}
                                                                        />
                                                                    </div>
                                                                </div>

                                                                <div className="grid grid-cols-2 gap-4">
                                                                    <div className="space-y-2">
                                                                        <Label className="text-[10px] font-black text-blue-600 uppercase tracking-tight flex items-center gap-1">
                                                                            NV GIAO ĐỒ <span className="text-red-500">*</span>
                                                                        </Label>
                                                                        <StaffNameSelect
                                                                            className="h-9 bg-white"
                                                                            value={formData.delivery_staff_name || ''}
                                                                            onValueChange={(val) => setFormData(prev => ({ ...prev, delivery_staff_name: val }))}
                                                                            users={users}
                                                                            disabled={isInputDisabled}
                                                                        />
                                                                    </div>
                                                                    <div className="space-y-2">
                                                                        <Label className="text-[10px] font-black text-blue-600 uppercase tracking-tight flex items-center gap-1">
                                                                            THỜI GIAN NHẬN <span className="text-red-500">*</span>
                                                                        </Label>
                                                                        <Input
                                                                            type="datetime-local"
                                                                            className="h-9"
                                                                            value={formData.delivery_received_at || ''}
                                                                            onChange={(e) => setFormData(prev => ({ ...prev, delivery_received_at: e.target.value }))}
                                                                        />
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div className="space-y-4">
                                                                <div className="grid grid-cols-2 gap-4">
                                                                    <div className="space-y-2">
                                                                        <Label className="text-[10px] font-black text-blue-600 uppercase tracking-tight flex items-center gap-1">
                                                                            NV TẠO ĐƠN <span className="text-red-500">*</span>
                                                                        </Label>
                                                                        <StaffNameSelect
                                                                            className="h-9 bg-white"
                                                                            value={formData.delivery_creator_name || ''}
                                                                            onValueChange={(val) => setFormData(prev => ({ ...prev, delivery_creator_name: val }))}
                                                                            users={users}
                                                                            disabled={isInputDisabled}
                                                                        />
                                                                    </div>
                                                                    <div className="space-y-2">
                                                                        <Label className="text-[10px] font-black text-blue-600 uppercase tracking-tight flex items-center gap-1">
                                                                            SDT SHIP LẤY HÀNG <span className="text-red-500">*</span>
                                                                        </Label>
                                                                        <Input
                                                                            placeholder="09xx..."
                                                                            className="h-9"
                                                                            value={formData.delivery_shipper_phone || ''}
                                                                            onChange={(e) => setFormData(prev => ({ ...prev, delivery_shipper_phone: e.target.value }))}
                                                                        />
                                                                    </div>
                                                                </div>

                                                                <div className="grid grid-cols-2 gap-4">
                                                                    <div className="space-y-2">
                                                                        <Label className="text-[10px] font-black text-blue-600 uppercase tracking-tight flex items-center gap-1">
                                                                            NV VẬN CHUYỂN <span className="text-red-500">*</span>
                                                                        </Label>
                                                                        <Select
                                                                            value={
                                                                                DELIVERY_CARRIER_OPTIONS.includes(formData.delivery_carrier as any)
                                                                                    ? (formData.delivery_carrier as string)
                                                                                    : formData.delivery_carrier
                                                                                        ? 'Khác'
                                                                                        : ''
                                                                            }
                                                                            onValueChange={(val) => {
                                                                                if (val === 'Khác') {
                                                                                    setFormData(prev => ({ ...prev, delivery_carrier: '' }));
                                                                                } else {
                                                                                    setFormData(prev => ({ ...prev, delivery_carrier: val }));
                                                                                }
                                                                            }}
                                                                        >
                                                                            <SelectTrigger className="h-9 bg-white">
                                                                                <SelectValue placeholder="Chọn đơn vị..." />
                                                                            </SelectTrigger>
                                                                            <SelectContent>
                                                                                {DELIVERY_CARRIER_OPTIONS.map((name) => (
                                                                                    <SelectItem key={name} value={name}>{name}</SelectItem>
                                                                                ))}
                                                                            </SelectContent>
                                                                        </Select>
                                                                        {(formData.delivery_carrier === '' ||
                                                                            !DELIVERY_CARRIER_OPTIONS.includes(formData.delivery_carrier as (typeof DELIVERY_CARRIER_OPTIONS)[number])) && (
                                                                            <Input
                                                                                className="h-9"
                                                                                placeholder="Nhập tên đơn vị..."
                                                                                value={formData.delivery_carrier || ''}
                                                                                onChange={(e) => setFormData(prev => ({ ...prev, delivery_carrier: e.target.value }))}
                                                                            />
                                                                        )}
                                                                    </div>
                                                                    <div className="space-y-2">
                                                                        <Label className="text-[10px] font-black text-blue-600 uppercase tracking-tight flex items-center gap-1">
                                                                            THỜI GIAN KHÁCH NHẬN <span className="text-red-500">*</span>
                                                                        </Label>
                                                                        <Input
                                                                            type="datetime-local"
                                                                            className="h-9"
                                                                            value={formData.delivery_received_at || ''}
                                                                            onChange={(e) => setFormData(prev => ({ ...prev, delivery_received_at: e.target.value }))}
                                                                        />
                                                                    </div>
                                                                </div>

                                                                <div className="space-y-4 border-t border-blue-50 pt-4">
                                                                    <div className="grid grid-cols-2 gap-4">
                                                                        <div className="space-y-2">
                                                                            <Label className="text-xs font-bold text-gray-500 uppercase">Mã vận đơn</Label>
                                                                            <Input
                                                                                placeholder="Nhập mã..."
                                                                                value={formData.delivery_code || ''}
                                                                                onChange={(e) => setFormData(prev => ({ ...prev, delivery_code: e.target.value }))}
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                    
                                                                    <div className="grid grid-cols-2 gap-4">
                                                                        <div className="space-y-2">
                                                                            <Label className="text-xs font-bold text-gray-500 uppercase">Phí Ship</Label>
                                                                            <Input
                                                                                type="text"
                                                                                placeholder="0"
                                                                                value={formData.delivery_fee ? formData.delivery_fee.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".") : ""}
                                                                                onChange={(e) => {
                                                                                    const val = e.target.value.replace(/\./g, "");
                                                                                    if (/^\d*$/.test(val)) {
                                                                                        setFormData(prev => ({ ...prev, delivery_fee: val ? parseInt(val, 10) : 0 }));
                                                                                    }
                                                                                }}
                                                                            />
                                                                        </div>
                                                                        <div className="space-y-2">
                                                                            <Label className="text-xs font-bold text-gray-500 uppercase">PT Thanh toán Ship</Label>
                                                                            <Select 
                                                                                value={(formData as any).delivery_payment_method || 'cash'}
                                                                                onValueChange={(val) => setFormData(prev => ({ ...prev, delivery_payment_method: val }))}
                                                                            >
                                                                                <SelectTrigger className="bg-white">
                                                                                    <SelectValue />
                                                                                </SelectTrigger>
                                                                                <SelectContent>
                                                                                    <SelectItem value="cash">Tiền mặt</SelectItem>
                                                                                    <SelectItem value="transfer">Chuyển khoản</SelectItem>
                                                                                    <SelectItem value="zalopay">Zalo Pay</SelectItem>
                                                                                </SelectContent>
                                                                            </Select>
                                                                        </div>
                                                                    </div>
                                                                    
                                                                    <div className="space-y-2">
                                                                        <Label className="text-xs font-bold text-gray-500 uppercase">ĐỊA CHỈ GIAO HÀNG</Label>
                                                                        <Input
                                                                            placeholder="Địa chỉ nhận đồ của khách..."
                                                                            value={formData.delivery_address || ''}
                                                                            onChange={(e) => setFormData(prev => ({ ...prev, delivery_address: e.target.value }))}
                                                                        />
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )}

                                                        <div className="space-y-2">
                                                            <Label className="text-xs font-bold text-gray-500 uppercase">GHI CHÚ GIAO HÀNG</Label>
                                                            <Textarea
                                                                placeholder="Lưu ý cho shipper hoặc khâu đóng gói..."
                                                                value={formData.delivery_notes || ''}
                                                                onChange={(e) => setFormData(prev => ({ ...prev, delivery_notes: e.target.value }))}
                                                            />
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-start gap-4">
                                                        <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                                                            <Truck className="h-5 w-5 text-blue-600" />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <p className="font-bold text-gray-800">{order.delivery_carrier || 'N/A'}</p>
                                                            <p className="text-xs text-gray-500">{order.delivery_address || 'Không có địa chỉ'}</p>
                                                        </div>
                                                    </div>
                                                )}

                                                <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3">
                                                    <Checkbox
                                                        id="accessories_returned_checked"
                                                        checked={!!(formData as any).accessories_returned_checked}
                                                        onCheckedChange={(checked) =>
                                                            setFormData((prev) => ({ ...prev, accessories_returned_checked: !!checked }))
                                                        }
                                                        className="mt-0.5"
                                                    />
                                                    <Label
                                                        htmlFor="accessories_returned_checked"
                                                        className="cursor-pointer text-sm font-semibold leading-snug text-emerald-900"
                                                    >
                                                        Xác nhận trả đủ đồ phụ kiện cho khách
                                                        <span className="text-red-500"> *</span>
                                                    </Label>
                                                </div>

                                                <div className="bg-blue-50/50 p-4 rounded-2xl border border-blue-100 shadow-sm space-y-3 pt-2">
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-2">
                                                            <div className="h-7 w-7 rounded-lg bg-blue-100 flex items-center justify-center">
                                                                <Package className="h-4 w-4 text-blue-600" />
                                                            </div>
                                                            <div className="flex flex-col">
                                                                <span className="text-[11px] font-black text-blue-900 uppercase tracking-tight">Ảnh đóng gói</span>
                                                                <span className="text-[9px] text-blue-500 font-medium">Kiện hàng kèm mã vận đơn</span>
                                                            </div>
                                                        </div>
                                                        <Badge variant="outline" className="text-[9px] bg-white text-blue-600 border-blue-200">
                                                            {(formData.packaging_photos?.length || 0)} ảnh
                                                        </Badge>
                                                    </div>

                                                    <div className="flex flex-wrap gap-2 pt-1">
                                                        {(Array.isArray(formData.packaging_photos) ? formData.packaging_photos : []).map((photo, idx) => (
                                                            <ImageUpload
                                                                key={`pack-${idx}`}
                                                                value={photo}
                                                                onChange={(url) => {
                                                                    setFormData(prev => {
                                                                        const newPhotos = [...(prev.packaging_photos || [])];
                                                                        if (url) { newPhotos[idx] = url; } else { newPhotos.splice(idx, 1); }
                                                                        return { ...prev, packaging_photos: newPhotos };
                                                                    });
                                                                }}
                                                                className="w-16 h-16 rounded-xl border-2"
                                                                bucket="orders" folder="packaging" hideInfo
                                                            />
                                                        ))}
                                                        <ImageUpload
                                                            key="pack-new" value={null}
                                                            onChange={(url) => {
                                                                if (url) {
                                                                    setFormData(prev => ({ ...prev, packaging_photos: [...(prev.packaging_photos || []), url] }));
                                                                }
                                                            }}
                                                            className="w-16 h-16 rounded-xl border-2 border-dashed"
                                                            bucket="orders" folder="packaging" placeholderIcon={<Package className="h-6 w-6 text-blue-300" />} hideInfo
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Feedback & Invoice */}
                                    {(roomId.startsWith('after3') || roomId.startsWith('after4')) && (
                                        <div className="space-y-4">
                                            <h3 className="font-semibold text-xs uppercase tracking-[0.2em] text-green-800">HD BẢO QUẢN & PHẢN HỒI</h3>
                                            <div className="space-y-3">
                                                {roomId.startsWith('after3') ? (
                                                    <div className="bg-white p-4 rounded-xl border border-green-50 shadow-sm space-y-3">
                                                        <label htmlFor="hd_sent" className="flex items-center justify-between cursor-pointer">
                                                            <div className="flex items-center gap-3">
                                                                <BookOpen className={cn("h-5 w-5", formData.hd_sent ? "text-green-600" : "text-gray-300")} />
                                                                <span className="text-sm font-medium">Đã gửi hướng dẫn bảo quản</span>
                                                            </div>
                                                            <Checkbox
                                                                id="hd_sent"
                                                                checked={formData.hd_sent}
                                                                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, hd_sent: !!checked }))}
                                                            />
                                                        </label>
                                                        <div className="pl-8">
                                                            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-green-700">
                                                                <Camera className="h-3.5 w-3.5" />
                                                                Ảnh chứng minh đã gửi HD
                                                            </div>
                                                            <MultiMediaUpload
                                                                value={formData.hd_sent_photos || []}
                                                                onChange={(urls) => setFormData(prev => ({ ...prev, hd_sent_photos: urls }))}
                                                                bucket="orders"
                                                                folder="hd-feedback"
                                                                disabled={saving}
                                                            />
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="bg-white p-4 rounded-xl border border-green-50 shadow-sm space-y-3">
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-center gap-3">
                                                                <BookOpen className={cn("h-5 w-5", formData.hd_sent ? "text-green-600" : "text-gray-300")} />
                                                                <span className="text-sm font-medium">Đã gửi hướng dẫn bảo quản</span>
                                                            </div>
                                                            <Badge variant="outline" className="bg-green-50 text-green-700">{order.hd_sent ? 'Đã gửi' : 'Chưa gửi'}</Badge>
                                                        </div>
                                                        {!!formData.hd_sent_photos?.length && (
                                                            <MultiMediaUpload value={formData.hd_sent_photos} onChange={() => {}} disabled bucket="orders" folder="hd-feedback" />
                                                        )}
                                                    </div>
                                                )}

                                                {roomId.startsWith('after3') ? (
                                                    <div className="bg-white p-4 rounded-xl border border-green-50 shadow-sm space-y-3">
                                                        <label htmlFor="fb_req" className="flex items-center justify-between cursor-pointer">
                                                            <div className="flex items-center gap-3">
                                                                <MessageSquare className={cn("h-5 w-5", formData.feedback_requested ? "text-green-600" : "text-gray-300")} />
                                                                <span className="text-sm font-medium">Yêu cầu Feedback</span>
                                                            </div>
                                                            <Checkbox
                                                                id="fb_req"
                                                                checked={formData.feedback_requested}
                                                                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, feedback_requested: !!checked }))}
                                                            />
                                                        </label>
                                                        <div className="pl-8">
                                                            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-green-700">
                                                                <Camera className="h-3.5 w-3.5" />
                                                                Ảnh chứng minh yêu cầu Feedback
                                                            </div>
                                                            <MultiMediaUpload
                                                                value={formData.feedback_requested_photos || []}
                                                                onChange={(urls) => setFormData(prev => ({ ...prev, feedback_requested_photos: urls }))}
                                                                bucket="orders"
                                                                folder="hd-feedback"
                                                                disabled={saving}
                                                            />
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="bg-white p-4 rounded-xl border border-green-50 shadow-sm space-y-3">
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-center gap-3">
                                                                <MessageSquare className={cn("h-5 w-5", formData.feedback_requested ? "text-green-600" : "text-gray-300")} />
                                                                <span className="text-sm font-medium">Yêu cầu Feedback</span>
                                                            </div>
                                                            <Badge variant="outline" className="bg-green-50 text-green-700">{order.feedback_requested ? 'Đã gửi' : 'Chưa gửi'}</Badge>
                                                        </div>
                                                        {!!formData.feedback_requested_photos?.length && (
                                                            <MultiMediaUpload value={formData.feedback_requested_photos} onChange={() => {}} disabled bucket="orders" folder="hd-feedback" />
                                                        )}
                                                    </div>
                                                )}

                                                {roomId.startsWith('after3') && (
                                                    <div className="grid grid-cols-2 gap-3 pt-2">
                                                        <Button
                                                            variant="outline"
                                                            className="h-14 rounded-2xl border-green-200 hover:bg-green-50 hover:text-green-700 flex flex-col items-center justify-center gap-1 group"
                                                            onClick={() => handleFeedbackAction(true)}
                                                            disabled={saving}
                                                        >
                                                            <ThumbsUp className="h-5 w-5 text-green-500 group-hover:scale-110 transition-transform" />
                                                            <span className="text-[10px] font-black uppercase tracking-tighter">Hài lòng (Khen)</span>
                                                        </Button>
                                                        <Button
                                                            variant="outline"
                                                            className="h-14 rounded-2xl border-red-200 hover:bg-red-50 hover:text-red-700 flex flex-col items-center justify-center gap-1 group"
                                                            onClick={() => handleFeedbackAction(false)}
                                                            disabled={saving}
                                                        >
                                                            <ThumbsDown className="h-5 w-5 text-red-500 group-hover:scale-110 transition-transform" />
                                                            <span className="text-[10px] font-black uppercase tracking-tighter">Góp ý (Chê)</span>
                                                        </Button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {isAftersale && (
                                        <div className="flex flex-col min-h-0 gap-4 md:gap-6 pt-4 md:pt-6 border-t mt-2 md:mt-4">
                                            <div className="flex flex-col min-h-0 max-md:max-h-[200px] md:min-h-[220px]">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <MessageSquare className="h-3.5 w-3.5 text-gray-400" />
                                                    <h4 className="font-semibold text-xs uppercase tracking-[0.2em] text-gray-400">Thảo luận nội bộ</h4>
                                                </div>
                                                <ProductChat
                                                    orderId={order?.id || ''}
                                                    entityId={entityId}
                                                    entityType={entityType}
                                                    roomId={roomId}
                                                    currentUserId={currentUserId}
                                                    highlightMessageId={highlightMessageId}
                                                />
                                            </div>

                                            <div className="flex flex-col min-h-0">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <History className="h-3.5 w-3.5 text-gray-400" />
                                                    <h4 className="font-semibold text-xs uppercase tracking-[0.2em] text-gray-400">Lịch sử thay đổi</h4>
                                                </div>
                                                <div className="flex-1 min-h-0 max-h-[180px] md:max-h-[240px] overflow-y-auto touch-pan-y overscroll-y-contain bg-white rounded-xl border border-gray-100 p-3">
                                                    <div className="space-y-3">
                                                        {roomLogs.length > 0 ? roomLogs.map(renderLogItem) : (
                                                            <div className="text-center py-8 text-gray-400 italic text-[11px]">Chưa có lịch sử thay đổi</div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {isAftersale && !roomId.startsWith('after4') && (
                                        <div className="sticky bottom-0 -mx-4 -mb-4 mt-auto p-4 bg-white/95 backdrop-blur-sm border-t border-gray-200/50 shadow-[0_-10px_20px_-10px_rgba(0,0,0,0.05)] z-50 order-last">
                                            <Button
                                                className="w-full h-12 rounded-xl font-bold shadow-lg shadow-primary/20"
                                                onClick={handleSave}
                                                disabled={saving}
                                            >
                                                {saving ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Save className="h-5 w-5 mr-2" />}
                                                {roomId.startsWith('after1_debt')
                                                    ? 'Xác nhận kiểm nợ & Lưu'
                                                    : roomId.startsWith('after2')
                                                    ? 'Xác nhận trả phụ kiện & Lưu'
                                                    : 'Cập nhật thông tin'}
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            ) : isCareFlow && order ? (
                                <div className="flex-1 flex flex-col gap-4">
                                    <h3 className={cn(
                                        "font-semibold text-xs uppercase tracking-[0.2em]",
                                        roomId.startsWith('war') ? "text-red-700" : "text-teal-700"
                                    )}>
                                        {roomId.startsWith('war') ? 'Tình trạng Bảo hành' : 'Tình trạng Chăm sóc'}
                                    </h3>

                                    <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm space-y-4">
                                        {/* Current stage badge */}
                                        <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50">
                                            {roomId.startsWith('war') ? (
                                                <ShieldCheck className="h-5 w-5 text-red-500 shrink-0" />
                                            ) : (
                                                <Heart className="h-5 w-5 text-teal-500 shrink-0" />
                                            )}
                                            <div className="flex flex-col">
                                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">TRẠNG THÁI HIỆN TẠI</span>
                                                <span className="text-sm font-black text-gray-800">{getCareWarrantyStageLabel((productItem || (services?.[0] as any))?.care_warranty_stage)}</span>
                                            </div>
                                        </div>

                                        {/* Staff info — warranty only */}
                                        {roomId.startsWith('war') && (
                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="bg-purple-50/60 p-3 rounded-xl border border-purple-100 flex items-center gap-2">
                                                    <Wrench className="h-4 w-4 text-purple-500 shrink-0" />
                                                    <div className="flex flex-col min-w-0">
                                                        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-tight">Kỹ Thuật Viên</span>
                                                        <span className="text-xs font-bold text-gray-800 truncate">
                                                            {Array.from(new Set(services.filter(s => (s as any).technician).map(s => (s as any).technician.name))).join(', ') || '—'}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="bg-blue-50/60 p-3 rounded-xl border border-blue-100 flex items-center gap-2">
                                                    <ShieldCheck className="h-4 w-4 text-blue-500 shrink-0" />
                                                    <div className="flex flex-col min-w-0">
                                                        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-tight">NV Sale</span>
                                                        <span className="text-xs font-bold text-gray-800 truncate">{order?.sales_user?.name || '—'}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* Single photo: "Ảnh Trước Bảo hành" (warranty) or "Ảnh Chăm sóc" (care) */}
                                        <div className={cn(
                                            "p-4 rounded-2xl border space-y-2",
                                            roomId.startsWith('war') ? "bg-red-50/40 border-red-100" : "bg-teal-50/40 border-teal-100"
                                        )}>
                                            <div className="flex items-center gap-2">
                                                <Camera className={cn("h-4 w-4", roomId.startsWith('war') ? "text-red-500" : "text-teal-500")} />
                                                <span className={cn("text-[11px] font-black uppercase tracking-tight", roomId.startsWith('war') ? "text-red-900" : "text-teal-900")}>
                                                    {roomId.startsWith('war') ? 'Ảnh Trước Bảo hành' : 'Ảnh Chăm sóc'}
                                                </span>
                                            </div>
                                            <div className="flex gap-2 flex-wrap">
                                                <ImageUpload
                                                    key="care-main"
                                                    value={(formData.completion_photos as string[])?.[0] || null}
                                                    onChange={(url) => {
                                                        setFormData(prev => ({ ...prev, completion_photos: url ? [url] : [] }));
                                                    }}
                                                    className="w-20 h-20 rounded-xl border-2"
                                                    bucket="orders" folder="warranty" hideInfo
                                                />
                                            </div>
                                        </div>

                                        {/* Notes */}
                                        <div className="space-y-1.5">
                                            <Label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Ghi chú tiến độ</Label>
                                            <Textarea
                                                placeholder="Nhập ghi chú cập nhật tiến độ chăm sóc/bảo hành..."
                                                className="bg-gray-50/50 min-h-[80px] text-sm"
                                                value={formData.notes || ''}
                                                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                                            />
                                        </div>

                                    </div>

                                    <div className="mt-auto bg-gray-100/50 p-4 rounded-xl space-y-3">
                                        <div className="flex items-center gap-2 text-[10px] text-gray-400 font-bold uppercase tracking-widest leading-none">
                                            <History className="h-3 w-3" /> Tóm tắt đơn hàng
                                        </div>
                                        <div className="grid grid-cols-2 gap-4 pt-1">
                                            <div className="flex flex-col">
                                                <span className="text-[9px] text-gray-400 font-bold tracking-tight">NGÀY HOÀN THÀNH</span>
                                                <span className="text-xs font-bold text-gray-600 tabular-nums">{order?.completed_at ? formatDateTime(order.completed_at) : '—'}</span>
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-[9px] text-gray-400 font-bold tracking-tight">TỔNG THANH TOÁN</span>
                                                <span className="text-xs font-bold text-gray-600 tabular-nums">{order ? formatCurrency(order.total_amount) : '—'}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex flex-col min-h-0 gap-4 md:gap-6 pt-4 md:pt-6 border-t mt-2 md:mt-4">
                                        <div className="flex flex-col min-h-0 max-md:max-h-[200px] md:min-h-[220px]">
                                            <div className="flex items-center gap-2 mb-2">
                                                <MessageSquare className="h-3.5 w-3.5 text-gray-400" />
                                                <h4 className="font-semibold text-xs uppercase tracking-[0.2em] text-gray-400">Thảo luận nội bộ</h4>
                                            </div>
                                            <ProductChat
                                                orderId={order?.id || ''}
                                                entityId={entityId}
                                                entityType={entityType}
                                                roomId={roomId}
                                                currentUserId={currentUserId}
                                                highlightMessageId={highlightMessageId}
                                            />
                                        </div>

                                        <div className="flex flex-col min-h-0">
                                            <div className="flex items-center gap-2 mb-2">
                                                <History className="h-3.5 w-3.5 text-gray-400" />
                                                <h4 className="font-semibold text-xs uppercase tracking-[0.2em] text-gray-400">Lịch sử thay đổi</h4>
                                            </div>
                                            <div className="flex-1 min-h-0 max-h-[180px] md:max-h-[240px] overflow-y-auto touch-pan-y overscroll-y-contain bg-white rounded-xl border border-gray-100 p-3">
                                                <div className="space-y-3">
                                                    {roomLogs.length > 0 ? roomLogs.map(renderLogItem) : (
                                                        <div className="text-center py-8 text-gray-400 italic text-[11px]">Chưa có lịch sử thay đổi</div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="sticky bottom-0 -mx-4 -mb-4 mt-auto p-4 bg-white/95 backdrop-blur-sm border-t border-gray-200/50 shadow-[0_-10px_20px_-10px_rgba(0,0,0,0.05)] z-50 order-last space-y-3">
                                        {/* Tạo HD Bảo hành button — warranty only */}
                                        {roomId.startsWith('war') && (
                                            <Button
                                                variant="outline"
                                                className="w-full h-10 rounded-xl font-bold border-red-300 text-red-700 hover:bg-red-50 gap-2 bg-white"
                                                disabled={saving}
                                                onClick={async () => {
                                                    if (!entityId || !onReloadOrder) return;
                                                    setSaving(true);
                                                    try {
                                                        const isCustomerItem = !!product;
                                                        const apiModule = isCustomerItem ? orderProductsApi : orderItemsApi;
                                                        
                                                        const now = new Date();
                                                        const seq = `${now.getFullYear().toString().slice(-2)}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}`;
                                                        const warrantyCode = `HDBH${order?.order_code || ''}.${entityId.slice(-4)}.${seq}`;

                                                        await apiModule.updateAfterSaleData(entityId, {
                                                            care_warranty_flow: 'warranty',
                                                            care_warranty_stage: 'war3',
                                                        });

                                                        await apiModule.updateStatus(entityId, 'step1', 'Bảo hành lại', warrantyCode);

                                                        if (isCustomerItem) {
                                                            await orderProductsApi.resetServices(entityId);
                                                        }

                                                        if (order?.id && fetchKanbanLogs) {
                                                            await fetchKanbanLogs(order.id);
                                                        }

                                                        toast.success(`Đã tạo HD Bảo hành: ${warrantyCode} và chuyển về Nhận đồ & Chụp ảnh`);
                                                        await onReloadOrder?.();
                                                        onOpenChange(false);
                                                        if (setActiveTab) setActiveTab('sales');
                                                    } catch (error: any) {
                                                        toast.error(error?.response?.data?.message || 'Lỗi khi tạo HD Bảo hành');
                                                    } finally {
                                                        setSaving(false);
                                                    }
                                                }}
                                            >
                                                <ClipboardList className="h-4 w-4" />
                                                Tạo HD Bảo hành
                                            </Button>
                                        )}

                                        {/* Save */}
                                        <Button
                                            className={cn(
                                                "w-full h-11 rounded-xl font-bold transition-all text-white",
                                                roomId.startsWith('war') ? "bg-red-600 hover:bg-red-700" : "bg-teal-600 hover:bg-teal-700"
                                            )}
                                            onClick={handleSave}
                                            disabled={saving}
                                        >
                                            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                                            Lưu ghi chú
                                        </Button>
                                    </div>
                                </div>

                            ) : isSalesStep ? (
                                <div className="flex-1 flex flex-col gap-4 min-h-0">
                                    <div className="flex items-center justify-between mb-2">
                                        <h3 className="font-semibold text-xs uppercase tracking-[0.2em] text-gray-400">
                                            {SALES_STATUS_LABELS[roomId] || 'Thông tin bước'}
                                        </h3>
                                        <Badge variant="secondary" className="text-[10px] px-2 py-0 font-bold">
                                            {SALES_STATUS_LABELS[roomId]?.toUpperCase() || roomId.toUpperCase()}
                                        </Badge>
                                    </div>

                                    {/* Step 1: Nhận đồ - Receiver Info */}
                                    {roomId === 'step1' && (
                                        <>
                                            <div className="product-detail-form-card bg-white p-4 md:p-5 rounded-2xl border border-blue-100 shadow-sm space-y-4">
                                                <div className="flex items-center gap-2 text-blue-700 mb-1">
                                                    <UserIcon className="h-4 w-4" />
                                                    <span className="text-xs font-black uppercase tracking-tight">Thông tin người nhận đồ</span>
                                                </div>
                                                <div className="space-y-3">
                                                    <div className="grid grid-cols-3 gap-4">
                                                        <div className="space-y-1.5">
                                                            <Label className="text-xs font-bold text-gray-500">NHÂN VIÊN SALE <span className="text-red-500">*</span></Label>
                                                            <Select
                                                                value={stepData.step1_receiver_name || ''}
                                                                onValueChange={(val) => setStepData(prev => ({ ...prev, step1_receiver_name: val }))}
                                                             >
                                                                 <SelectTrigger className="bg-white h-9">
                                                                     <SelectValue placeholder="Chọn..." />
                                                                 </SelectTrigger>
                                                                 <SelectContent>
                                                                     {users.filter(u => ['sale', 'manager', 'admin'].includes(u.role)).map(u => (
                                                                         <SelectItem key={u.id} value={u.name}>{u.name}</SelectItem>
                                                                     ))}
                                                                 </SelectContent>
                                                             </Select>
                                                        </div>
                                                        <div className="space-y-1.5">
                                                            <Label className="text-xs font-bold text-gray-500">TIỀN SHIP</Label>
                                                            <Input
                                                                placeholder="0..."
                                                                type="text"
                                                                className="h-9"
                                                                value={stepData.step1_shipping_fee ? stepData.step1_shipping_fee.toLocaleString('vi-VN') : ''}
                                                                onChange={(e) => {
                                                                    const val = e.target.value.replace(/\D/g, '');
                                                                    setStepData(prev => ({ ...prev, step1_shipping_fee: val ? parseInt(val, 10) : 0 }));
                                                                }}
                                                            />
                                                        </div>
                                                        <div className="space-y-1.5">
                                                            <Label className="text-xs font-bold text-gray-500">PT THANH TOÁN</Label>
                                                            <Select
                                                                value={stepData.step1_payment_method || ''}
                                                                onValueChange={(val) => setStepData(prev => ({ ...prev, step1_payment_method: val }))}
                                                            >
                                                                <SelectTrigger className="bg-white h-9">
                                                                    <SelectValue placeholder="Chọn..." />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="cash">Tiền mặt</SelectItem>
                                                                    <SelectItem value="transfer">Chuyển khoản</SelectItem>
                                                                    <SelectItem value="zalopay">Zalo Pay</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                        </div>
                                                    </div>

                                                    <div className="space-y-1.5">
                                                        <Label className="text-xs font-bold text-gray-500 uppercase font-bold tracking-tight mb-2 flex items-center gap-1.5">
                                                            <Camera className="h-3.5 w-3.5 text-blue-500" />
                                                            ẢNH & VIDEO LÀM BẰNG CHỨNG <span className="text-red-500">*</span>
                                                         </Label>
                                                         <MultiMediaUpload 
                                                            value={stepData.step1_evidence_photos || []}
                                                            onChange={(urls) => setStepData(prev => ({ ...prev, step1_evidence_photos: urls }))}
                                                         />
                                                     </div>

                                                    <div className="flex items-start gap-3 rounded-xl border border-amber-100 bg-amber-50/60 p-3">
                                                        <Checkbox
                                                            id="step1_accessories_checked"
                                                            checked={!!stepData.step1_accessories_checked}
                                                            onCheckedChange={(checked) =>
                                                                setStepData(prev => ({ ...prev, step1_accessories_checked: !!checked }))
                                                            }
                                                            className="mt-0.5"
                                                        />
                                                        <Label
                                                            htmlFor="step1_accessories_checked"
                                                            className="cursor-pointer text-sm font-semibold leading-snug text-amber-900"
                                                        >
                                                            Đã kiểm tra đầy đủ phụ kiện đi kèm
                                                            <span className="text-red-500"> *</span>
                                                        </Label>
                                                    </div>

                                                    <div className="space-y-1.5">
                                                        <Label className="text-xs font-bold text-gray-500">GHI CHÚ NHẬN ĐỒ</Label>
                                                        <Textarea
                                                            placeholder="Tình trạng đồ khi nhận, ghi chú thêm..."
                                                            className="min-h-[80px]"
                                                            value={stepData.step1_notes || ''}
                                                            onChange={(e) => setStepData(prev => ({ ...prev, step1_notes: e.target.value }))}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="sticky bottom-0 -mx-4 -mb-4 mt-auto p-4 bg-white/95 backdrop-blur-sm border-t border-gray-200/50 shadow-[0_-10px_20px_-10px_rgba(0,0,0,0.05)] z-50 order-last">
                                                <Button
                                                    className="w-full h-11 rounded-xl font-bold shadow-lg shadow-blue-200 bg-blue-600 hover:bg-blue-700 text-white"
                                                    onClick={handleSaveStepData}
                                                    disabled={savingStepData}
                                                >
                                                    {savingStepData ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                                                    Lưu thông tin nhận đồ
                                                </Button>
                                            </div>
                                        </>
                                    )}

                                    {/* Step 2: TAGS + FORM TÚI + SHOESTREE */}
                                    {roomId === 'step2' && (
                                        <>
                                            <div className="product-detail-form-card bg-white p-4 md:p-5 rounded-2xl border border-green-100 shadow-sm space-y-4">
                                                <div className="flex items-center gap-2 text-green-700 mb-1">
                                                    <Tag className="h-4 w-4" />
                                                    <span className="text-xs font-black uppercase tracking-tight">Gắn Tags & Phụ kiện bảo quản</span>
                                                </div>
                                                <div className="space-y-3">
                                                    <div className="space-y-1.5">
                                                        <Label className="text-xs font-bold text-gray-500 uppercase font-bold tracking-tight mb-2 flex items-center gap-1.5">
                                                            <Camera className="h-3.5 w-3.5 text-green-500" />
                                                            ẢNH CHỨNG MINH ĐÃ GẮN TAGS <span className="text-red-500">*</span>
                                                        </Label>
                                                        <MultiMediaUpload 
                                                           value={stepData.step2_tags_photos || []}
                                                           onChange={(urls) => setStepData(prev => ({ ...prev, step2_tags_photos: urls }))}
                                                        />
                                                    </div>
                                                    <div className="space-y-1.5">
                                                        <Label className="text-xs font-bold text-gray-500 uppercase font-bold tracking-tight mb-2 flex items-center gap-1.5">
                                                            <Camera className="h-3.5 w-3.5 text-green-500" />
                                                            ẢNH ĐÃ GẮN FORM TÚI/SHOESTREE <span className="text-red-500">*</span>
                                                        </Label>
                                                        <MultiMediaUpload 
                                                           value={stepData.step2_form_photos || []}
                                                           onChange={(urls) => setStepData(prev => ({ ...prev, step2_form_photos: urls }))}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="sticky bottom-0 -mx-4 -mb-4 mt-auto p-4 bg-white/95 backdrop-blur-sm border-t border-gray-200/50 shadow-[0_-10px_20px_-10px_rgba(0,0,0,0.05)] z-50 order-last">
                                                <Button
                                                    className="w-full h-11 rounded-xl font-bold shadow-lg shadow-green-200 bg-green-600 hover:bg-green-700 text-white"
                                                    onClick={handleSaveStepData}
                                                    disabled={savingStepData}
                                                >
                                                    {savingStepData ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                                                    Lưu thông tin Step 2
                                                </Button>
                                            </div>
                                        </>
                                    )}

                                    {/* Step 3: Trao đổi KT - Technician Exchange */}
                                    {roomId === 'step3' && (
                                        <>
                                            <div className="product-detail-form-card bg-white p-4 md:p-5 rounded-2xl border border-orange-100 shadow-sm space-y-4">
                                                <div className="flex items-center gap-2 text-orange-700 mb-1">
                                                    <ClipboardList className="h-4 w-4" />
                                                    <span className="text-xs font-black uppercase tracking-tight">Trao đổi với Kỹ thuật</span>
                                                </div>
                                                <div className="space-y-3">
                                                        <Label className="text-xs font-bold text-gray-500">TÊN KỸ THUẬT VIÊN (Gõ @ để nhắc tên)</Label>
                                                        <div className="relative">
                                                            <Input
                                                                placeholder="VD: @KT Hùng, @KT Minh..."
                                                                value={stepData.step3_technician_name || ''}
                                                                onKeyDown={(e) => {
                                                                    if (e.key === 'Escape') setShowMentionList(false);
                                                                }}
                                                                onChange={(e) => {
                                                                    const val = e.target.value;
                                                                    setStepData(prev => ({ ...prev, step3_technician_name: val }));
                                                                    
                                                                    // Mention logic
                                                                    const cursorPosition = e.target.selectionStart || 0;
                                                                    const textBeforeCursor = val.substring(0, cursorPosition);
                                                                    const lastAt = textBeforeCursor.lastIndexOf('@');
                                                                    
                                                                    if (lastAt !== -1 && (lastAt === 0 || textBeforeCursor[lastAt - 1] === ' ')) {
                                                                        const search = textBeforeCursor.substring(lastAt + 1);
                                                                        setMentionSearch(search);
                                                                        setShowMentionList(true);
                                                                        setMentionInputType('step3_technician_name');
                                                                    } else {
                                                                        setShowMentionList(false);
                                                                    }
                                                                }}
                                                            />
                                                            {showMentionList && mentionInputType === 'step3_technician_name' && (
                                                                <div className="absolute bottom-full left-0 mb-2 w-64 max-h-48 bg-white border rounded-lg shadow-xl overflow-y-auto z-[100]">
                                                                    <div className="p-2 text-[10px] font-bold text-gray-400 border-b bg-gray-50 uppercase tracking-wider">
                                                                        Nhắc tên kỹ thuật viên
                                                                    </div>
                                                                    {users
                                                                        .filter(u => u.role === 'technician' && normalizeVn(u.name).includes(normalizeVn(mentionSearch)))
                                                                        .map(u => (
                                                                            <button
                                                                                key={u.id}
                                                                                type="button"
                                                                                onClick={() => {
                                                                                    const currentText = stepData.step3_technician_name || '';
                                                                                    const lastAt = currentText.lastIndexOf('@');
                                                                                    const newText = currentText.substring(0, lastAt) + '@' + u.name + ' ';
                                                                                    setStepData(prev => ({ ...prev, step3_technician_name: newText }));
                                                                                    setShowMentionList(false);
                                                                                }}
                                                                                className="w-full text-left px-3 py-2 hover:bg-primary/10 flex items-center gap-2 transition-colors border-b last:border-0"
                                                                            >
                                                                                <Avatar className="h-6 w-6">
                                                                                    <AvatarImage src={u.avatar} />
                                                                                    <AvatarFallback><UserIcon className="h-3 w-3" /></AvatarFallback>
                                                                                </Avatar>
                                                                                <div className="flex flex-col">
                                                                                    <span className="text-sm font-medium">{u.name}</span>
                                                                                    <span className="text-[10px] text-gray-500 uppercase">{u.role}</span>
                                                                                </div>
                                                                            </button>
                                                                        ))
                                                                    }
                                                                </div>
                                                            )}
                                                        </div>
                                                    <div className="space-y-1.5">
                                                        <Label className="text-xs font-bold text-gray-500">CHI TIẾT CÔNG VIỆC CẦN LÀM</Label>
                                                        <Textarea
                                                            placeholder="VD: Đánh bóng mũi giày, gia cố đế, vệ sinh lót trong..."
                                                            className="min-h-[100px]"
                                                            value={stepData.step3_work_details || ''}
                                                            onChange={(e) => setStepData(prev => ({ ...prev, step3_work_details: e.target.value }))}
                                                        />
                                                    </div>
                                                    <div className="space-y-1.5">
                                                        <Label className="text-xs font-bold text-gray-500">VỊ TRÍ CẦN XỬ LÝ</Label>
                                                        <Input
                                                            placeholder="VD: Mũi giày bên trái, gót phải..."
                                                            value={stepData.step3_work_location || ''}
                                                            onChange={(e) => setStepData(prev => ({ ...prev, step3_work_location: e.target.value }))}
                                                        />
                                                    </div>
                                                    <div className="space-y-1.5">
                                                        <Label className="text-xs font-bold text-gray-500">GHI CHÚ THÊM</Label>
                                                        <Textarea
                                                            placeholder="Ghi chú trao đổi thêm với KT..."
                                                            className="min-h-[60px]"
                                                            value={stepData.step3_notes || ''}
                                                            onChange={(e) => setStepData(prev => ({ ...prev, step3_notes: e.target.value }))}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="sticky bottom-0 -mx-4 -mb-4 mt-auto p-4 bg-white/95 backdrop-blur-sm border-t border-gray-200/50 shadow-[0_-10px_20px_-10px_rgba(0,0,0,0.05)] z-50 order-last">
                                                <Button
                                                    className="w-full h-11 rounded-xl font-bold shadow-lg shadow-orange-200 bg-orange-600 hover:bg-orange-700 text-white"
                                                    onClick={handleSaveStepData}
                                                    disabled={savingStepData}
                                                >
                                                    {savingStepData ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                                                    Lưu thông tin trao đổi KT
                                                </Button>
                                            </div>
                                        </>
                                    )}

                                        <div className="flex flex-col min-h-0 gap-4">
                                            <div className="flex flex-col min-h-0 max-md:max-h-[200px] md:min-h-[220px]">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <MessageSquare className="h-3.5 w-3.5 text-gray-400" />
                                                    <h4 className="font-semibold text-xs uppercase tracking-[0.2em] text-gray-400">Trao đổi nội bộ</h4>
                                                </div>
                                                <ProductChat
                                                    orderId={order?.id || ''}
                                                    entityId={entityId}
                                                    entityType={entityType}
                                                    roomId={roomId}
                                                    currentUserId={currentUserId}
                                                    highlightMessageId={highlightMessageId}
                                                />
                                            </div>

                                            <div className="flex flex-col min-h-0">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <History className="h-3.5 w-3.5 text-gray-400" />
                                                    <h4 className="font-semibold text-xs uppercase tracking-[0.2em] text-gray-400">Lịch sử thay đổi</h4>
                                                </div>
                                                <div className="flex-1 min-h-0 max-h-[180px] md:max-h-[240px] overflow-y-auto touch-pan-y overscroll-y-contain bg-white rounded-xl border border-gray-100 p-3">
                                                    <div className="space-y-3">
                                                        {roomLogs.length > 0 ? roomLogs.map(renderLogItem) : (
                                                            <div className="text-center py-8 text-gray-400 italic text-[11px]">Chưa có lịch sử thay đổi</div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                <div className="flex-1 flex flex-col gap-4 min-h-0">
                                    <div className="flex flex-col min-h-0 max-md:max-h-[200px] md:min-h-[220px]">
                                        <div className="flex items-center justify-between mb-2">
                                            <h3 className="font-semibold text-xs uppercase tracking-[0.2em] text-gray-400">Trao đổi nội bộ</h3>
                                            <Badge variant="secondary" className="text-[10px] px-2 py-0 font-bold">
                                                {SALES_STATUS_LABELS[roomId]?.toUpperCase() || `PHÒNG ${roomId.toUpperCase()}`}
                                            </Badge>
                                        </div>

                                        {entityId && (
                                            <ProductChat
                                                orderId={order?.id || ''}
                                                entityId={entityId}
                                                entityType={entityType}
                                                roomId={roomId}
                                                currentUserId={currentUserId}
                                                highlightMessageId={highlightMessageId}
                                            />
                                        )}
                                    </div>

                                    <div className="flex flex-col min-h-0">
                                        <div className="flex items-center gap-2 mb-2">
                                            <History className="h-3.5 w-3.5 text-gray-400" />
                                            <h4 className="font-semibold text-xs uppercase tracking-[0.2em] text-gray-400">Lịch sử thay đổi</h4>
                                        </div>
                                        <div className="flex-1 min-h-0 max-h-[180px] md:max-h-[240px] overflow-y-auto touch-pan-y overscroll-y-contain bg-white rounded-xl border border-gray-100 p-3">
                                            <div className="space-y-3">
                                                {roomLogs.length > 0 ? roomLogs.map(renderLogItem) : (
                                                    <div className="text-center py-8 text-gray-400 italic text-[11px]">Chưa có lịch sử thay đổi</div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Mark Failed Button - Only for Workflow stages */}
                                    {!isSalesStep && !isAftersale && !isCareFlow && (
                                        <div className="sticky bottom-0 -mx-4 -mb-4 mt-auto p-4 bg-white/95 backdrop-blur-sm border-t border-gray-200/50 shadow-[0_-10px_20px_-10px_rgba(0,0,0,0.05)] z-50 order-last">
                                            <Button
                                                variant="outline"
                                                className="w-full h-10 rounded-xl border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 font-bold gap-2 text-xs bg-white"
                                                onClick={() => {
                                                    toast.info("Vui lòng sử dụng nút 'Thất bại' bên ngoài Kanban để ghi nhận chi tiết.");
                                                }}
                                            >
                                                <XCircle className="h-4 w-4" />
                                                ĐÁNH DẤU THẤT BẠI
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                        </div>
                    </div>
                </div>

            <WorkflowLogDetailDialog 
                open={showLogDetailDialog} 
                onOpenChange={setShowLogDetailDialog} 
                log={selectedLogDetail} 
            />

            <BackwardMoveDialog
                open={!!viewLogData}
                onClose={() => setViewLogData(null)}
                itemName={viewLogData?.itemName || productName}
                mode="view"
                initialData={viewLogData ? {
                    reason: viewLogData.reason || '',
                    photos: viewLogData.photos || [],
                    notes: viewLogData.notes
                } : undefined}
            />

            <UpsellDialog
                open={showUpsellDialog}
                onOpenChange={setShowUpsellDialog}
                orderId={order?.id || ''}
                preselectedProduct={product ? {
                    id: product.id,
                    name: productName,
                    type: (product as any).product_type || (product as any).type || (product as any).item_type || 'giày'
                } : null}
                onSuccess={async () => {
                    if (onReloadOrder) await onReloadOrder();
                }}
            />

            <Dialog open={!!mainPreviewUrl} onOpenChange={(open) => !open && setMainPreviewUrl(null)}>
                <DialogContent className="max-w-5xl p-0 overflow-hidden bg-transparent border-none shadow-none flex items-center justify-center">
                    <DialogTitle className="sr-only">Xem phương tiện</DialogTitle>
                    {mainPreviewUrl && (
                        mainPreviewUrl.match(/\.(mp4|webm|ogg|mov|m4v)$|^data:video/i) || mainPreviewUrl.includes('/video/') ? (
                            <video src={mainPreviewUrl} controls autoPlay className="max-w-full max-h-[90vh] rounded-lg shadow-2xl bg-black" />
                        ) : (
                            <img src={mainPreviewUrl} alt="" className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl bg-white" />
                        )
                    )}
                </DialogContent>
            </Dialog>

            {/* Cảnh báo chưa xác nhận trả phụ kiện */}
            <Dialog open={showAccessoriesReturnWarning} onOpenChange={setShowAccessoriesReturnWarning}>
                <DialogContent className="max-w-sm rounded-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-base font-bold">Chưa xác nhận trả phụ kiện</DialogTitle>
                        <DialogDescription className="text-sm text-muted-foreground">
                            Vui lòng tick &quot;Xác nhận trả đủ đồ phụ kiện cho khách&quot; trước khi lưu hoặc chuyển bước.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            className="w-full rounded-xl font-semibold"
                            onClick={() => setShowAccessoriesReturnWarning(false)}
                        >
                            Đã hiểu
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Cảnh báo chưa xác nhận phụ kiện đi kèm (nhận đồ) */}
            <Dialog open={showAccessoriesWarning} onOpenChange={setShowAccessoriesWarning}>
                <DialogContent className="max-w-sm rounded-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-base font-bold">Chưa xác nhận phụ kiện</DialogTitle>
                        <DialogDescription className="text-sm text-muted-foreground">
                            Vui lòng tick vào ô &quot;Đã kiểm tra đầy đủ phụ kiện đi kèm&quot; trước khi lưu thông tin nhận đồ.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            className="w-full rounded-xl font-semibold"
                            onClick={() => setShowAccessoriesWarning(false)}
                        >
                            Đã hiểu
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Extension Request Reason Dialog */}
            <Dialog open={showExtensionRequestDialog} onOpenChange={setShowExtensionRequestDialog}>
                <DialogContent className="max-w-md p-6 rounded-2xl border-none shadow-2xl space-y-4">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-bold flex items-center gap-2">
                            <Calendar className="w-5 h-5 text-blue-600" />
                            Gửi yêu cầu gia hạn ngày hẹn trả
                        </DialogTitle>
                        <DialogDescription className="text-xs text-muted-foreground">
                            Bạn đang đề xuất thay đổi ngày hẹn trả sang ngày mới. Vui lòng nhập lý do để Admin/Quản lý phê duyệt.
                        </DialogDescription>
                    </DialogHeader>
                    
                    <div className="space-y-4">
                        <div className="bg-blue-50/50 border border-blue-100 p-3 rounded-xl space-y-1">
                            <span className="text-[10px] font-bold text-blue-900 uppercase">Ngày hẹn trả mới đề xuất</span>
                            <p className="text-sm font-black text-blue-800">
                                {proposedDueDate ? formatDateTime(new Date(proposedDueDate).toISOString()) : '—'}
                            </p>
                        </div>
                        
                        <div className="space-y-1.5">
                            <Label className="text-xs font-bold text-gray-500 uppercase">Lý do gia hạn *</Label>
                            <Textarea
                                value={extensionReasonInput}
                                onChange={(e) => setExtensionReasonInput(e.target.value)}
                                placeholder="Ví dụ: Đang đợi phụ kiện về, Sản phẩm phát sinh lỗi trong quá trình xử lý,..."
                                className="min-h-[80px] rounded-xl text-xs bg-slate-50/30"
                            />
                        </div>
                    </div>
                    
                    <div className="flex gap-2 justify-end pt-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-9 px-4 rounded-xl text-xs font-bold"
                            onClick={() => setShowExtensionRequestDialog(false)}
                            disabled={saving}
                        >
                            HỦY
                        </Button>
                        <Button
                            size="sm"
                            className="h-9 px-4 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white"
                            onClick={handleSubmitExtensionRequest}
                            disabled={saving}
                        >
                            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'GỬI YÊU CẦU'}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </DialogContent>
    </Dialog>
);
}
