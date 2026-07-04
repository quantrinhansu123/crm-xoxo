import { useState, useEffect, useMemo, type ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    Package,
    Truck,
    Clock,
    Loader2,
    ExternalLink,
    FileText,
    RefreshCw,
    Plus,
    AlertCircle,
    CheckCircle2,
    Calendar,
    MapPin,
    User,
    Image as ImageIcon,
    Search,
    Building2,
    Hash,
    DollarSign,
    Layers,
} from 'lucide-react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import type { DropResult } from '@hello-pangea/dnd';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { requestsApi, orderItemsApi, ordersApi, usersApi, transactionsApi } from '@/lib/api';
import { uploadFile } from '@/lib/supabase';
import { cn, formatDateTime, formatCurrency } from '@/lib/utils';
import { ACCESSORY_LABELS, PARTNER_LABELS, EXTENSION_LABELS, REQUEST_SLA } from '@/components/orders/constants';
import {
    MobileKanbanColumnTabs,
    MobileKanbanMoveBar,
    type MobileKanbanColumn,
} from '@/components/kanban/mobileKanban';
import { useAuth } from '@/contexts/AuthContext';
import { useViewActionForRoles } from '@/hooks/useViewAction';
import {
    canViewAccessoryPurchasePrice,
    canViewPartnerFeePrice,
    isSensitivePriceField,
} from '@/lib/sensitivePermissions';

const ACCESSORY_COLUMNS = Object.entries(ACCESSORY_LABELS)
    .filter(([id]) => id !== 'requested' && id !== 'rejected')
    .map(([id, label]) => ({ id, label }));
const PARTNER_COLUMNS = Object.entries(PARTNER_LABELS)
    .filter(([id]) => id !== 'requested' && id !== 'rejected')
    .map(([id, label]) => ({ id, label }));

// Extension: Show only requested, manager_approved, sale_contacted, notified_tech in Kanban board
const EXTENSION_COLUMNS = Object.entries(EXTENSION_LABELS)
    .filter(([id]) => ['manager_approved', 'sale_contacted', 'notified_tech'].includes(id))
    .map(([id, label]) => ({ id, label }));

// Reorder extension columns: QL duyệt (manager_approved) before "Đã báo KT" (notified_tech)
// Since notified_tech was 4th and manager_approved was 3rd, the order requested is requested -> contacted -> approved -> tech
// Current labels: requested, sale_contacted, manager_approved, notified_tech, kpi_recorded.
// Order in EXTENSION_COLUMNS filter:
// 1. requested
// 2. sale_contacted
// 3. manager_approved
// 4. notified_tech
// This is already the correct order from the Labels object. Let's just make sure.

function calculateSLADisplay(updatedAt: string | undefined, slaHours: number): { label: string; isOverdue: boolean; color: string; badge: string } {
    if (!updatedAt || slaHours === 0) return { label: '', isOverdue: false, color: '', badge: '' };

    // SLA start from updatedAt of the status change
    const start = new Date(updatedAt);
    const deadline = new Date(start.getTime() + Math.abs(slaHours) * 60 * 60 * 1000);
    const now = new Date();

    const diffMs = deadline.getTime() - now.getTime();
    const isOverdue = diffMs < 0;

    if (isOverdue) {
        const h = Math.abs(Math.floor(diffMs / (3600 * 1000)));
        const m = Math.abs(Math.floor((diffMs % (3600 * 1000)) / 60000));
        return {
            label: h > 0 ? `Trễ ${h}h ${m}p` : `Trễ ${m}p`,
            isOverdue: true,
            color: 'text-red-600 border-red-200 bg-red-50',
            badge: 'bg-red-500'
        };
    }

    const h = Math.floor(diffMs / (3600 * 1000));
    const m = Math.floor((diffMs % (3600 * 1000)) / 60000);

    let label = h > 0 ? `${h}h ${m}p` : `${m}p`;
    let color = h <= 2 ? 'text-amber-600 border-amber-200 bg-amber-50' : 'text-emerald-600 border-emerald-200 bg-emerald-50';
    let badge = h <= 2 ? 'bg-amber-500' : 'bg-emerald-500';

    return { label: `Còn ${label}`, isOverdue: false, color, badge };
}

const COLUMN_SLA_LABELS: Record<string, string> = {
    need_buy: 'Xử lý trong 1 ngày',
    bought: 'Mua trong 1 ngày',
    waiting_ship: 'Chờ trong 6 ngày',
    shipped: 'Xử lý trong 12h',

    ship_to_partner: 'Xử lý trong 1 ngày',
    partner_doing: 'Theo deadline',
    ship_back: 'Xử lý trong 1 ngày',

    requested: 'Cảnh báo 3h',
    manager_approved: 'Xử lý trong 1h',
    sale_contacted: 'Xong trong 1h',
    notified_tech: 'Xong trong 1h',
};



function groupByStatus<T extends { status: string }>(items: T[], columnIds: string[]): Record<string, T[]> {
    const map: Record<string, T[]> = {};
    columnIds.forEach((id) => (map[id] = []));
    items.forEach((item) => {
        if (map[item.status]) map[item.status].push(item);
    });
    return map;
}

type RequestKanbanColumn = { id: string; label: string };

function RequestKanbanBoard({
    columns,
    items,
    updatingId,
    onDragEnd,
    renderCard,
}: {
    columns: RequestKanbanColumn[];
    items: { id: string; status: string }[];
    updatingId: string | null;
    onDragEnd: (result: DropResult) => void;
    renderCard: (row: any) => ReactNode;
}) {
    const [mobileCol, setMobileCol] = useState(columns[0]?.id ?? '');
    const byStatus = useMemo(() => groupByStatus(items, columns.map((c) => c.id)), [items, columns]);
    const mobileColumns: MobileKanbanColumn[] = columns.map((c) => ({ id: c.id, title: c.label }));
    const isUpdating = !!updatingId;
    const activeCol = columns.find((c) => c.id === mobileCol) ?? columns[0];

    return (
        <DragDropContext onDragEnd={onDragEnd}>
            <div className="space-y-3 md:hidden">
                <MobileKanbanColumnTabs
                    columns={mobileColumns}
                    activeId={mobileCol}
                    onChange={setMobileCol}
                    getCount={(id) => byStatus[id]?.length ?? 0}
                />
                {activeCol && (
                    <Droppable droppableId={activeCol.id}>
                        {(provided, snapshot) => (
                            <div
                                ref={provided.innerRef}
                                {...provided.droppableProps}
                                className={cn(
                                    'min-h-[200px] space-y-2 rounded-xl border bg-muted/30 p-2 transition-colors',
                                    snapshot.isDraggingOver && 'bg-primary/10 border-primary/30'
                                )}
                            >
                                <div className="mb-2 flex flex-col gap-1">
                                    <span className="font-bold text-sm text-slate-700">{activeCol.label}</span>
                                    {COLUMN_SLA_LABELS[activeCol.id] && (
                                        <span className="text-[10px] font-medium italic text-muted-foreground">
                                            {COLUMN_SLA_LABELS[activeCol.id]}
                                        </span>
                                    )}
                                </div>
                                {(byStatus[activeCol.id] || []).map((row: any, index: number) => (
                                    <Draggable
                                        key={row.id}
                                        draggableId={row.id}
                                        index={index}
                                        isDragDisabled
                                    >
                                        {(dragProvided) => (
                                            <div
                                                ref={dragProvided.innerRef}
                                                {...dragProvided.draggableProps}
                                            >
                                                {renderCard(row)}
                                                <MobileKanbanMoveBar
                                                    columns={mobileColumns}
                                                    currentColumnId={activeCol.id}
                                                    draggableId={row.id}
                                                    onMove={onDragEnd}
                                                    disabled={isUpdating}
                                                    sourceIndex={index}
                                                    embedded
                                                />
                                            </div>
                                        )}
                                    </Draggable>
                                ))}
                                {provided.placeholder}
                            </div>
                        )}
                    </Droppable>
                )}
            </div>

            <div className="-mx-4 hidden min-h-[320px] gap-4 overflow-x-auto px-4 pb-2 md:flex sm:mx-0 sm:gap-4 sm:px-0">
                {columns.map((col) => (
                    <Droppable key={col.id} droppableId={col.id}>
                        {(provided, snapshot) => (
                            <div
                                ref={provided.innerRef}
                                {...provided.droppableProps}
                                className={cn(
                                    'w-[280px] shrink-0 rounded-xl border bg-muted/30 p-3 transition-colors',
                                    snapshot.isDraggingOver && 'bg-primary/10 border-primary/30'
                                )}
                            >
                                <div className="mb-3 flex flex-col gap-1">
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm font-bold text-slate-700">{col.label}</span>
                                        <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                                            {byStatus[col.id]?.length ?? 0}
                                        </Badge>
                                    </div>
                                    {COLUMN_SLA_LABELS[col.id] && (
                                        <span className="text-[10px] font-medium italic text-muted-foreground">
                                            {COLUMN_SLA_LABELS[col.id]}
                                        </span>
                                    )}
                                </div>
                                <div className="min-h-[200px] space-y-2">
                                    {(byStatus[col.id] || []).map((row: any, index: number) => (
                                        <Draggable
                                            key={row.id}
                                            draggableId={row.id}
                                            index={index}
                                            isDragDisabled={isUpdating}
                                        >
                                            {(dragProvided, dragSnapshot) => (
                                                <div
                                                    ref={dragProvided.innerRef}
                                                    {...dragProvided.draggableProps}
                                                    {...dragProvided.dragHandleProps}
                                                    className={dragSnapshot.isDragging ? 'opacity-90' : ''}
                                                >
                                                    {renderCard(row)}
                                                </div>
                                            )}
                                        </Draggable>
                                    ))}
                                </div>
                                {provided.placeholder}
                            </div>
                        )}
                    </Droppable>
                ))}
            </div>
        </DragDropContext>
    );
}

function getFirstImage(value: any): string | null {
    if (!value) return null;
    if (Array.isArray(value)) return value.find(Boolean) || null;
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return null;
        if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
            try {
                const parsed = JSON.parse(trimmed);
                return getFirstImage(parsed);
            } catch {
                return trimmed;
            }
        }
        return trimmed;
    }
    if (typeof value === 'object') {
        return getFirstImage(value.images) ||
            getFirstImage(value.product_images) ||
            getFirstImage(value.image) ||
            getFirstImage(value.url) ||
            getFirstImage(value.src);
    }
    return null;
}

function getRequestProductImage(row: any): string | null {
    const orderProduct = row.order_product_service?.order_product || row.order_product;
    const orderItem = row.order_item;
    return getFirstImage(orderItem?.product_images) ||
        getFirstImage(orderItem?.images) ||
        getFirstImage(orderItem?.image) ||
        getFirstImage(orderItem?.product?.image) ||
        getFirstImage(orderItem?.product?.images) ||
        getFirstImage(orderProduct?.product_images) ||
        getFirstImage(orderProduct?.images) ||
        getFirstImage(orderProduct?.image) ||
        getFirstImage(row.order?.order_products?.[0]) ||
        getFirstImage(row.metadata?.product_images) ||
        getFirstImage(row.metadata?.photos) ||
        null;
}

function PhotoUpload({ label, value, onChange, disabled }: { label: string; value: string[]; onChange: (urls: string[]) => void; disabled?: boolean }) {
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
            <div className="grid grid-cols-2 gap-3">
                {value?.map((url, i) => (
                    <div key={i} className="group relative aspect-square rounded-xl overflow-hidden border bg-white shadow-md transition-transform hover:scale-[1.02]">
                        <img src={url} alt="" className="w-full h-full object-cover" />
                        {!disabled && (
                            <button
                                onClick={() => removePhoto(i)}
                                className="absolute top-1.5 right-1.5 bg-black/60 text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                                <Plus className="w-4 h-4 rotate-45" />
                            </button>
                        )}
                    </div>
                ))}
                {!disabled && (
                    <label className={`aspect-square rounded-xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
                        {uploading ? <Loader2 className="w-8 h-8 animate-spin text-primary" /> : <ImageIcon className="w-10 h-10 text-slate-300" />}
                        <span className="text-xs font-bold text-slate-400 mt-2">Tải ảnh</span>
                        <input type="file" multiple accept="image/*" className="hidden" onChange={handleFileChange} />
                    </label>
                )}
            </div>
        </div>
    );
}

const ACCESSORY_TRANSITIONS: Record<string, { next: string; label: string; fields: { name: string; label: string; type: 'photo' | 'text' | 'number' | 'select' | 'datetime-local'; required: boolean; placeholder?: string; options?: { label: string; value: string }[] }[] }> = {
    need_buy: {
        next: 'bought',
        label: 'Đã mua (Cập nhật ảnh)',
        fields: [
            { name: 'payment_by', label: '1. Nhân viên chi', type: 'select', required: true },
            {
                name: 'payment_type', label: '2. Chi loại', type: 'select', required: true, options: [
                    { label: 'Tiền mặt', value: 'cash' },
                    { label: 'Chuyển khoản', value: 'transfer' },
                    { label: 'Zalo Pay', value: 'zalopay' }
                ]
            },
            { name: 'photos_purchase', label: '3. Ảnh mua', type: 'photo', required: true },
            { name: 'photos_transfer', label: '4. Ảnh ck', type: 'photo', required: true }
        ]
    },
    bought: {
        next: 'waiting_ship',
        label: 'Chờ ship (Cập nhật vận đơn)',
        fields: [
            { name: 'tracking_number', label: '1. Mã vận đơn', type: 'text', required: true, placeholder: 'VN12345678...' },
            { name: 'notes_shipping', label: '2. Note', type: 'text', required: false, placeholder: 'Ghi chú vận chuyển...' }
        ]
    },
    waiting_ship: {
        next: 'shipped',
        label: 'Ship tới (Cập nhật nhận hàng)',
        fields: [
            { name: 'payment_by', label: '1. Nhân viên chi', type: 'select', required: true },
            {
                name: 'payment_type', label: '2. Chi loại', type: 'select', required: true, options: [
                    { label: 'Tiền mặt', value: 'cash' },
                    { label: 'Chuyển khoản', value: 'transfer' },
                    { label: 'Zalo Pay', value: 'zalopay' }
                ]
            },
            { name: 'shipping_cost', label: '3. Phí ship (0đ hoặc 100k...)', type: 'text', required: true, placeholder: '0đ hoặc 100k...' },
            { name: 'photos_arrival', label: '4. Ảnh chụp lúc nhận hàng', type: 'photo', required: true }
        ]
    },
    shipped: {
        next: 'delivered_to_tech',
        label: 'Giao KT (Hoàn tất bàn giao)',
        fields: [
            { name: 'photos_item', label: '1. Chụp ảnh hàng', type: 'photo', required: true },
            { name: 'photos_storage', label: '2. Chụp chỗ để', type: 'photo', required: true }
        ]
    },
    delivered_to_tech: {
        next: 'done',
        label: 'Hoàn tất',
        fields: []
    }
};

const PARTNER_TRANSITIONS: Record<string, { next: string; label: string; fields: { name: string; label: string; type: 'photo' | 'text' | 'number' | 'select' | 'datetime-local'; required: boolean; placeholder?: string; options?: { label: string; value: string }[] }[] }> = {
    ship_to_partner: {
        next: 'partner_doing',
        label: 'Đối tác đã nhận',
        fields: [
            { name: 'sender_staff', label: '1. Tên NV gửi', type: 'select', required: true },
            { name: 'shipping_sender_staff', label: '2. Tên NV gửi tiền ship', type: 'select', required: true },
            { name: 'shipping_cost_out', label: '3. Phí ship đi', type: 'text', required: true, placeholder: '0đ hoặc 20k...' },
            {
                name: 'shipping_payment_type', label: '4. Loại chi ship', type: 'select', required: true, options: [
                    { label: 'Tiền mặt', value: 'cash' },
                    { label: 'Chuyển khoản', value: 'transfer' },
                    { label: 'Zalo Pay', value: 'zalopay' }
                ]
            },
            { name: 'appointment_time', label: '5. Thời gian đối tác hẹn làm', type: 'datetime-local', required: true },
            { name: 'photos_package', label: '6. Ảnh gói đồ', type: 'photo', required: true }
        ]
    },
    partner_doing: {
        next: 'ship_back',
        label: 'Gửi về Shop',
        fields: [
            { name: 'partner_name', label: 'Tên đối tác', type: 'text', required: true, placeholder: 'Xưởng ABC...' },
            { name: 'partner_address', label: 'Địa chỉ', type: 'text', required: true, placeholder: 'Số 1 Trần Phú...' },
            { name: 'appointment_time', label: 'Hẹn ngày xong', type: 'datetime-local', required: true }
        ]
    },
    ship_back: {
        next: 'done', 
        label: 'Hoàn thành bàn giao', 
        fields: [
            // Row 1: Costs
            { name: 'shipping_cost_back', label: '1. Phí ship mang về', type: 'text', required: true, placeholder: '0đ hoặc 20k...' },
            { name: 'partner_fee_amount', label: '4. Phí sửa đối tác', type: 'text', required: true, placeholder: '0đ hoặc 500k...' },
            
            // Row 2: Personnel
            { name: 'shipping_sender_staff_back', label: '2. NV gửi tiền ship về', type: 'select', required: true },
            { name: 'partner_fee_sender_staff', label: '5. NV gửi phí đối tác', type: 'select', required: true },
            
            // Row 3: Payment Type
            { name: 'shipping_payment_type_back', label: '3. Loại chi ship về', type: 'select', required: true, options: [
                { label: 'Tiền mặt', value: 'cash' },
                { label: 'Chuyển khoản', value: 'transfer' },
                { label: 'Zalo Pay', value: 'zalopay' }
            ]},
            { name: 'partner_payment_type', label: '6. Loại chi phí đối tác', type: 'select', required: true, options: [
                { label: 'Tiền mặt', value: 'cash' },
                { label: 'Chuyển khoản', value: 'transfer' },
                { label: 'Zalo Pay', value: 'zalopay' }
            ]},
            
            // Row 4: Evidence
            { name: 'photos_package_back', label: '7. Ảnh gói hàng (về)', type: 'photo', required: true },
            { name: 'photos_storage', label: '8. Ảnh chỗ để gói hàng', type: 'photo', required: true }
        ]
    },
};


type KanbanCardProps = {
    row: any;
    onOpenDialog: (row: any) => void;
    onNavigateOrder: (id: string) => void;
    getOrder: (row: any) => { id?: string; order_code?: string };
    getProductCode?: (row: any) => string;
    getItemName: (row: any) => string;
    getProductImage?: (row: any) => string | null;
    extra?: React.ReactNode;
};

function AccessoryKanbanCard({ row, onOpenDialog, onNavigateOrder, getOrder, getProductCode, getItemName, getProductImage, extra }: KanbanCardProps) {
    const order = getOrder(row);
    const productCode = getProductCode?.(row) ?? '—';
    const productImage = getProductImage?.(row) ?? null;

    const slaConfig = REQUEST_SLA[row.status] || 0;
    const { label: slaLabel, isOverdue, color: slaColor, badge: slaBadge } = calculateSLADisplay(row.updated_at, slaConfig);

    return (
        <div
            className={`group relative rounded-xl border bg-card text-sm shadow-sm transition-all hover:shadow-md overflow-hidden ${isOverdue ? 'border-red-500 ring-1 ring-red-500' : ''}`}
        >
            <div className="relative flex h-36 w-full items-center justify-center overflow-hidden bg-muted sm:h-auto sm:aspect-[4/3]">
                {productImage ? (
                    <img src={productImage} alt="" className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                ) : (
                    <Package className="h-10 w-10 text-muted-foreground/40" />
                )}
                {slaLabel && (
                    <div className={`absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-bold shadow-sm flex items-center gap-1 border ${slaColor}`}>
                        <Clock className="w-3 h-3" />
                        {slaLabel}
                    </div>
                )}
            </div>
            <div className="p-2.5 sm:p-3">
                <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                        <div className="flex items-center gap-1.5 overflow-hidden">
                            <span className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-wider">{productCode.includes('.') ? 'Mã SP' : 'Mã ĐH'}:</span>
                            <span className="font-mono font-bold text-primary truncate" title={productCode}>{productCode}</span>
                        </div>
                        <p className="mt-1 truncate text-[13px] font-medium text-slate-900 sm:text-sm" title={getItemName(row)}>
                            {row.metadata?.item_name || getItemName(row)}
                            {row.metadata?.quantity && <span className="text-muted-foreground ml-1">x{row.metadata.quantity}</span>}
                        </p>
                    </div>
                    {order.order_code && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0 text-muted-foreground hover:text-primary hover:bg-primary/5"
                            onClick={() => order.id && onNavigateOrder(order.id)}
                        >
                            <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                    )}
                </div>

                {row.notes && (
                    <div className="mt-2 text-xs text-muted-foreground bg-muted/40 p-1.5 rounded-md line-clamp-2 italic" title={row.notes}>
                        &ldquo;{row.notes}&rdquo;
                    </div>
                )}

                {extra}

                <Button
                    variant={isOverdue ? "destructive" : "outline"}
                    size="sm"
                    className="mt-2.5 h-7 w-full rounded-lg text-[11px] font-semibold sm:mt-3 sm:h-8 sm:text-xs"
                    onClick={() => onOpenDialog(row)}
                >
                    {isOverdue ? "Xử lý quá hạn" : "Cập nhật"}
                </Button>
            </div>
        </div>
    );
}

function PartnerKanbanCard({ row, onOpenDialog, onNavigateOrder, getOrder, getProductCode, getItemName, getProductImage, extra }: KanbanCardProps) {
    const order = getOrder(row);
    const productCode = getProductCode?.(row) ?? '—';
    const productImage = getProductImage?.(row) ?? null;

    const slaConfig = REQUEST_SLA[row.status] || 0;
    const { label: slaLabel, isOverdue, color: slaColor } = calculateSLADisplay(row.updated_at, slaConfig);

    const metadata = row.metadata || {};
    const appointmentTime = metadata.appointment_time ? new Date(metadata.appointment_time) : null;
    
    // Check if appointment is today (any time today - midnight to midnight)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const isAppointmentToday = row.status === 'partner_doing' &&
        appointmentTime &&
        appointmentTime.getTime() >= today.getTime() &&
        appointmentTime.getTime() < tomorrow.getTime();
    
    // Check if appointment is tomorrow (1 day before)
    const dayAfterTomorrow = new Date(tomorrow);
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);
    const isAppointmentTomorrow = row.status === 'partner_doing' &&
        appointmentTime &&
        appointmentTime.getTime() >= tomorrow.getTime() &&
        appointmentTime.getTime() < dayAfterTomorrow.getTime();
    
    // Check if appointment is overdue (past due)
    const isAppointmentOverdue = row.status === 'partner_doing' &&
        appointmentTime &&
        appointmentTime.getTime() < Date.now();
    
    const finalOverdue = isOverdue || isAppointmentOverdue || isAppointmentToday;

    return (
        <div
            className={`group relative rounded-xl border bg-card text-sm shadow-sm transition-all hover:shadow-md overflow-hidden ${finalOverdue ? 'border-red-500 ring-1 ring-red-500' : ''}`}
        >
            <div className="relative flex h-36 w-full items-center justify-center overflow-hidden bg-muted sm:h-auto sm:aspect-[4/3]">
                {productImage ? (
                    <img src={productImage} alt="" className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                ) : (
                    <Package className="h-10 w-10 text-muted-foreground/40" />
                )}
                {slaLabel && (
                    <div className={`absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-bold shadow-sm flex items-center gap-1 border ${slaColor}`}>
                        <Clock className="w-3 h-3" />
                        {slaLabel}
                    </div>
                )}
            </div>
            <div className="p-2.5 sm:p-3">
                <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                        <div className="flex items-center gap-1.5 overflow-hidden">
                            <span className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-wider">{productCode.includes('.') ? 'Mã SP' : 'Mã ĐH'}:</span>
                            <span className="font-mono font-bold text-primary truncate" title={productCode}>{productCode}</span>
                        </div>
                        <p className="mt-1 truncate text-[13px] font-medium text-slate-900 sm:text-sm" title={getItemName(row)}>
                            {row.metadata?.item_name || getItemName(row)}
                        </p>
                    </div>
                    {order.order_code && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0 text-muted-foreground hover:text-primary hover:bg-primary/5"
                            onClick={() => order.id && onNavigateOrder(order.id)}
                        >
                            <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                    )}
                </div>

                {metadata.partner_name && (
                    <div className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-600 bg-slate-50 border border-slate-100 p-1.5 rounded-md">
                        <MapPin className="w-3 h-3 text-slate-400" />
                        <span className="font-semibold">{metadata.partner_name}</span>
                    </div>
                )}

                {metadata.appointment_time && (
                    <div className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-600 bg-slate-50 border border-slate-100 p-1.5 rounded-md">
                        <Calendar className="w-3 h-3 text-slate-400" />
                        <span>Hẹn: </span>
                        <span className={isAppointmentOverdue ? 'text-red-600 font-bold' : isAppointmentToday ? 'text-red-600 font-bold' : isAppointmentTomorrow ? 'text-amber-600 font-bold' : 'font-semibold'}>
                            {formatDateTime(metadata.appointment_time)}
                        </span>
                        {isAppointmentTomorrow && (
                            <Badge variant="outline" className="ml-1 text-[9px] h-4 px-1 bg-amber-50 border-amber-200 text-amber-700">
                                Ngày mai
                            </Badge>
                        )}
                    </div>
                )}

                {row.notes && (
                    <div className="mt-2 text-xs text-muted-foreground bg-muted/40 p-1.5 rounded-md line-clamp-2 italic">
                        &ldquo;{row.notes}&rdquo;
                    </div>
                )}

                {extra}

                <Button
                    variant={finalOverdue ? "destructive" : "outline"}
                    size="sm"
                    className="mt-2.5 h-7 w-full rounded-lg text-[11px] font-semibold sm:mt-3 sm:h-8 sm:text-xs"
                    onClick={() => onOpenDialog(row)}
                >
                    {finalOverdue ? "Xử lý quá hạn" : "Cập nhật"}
                </Button>
            </div>
        </div>
    );
}

function ExtensionKanbanCard({ row, onOpenDialog, onNavigateOrder, getOrder, getProductCode, getItemName, getProductImage, extra }: KanbanCardProps) {
    const order = getOrder(row);
    const productCode = getProductCode?.(row) ?? '—';
    const productImage = getProductImage?.(row) ?? null;

    // SLA for Extension: Warning if requested more than 3h ago (handled by requested: -3 SLA)
    const slaConfig = REQUEST_SLA[row.status] || 0;
    const { label: slaLabel, isOverdue, color: slaColor } = calculateSLADisplay(row.updated_at, slaConfig);

    return (
        <div
            className={`group relative rounded-xl border bg-card text-sm shadow-sm transition-all hover:shadow-md overflow-hidden ${isOverdue ? 'border-red-500 ring-1 ring-red-500' : ''}`}
        >
            <div className="relative flex h-36 w-full items-center justify-center overflow-hidden bg-muted sm:h-auto sm:aspect-[4/3]">
                {productImage ? (
                    <img src={productImage} alt="" className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                ) : (
                    <Clock className="h-10 w-10 text-muted-foreground/30" />
                )}
                {slaLabel && (
                    <div className={`absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-bold shadow-sm flex items-center gap-1 border ${slaColor}`}>
                        <Clock className="w-3 h-3" />
                        {slaLabel}
                    </div>
                )}
            </div>

            <div className="p-2.5 sm:p-3">
                <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                        <div className="flex items-center gap-1.5 overflow-hidden">
                            <span className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-wider">{productCode.includes('.') ? 'Mã SP' : 'Mã ĐH'}:</span>
                            <span className="font-mono font-bold text-primary truncate" title={productCode}>{productCode}</span>
                        </div>
                        <p className="mt-1 truncate text-[13px] font-medium text-slate-900 sm:text-sm" title={getItemName(row)}>
                            {getItemName(row)}
                        </p>
                    </div>
                    {order.id && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0 text-muted-foreground hover:text-primary hover:bg-primary/5"
                            onClick={() => onNavigateOrder(order.id!)}
                        >
                            <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                    )}
                </div>

                <div className="mt-2 space-y-1.5">
                    <div className="flex items-center gap-2 text-[11px] text-slate-600 bg-slate-50 border border-slate-100 p-1.5 rounded-md">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <span>Hạn mới: <span className="font-bold text-slate-900">{row.new_due_at ? formatDateTime(row.new_due_at) : '—'}</span></span>
                    </div>
                    {row.reason && (
                        <div className="text-[11px] text-muted-foreground line-clamp-2 italic italic px-1">
                            &ldquo;{row.reason}&rdquo;
                        </div>
                    )}
                </div>

                {extra}

                <Button
                    variant={isOverdue ? "destructive" : "outline"}
                    size="sm"
                    className="mt-2.5 h-7 w-full rounded-lg text-[11px] font-semibold sm:mt-3 sm:h-8 sm:text-xs"
                    onClick={() => onOpenDialog(row)}
                >
                    Cập nhật
                </Button>
            </div>
        </div>
    );
}

function AccessoryKanban({
    items,
    updatingId,
    onDragEnd,
    onOpenDialog,
    onNavigateOrder,
}: {
    items: any[];
    updatingId: string | null;
    onDragEnd: (result: DropResult) => void;
    onOpenDialog: (row: any) => void;
    onNavigateOrder: (id: string) => void;
}) {
    return (
        <RequestKanbanBoard
            columns={ACCESSORY_COLUMNS}
            items={items}
            updatingId={updatingId}
            onDragEnd={onDragEnd}
            renderCard={(row) => {
                const order =
                    row.order_item?.order ??
                    row.order_product_service?.order_product?.order ??
                    row.order_product?.order;
                return (
                    <AccessoryKanbanCard
                        row={row}
                        onOpenDialog={onOpenDialog}
                        onNavigateOrder={onNavigateOrder}
                        getOrder={() => order || {}}
                        getProductCode={(r) =>
                            r.order_item?.item_code ??
                            r.order_product_service?.order_product?.product_code ??
                            r.order_product?.product_code ??
                            (r.metadata?.order_code ?? '—').toUpperCase().replace('HD', 'HĐ')
                        }
                        getItemName={(r) =>
                            r.order_item?.item_name ??
                            r.order_product_service?.order_product?.name ??
                            r.order_product?.name ??
                            '—'
                        }
                        getProductImage={getRequestProductImage}
                    />
                );
            }}
        />
    );
}

function PartnerKanban({
    items,
    updatingId,
    onDragEnd,
    onOpenDialog,
    onNavigateOrder,
}: {
    items: any[];
    updatingId: string | null;
    onDragEnd: (result: DropResult) => void;
    onOpenDialog: (row: any) => void;
    onNavigateOrder: (id: string) => void;
}) {
    return (
        <RequestKanbanBoard
            columns={PARTNER_COLUMNS}
            items={items}
            updatingId={updatingId}
            onDragEnd={onDragEnd}
            renderCard={(row) => {
                const order =
                    row.order_item?.order ??
                    row.order_product_service?.order_product?.order ??
                    row.order_product?.order;
                return (
                    <PartnerKanbanCard
                        row={row}
                        onOpenDialog={onOpenDialog}
                        onNavigateOrder={onNavigateOrder}
                        getOrder={() => order || {}}
                        getProductCode={(r) =>
                            r.order_item?.item_code ??
                            r.order_product_service?.order_product?.product_code ??
                            r.order_product?.product_code ??
                            (r.metadata?.order_code ?? '—').toUpperCase().replace('HD', 'HĐ')
                        }
                        getItemName={(r) =>
                            r.order_item?.item_name ??
                            r.order_product_service?.order_product?.name ??
                            r.order_product?.name ??
                            '—'
                        }
                        getProductImage={getRequestProductImage}
                    />
                );
            }}
        />
    );
}

function ExtensionKanban({
    items,
    updatingId,
    onDragEnd,
    onOpenDialog,
    onNavigateOrder,
}: {
    items: any[];
    updatingId: string | null;
    onDragEnd: (result: DropResult) => void;
    onOpenDialog: (row: any) => void;
    onNavigateOrder: (id: string) => void;
}) {
    return (
        <RequestKanbanBoard
            columns={EXTENSION_COLUMNS}
            items={items}
            updatingId={updatingId}
            onDragEnd={onDragEnd}
            renderCard={(row) => {
                const order = row.order as any;
                return (
                    <ExtensionKanbanCard
                        row={row}
                        onOpenDialog={onOpenDialog}
                        onNavigateOrder={onNavigateOrder}
                        getOrder={() => ({
                            id: order?.id ?? row.order_id,
                            order_code: order?.order_code || '—',
                        })}
                        getProductCode={(r) =>
                            r.order_item?.item_code ??
                            r.order_product_service?.order_product?.product_code ??
                            r.order_product?.product_code ??
                            (order?.order_code ?? '—').toUpperCase().replace('HD', 'HĐ')
                        }
                        getItemName={(r) =>
                            r.order_item?.item_name ??
                            r.order_product_service?.item_name ??
                            r.order_product?.name ??
                            '—'
                        }
                        getProductImage={getRequestProductImage}
                    />
                );
            }}
        />
    );
}

export function RequestsPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const { user } = useAuth();
    const { canEdit: canEditRequests } = useViewActionForRoles('requests', [
        'admin',
        'manager',
        'sale',
        'technician',
    ]);
    const showAccessoryPrice = canViewAccessoryPurchasePrice(user);
    const showPartnerPrice = canViewPartnerFeePrice(user);
    const [loading, setLoading] = useState(true);
    const [accessories, setAccessories] = useState<any[]>([]);
    const [partners, setPartners] = useState<any[]>([]);
    const [extensions, setExtensions] = useState<any[]>([]);
    const [activeTab, setActiveTab] = useState((location.state as any)?.defaultTab || 'accessories');
    const [updatingId, setUpdatingId] = useState<string | null>(null);
    const [users, setUsers] = useState<any[]>([]);

    // Dialog Mua phụ kiện / Gửi Đối Tác
    const [showAccessoryDialog, setShowAccessoryDialog] = useState(false);
    const [accessoryRow, setAccessoryRow] = useState<any>(null);
    const [accessoryStatus, setAccessoryStatus] = useState('');
    const [accessoryNotes, setAccessoryNotes] = useState('');

    const [showPartnerDialog, setShowPartnerDialog] = useState(false);
    const [partnerRow, setPartnerRow] = useState<any>(null);
    const [partnerStatus, setPartnerStatus] = useState('');
    const [partnerNotes, setPartnerNotes] = useState('');

    // Dialog Xin gia hạn
    const [showExtensionDialog, setShowExtensionDialog] = useState(false);
    const [extensionRow, setExtensionRow] = useState<any>(null);
    const [extensionStatus, setExtensionStatus] = useState('');
    const [extensionCustomerResult, setExtensionCustomerResult] = useState('');
    const [extensionNewDueAt, setExtensionNewDueAt] = useState('');
    const [extensionValidReason, setExtensionValidReason] = useState(false);
    const [extensionCancelReason, setExtensionCancelReason] = useState('1'); // '1', '2', '3'

    const [accessoryMeta, setAccessoryMeta] = useState<Record<string, any>>({});
    const [partnerMeta, setPartnerMeta] = useState<Record<string, any>>({});

    // Create Accessory Dialog State
    const [showCreateAccessory, setShowCreateAccessory] = useState(false);
    const [newItemName, setNewItemName] = useState('');
    const [newItemQuantity, setNewItemQuantity] = useState('');
    const [newItemPrice, setNewItemPrice] = useState('');
    const [newItemOrderCode, setNewItemOrderCode] = useState('');
    const [newItemNotes, setNewItemNotes] = useState('');
    const [newItemPhotos, setNewItemPhotos] = useState<string[]>([]);
    const [searchingOrder, setSearchingOrder] = useState(false);
    const [foundOrder, setFoundOrder] = useState<any>(null);
    const [foundItem, setFoundItem] = useState<any>(null);

    const getOrderCode = (req: any) => {
        if (!req) return '—';
        return req.order?.order_code ||
            req.order_code ||
            req.metadata?.order_code ||
            req.order_item?.order?.order_code ||
            req.order_product?.order?.order_code ||
            req.order_product_service?.order_product?.order?.order_code ||
            '—';
    };

    const getOrderId = (req: any) => {
        if (!req) return '';
        return req.order_id ||
            req.order?.id ||
            req.order_item?.order?.id ||
            req.order_product?.order?.id ||
            req.order_product_service?.order_product?.order?.id ||
            req.metadata?.order_id;
    };

    const getOrderProductId = (req: any): string | undefined => {
        if (!req) return undefined;
        return (
            req.order_product_id ||
            req.metadata?.order_product_id ||
            req.order_product?.id ||
            req.order_product_service?.order_product_id ||
            req.order_product_service?.order_product?.id ||
            undefined
        );
    };

    const expenseProductNote = (req: any, base: string) => {
        const code =
            req.order_product?.product_code ||
            req.order_product_service?.order_product?.product_code ||
            req.metadata?.order_product_code ||
            req.metadata?.product_code;
        return code ? `[${code}] ${base}` : base;
    };

    const loadAll = async () => {
        setLoading(true);
        try {
            const [accRes, partRes, extRes, usersRes] = await Promise.all([
                requestsApi.getAccessories(),
                requestsApi.getPartners(),
                requestsApi.getExtensions(),
                usersApi.getAll({ status: 'active' }),
            ]);
            setAccessories((accRes.data?.data as any[]) || []);
            setPartners((partRes.data?.data as any[]) || []);
            setExtensions((extRes.data?.data as any[]) || []);
            setUsers((usersRes.data as any).data.users || []);
            
            // Check for appointments tomorrow and notify
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(0, 0, 0, 0);
            const dayAfterTomorrow = new Date(tomorrow);
            dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);
            
            const tomorrowAppointments = (partRes.data?.data || []).filter((p: any) => {
                if (p.status !== 'partner_doing' || !p.metadata?.appointment_time) return false;
                const aptDate = new Date(p.metadata.appointment_time);
                return aptDate.getTime() >= tomorrow.getTime() && aptDate.getTime() < dayAfterTomorrow.getTime();
            });
            
            if (tomorrowAppointments.length > 0) {
                toast.warning(
                    `Có ${tomorrowAppointments.length} lịch hẹn đối tác vào NGÀY MAI!`, 
                    { duration: 5000 }
                );
            }
        } catch (e: any) {
            toast.error(e?.response?.data?.message || 'Không tải được danh sách');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadAll();
    }, []);

    const handleUpdateAccessory = async (requestId: string, status: string) => {
        setUpdatingId(requestId);
        try {
            await requestsApi.updateAccessory(requestId, { status });
            toast.success('Đã cập nhật trạng thái mua phụ kiện');
            loadAll();
        } catch (e: any) {
            toast.error(e?.response?.data?.message || 'Lỗi cập nhật');
        } finally {
            setUpdatingId(null);
        }
    };

    const handleUpdatePartner = async (requestId: string, status: string) => {
        setUpdatingId(requestId);
        try {
            await requestsApi.updatePartner(requestId, { status });
            toast.success('Đã cập nhật trạng thái gửi đối tác');
            loadAll();
        } catch (e: any) {
            toast.error(e?.response?.data?.message || 'Lỗi cập nhật');
        } finally {
            setUpdatingId(null);
        }
    };

    const handleUpdateExtension = async (requestId: string, status: string, newDueAt?: string, validReason?: boolean, customerResult?: string, kpiImpact?: boolean) => {
        setUpdatingId(requestId);
        try {
            await requestsApi.updateExtension(requestId, {
                status,
                ...(newDueAt && { new_due_at: newDueAt }),
                ...(typeof validReason === 'boolean' && { valid_reason: validReason }),
                ...(customerResult !== undefined && { customer_result: customerResult }),
                ...(typeof kpiImpact === 'boolean' && { kpi_impact: kpiImpact }),
            });
            toast.success('Đã cập nhật yêu cầu gia hạn');
            loadAll();
            setShowExtensionDialog(false);
            setExtensionRow(null);
        } catch (e: any) {
            toast.error(e?.response?.data?.message || 'Lỗi cập nhật');
        } finally {
            setUpdatingId(null);
        }
    };

    const handleAccessoryDragEnd = (result: DropResult) => {
        if (!canEditRequests) {
            toast.error('Bạn không có quyền sửa trên màn Tất cả yêu cầu');
            return;
        }
        if (!result.destination || result.source.droppableId === result.destination.droppableId) return;
        const row = accessories.find((r: any) => r.id === result.draggableId);
        if (!row) return;

        const newStatus = result.destination.droppableId;
        const trans = ACCESSORY_TRANSITIONS[row.status];

        // Prevent drag-to-next if required fields are missing
        if (trans && trans.next === newStatus) {
            for (const field of trans.fields) {
                if (field.required) {
                    const val = row.metadata?.[field.name];
                    if (!val || (Array.isArray(val) && val.length === 0)) {
                        toast.error(`Bạn cần điền/tải ${field.label}. Đã tự động mở Dialog xử lý.`);
                        openAccessoryDialog(row);
                        return;
                    }
                }
            }
        }

        const prevStatus = row.status;
        setAccessories((prev) => prev.map((r) => (r.id === row.id ? { ...r, status: newStatus } : r)));
        requestsApi.updateAccessory(row.id, { status: newStatus }).then(() => {
            toast.success('Đã cập nhật trạng thái mua phụ kiện');
        }).catch((e: any) => {
            setAccessories((prev) => prev.map((r) => (r.id === row.id ? { ...r, status: prevStatus } : r)));
            toast.error(e?.response?.data?.message || 'Lỗi cập nhật');
        });
    };

    const handlePartnerDragEnd = (result: DropResult) => {
        if (!canEditRequests) {
            toast.error('Bạn không có quyền sửa trên màn Tất cả yêu cầu');
            return;
        }
        if (!result.destination || result.source.droppableId === result.destination.droppableId) return;
        const row = partners.find((r: any) => r.id === result.draggableId);
        if (!row) return;

        const newStatus = result.destination.droppableId;
        const trans = PARTNER_TRANSITIONS[row.status];

        // Validation for drag & drop
        if (trans && trans.next === newStatus) {
            for (const field of trans.fields) {
                if (field.required) {
                    const val = row.metadata?.[field.name];
                    if (!val || (Array.isArray(val) && val.length === 0)) {
                        toast.error(`Bạn cần điền/tải ${field.label}. Đã tự động mở Dialog xử lý.`);
                        openPartnerDialog(row);
                        return;
                    }
                }
            }
        }

        const prevStatus = row.status;
        setPartners((prev) => prev.map((r) => (r.id === row.id ? { ...r, status: newStatus } : r)));
        requestsApi.updatePartner(row.id, { status: newStatus }).then(() => {
            toast.success('Đã cập nhật trạng thái gửi đối tác');
        }).catch((e: any) => {
            setPartners((prev) => prev.map((r) => (r.id === row.id ? { ...r, status: prevStatus } : r)));
            toast.error(e?.response?.data?.message || 'Lỗi cập nhật');
        });
    };

    const handleExtensionDragEnd = (result: DropResult) => {
        if (!canEditRequests) {
            toast.error('Bạn không có quyền sửa trên màn Tất cả yêu cầu');
            return;
        }
        if (!result.destination || result.source.droppableId === result.destination.droppableId) return;
        const row = extensions.find((r: any) => r.id === result.draggableId);
        if (!row?.id) return;
        const newStatus = result.destination.droppableId;
        const prevStatus = row.status;
        setExtensions((prev) => prev.map((r) => (r.id === row.id ? { ...r, status: newStatus } : r)));
        requestsApi.updateExtension(row.id, { status: newStatus }).then(() => {
            toast.success('Đã cập nhật trạng thái gia hạn');
        }).catch((e: any) => {
            setExtensions((prev) => prev.map((r) => (r.id === row.id ? { ...r, status: prevStatus } : r)));
            toast.error(e?.response?.data?.message || 'Lỗi cập nhật');
        });
    };

    const openAccessoryDialog = (row: any) => {
        setAccessoryRow(row);
        const trans = ACCESSORY_TRANSITIONS[row.status];
        setAccessoryStatus(trans?.next || row.status);
        setAccessoryNotes(row.notes ?? '');
        setAccessoryMeta(row.metadata || {});
        setShowAccessoryDialog(true);
    };

    const handleSubmitAccessory = async () => {
        if (!accessoryRow?.id) return;

        // Validation for mandatory fields
        const trans = ACCESSORY_TRANSITIONS[accessoryRow.status];
        if (trans) {
            for (const field of trans.fields) {
                if (field.required) {
                    const val = accessoryMeta[field.name];
                    if (!val || (Array.isArray(val) && val.length === 0)) {
                        toast.error(`Vui lòng điền/tải: ${field.label}`);
                        return;
                    }
                }
            }
        }

        setUpdatingId(accessoryRow.id);
        try {
            await requestsApi.updateAccessory(accessoryRow.id, {
                status: accessoryStatus,
                notes: accessoryNotes || undefined,
                metadata: accessoryMeta
            });

            // 💰 Tự động tạo phiếu chi khi chuyển sang Đã mua
            if (accessoryRow.status === 'need_buy' && accessoryStatus === 'bought') {
                try {
                    const amount = Number(String(accessoryMeta.price_estimate || 0).replace(/\D/g, ''));
                    if (amount > 0) {
                        await transactionsApi.create({
                            type: 'expense',
                            category: 'Mua phụ kiện',
                            amount,
                            payment_method: accessoryMeta.payment_type || 'transfer',
                            notes: expenseProductNote(
                                accessoryRow,
                                `Chi mua: ${accessoryMeta.item_name || 'phụ kiện'} (Yêu cầu #${accessoryRow.id.slice(0, 8)}). Người chi: ${accessoryMeta.payment_by || 'N/A'}`
                            ),
                            order_id: getOrderId(accessoryRow),
                            order_code: getOrderCode(accessoryRow),
                            order_product_id: getOrderProductId(accessoryRow),
                            date: new Date().toISOString(),
                            status: 'approved',
                            metadata: {
                                type: 'accessory_purchase',
                                purchase_photos: accessoryMeta.photos_purchase || [],
                                transfer_photos: accessoryMeta.photos_transfer || [],
                            },
                        });
                        toast.success('Đã tự động tạo phiếu chi mua phụ kiện');
                    }
                } catch (txErr) {
                    console.error('Lỗi tạo phiếu chi mua:', txErr);
                }
            }

            // 💰 Tự động tạo phiếu chi phí ship khi hàng về
            if (accessoryRow.status === 'waiting_ship' && accessoryStatus === 'shipped') {
                try {
                    const amount = Number(String(accessoryMeta.shipping_cost || 0).replace(/\D/g, ''));
                    if (amount > 0) {
                        await transactionsApi.create({
                            type: 'expense',
                            category: 'Phí ship nhận hàng',
                            amount,
                            payment_method: accessoryMeta.payment_type || 'transfer',
                            notes: expenseProductNote(
                                accessoryRow,
                                `Phí ship: ${accessoryRow.metadata?.item_name || 'phụ kiện'} (Yêu cầu #${accessoryRow.id.slice(0, 8)}). Người chi: ${accessoryMeta.payment_by || 'N/A'}`
                            ),
                            order_id: getOrderId(accessoryRow),
                            order_code: getOrderCode(accessoryRow),
                            order_product_id: getOrderProductId(accessoryRow),
                            date: new Date().toISOString(),
                            status: 'approved',
                            metadata: {
                                type: 'accessory_shipping',
                                arrival_photos: accessoryMeta.photos_arrival || [],
                            },
                        });
                        toast.success('Đã tự động tạo phiếu chi phí ship');
                    }
                } catch (txErr) {
                    console.error('Lỗi tạo phiếu chi ship:', txErr);
                }
            }

            toast.success('Đã cập nhật trạng thái mua phụ kiện');
            loadAll();
            setShowAccessoryDialog(false);
            setAccessoryRow(null);
            setAccessoryMeta({});
        } catch (e: any) {
            toast.error(e?.response?.data?.message || 'Lỗi cập nhật');
        } finally {
            setUpdatingId(null);
        }
    };

    const openPartnerDialog = (row: any) => {
        setPartnerRow(row);
        const trans = PARTNER_TRANSITIONS[row.status];
        setPartnerStatus(trans?.next || row.status);
        setPartnerNotes(row.notes ?? '');
        setPartnerMeta(row.metadata || {});
        setShowPartnerDialog(true);
    };

    const handleSubmitPartner = async () => {
        if (!partnerRow?.id) return;

        const trans = PARTNER_TRANSITIONS[partnerRow.status];
        if (trans) {
            for (const field of trans.fields) {
                if (field.required) {
                    const val = partnerMeta[field.name];
                    if (!val || (Array.isArray(val) && val.length === 0)) {
                        toast.error(`Vui lòng điền/tải: ${field.label}`);
                        return;
                    }
                }
            }
        }

        setUpdatingId(partnerRow.id);
        try {
            await requestsApi.updatePartner(partnerRow.id, {
                status: partnerStatus,
                notes: partnerNotes || undefined,
                metadata: partnerMeta
            });

            // 💰 Tự động tạo phiếu chi phí ship khi gửi đi
            if (partnerRow.status === 'ship_to_partner' && partnerStatus === 'partner_doing') {
                try {
                    const amount = Number(String(partnerMeta.shipping_cost_out || 0).replace(/\D/g, ''));
                    if (amount > 0) {
                        await transactionsApi.create({
                            type: 'expense',
                            category: 'Phí ship gửi đối tác',
                            amount,
                            payment_method: partnerMeta.shipping_payment_type || 'transfer',
                            notes: expenseProductNote(
                                partnerRow,
                                `Phí ship gửi: ${partnerRow.order_item?.item_name ?? partnerRow.order_product_service?.order_product?.name ?? partnerRow.order_product?.name ?? 'sản phẩm'} (Yêu cầu #${partnerRow.id.slice(0, 8)}). Người gửi: ${partnerMeta.sender_staff || 'N/A'}. Người chi: ${partnerMeta.shipping_sender_staff || 'N/A'}`
                            ),
                            order_id: getOrderId(partnerRow),
                            order_code: getOrderCode(partnerRow),
                            order_product_id: getOrderProductId(partnerRow),
                            date: new Date().toISOString(),
                            status: 'approved',
                            metadata: {
                                type: 'partner_shipping_out',
                                package_photos: partnerMeta.photos_package || [],
                            },
                        });
                        toast.success('Đã tự động tạo phiếu chi phí ship gửi đi');
                    }
                } catch (txErr) {
                    console.error('Lỗi tạo phiếu chi ship gửi:', txErr);
                }
            }

            // 💰 Tự động tạo phiếu chi khi hoàn tất gửi đối tác (Phí ship về + Phí đối tác)
            if (partnerRow.status === 'ship_back' && partnerStatus === 'done') {
                try {
                    const itemName = partnerRow.order_item?.item_name ?? partnerRow.order_product_service?.order_product?.name ?? partnerRow.order_product?.name ?? 'sản phẩm';
                    const reqId = partnerRow.id.slice(0, 8);
                    
                    // 1. Phí ship trả hàng
                    const shipAmount = Number(String(partnerMeta.shipping_cost_back || 0).replace(/\D/g, ''));
                    if (shipAmount > 0) {
                        await transactionsApi.create({
                            type: 'expense',
                            category: 'Phí ship gửi đối tác',
                            amount: shipAmount,
                            payment_method: partnerMeta.shipping_payment_type_back || 'transfer',
                            notes: expenseProductNote(
                                partnerRow,
                                `Phí ship trả: ${itemName} (Yêu cầu #${reqId}). Người chi: ${partnerMeta.shipping_sender_staff_back || 'N/A'}`
                            ),
                            order_id: getOrderId(partnerRow),
                            order_code: getOrderCode(partnerRow),
                            order_product_id: getOrderProductId(partnerRow),
                            date: new Date().toISOString(),
                            status: 'approved',
                            metadata: {
                                type: 'partner_shipping_back',
                                package_photos: partnerMeta.photos_package_back || [],
                            },
                        });
                    }

                    // 2. Phí thanh toán đối tác
                    const partnerFee = Number(String(partnerMeta.partner_fee_amount || 0).replace(/\D/g, ''));
                    if (partnerFee > 0) {
                        await transactionsApi.create({
                            type: 'expense',
                            category: 'Thanh toán phí đối tác',
                            amount: partnerFee,
                            payment_method: partnerMeta.partner_payment_type || 'transfer',
                            notes: expenseProductNote(
                                partnerRow,
                                `Thanh toán phí: ${itemName} (Yêu cầu #${reqId}). Người chi: ${partnerMeta.partner_fee_sender_staff || 'N/A'}`
                            ),
                            order_id: getOrderId(partnerRow),
                            order_code: getOrderCode(partnerRow),
                            order_product_id: getOrderProductId(partnerRow),
                            date: new Date().toISOString(),
                            status: 'approved',
                            metadata: {
                                type: 'partner_repair_fee',
                                photos_storage: partnerMeta.photos_storage || [],
                            },
                        });
                    }

                    if (shipAmount > 0 || partnerFee > 0) {
                        toast.success('Đã tự động tạo phiếu chi hoàn tất đối tác');
                    }
                } catch (txErr) {
                    console.error('Lỗi tạo phiếu chi hoàn tất đối tác:', txErr);
                }
            }

            toast.success('Đã cập nhật trạng thái gửi đối tác');
            loadAll();
            setShowPartnerDialog(false);
            setPartnerRow(null);
            setPartnerMeta({});
        } catch (e: any) {
            toast.error(e?.response?.data?.message || 'Lỗi cập nhật');
        } finally {
            setUpdatingId(null);
        }
    };


    const EXTENSION_NEXT_STATUS: Record<string, string> = {
        manager_approved: 'sale_contacted',
        sale_contacted: 'notified_tech',
        notified_tech: 'notified_tech', // terminal
    };

    const openExtensionDialog = (row: any) => {
        setExtensionRow(row);
        // Default to next status, not current status
        setExtensionStatus(EXTENSION_NEXT_STATUS[row.status] ?? row.status);
        setExtensionCustomerResult(row.customer_result ?? '');
        setExtensionNewDueAt(row.new_due_at ? row.new_due_at.slice(0, 16) : '');
        setExtensionValidReason(!!row.valid_reason);
        setShowExtensionDialog(true);
    };

    const handleSubmitExtension = async () => {
        if (!extensionRow?.id) return;

        // If rejected, valid_reason depends on the selected reason (1 and 2 are valid, 3 is not)
        const isRejected = extensionStatus === 'rejected';
        const finalValidReason = isRejected ? extensionValidReason : true;

        await handleUpdateExtension(
            extensionRow.id,
            extensionStatus,
            extensionNewDueAt || undefined,
            finalValidReason,
            extensionCustomerResult
        );
    };

    const handleSubmitExtensionWithKpi = async (kpiImpactValue?: boolean) => {
        if (!extensionRow?.id) return;
        const isRejected = extensionStatus === 'rejected';
        const finalValidReason = isRejected ? extensionValidReason : true;

        await handleUpdateExtension(
            extensionRow.id,
            extensionStatus,
            extensionNewDueAt || undefined,
            finalValidReason,
            extensionCustomerResult,
            kpiImpactValue
        );
    };

    // Create Accessory Logic
    const handleSearchOrder = async () => {
        if (!newItemOrderCode.trim()) return;
        setSearchingOrder(true);
        try {
            // Normalize: HD -> HĐ, uppercase
            const query = newItemOrderCode.trim().toUpperCase().replace('HD', 'HĐ');

            // If query is HĐ1.1, base code is HĐ1
            const baseOrderCode = query.includes('.') ? query.split('.')[0] : query;

            const res = await ordersApi.getAll({ search: baseOrderCode });
            const orders = (res.data as any).data.orders || [];

            // 1. Try to find direct match by order_code
            let order = orders.find((o: any) => o.order_code === baseOrderCode);

            // 2. If not found or searching for specific item, try to find by product code in sub-items
            let targetItem = null;
            // Search in flattened items (works for both V1 order_items and V2 order_product_services)
            if (order && query.includes('.')) {
                targetItem = (order.items || []).find((it: any) =>
                    it.item_code === query ||
                    (it.product?.code === query) ||
                    (it.id === query) // Fallback for direct ID match
                );
            }

            if (order) {
                setFoundOrder(order);
                // If we specifically found an item, we can store it or toast it
                if (targetItem) {
                    setFoundItem(targetItem);
                    toast.success(`Đã tìm thấy đơn hàng: ${order.order_code} - Sản phẩm: ${targetItem.item_name}`);
                } else {
                    setFoundItem(null);
                    toast.success(`Đã tìm thấy đơn hàng: ${order.order_code}`);
                }
            } else {
                setFoundOrder(null);
                setFoundItem(null);
                toast.error('Không tìm thấy đơn hàng');
            }
        } catch (e) {
            toast.error('Lỗi tìm kiếm đơn hàng');
        } finally {
            setSearchingOrder(false);
        }
    };

    const handleCreateAccessory = async () => {
        if (!newItemName.trim()) {
            toast.error('Vui lòng nhập tên linh kiện / sản phẩm');
            return;
        }
        setUpdatingId('creating');
        try {
            const normalizedCustomCode = newItemOrderCode.trim().toUpperCase().replace('HD', 'HĐ');

            // Resolve correct ID based on the item found or the first item in the order
            let order_item_id = undefined;
            let order_product_id = undefined;
            let order_product_service_id = undefined;

            const itemToLink = foundItem || foundOrder?.items?.[0];
            if (itemToLink) {
                if (itemToLink.is_customer_item) {
                    if (itemToLink.item_type === 'product') {
                        order_product_id = itemToLink.id;
                    } else {
                        order_product_service_id = itemToLink.id;
                    }
                } else {
                    order_item_id = itemToLink.id;
                }
            }

            const payload = {
                notes: newItemNotes,
                metadata: {
                    item_name: newItemName,
                    quantity: newItemQuantity,
                    price_estimate: newItemPrice,
                    photos: newItemPhotos,
                    order_code: foundOrder?.order_code || (normalizedCustomCode || undefined)
                },
                order_item_id,
                order_product_id,
                order_product_service_id
            };
            console.log('📤 Sending Create Accessory Request:', payload);
            await requestsApi.createAccessory(payload);
            toast.success('Đã tạo yêu cầu mua phụ kiện');
            loadAll();
            setShowCreateAccessory(false);
            setNewItemName('');
            setNewItemQuantity('');
            setNewItemPrice('');
            setNewItemOrderCode('');
            setNewItemNotes('');
            setNewItemPhotos([]);
            setFoundOrder(null);
            setFoundItem(null);
        } catch (e: any) {
            console.error('❌ Create Accessory Error:', e);
            if (e.response) {
                console.error('❌ Server Response:', e.response.data);
            }
            toast.error(e?.response?.data?.message || 'Lỗi tạo yêu cầu');
        } finally {
            setUpdatingId(null);
        }
    };


    if (loading && accessories.length === 0 && partners.length === 0 && extensions.length === 0) {
        return (
            <div className="flex items-center justify-center min-h-[40vh]">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-4 sm:space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="flex items-center gap-2 text-xl font-bold sm:text-2xl">
                        <FileText className="h-7 w-7 text-primary" />
                        Quản lý yêu cầu
                    </h1>
                    <p className="mt-1 hidden text-sm text-muted-foreground sm:block">
                        Trang dành cho Admin / Quản lý xử lý các phiếu Mua phụ kiện, Gửi Đối Tác và Xin gia hạn do kỹ thuật tạo.
                    </p>
                </div>
                <Button variant="outline" size="sm" onClick={loadAll} disabled={loading} className="h-9 w-full sm:w-auto">
                    <RefreshCw className={loading ? 'animate-spin h-4 w-4 mr-2' : 'h-4 w-4 mr-2'} />
                    Tải lại
                </Button>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="flex h-12 w-full max-w-2xl items-center justify-start gap-2 overflow-x-auto rounded-xl border bg-slate-50 p-1">
                    <TabsTrigger value="accessories" className="min-h-[44px] shrink-0 self-center rounded-xl border bg-white px-4 text-sm font-medium data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-white sm:text-sm">
                        <Package className="h-4 w-4" />
                        Mua phụ kiện ({accessories.length})
                    </TabsTrigger>
                    <TabsTrigger value="partners" className="min-h-[44px] shrink-0 self-center rounded-xl border bg-white px-4 text-sm font-medium data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-white sm:text-sm">
                        <Truck className="h-4 w-4" />
                        Gửi Đối Tác ({partners.length})
                    </TabsTrigger>
                    <TabsTrigger value="extensions" className="min-h-[44px] shrink-0 self-center rounded-xl border bg-white px-4 text-sm font-medium data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-white sm:text-sm">
                        <Clock className="h-4 w-4" />
                        Xin gia hạn ({extensions.length})
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="accessories" className="mt-4">
                    <Card>
                        <CardHeader className="pb-4">
                            <div className="flex flex-wrap items-center justify-between gap-4">
                                <div>
                                    <CardTitle className="text-lg font-bold">Yêu cầu Mua phụ kiện / VPP</CardTitle>
                                    <CardDescription>Kéo thả thẻ giữa các cột để chuyển trạng thái.</CardDescription>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button size="sm" className="h-10 px-4 rounded-xl gap-2 font-bold shadow-lg shadow-primary/20" onClick={() => {
                                        setShowCreateAccessory(true);
                                    }}>
                                        <Plus className="w-4 h-4" />
                                        Tạo yêu cầu
                                    </Button>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
                            {accessories.length === 0 ? (
                                <p className="text-sm text-muted-foreground text-center py-8">Chưa có yêu cầu nào.</p>
                            ) : (
                                <AccessoryKanban
                                    items={accessories}
                                    updatingId={updatingId}
                                    onDragEnd={handleAccessoryDragEnd}
                                    onOpenDialog={openAccessoryDialog}
                                    onNavigateOrder={(id) => navigate(`/orders/${id}`)}
                                />
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="partners" className="mt-4">
                    <Card>
                        <CardHeader>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                    <CardTitle className="text-base">Yêu cầu Gửi Đối Tác</CardTitle>
                                    <p className="text-sm text-muted-foreground">Kéo thả thẻ giữa các cột để chuyển trạng thái.</p>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
                            {partners.length === 0 ? (
                                <p className="text-sm text-muted-foreground text-center py-8">Chưa có yêu cầu nào.</p>
                            ) : (
                                <PartnerKanban
                                    items={partners}
                                    updatingId={updatingId}
                                    onDragEnd={handlePartnerDragEnd}
                                    onOpenDialog={openPartnerDialog}
                                    onNavigateOrder={(id) => navigate(`/orders/${id}`)}
                                />
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="extensions" className="mt-4">
                    <Card>
                        <CardHeader>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                    <CardTitle className="text-base">Yêu cầu Xin gia hạn</CardTitle>
                                    <p className="text-sm text-muted-foreground">Kéo thả thẻ giữa các cột để chuyển trạng thái.</p>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
                            {extensions.length === 0 ? (
                                <p className="text-sm text-muted-foreground text-center py-8">Chưa có yêu cầu nào.</p>
                            ) : (
                                <ExtensionKanban
                                    items={extensions}
                                    updatingId={updatingId}
                                    onDragEnd={handleExtensionDragEnd}
                                    onOpenDialog={openExtensionDialog}
                                    onNavigateOrder={(id) => navigate(`/orders/${id}`)}
                                />
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* Dialog Cập nhật Mua phụ kiện */}
            <Dialog open={showAccessoryDialog} onOpenChange={setShowAccessoryDialog}>
                <DialogContent className="max-w-md p-0 overflow-hidden rounded-2xl border-none shadow-2xl">
                    <DialogHeader className="p-6 pb-4 bg-slate-50/50 border-b">
                        <DialogTitle className="text-xl font-bold flex items-center gap-2">
                            <Package className="w-6 h-6 text-primary" />
                            Xử lý yêu cầu
                        </DialogTitle>
                    </DialogHeader>
                    {accessoryRow && (
                        <div className="p-6 space-y-5">
                            <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 flex gap-3">
                                <div className="h-10 w-10 shrink-0 bg-white rounded-lg border shadow-sm flex items-center justify-center">
                                    <RefreshCw className="w-5 h-5 text-amber-600" />
                                </div>
                                <div>
                                    <p className="text-xs font-semibold text-amber-800 uppercase tracking-wider">Trạng thái tiếp theo</p>
                                    <p className="text-sm font-bold text-amber-900 mt-0.5">
                                        {ACCESSORY_LABELS[accessoryStatus] || accessoryStatus}
                                    </p>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="bg-slate-50 border rounded-xl p-4 space-y-3">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase">Tên phụ kiện</p>
                                            <p className="text-sm font-bold text-slate-700">{accessoryRow.metadata?.item_name || 'N/A'}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase">Mã SP/ĐH</p>
                                            <p className="text-sm font-bold text-slate-700">{accessoryRow.metadata?.order_code || 'N/A'}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase">Số lượng</p>
                                            <p className="text-sm font-bold text-slate-700">{accessoryRow.metadata?.quantity || '1'}</p>
                                        </div>
                                        {showAccessoryPrice ? (
                                            <div>
                                                <p className="text-[10px] font-bold text-slate-400 uppercase">Giá</p>
                                                {accessoryRow.status === 'need_buy' ? (
                                                    <div className="relative mt-1">
                                                        <Input
                                                            type="text"
                                                            value={String(accessoryMeta.price_estimate || '').replace(/\D/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, ".")}
                                                            onChange={(e) => {
                                                                const val = e.target.value.replace(/\./g, "");
                                                                if (/^\d*$/.test(val)) {
                                                                    setAccessoryMeta({ ...accessoryMeta, price_estimate: val });
                                                                }
                                                            }}
                                                            className="h-8 text-sm font-bold text-emerald-600 pr-6 border-emerald-100 bg-emerald-50/30 focus-visible:ring-emerald-500 text-right"
                                                        />
                                                        <span className="absolute right-2 top-1.5 text-[10px] font-bold text-emerald-600">₫</span>
                                                    </div>
                                                ) : (
                                                    <p className="text-sm font-bold text-emerald-600">{formatCurrency(Number(String(accessoryMeta.price_estimate || 0).replace(/\D/g, '')))}</p>
                                                )}
                                            </div>
                                        ) : (
                                            <div>
                                                <p className="text-[10px] font-bold text-slate-400 uppercase">Giá</p>
                                                <p className="text-sm font-bold text-slate-400">Không có quyền xem</p>
                                            </div>
                                        )}
                                    </div>
                                    {accessoryRow.notes && (
                                        <div className="pt-2 border-t text-left">
                                            <p className="text-[10px] font-bold text-slate-400 uppercase">Ghi chú KT</p>
                                            <p className="text-xs text-slate-600 italic">"{accessoryRow.notes}"</p>
                                        </div>
                                    )}
                                </div>

                                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                                    {ACCESSORY_TRANSITIONS[accessoryRow.status]?.fields
                                        .filter((field) => showAccessoryPrice || !isSensitivePriceField(field.name))
                                        .map((field) => (
                                        <div key={field.name} className={`space-y-1.5 text-left ${field.type === 'photo' || field.name === 'payment_by' || field.name === 'payment_type' ? 'col-span-1' : 'col-span-2'}`}>
                                            <div className="flex items-center justify-between">
                                                <Label className="text-[11px] font-bold text-slate-500 uppercase tracking-tight">
                                                    {field.label} {field.required && <span className="text-red-500">*</span>}
                                                </Label>
                                            </div>

                                            {field.type === 'photo' ? (
                                                <PhotoUpload
                                                    label=""
                                                    value={accessoryMeta[field.name] || []}
                                                    onChange={(urls) => setAccessoryMeta(m => ({ ...m, [field.name]: urls }))}
                                                />
                                            ) : field.type === 'select' ? (
                                                <Select
                                                    value={accessoryMeta[field.name] || ''}
                                                    onValueChange={(val) => setAccessoryMeta(m => ({ ...m, [field.name]: val }))}
                                                >
                                                    <SelectTrigger className="h-10 rounded-lg">
                                                        <SelectValue placeholder={field.placeholder || "Chọn..."} />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {field.name.includes('staff') || field.name.includes('_by') ? (
                                                            users.map(u => (
                                                                <SelectItem key={u.id} value={u.name}>{u.name}</SelectItem>
                                                            ))
                                                        ) : (
                                                            field.options?.map(opt => (
                                                                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                                            ))
                                                        )}
                                                    </SelectContent>
                                                </Select>
                                            ) : (
                                                <Input
                                                    type={field.type === 'number' ? 'number' : 'text'}
                                                    value={accessoryMeta[field.name] || ''}
                                                    onChange={(e) => {
                                                        let value = e.target.value;
                                                        if (field.name.toLowerCase().includes('cost') || field.name.toLowerCase().includes('price') || field.name.toLowerCase().includes('amount')) {
                                                            const digits = value.replace(/\D/g, '');
                                                            value = digits ? digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".") : '';
                                                        }
                                                        setAccessoryMeta(m => ({ ...m, [field.name]: value }));
                                                    }}
                                                    placeholder={field.placeholder || '...'}
                                                    className="h-10 rounded-lg text-left"
                                                />
                                            )}
                                        </div>
                                    ))}

                                    <div className="space-y-1.5 pt-2 border-t border-dashed text-left col-span-2">
                                        <Label className="text-[11px] font-bold text-slate-500 uppercase tracking-tight">Ghi chú xử lý</Label>
                                        <Textarea
                                            value={accessoryNotes}
                                            onChange={(e) => setAccessoryNotes(e.target.value)}
                                            placeholder="Nhập ghi chú (nếu có)..."
                                            className="min-h-[100px] rounded-xl resize-none"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                    <DialogFooter className="p-6 bg-slate-50/50 border-t flex items-center justify-between gap-3">
                        <Button variant="ghost" onClick={() => setShowAccessoryDialog(false)} className="rounded-xl px-6">Hủy</Button>
                        <Button
                            onClick={handleSubmitAccessory}
                            disabled={!!updatingId}
                            className="rounded-xl px-10 font-bold shadow-lg shadow-primary/20"
                        >
                            {updatingId ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                            Xác nhận
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Dialog Cập nhật Gửi Đối Tác */}
            <Dialog open={showPartnerDialog} onOpenChange={setShowPartnerDialog}>
                <DialogContent className="max-w-md p-0 overflow-hidden rounded-2xl border-none shadow-2xl">
                    <DialogHeader className="p-4 pb-2 bg-slate-50/50 border-b">
                        <DialogTitle className="text-lg font-bold flex items-center gap-2">
                            <Truck className="w-5 h-5 text-primary" />
                            Xử lý gửi đối tác
                        </DialogTitle>
                    </DialogHeader>
                    {partnerRow && (
                        <div className="p-4 space-y-3">
                            <div className="bg-amber-50 border border-amber-100 rounded-lg p-2.5 flex items-center gap-3">
                                <div className="h-8 w-8 shrink-0 bg-white rounded flex items-center justify-center shadow-sm">
                                    <RefreshCw className="w-4 h-4 text-amber-600" />
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold text-amber-800 uppercase leading-none">Trạng thái tiếp theo</p>
                                    <p className="text-sm font-bold text-amber-900 mt-1">
                                        {PARTNER_LABELS[partnerStatus] || partnerStatus}
                                    </p>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="bg-slate-50 border rounded-lg p-2.5 space-y-2">
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <p className="text-[9px] font-bold text-slate-400 uppercase">Hạng mục</p>
                                            <p className="text-xs font-bold text-slate-700 truncate">
                                                {partnerRow.order_item?.item_name ??
                                                    partnerRow.order_product_service?.order_product?.name ??
                                                    partnerRow.order_product?.name ?? '—'}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-[9px] font-bold text-slate-400 uppercase">Mã SP/ĐH</p>
                                            <p className="text-xs font-bold text-slate-700 truncate">
                                                {partnerRow.order_item?.item_code ??
                                                    partnerRow.order_product_service?.order_product?.product_code ??
                                                    partnerRow.order_product?.product_code ??
                                                    (partnerRow.metadata?.order_code ?? '—').toUpperCase()}
                                            </p>
                                        </div>
                                    </div>
                                    {partnerRow.notes && (
                                        <div className="pt-1.5 border-t text-left">
                                            <p className="text-[9px] font-bold text-slate-400 uppercase">Ghi chú KT</p>
                                            <p className="text-[11px] text-slate-600 italic line-clamp-1">"{partnerRow.notes}"</p>
                                        </div>
                                    )}
                                </div>

                                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                                    {PARTNER_TRANSITIONS[partnerRow.status]?.fields
                                        .filter((field) => showPartnerPrice || !isSensitivePriceField(field.name))
                                        .map((field) => (
                                        <div key={field.name} className={`space-y-1.5 text-left ${['sender_staff', 'shipping_sender_staff', 'shipping_cost_out', 'shipping_payment_type', 'shipping_cost_back', 'shipping_sender_staff_back', 'shipping_payment_type_back', 'partner_fee_amount', 'partner_fee_sender_staff', 'partner_payment_type', 'photos_package_back', 'photos_storage'].includes(field.name) ? 'col-span-1' : 'col-span-2'}`}>
                                            <div className="flex items-center justify-between">
                                                <Label className="text-[11px] font-bold text-slate-500 uppercase tracking-tight">
                                                    {field.label} {field.required && <span className="text-red-500">*</span>}
                                                </Label>
                                            </div>

                                            {field.type === 'photo' ? (
                                                <PhotoUpload
                                                    label=""
                                                    value={partnerMeta[field.name] || []}
                                                    onChange={(urls) => setPartnerMeta(m => ({ ...m, [field.name]: urls }))}
                                                />
                                            ) : field.type === 'select' ? (
                                                <Select
                                                    value={partnerMeta[field.name] || ''}
                                                    onValueChange={(val) => setPartnerMeta(m => ({ ...m, [field.name]: val }))}
                                                >
                                                    <SelectTrigger className="h-10 rounded-lg">
                                                        <SelectValue placeholder={field.placeholder || "Chọn..."} />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {field.name.includes('staff') || field.name.includes('_by') ? (
                                                            users.map(u => (
                                                                <SelectItem key={u.id} value={u.name}>{u.name}</SelectItem>
                                                            ))
                                                        ) : (
                                                            field.options?.map(opt => (
                                                                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                                            ))
                                                        )}
                                                    </SelectContent>
                                                </Select>
                                            ) : (
                                                <Input
                                                    type={field.type === 'datetime-local' ? 'datetime-local' : (field.type === 'number' ? 'number' : 'text')}
                                                    value={partnerMeta[field.name] || ''}
                                                    onChange={(e) => {
                                                        let value = e.target.value;
                                                        if (field.name.toLowerCase().includes('cost') || field.name.toLowerCase().includes('price') || field.name.toLowerCase().includes('amount')) {
                                                            const digits = value.replace(/\D/g, '');
                                                            value = digits ? digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".") : '';
                                                        }
                                                        setPartnerMeta(m => ({ ...m, [field.name]: value }));
                                                    }}
                                                    placeholder={field.placeholder || '...'}
                                                    className="h-10 rounded-lg text-left"
                                                />
                                            )}
                                        </div>
                                    ))}
                                </div>

                                <div className="space-y-1.5 pt-1.5 border-t border-dashed text-left">
                                    <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">Ghi chú xử lý</Label>
                                    <Textarea
                                        value={partnerNotes}
                                        onChange={(e) => setPartnerNotes(e.target.value)}
                                        placeholder="Nhập ghi chú..."
                                        className="min-h-[54px] rounded-lg resize-none text-sm"
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                    <DialogFooter className="p-4 bg-slate-50/50 border-t flex items-center justify-between gap-3">
                        <Button variant="ghost" onClick={() => setShowPartnerDialog(false)} className="rounded-lg px-6 h-9 text-sm">Hủy</Button>
                        <Button
                            onClick={handleSubmitPartner}
                            disabled={!!updatingId}
                            className="rounded-lg px-8 h-9 font-bold shadow-lg shadow-primary/20 text-sm"
                        >
                            {updatingId ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                            Xác nhận
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>


            {/* Dialog Xin gia hạn */}
            <Dialog open={showExtensionDialog} onOpenChange={setShowExtensionDialog}>
                <DialogContent className="max-w-md p-0 overflow-hidden rounded-[28px] border-none shadow-2xl bg-white">
                    <DialogHeader className="px-6 py-5 bg-white border-b border-slate-100">
                        <DialogTitle className="text-xl font-bold flex items-center gap-3 text-slate-900">
                            <div className="w-9 h-9 bg-primary/10 rounded-xl flex items-center justify-center">
                                <Clock className="w-5 h-5 text-primary" />
                            </div>
                            Xử lý gia hạn sản phẩm
                        </DialogTitle>
                    </DialogHeader>

                    <div className="max-h-[60vh] overflow-y-auto px-6 py-6 space-y-6">
                        {extensionRow && (
                            <>
                                {/* Product Info Card */}
                                <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4">
                                    <div className="flex gap-4">
                                        <div className="h-16 w-16 shrink-0 bg-white rounded-xl border border-slate-200 flex items-center justify-center overflow-hidden">
                                            {((extensionRow.order_item?.product?.image) || (extensionRow.order_product?.images?.[0]) || (extensionRow.order_product_service?.order_product?.images?.[0])) ? (
                                                <img
                                                    src={extensionRow.order_item?.product?.image || extensionRow.order_product?.images?.[0] || extensionRow.order_product_service?.order_product?.images?.[0]}
                                                    className="w-full h-full object-cover"
                                                />
                                            ) : (
                                                <Package className="w-8 h-8 text-slate-300" />
                                            )}
                                        </div>
                                        <div className="min-w-0 flex-1 flex flex-col justify-center">
                                            <Badge variant="secondary" className="w-fit mb-1 text-[10px] font-bold px-2 bg-white text-slate-500 border-slate-100 uppercase">
                                                Mã: {extensionRow.order_item?.item_code || extensionRow.order_product?.product_code || extensionRow.order_product_service?.order_product?.product_code || (extensionRow.order?.order_code ?? extensionRow.order_id)}
                                            </Badge>
                                            <p className="text-sm font-bold text-slate-800 line-clamp-1">
                                                {extensionRow.order_item?.item_name || extensionRow.order_product?.name || extensionRow.order_product_service?.item_name || '—'}
                                            </p>
                                        </div>
                                    </div>
                                    {extensionRow.reason && (
                                        <div className="mt-3 pt-3 border-t border-slate-200/60">
                                            <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Lý do kỹ thuật</p>
                                            <p className="text-xs text-slate-600 italic leading-relaxed">
                                                "{extensionRow.reason}"
                                            </p>
                                        </div>
                                    )}
                                </div>

                                {/* Status Box */}
                                <div className={cn(
                                    "rounded-2xl p-4 flex gap-4 items-center border",
                                    extensionStatus === 'rejected' ? "bg-red-50 border-red-100" : "bg-blue-50 border-blue-100"
                                )}>
                                    <div className={cn(
                                        "h-10 w-10 shrink-0 rounded-xl flex items-center justify-center shadow-sm",
                                        extensionStatus === 'rejected' ? "bg-white text-red-600" : "bg-white text-blue-600"
                                    )}>
                                        {extensionStatus === 'rejected' ? <AlertCircle className="w-5 h-5" /> : <RefreshCw className="w-5 h-5 animate-spin" />}
                                    </div>
                                    <div>
                                        <p className={cn(
                                            "text-[10px] font-bold uppercase tracking-wider mb-0.5",
                                            extensionStatus === 'rejected' ? "text-red-500" : "text-blue-500"
                                        )}>Trạng thái mới</p>
                                        <p className={cn(
                                            "text-sm font-bold",
                                            extensionStatus === 'rejected' ? "text-red-900" : "text-blue-900"
                                        )}>
                                            {extensionStatus === 'rejected' ? 'Từ chối yêu cầu' :
                                                extensionStatus === 'manager_approved' ? 'QL đã duyệt' :
                                                    EXTENSION_LABELS[extensionStatus] || extensionStatus}
                                        </p>
                                    </div>
                                </div>

                                {/* Form Fields */}
                                <div className="space-y-4">
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-bold text-slate-500 ml-1">Cập nhật tiến trình</Label>
                                        <Select value={extensionStatus} onValueChange={setExtensionStatus}>
                                            <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-white text-sm">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="rounded-xl">
                                                <SelectItem value="sale_contacted">Sale đã liên hệ</SelectItem>
                                                <SelectItem value="manager_approved">QL đã duyệt</SelectItem>
                                                <SelectItem value="notified_tech">Đã báo KT</SelectItem>
                                                <SelectItem value="rejected" className="text-red-600 font-bold">Từ chối gia hạn</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {extensionStatus === 'rejected' ? (
                                        <div className="space-y-4">
                                            <div className="space-y-1.5">
                                                <Label className="text-xs font-bold text-slate-500 ml-1">Lý do từ chối</Label>
                                                <Select value={extensionCancelReason} onValueChange={(val) => {
                                                    setExtensionCancelReason(val);
                                                    setExtensionValidReason(val === '1' || val === '2');
                                                }}>
                                                    <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-white text-sm">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent className="rounded-xl">
                                                        <SelectItem value="1">Máy hỏng / Mất điện (Không KPI)</SelectItem>
                                                        <SelectItem value="2">Thiếu linh kiện (Không KPI)</SelectItem>
                                                        <SelectItem value="3" className="font-bold text-orange-700">Quên chưa làm (Bị tính KPI)</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className={cn(
                                                "p-3 rounded-xl border text-xs font-medium leading-relaxed",
                                                extensionCancelReason === '3' ? "bg-orange-50 border-orange-100 text-orange-800" : "bg-emerald-50 border-emerald-100 text-emerald-800"
                                            )}>
                                                {extensionCancelReason === '3' ?
                                                    '⚠️ Lưu ý: Lý do này sẽ tính lỗi trễ KPI cho nhân viên.' :
                                                    '✅ Lý do hợp lệ: Sẽ không tính trễ KPI cho nhân viên.'}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            <div className="space-y-1.5">
                                                <Label className="text-xs font-bold text-slate-500 ml-1">Gia hạn đến ngày</Label>
                                                <div className="relative">
                                                    <Input
                                                        type="datetime-local"
                                                        value={extensionNewDueAt}
                                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setExtensionNewDueAt(e.target.value)}
                                                        className="h-11 rounded-xl pl-10 border-slate-200"
                                                    />
                                                    <Calendar className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                                                </div>
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label className="text-xs font-bold text-slate-500 ml-1">Kết quả báo khách</Label>
                                                <Textarea
                                                    value={extensionCustomerResult}
                                                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setExtensionCustomerResult(e.target.value)}
                                                    placeholder="Khách đồng ý chờ thêm..."
                                                    className="min-h-[100px] rounded-xl border-slate-200 text-sm bg-white"
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                    </div>

                    <DialogFooter className="px-6 py-6 bg-slate-50 border-t border-slate-100 flex flex-col gap-3">
                        {extensionStatus === 'rejected' ? (
                            <div className="flex gap-3 w-full">
                                <Button
                                    variant="ghost"
                                    onClick={() => setShowExtensionDialog(false)}
                                    className="flex-1 h-12 rounded-2xl font-bold text-slate-500 hover:bg-white"
                                >
                                    Hủy
                                </Button>
                                <Button
                                    onClick={handleSubmitExtension}
                                    disabled={!!updatingId}
                                    className="flex-[2] h-12 rounded-2xl font-bold bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-200"
                                >
                                    {updatingId ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <AlertCircle className="w-5 h-5 mr-2" />}
                                    Xác nhận Từ chối
                                </Button>
                            </div>
                        ) : (
                            <div className="flex gap-3 w-full">
                                <Button
                                    variant="ghost"
                                    onClick={() => setShowExtensionDialog(false)}
                                    className="flex-1 h-12 rounded-2xl font-bold text-slate-500 hover:bg-white"
                                >
                                    Hủy
                                </Button>
                                <Button
                                    onClick={handleSubmitExtension}
                                    disabled={!!updatingId}
                                    className="flex-[2] h-12 rounded-2xl font-bold bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20"
                                >
                                    {updatingId ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <CheckCircle2 className="w-5 h-5 mr-2" />}
                                    Chuyển → {EXTENSION_LABELS[extensionStatus] || extensionStatus}
                                </Button>
                            </div>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Dialog Tạo yêu cầu mới */}
            <Dialog open={showCreateAccessory} onOpenChange={setShowCreateAccessory}>
                <DialogContent className="max-w-md p-0 overflow-hidden rounded-2xl border-none shadow-2xl">
                    <DialogHeader className="p-6 pb-4 bg-slate-50/50 border-b">
                        <DialogTitle className="text-xl font-bold flex items-center gap-2">
                            <Plus className="w-6 h-6 text-primary" />
                            Tạo yêu cầu mua phụ kiện
                        </DialogTitle>
                    </DialogHeader>
                    <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
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
                                            else setNewItemPrice(digits.replace(/\B(?=(\d{3})+(?!\d))/g, "."));
                                        }}
                                        placeholder="1.500.000"
                                        className="h-11 rounded-xl pl-10"
                                    />
                                    <DollarSign className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-bold text-slate-500">Mã đơn hàng liên quan (không bắt buộc)</Label>
                            <div className="flex gap-2">
                                <div className="relative flex-1">
                                    <Input
                                        value={newItemOrderCode}
                                        onChange={(e) => setNewItemOrderCode(e.target.value)}
                                        placeholder="HĐ.123..."
                                        className="h-11 rounded-xl pl-10"
                                    />
                                    <Search className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                                </div>
                                <Button
                                    variant="outline"
                                    className="h-11 rounded-xl px-4"
                                    onClick={handleSearchOrder}
                                    disabled={searchingOrder}
                                >
                                    {searchingOrder ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Tìm'}
                                </Button>
                            </div>
                            {foundOrder && (
                                <div className="mt-1 flex items-center gap-2 p-2 bg-green-50 border border-green-100 rounded-lg animate-in fade-in slide-in-from-top-1">
                                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                                    <span className="text-xs font-medium text-green-800">
                                        Khớp: {foundOrder.order_code}{foundItem ? ` - ${foundItem.item_name}` : ''}
                                    </span>
                                </div>
                            )}
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
                        <Button variant="ghost" onClick={() => setShowCreateAccessory(false)} className="rounded-xl px-6">Hủy</Button>
                        <Button
                            onClick={handleCreateAccessory}
                            disabled={!!updatingId || !newItemName}
                            className="rounded-xl px-10 font-bold shadow-lg shadow-primary/20"
                        >
                            {updatingId === 'creating' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                            Gửi yêu cầu
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

