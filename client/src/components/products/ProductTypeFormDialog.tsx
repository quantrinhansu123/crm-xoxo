import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import type { ProductType } from '@/hooks/useProductTypes';

const productTypeSchema = z.object({
    name: z.string().min(1, 'Tên loại sản phẩm là bắt buộc'),
    code: z.string().min(1, 'Mã loại sản phẩm là bắt buộc'),
    description: z.string().optional(),
});

type ProductTypeFormData = z.infer<typeof productTypeSchema>;

interface ProductTypeFormDialogProps {
    open: boolean;
    onClose: () => void;
    productType?: ProductType | null;
    onSubmit: (data: ProductTypeFormData) => Promise<void>;
}

export function ProductTypeFormDialog({ open, onClose, productType, onSubmit }: ProductTypeFormDialogProps) {
    const [isSubmitting, setIsSubmitting] = useState(false);

    const { register, handleSubmit, reset, formState: { errors }, setValue } = useForm<ProductTypeFormData>({
        resolver: zodResolver(productTypeSchema),
        defaultValues: {
            name: '',
            code: '',
            description: '',
        },
    });

    useEffect(() => {
        if (open) {
            if (productType) {
                setValue('name', productType.name);
                setValue('code', productType.code);
                setValue('description', productType.description || '');
            } else {
                reset({
                    name: '',
                    code: '',
                    description: '',
                });
            }
        }
    }, [open, productType, setValue, reset]);

    const handleFormSubmit = async (data: ProductTypeFormData) => {
        try {
            setIsSubmitting(true);
            await onSubmit(data);
            onClose();
        } catch (error) {
            console.error(error);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>{productType ? 'Cập nhật loại sản phẩm' : 'Thêm loại sản phẩm mới'}</DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="product-type-name">Tên loại sản phẩm <span className="text-red-500">*</span></Label>
                        <Input
                            id="product-type-name"
                            placeholder="Ví dụ: Giày, Túi xách..."
                            {...register('name')}
                        />
                        {errors.name && <p className="text-sm text-red-500">{errors.name.message}</p>}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="product-type-code">Mã loại <span className="text-red-500">*</span></Label>
                        <Input
                            id="product-type-code"
                            placeholder="ví dụ: giay, tui-xach..."
                            {...register('code')}
                        />
                        {errors.code && <p className="text-sm text-red-500">{errors.code.message}</p>}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="product-type-desc">Mô tả</Label>
                        <Textarea
                            id="product-type-desc"
                            placeholder="Mô tả chi tiết..."
                            {...register('description')}
                        />
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
                            Hủy
                        </Button>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {productType ? 'Cập nhật' : 'Tạo mới'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
