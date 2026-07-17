import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Plus, Loader2, Search, ListFilter, QrCode } from 'lucide-react';
import { toast, Toaster } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useOrders } from '@/hooks/useOrders';
import type { Order, OrderItem } from '@/hooks/useOrders';
import { useCustomers } from '@/hooks/useCustomers';
import { useProducts } from '@/hooks/useProducts';
import { usePackages } from '@/hooks/usePackages';
import { useVouchers } from '@/hooks/useVouchers';
import { useUsers } from '@/hooks/useUsers';
import { useDepartments } from '@/hooks/useDepartments';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import type { OrderStatus } from '@/types';

import {
    OrderCard,
    OrderConfirmationDialog,
    PaymentDialog,
    columns,
    MobileOrdersKanban,
} from '@/components/orders';
import { OrderQrScanDialog } from '@/components/orders/OrderQrScanDialog';
import { orderItemsApi, orderProductsApi, ordersApi } from '@/lib/api';
import { normalizeSearchText } from '@/lib/utils';
import { ConfirmDoneDialog } from '@/components/orders/workflow/ConfirmDoneDialog';
import { useViewActionForRoles } from '@/hooks/useViewAction';

const MOBILE_ORDER_STAT_STYLES: Record<string, { bg: string; label: string }> = {
    before_sale: { bg: 'bg-blue-600', label: 'Before Sale' },
    in_progress: { bg: 'bg-orange-500', label: 'Đang thực hiện' },
    done: { bg: 'bg-emerald-600', label: 'Đã hoàn thiện' },
    after_sale: { bg: 'bg-teal-600', label: 'After sale' },
    cancelled: { bg: 'bg-rose-500', label: 'Đã huỷ' },
};

export function OrdersPage() {
    const location = useLocation();
    const navigate = useNavigate();
    const { canEdit, canDelete } = useViewActionForRoles('orders', ['admin', 'manager', 'accountant', 'sale', 'technician']);
    const { orders, loading, error, fetchOrders, updateOrderStatus, updateOrder, createOrder, deleteOrder } = useOrders();
    const { customers, fetchCustomers } = useCustomers();
    const { products, services, fetchProducts, fetchServices } = useProducts();
    const { packages, fetchPackages } = usePackages();
    const { vouchers, fetchVouchers } = useVouchers();
    const { technicians, salesPersons, fetchTechnicians, fetchSales } = useUsers();
    const { departments, fetchDepartments } = useDepartments();
    const [payingOrder, setPayingOrder] = useState<Order | null>(null);
    const [payingGroup, setPayingGroup] = useState<{ product: OrderItem | null; services: OrderItem[] } | null>(null);
    const [pendingDrop, setPendingDrop] = useState<{ orderId: string; targetStatus: string } | null>(null);
    const [newlyCreatedOrder, setNewlyCreatedOrder] = useState<Order | null>(null);
    const [columnSearch, setColumnSearch] = useState<{ [key: string]: string }>({});
    const [globalSearch, setGlobalSearch] = useState('');
    const [showQrScan, setShowQrScan] = useState(false);
    const [selectedStaffId, setSelectedStaffId] = useState<string>('all');
    const [mobileColumnIndex, setMobileColumnIndex] = useState(0);

    // Confirm done dialog states
    const [showConfirmDoneDialog, setShowConfirmDoneDialog] = useState(false);
    const [confirmDoneItemIds, setConfirmDoneItemIds] = useState<string[]>([]);
    const [confirmDoneProductId, setConfirmDoneProductId] = useState<string | null>(null);
    const [isV2ServiceForDone, setIsV2ServiceForDone] = useState(false);
    const [orderToCheckStatus, setOrderToCheckStatus] = useState<string | null>(null);

    // Fetch data on mount and when navigating back to this page
    useEffect(() => {
        fetchOrders({ limit: 500 });
        fetchCustomers({ status: 'active' }); // Only fetch active customers
        fetchProducts({ status: 'active' });
        fetchServices({ status: 'active' });
        fetchPackages();
        fetchVouchers();
        fetchTechnicians();
        fetchSales();
        fetchDepartments();
    }, [location.pathname, fetchOrders, fetchCustomers, fetchProducts, fetchServices, fetchPackages, fetchVouchers, fetchTechnicians, fetchSales, fetchDepartments]);

    // Refetch orders when page becomes visible (e.g., after navigation)
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (!document.hidden) {
                fetchOrders({ limit: 500 });
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [fetchOrders]);

    const handleMarkGroupDone = (
        order: Order,
        group: { product: OrderItem | null; services: OrderItem[] },
    ) => {
        setConfirmDoneItemIds(group.services.map(s => s.id).filter(Boolean));
        setConfirmDoneProductId(group.product?.id || null);
        setIsV2ServiceForDone(
            group.services.some(s => s.item_type === 'service' || s.item_type === 'package')
            || !!(group.product as any)?.is_customer_item,
        );
        setOrderToCheckStatus(order.id);
        setShowConfirmDoneDialog(true);
    };

    const getGroupStatus = (group: { product: OrderItem | null; services: OrderItem[] }, fallbackOrder: Order): string => {
        const itemStatus = group.product?.status || group.services?.[0]?.status;
        
        if (!itemStatus) {
            return fallbackOrder.status;
        }

        // 1. Sales / Warranty steps (Before Sale) - Highest priority
        // If an item is being handled by Sales/Warranty, it belongs in "Before Sale"
        if (['step1', 'step2', 'step3', 'step4', 'pending'].includes(itemStatus)) return 'before_sale';

        // 2. Check for technical workflow progress (In Progress)
        // If sales are done/confirmed and any item in the group is assigned or being worked on
        const allItems = [group.product, ...group.services].filter(Boolean) as OrderItem[];
        const hasActiveTechSteps = allItems.some(item => 
            item.order_item_steps?.some(step => ['in_progress', 'assigned'].includes(step.status))
        );
        if (hasActiveTechSteps) return 'in_progress';

        // 3. Explicit In Progress / Processing statuses (from lead item)
        if (['assigned', 'in_progress', 'processing'].includes(itemStatus)) return 'in_progress';
        
        // 4. Completion / After sale statuses
        if (['completed', 'done'].includes(itemStatus)) return 'done';
        if (['delivered', 'after_sale'].includes(itemStatus)) return 'after_sale';
        
        // 5. Fallback to order status (e.g. for step5 which is technically "chốt đơn" but waiting for tech)
        return fallbackOrder.status;
    };

    const matchesGlobalSearch = (
        order: Order,
        group: { product: OrderItem | null; services: OrderItem[] },
        term: string,
    ) => {
        const gTerm = normalizeSearchText(term);
        const groupItems = [group.product, ...group.services].filter(Boolean) as OrderItem[];
        const allItems = (order.items || []) as OrderItem[];

        return (
            normalizeSearchText(order.order_code || '').includes(gTerm) ||
            normalizeSearchText(order.customer?.name || '').includes(gTerm) ||
            (order.customer?.phone || '').includes(term.trim()) ||
            normalizeSearchText(order.sales_user?.name || '').includes(gTerm) ||
            groupItems.some((it) => normalizeSearchText(it.item_code || '').includes(gTerm)) ||
            allItems.some((it) => normalizeSearchText(it.item_code || '').includes(gTerm))
        );
    };

    const findOrderByScannedCode = (code: string) => {
        const trimmed = code.trim();
        if (!trimmed) return undefined;

        const norm = normalizeSearchText(trimmed);
        const byOrderCode = orders.find(
            (o) =>
                normalizeSearchText(o.order_code || '') === norm ||
                (o.order_code || '').toLowerCase() === trimmed.toLowerCase(),
        );
        if (byOrderCode) return byOrderCode;

        return orders.find((o) =>
            (o.items || []).some(
                (it) =>
                    (it.item_code || '').toLowerCase() === trimmed.toLowerCase() ||
                    normalizeSearchText(it.item_code || '') === norm,
            ),
        );
    };

    const handleQrScan = async (code: string) => {
        const order = findOrderByScannedCode(code);
        if (order) {
            navigate(`/orders/${order.id}`);
            toast.success(`Đã tìm thấy đơn ${order.order_code}`);
            return;
        }

        // Fallback: tìm trực tiếp từ server theo mã đơn/mã HĐ
        try {
            const searchResp = await ordersApi.getAll({ search: code, page: 1, limit: 1 });
            const found = searchResp.data?.data?.orders?.[0];
            if (found?.id) {
                navigate(`/orders/${found.id}`);
                toast.success(`Đã tìm thấy đơn ${found.order_code ?? code}`);
                return;
            }
        } catch {
            // ignore and continue to product-code fallback
        }

        try {
            const response = await orderProductsApi.getByCode(code);
            const product = response.data?.data;
            const orderId = product?.order_id ?? product?.order?.id;
            if (orderId) {
                navigate(`/orders/${orderId}`);
                toast.success(
                    `Đã tìm thấy đơn ${product?.order?.order_code ?? ''}`.trim(),
                );
                return;
            }
        } catch {
            // not a product_code on server
        }

        setGlobalSearch(code);
        toast.error('Không tìm thấy đơn hàng với mã này');
    };

    const getCardsByStatus = (status: string) => {
        let result: { order: Order; group: { product: OrderItem | null; services: OrderItem[] }; groupIndex: number }[] = [];
        orders.forEach(order => {
            const groups = getOrderProductGroups(order);
            groups.forEach((group, index) => {
                const groupStatus = getGroupStatus(group, order);
                if (groupStatus === status) {
                    result.push({ order, group, groupIndex: index });
                }
            });
        });

        // Apply staff filter
        if (selectedStaffId && selectedStaffId !== 'all') {
            result = result.filter(v => {
                const salesMatch = v.order.sales_id === selectedStaffId;
                const techMatch = 
                    v.group.product?.technician_id === selectedStaffId ||
                    v.group.product?.technicians?.some(t => t.technician_id === selectedStaffId) ||
                    v.group.services?.some(s => s.technician_id === selectedStaffId || s.technicians?.some(t => t.technician_id === selectedStaffId));
                
                return salesMatch || techMatch;
            });
        }

        // Apply global search (mã đơn, mã HĐ, khách, NV, SĐT)
        if (globalSearch.trim()) {
            return result.filter((v) => matchesGlobalSearch(v.order, v.group, globalSearch));
        }

        return result;
    };

    const getOrdersByStatus = (status: OrderStatus) => {
        return orders.filter(order => order.status === status);
    };

    /** Nhóm items theo product + services (giống OrderDetailPage workflowKanbanGroups) */
    const getOrderProductGroups = (order: Order): { product: OrderItem | null; services: OrderItem[] }[] => {
        const items = order?.items || [];
        // Check if this order has Customer Items (Sản phẩm khách gửi)
        const hasCustomerItems = items.some((item: any) => item.is_customer_item);

        const groups: { product: OrderItem | null; services: OrderItem[] }[] = [];
        let i = 0;
        while (i < items.length) {
            const item = items[i] as OrderItem & { is_customer_item?: boolean };
            
            // Treat ANY customer item that isn't a service/package as a "product" card head
            const isProductHead = item.is_customer_item && !['service', 'package'].includes(item.item_type) || 
                                 (!hasCustomerItems && item.item_type === 'product');

            if (isProductHead) {
                const services: OrderItem[] = [];
                let j = i + 1;
                while (j < items.length) {
                    const next = items[j] as OrderItem & { is_customer_item?: boolean };
                    // Stop if we hit another "product head"
                    const nextIsProductHead = next.is_customer_item && !['service', 'package'].includes(next.item_type) || 
                                           (!hasCustomerItems && next.item_type === 'product');
                    if (nextIsProductHead) break;
                    
                    if (next.item_type === 'service' || next.item_type === 'package') {
                        services.push(items[j] as OrderItem);
                    }
                    j++;
                }
                groups.push({ product: item, services });
                i = j;
            } else if (item.item_type === 'service' || item.item_type === 'package') {
                groups.push({ product: null, services: [item] });
                i++;
            } else if (item.item_type === 'product' && item.product_id) {
                // If order has Customer Items, skip Sale Items (add-ons) to prevent duplicate cards
                if (hasCustomerItems && !item.is_customer_item) {
                    i++;
                    continue;
                }
                groups.push({ product: item, services: [] });
                i++;
            } else if (item.item_name) {
                // Skip Sale Items that are product-type in orders with Customer Items
                if (hasCustomerItems && item.item_type === 'product' && !item.is_customer_item) {
                    i++;
                    continue;
                }
                groups.push({ product: null, services: [item] });
                i++;
            } else {
                i++;
            }
        }
        if (groups.length === 0 && items.length > 0) {
            // If all items were filtered out (e.g. only add-ons?), show something?
            // Customer Item orders should have at least one Customer Item, so this shouldn't happen unless data is corrupt.
            // Fallback to showing everything if no groups found
            return [{ product: items[0] as OrderItem, services: items.slice(1).filter((it: OrderItem) => it.item_name) as OrderItem[] }];
        }
        if (groups.length === 0) return [{ product: null, services: [] }];
        return groups;
    };

    const handleCreateOrder = async (data: {
        customer_id: string;
        items: Array<{ type: string; item_id: string; name: string; quantity: number; unit_price: number }>;
        notes?: string;
        discount?: number;
    }) => {
        try {
            const newOrder = await createOrder(data);
            toast.success('Đã tạo đơn hàng mới!');
            await fetchOrders();

            // Show confirmation dialog for the new order
            if (newOrder) {
                setNewlyCreatedOrder(newOrder);
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Lỗi khi tạo đơn hàng';
            toast.error(message);
            throw error;
        }
    };

    const handleUpdateOrder = async (orderId: string, data: {
        items: Array<{ type: string; item_id: string; name: string; quantity: number; unit_price: number }>;
        notes?: string;
        discount?: number;
    }) => {
        try {
            await updateOrder(orderId, data);
            toast.success('Đã cập nhật đơn hàng!');
            await fetchOrders();
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Lỗi khi cập nhật đơn hàng';
            toast.error(message);
            throw error;
        }
    };

    const handlePaymentSuccess = async () => {
        try {
            toast.success('Thanh toán thành công!');

            // If there's a pending drop (waiting for payment), proceed with status update
            if (pendingDrop) {
                const { orderId, targetStatus } = pendingDrop;
                const order = orders.find(o => o.id === orderId);
                if (order && payingGroup) {
                    const itemIds: string[] = [];
                    if (payingGroup.product) itemIds.push(payingGroup.product.id);
                    payingGroup.services.forEach(s => itemIds.push(s.id));

                    // Update status of all items in the group
                    await Promise.all(itemIds.map(id => orderItemsApi.updateStatus(id, targetStatus)));
                }
            }

            await fetchOrders();
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Lỗi khi cập nhật trạng thái đơn hàng';
            toast.error(message);
        } finally {
            setPendingDrop(null);
            setPayingOrder(null);
            setPayingGroup(null);
        }
    };

    const handlePaymentClose = () => {
        setPendingDrop(null);
        setPayingOrder(null);
        setPayingGroup(null);
    };

    const handleDeleteOrder = async (order: Order) => {
        if (!canDelete) return;
        const confirmed = window.confirm(
            `Bạn có chắc muốn xóa đơn hàng "${order.order_code}"? Thao tác này sẽ xóa toàn bộ hóa đơn, yêu cầu, công việc kỹ thuật và dữ liệu liên quan. Hành động này không thể hoàn tác.`,
        );
        if (!confirmed) return;

        try {
            await deleteOrder(order.id);
            toast.success('Đã xóa đơn hàng và toàn bộ dữ liệu liên quan');
            await fetchOrders({ limit: 500 });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Lỗi khi xóa đơn hàng';
            toast.error(message);
        }
    };

    if (loading && orders.length === 0) {
        return (
            <div className="flex items-center justify-center min-h-100">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <>
            <Toaster position="top-right" richColors />
            <div className="animate-fade-in w-full space-y-3 px-2 lg:space-y-6" style={{ contain: 'inline-size' }}>
                {/* ——— Mobile ——— */}
                <div className="space-y-3 lg:hidden">
                    <div className="flex items-center gap-2">
                        <h1 className="min-w-0 flex-1 text-lg font-bold text-foreground">Quản lý đơn hàng</h1>
                        <Select value={selectedStaffId} onValueChange={setSelectedStaffId}>
                            <SelectTrigger className="h-9 w-[min(148px,42vw)] shrink-0 border-slate-200 bg-white text-xs shadow-sm">
                                <SelectValue placeholder="Nhân viên" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Tất cả nhân viên</SelectItem>
                                {salesPersons.length > 0 && (
                                    <>
                                        <div className="bg-muted/50 px-2 py-1.5 text-xs font-bold uppercase text-muted-foreground">Sales</div>
                                        {salesPersons.map(s => (
                                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                        ))}
                                    </>
                                )}
                                {technicians.length > 0 && (
                                    <>
                                        <div className="bg-muted/50 px-2 py-1.5 text-xs font-bold uppercase text-muted-foreground">Kỹ thuật</div>
                                        {technicians.map(t => (
                                            <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                                        ))}
                                    </>
                                )}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="rounded-xl bg-muted/60 p-2">
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="icon"
                                className="h-10 w-10 shrink-0 border-slate-200 bg-white shadow-sm"
                                title="Bộ lọc"
                                type="button"
                            >
                                <ListFilter className="h-4 w-4 text-muted-foreground" />
                            </Button>
                            <div className="relative min-w-0 flex-1">
                                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    placeholder="Mã đơn, mã HĐ, khách..."
                                    className="h-10 border-slate-200 bg-white pl-9 shadow-sm"
                                    value={globalSearch}
                                    onChange={(e) => setGlobalSearch(e.target.value)}
                                />
                            </div>
                            <Button
                                variant="outline"
                                size="icon"
                                className="h-10 w-10 shrink-0 border-slate-200 bg-white shadow-sm"
                                onClick={() => setShowQrScan(true)}
                                title="Quét QR"
                                type="button"
                            >
                                <QrCode className="h-4 w-4 text-muted-foreground" />
                            </Button>
                            <Button
                                size="icon"
                                className="h-10 w-10 shrink-0 shadow-sm"
                                onClick={() => navigate('/orders/new')}
                                title="Tạo đơn"
                            >
                                <Plus className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        {columns.map((column, index) => {
                            const statStyle = MOBILE_ORDER_STAT_STYLES[column.id];
                            const count = getCardsByStatus(column.id).length;
                            const isActive = mobileColumnIndex === index;
                            return (
                                <button
                                    key={column.id}
                                    type="button"
                                    onClick={() => setMobileColumnIndex(index)}
                                    className={`rounded-xl p-3 text-left text-white shadow-sm transition-transform active:scale-[0.98] ${statStyle?.bg ?? 'bg-slate-600'} ${
                                        isActive ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-200' : ''
                                    } ${index === columns.length - 1 && columns.length % 2 === 1 ? 'col-span-2 max-w-[calc(50%-4px)]' : ''}`}
                                >
                                    <p className="text-[11px] font-medium opacity-90">{statStyle?.label ?? column.title}</p>
                                    <p className="text-2xl font-bold">{count}</p>
                                </button>
                            );
                        })}
                    </div>

                    {error && (
                        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
                            {error}
                        </div>
                    )}

                    <MobileOrdersKanban
                        columns={columns}
                        getCardsByStatus={getCardsByStatus}
                        activeColumnIndex={mobileColumnIndex}
                        onActiveColumnChange={setMobileColumnIndex}
                        onCardClick={(order) => navigate(`/orders/${order.id}`)}
                        onViewOrder={(order) => navigate(`/orders/${order.id}`)}
                        onEditOrder={canEdit ? (order) => navigate(`/orders/${order.id}/edit`) : undefined}
                        onMarkDone={canEdit ? handleMarkGroupDone : undefined}
                        onDeleteOrder={canDelete ? handleDeleteOrder : undefined}
                    />
                </div>

                {/* ——— Desktop ——— */}
                <div className="hidden space-y-6 lg:block">
                    <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
                        <div className="min-w-0 flex-1">
                            <h1 className="text-2xl font-bold text-foreground">Quản lý đơn hàng</h1>
                            <p className="text-muted-foreground">Theo dõi và xử lý đơn hàng theo trạng thái</p>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
                            <div className="flex-1 sm:min-w-[200px]">
                                <Select value={selectedStaffId} onValueChange={setSelectedStaffId}>
                                    <SelectTrigger className="h-10 w-full bg-white">
                                        <SelectValue placeholder="Lọc theo nhân viên" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Tất cả nhân viên</SelectItem>
                                        {salesPersons.length > 0 && (
                                            <>
                                                <div className="px-2 py-1.5 text-xs font-bold text-muted-foreground uppercase bg-muted/50">Sales</div>
                                                {salesPersons.map(s => (
                                                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                                ))}
                                            </>
                                        )}
                                        {technicians.length > 0 && (
                                            <>
                                                <div className="px-2 py-1.5 text-xs font-bold text-muted-foreground uppercase bg-muted/50">Kỹ thuật</div>
                                                {technicians.map(t => (
                                                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                                                ))}
                                            </>
                                        )}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="relative flex-1 sm:min-w-[250px]">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Mã đơn, mã HĐ, khách, NV..."
                                    className="pl-10 h-10 w-full bg-white"
                                    value={globalSearch}
                                    onChange={(e) => setGlobalSearch(e.target.value)}
                                />
                            </div>
                            <Button
                                variant="outline"
                                className="shrink-0 h-10 px-4"
                                onClick={() => setShowQrScan(true)}
                            >
                                <QrCode className="h-4 w-4 mr-2" />
                                Quét QR
                            </Button>
                            <Button onClick={() => navigate('/orders/new')} className="shrink-0 h-10 px-6">
                                <Plus className="h-4 w-4 mr-2" />
                                Tạo đơn
                            </Button>
                        </div>
                    </div>

                    {/* Error Message */}
                    {error && (
                        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-600">
                            {error}
                        </div>
                    )}

                    {/* Stats */}
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
                        {columns.map((column) => {
                            const count = getCardsByStatus(column.id).length;
                            return (
                                <Card key={column.id} className={`${column.bgColor} border-0`}>
                                    <CardContent className="p-3 sm:p-4">
                                        <div className="flex items-center justify-between">
                                            <span className={`text-sm font-medium ${column.color}`}>{column.title}</span>
                                            <span className={`text-xl sm:text-2xl font-bold ${column.color}`}>{count}</span>
                                        </div>
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>

                    <div className="pb-6">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                            {columns.map((column) => (
                                <div key={column.id} className="min-w-0">
                                    <Card className={`${column.bgColor} border ${column.borderColor} h-full`}>
                                        <CardHeader className="p-3 pb-2">
                                            <CardTitle className={`text-sm font-semibold flex items-center justify-between ${column.color}`}>
                                                <span>{column.title}</span>
                                                <Badge variant="secondary" className="bg-white/80">
                                                    {(() => {
                                                        const searchText = normalizeSearchText(columnSearch[column.id] || '');
                                                        const statusCards = getCardsByStatus(column.id);
                                                        if (!searchText) return statusCards.length;
                                                        return statusCards.filter((c) =>
                                                            matchesGlobalSearch(c.order, c.group, columnSearch[column.id] || ''),
                                                        ).length;
                                                    })()}
                                                </Badge>
                                            </CardTitle>
                                            <div className="relative mt-1.5 px-0.5">
                                                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                                                <Input
                                                    placeholder="Mã đơn, mã HĐ, khách..."
                                                    value={columnSearch[column.id] || ''}
                                                    onChange={(e) => setColumnSearch({ ...columnSearch, [column.id]: e.target.value })}
                                                    className="h-7 pl-6.5 text-[11px] bg-white/40 border-0 focus-visible:ring-1 focus-visible:ring-primary/20 placeholder:text-muted-foreground/60"
                                                />
                                            </div>
                                        </CardHeader>
                                        <CardContent className="p-2">
                                            {(() => {
                                                const cardsByStatus = getCardsByStatus(column.id);
                                                const searchText = normalizeSearchText(columnSearch[column.id] || '');
                                                const filteredCards = searchText
                                                    ? cardsByStatus.filter((c) =>
                                                        matchesGlobalSearch(
                                                            c.order,
                                                            c.group,
                                                            columnSearch[column.id] || '',
                                                        ),
                                                    )
                                                    : cardsByStatus;
                                                return (
                                                    <div className="kanban-column space-y-3 min-h-[100px] lg:min-h-[calc(100vh-300px)] p-1 rounded-lg">
                                                        {filteredCards.map(({ order, group, groupIndex }, index) => (
                                                            <OrderCard
                                                                key={`${order.id}__${groupIndex}`}
                                                                draggableId={`${order.id}__${groupIndex}`}
                                                                order={order}
                                                                productGroup={group}
                                                                columnId={column.id}
                                                                index={index}
                                                                draggable={false}
                                                                onClick={() => navigate(`/orders/${order.id}`)}
                                                                onDelete={canDelete ? handleDeleteOrder : undefined}
                                                            />
                                                        ))}
                                                        {filteredCards.length === 0 && (
                                                            <div className="flex items-center justify-center h-20 lg:h-32 text-muted-foreground text-sm">
                                                                Không có đơn hàng
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })()}
                                        </CardContent>
                                    </Card>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Payment Dialog */}
            <PaymentDialog
                order={payingOrder}
                open={!!payingOrder}
                productGroup={payingGroup}
                onClose={handlePaymentClose}
                onSuccess={handlePaymentSuccess}
            />

            {/* Order Confirmation Dialog (after creating new order) */}
            <OrderConfirmationDialog
                open={!!newlyCreatedOrder}
                onClose={() => setNewlyCreatedOrder(null)}
                order={newlyCreatedOrder}
                onConfirm={async () => {
                    await fetchOrders();
                    setNewlyCreatedOrder(null);
                }}
            />

            <OrderQrScanDialog
                open={showQrScan}
                onOpenChange={setShowQrScan}
                onScan={handleQrScan}
            />

            <ConfirmDoneDialog 
                open={showConfirmDoneDialog}
                onOpenChange={setShowConfirmDoneDialog}
                itemIds={confirmDoneItemIds}
                productId={confirmDoneProductId}
                isV2Service={isV2ServiceForDone}
                onSuccess={async () => {
                    await fetchOrders();
                    if (orderToCheckStatus) {
                        try {
                            const response = await ordersApi.getById(orderToCheckStatus);
                            const updatedOrder = response.data?.data?.order;
                            if (updatedOrder && updatedOrder.status !== 'done' && updatedOrder.status !== 'after_sale') {
                                const allDone = updatedOrder.items?.every((i: any) => 
                                    i.status === 'completed' || i.status === 'cancelled' || i.status === 'aftersale_stored'
                                );
                                if (allDone) {
                                    await updateOrderStatus(orderToCheckStatus, 'done');
                                }
                            }
                        } catch (err) {
                            console.error('Failed to sync order status after confirmation:', err);
                        }
                        setOrderToCheckStatus(null);
                    }
                }}
            />
        </>
    );
}
