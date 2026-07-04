import { useState } from 'react';
import { Image as ImageIcon, Loader2, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { uploadFile } from '@/lib/supabase';
import { orderProductsApi } from '@/lib/api';
import type { OrderItem } from '@/hooks/useOrders';
import { cn } from '@/lib/utils';

export function parseProductImages(item: OrderItem): string[] {
    const raw = (item as { product_images?: string[] }).product_images;
    if (Array.isArray(raw) && raw.length > 0) return raw.filter(Boolean);
    const single = item.product?.image ?? (item.product as { image?: string } | undefined)?.image;
    return single ? [single] : [];
}

export function isCustomerProductItem(item: OrderItem): boolean {
    return !!(item as { is_customer_item?: boolean }).is_customer_item && item.item_type === 'product';
}

interface OrderItemPhotosProps {
    item: OrderItem;
    canEdit: boolean;
    onUpdated: () => void;
    variant?: 'block' | 'table' | 'compact';
}

export function OrderItemPhotos({
    item,
    canEdit,
    onUpdated,
    variant = 'block',
}: OrderItemPhotosProps) {
    const [uploading, setUploading] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const images = parseProductImages(item);

    const saveImages = async (nextImages: string[]) => {
        await orderProductsApi.update(item.id, { images: nextImages });
        toast.success('Đã cập nhật ảnh sản phẩm');
        onUpdated();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files?.length || !canEdit) return;

        setUploading(true);
        try {
            const uploaded: string[] = [];
            for (let i = 0; i < files.length; i++) {
                const { url, error } = await uploadFile('products', 'images', files[i]);
                if (error) throw error;
                if (url) uploaded.push(url);
            }
            await saveImages([...images, ...uploaded]);
        } catch {
            toast.error('Lỗi khi tải ảnh');
        } finally {
            setUploading(false);
            e.target.value = '';
        }
    };

    const removeAt = async (index: number) => {
        if (!canEdit) return;
        const next = images.filter((_, i) => i !== index);
        try {
            await saveImages(next);
        } catch {
            toast.error('Không thể xóa ảnh');
        }
    };

    const thumbSize =
        variant === 'table' || variant === 'compact'
            ? 'h-10 w-10'
            : 'aspect-square w-full';

    const addControl = canEdit ? (
        <label
            className={cn(
                'cursor-pointer',
                variant === 'table'
                    ? 'mt-1.5 flex h-7 w-full items-center justify-center gap-1 rounded-md border border-dashed border-slate-300 bg-slate-50 text-[10px] font-medium text-slate-600 hover:border-primary/40 hover:bg-primary/5'
                    : variant === 'compact'
                      ? cn(
                            'flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-md border border-dashed border-slate-200 bg-slate-50/80',
                            uploading && 'pointer-events-none opacity-50',
                        )
                      : cn(
                            'flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-200 bg-slate-50/80',
                            thumbSize,
                            uploading && 'pointer-events-none opacity-50',
                        ),
            )}
        >
            {uploading ? (
                <Loader2
                    className={cn('animate-spin text-primary', variant === 'table' ? 'h-3 w-3' : 'h-5 w-5')}
                />
            ) : variant === 'table' ? (
                <>
                    <Plus className="h-3 w-3 shrink-0" />
                    Thêm ảnh
                </>
            ) : variant === 'compact' ? (
                <Plus className="h-3.5 w-3.5 text-slate-400" />
            ) : (
                <>
                    <ImageIcon className="h-5 w-5 text-slate-400" />
                    <span className="mt-0.5 text-[9px] font-medium text-slate-500">Thêm</span>
                </>
            )}
            <input
                type="file"
                multiple
                accept="image/*"
                className="hidden"
                disabled={uploading}
                onChange={(e) => void handleFileChange(e)}
            />
        </label>
    ) : null;

    return (
        <div
            className={cn(
                variant === 'block' && 'mt-2 border-t border-slate-100 pt-2',
                variant === 'compact' && 'border-t border-slate-100/80 pt-1.5',
            )}
        >
            {variant === 'block' && (
                <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Ảnh sản phẩm
                </p>
            )}
            {variant === 'compact' && (
                <p className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-slate-400">
                    Ảnh {images.length > 0 ? `(${images.length})` : ''}
                </p>
            )}

            <div
                className={cn(
                    variant === 'table' || variant === 'compact'
                        ? 'flex flex-wrap gap-1'
                        : 'grid grid-cols-4 gap-1.5',
                )}
            >
                {images.map((url, i) => (
                    <button
                        key={`${url}-${i}`}
                        type="button"
                        className={cn(
                            'relative shrink-0 overflow-hidden rounded-md border bg-muted',
                            thumbSize,
                        )}
                        onClick={() => setPreviewUrl(url)}
                    >
                        <img src={url} alt="" className="h-full w-full object-cover" />
                        {canEdit && (
                            <span
                                role="button"
                                tabIndex={0}
                                className="absolute right-0 top-0 rounded-bl-md bg-black/60 p-0.5 text-white"
                                onClick={(ev) => {
                                    ev.stopPropagation();
                                    void removeAt(i);
                                }}
                                onKeyDown={(ev) => {
                                    if (ev.key === 'Enter') {
                                        ev.stopPropagation();
                                        void removeAt(i);
                                    }
                                }}
                            >
                                <X className="h-2.5 w-2.5" />
                            </span>
                        )}
                    </button>
                ))}
                {(variant === 'block' || variant === 'compact') && addControl}
            </div>

            {variant === 'table' && addControl}

            <Dialog open={!!previewUrl} onOpenChange={(open) => !open && setPreviewUrl(null)}>
                <DialogContent className="max-w-sm gap-0 overflow-hidden p-0">
                    {previewUrl && (
                        <img src={previewUrl} alt="Xem ảnh" className="max-h-[70vh] w-full object-contain" />
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
