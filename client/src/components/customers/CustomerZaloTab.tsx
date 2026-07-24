import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Image as ImageIcon, Loader2, MessageCircle, Save, Video } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import type { Customer } from '@/hooks/useCustomers';
import type { Order } from '@/hooks/useOrders';
import { customersApi } from '@/lib/api';
import { cn } from '@/lib/utils';

type CustomerZaloTabProps = {
    customer: Customer;
    orders: Order[];
    onCustomerUpdated?: (customer: Customer) => void;
};

function collectMediaUrls(order: Order): string[] {
    const buckets = [
        order.completion_photos,
        order.packaging_photos,
        order.hd_sent_photos,
        order.feedback_requested_photos,
        order.debt_payment_photos,
    ];
    const urls: string[] = [];
    for (const list of buckets) {
        if (!Array.isArray(list)) continue;
        for (const url of list) {
            if (typeof url === 'string' && url.trim()) urls.push(url.trim());
        }
    }
    for (const item of order.customer_items || []) {
        if (!Array.isArray(item.images)) continue;
        for (const url of item.images) {
            if (typeof url === 'string' && url.trim()) urls.push(url.trim());
        }
    }
    return [...new Set(urls)];
}

function isVideoUrl(url: string): boolean {
    return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url);
}

function resolveProductName(order: Order): string {
    const fromCustomerItems = (order.customer_items || [])
        .map((item) => item.name || item.product_code)
        .filter(Boolean);
    if (fromCustomerItems.length) return fromCustomerItems.join(', ');

    const fromItems = (order.items || order.sale_items || [])
        .map((item: any) => item.product_name || item.name || item.product_code)
        .filter(Boolean);
    return fromItems.length ? fromItems.join(', ') : '—';
}

function resolveCurrentStep(order: Order): string {
    return (
        order.after_sale_stage
        || order.care_warranty_stage
        || order.care_warranty_flow
        || order.status
        || '—'
    );
}

const statusLabel: Record<string, string> = {
    before_sale: 'Đơn nháp',
    in_progress: 'Đang thực hiện',
    done: 'Đã hoàn thiện',
    after_sale: 'After Sale',
    cancelled: 'Đã hủy',
};

function FieldRow({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
    return (
        <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className={cn('text-sm text-foreground break-all', mono && 'font-mono text-[13px]')}>
                {value?.trim() ? value : '—'}
            </p>
        </div>
    );
}

export function CustomerZaloTab({ customer, orders, onCustomerUpdated }: CustomerZaloTabProps) {
    const zaloUserId = customer.zalo_user_id || customer.customer_zalo_user_id || '';
    const [zaloPhone, setZaloPhone] = useState(customer.zalo_phone || customer.customer_zalo_phone || '');
    const [zaloId, setZaloId] = useState(zaloUserId);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setZaloPhone(customer.zalo_phone || customer.customer_zalo_phone || '');
        setZaloId(customer.zalo_user_id || customer.customer_zalo_user_id || '');
    }, [customer.id, customer.zalo_phone, customer.customer_zalo_phone, customer.zalo_user_id, customer.customer_zalo_user_id]);

    const sortedOrders = useMemo(
        () => [...orders].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
        [orders]
    );

    const displayPhone = customer.phone || '';
    const displayZaloPhone = zaloPhone.trim() || displayPhone;
    const zaloChatUrl = displayZaloPhone
        ? `https://zalo.me/${displayZaloPhone.replace(/^0/, '84').replace(/\D/g, '')}`
        : null;

    const handleSave = async () => {
        setSaving(true);
        try {
            const payload = {
                zalo_phone: zaloPhone.trim() || null,
                customer_zalo_phone: zaloPhone.trim() || null,
                zalo_user_id: zaloId.trim() || null,
                customer_zalo_user_id: zaloId.trim() || null,
            };
            const res = await customersApi.update(customer.id, payload);
            const updated = res.data.data?.customer;
            if (updated) {
                onCustomerUpdated?.(updated);
                setZaloPhone(updated.zalo_phone || updated.customer_zalo_phone || '');
                setZaloId(updated.zalo_user_id || updated.customer_zalo_user_id || '');
            }
            toast.success('Đã lưu thông tin Zalo');
        } catch (err: any) {
            toast.error(err?.response?.data?.message || 'Không lưu được thông tin Zalo');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-[15px] flex items-center gap-2">
                        <MessageCircle className="h-4 w-4 text-sky-600" />
                        Thông tin Zalo khách
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <FieldRow label="customer_name" value={customer.name} />
                        <FieldRow label="customer_phone" value={displayPhone} mono />
                        <div className="space-y-1.5">
                            <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                zalo_phone / customer_zalo_phone *
                            </Label>
                            <Input
                                value={zaloPhone}
                                onChange={(e) => setZaloPhone(e.target.value)}
                                placeholder={displayPhone ? `Mặc định: ${displayPhone}` : 'Nhập số Zalo khách'}
                                className="h-9"
                            />
                            <p className="text-[11px] text-muted-foreground">
                                Số Zalo dùng gửi tin. Để trống sẽ fallback sang SĐT liên hệ.
                            </p>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                zalo_user_id
                            </Label>
                            <Input
                                value={zaloId}
                                onChange={(e) => setZaloId(e.target.value)}
                                placeholder="Zalo OA user id (nếu có)"
                                className="h-9 font-mono text-[13px]"
                            />
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                        <Button onClick={handleSave} disabled={saving} className="h-9">
                            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Save className="h-4 w-4 mr-1.5" />}
                            Lưu Zalo
                        </Button>
                        {zaloChatUrl && (
                            <Button variant="outline" className="h-9" asChild>
                                <a href={zaloChatUrl} target="_blank" rel="noreferrer">
                                    <ExternalLink className="h-4 w-4 mr-1.5" />
                                    Mở Zalo ({displayZaloPhone})
                                </a>
                            </Button>
                        )}
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-[15px]">Ngữ cảnh đơn / Zalo gần nhất</CardTitle>
                </CardHeader>
                <CardContent>
                    {sortedOrders.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-6 text-center">Chưa có đơn để hiển thị order_code / product / media</p>
                    ) : (
                        <div className="space-y-3">
                            {sortedOrders.slice(0, 8).map((order) => {
                                const media = collectMediaUrls(order);
                                const step = resolveCurrentStep(order);
                                return (
                                    <div key={order.id} className="rounded-lg border border-border/80 p-3 space-y-3">
                                        <div className="flex flex-wrap items-start justify-between gap-2">
                                            <div>
                                                <p className="text-[11px] uppercase text-muted-foreground font-semibold">order_code</p>
                                                <p className="font-semibold text-primary">{order.order_code}</p>
                                            </div>
                                            <Badge variant="secondary">
                                                {statusLabel[order.status] || order.status}
                                            </Badge>
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            <FieldRow label="product_name" value={resolveProductName(order)} />
                                            <FieldRow label="event / current_step" value={step} />
                                            <FieldRow label="status" value={order.status} mono />
                                            <FieldRow
                                                label="customer_zalo_phone (payload)"
                                                value={displayZaloPhone}
                                                mono
                                            />
                                        </div>

                                        {media.length > 0 && (
                                            <div className="space-y-1.5">
                                                <p className="text-[11px] uppercase text-muted-foreground font-semibold">
                                                    link ảnh / video
                                                </p>
                                                <div className="flex flex-wrap gap-2">
                                                    {media.slice(0, 12).map((url) => (
                                                        <a
                                                            key={url}
                                                            href={url}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="inline-flex items-center gap-1 text-xs text-sky-700 hover:underline bg-sky-50 border border-sky-100 rounded-md px-2 py-1 max-w-full"
                                                        >
                                                            {isVideoUrl(url)
                                                                ? <Video className="h-3.5 w-3.5 shrink-0" />
                                                                : <ImageIcon className="h-3.5 w-3.5 shrink-0" />}
                                                            <span className="truncate max-w-[220px]">{url}</span>
                                                        </a>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
