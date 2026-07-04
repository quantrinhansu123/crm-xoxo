import { useState, useEffect, useRef } from 'react';
import { Package, Upload, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import type { Product } from './types';
import { unitOptions } from './types';
import { formatNumber, parseNumber } from './utils';
import { uploadFile } from '@/lib/supabase';

interface ProductFormDialogProps {
    open: boolean;
    onClose: () => void;
    product?: Product | null;
    onSubmit: (data: Partial<Product>) => Promise<void>;
}

export function ProductFormDialog({ open, onClose, product, onSubmit }: ProductFormDialogProps) {
    const [name, setName] = useState('');
    const [unit, setUnit] = useState('cái');
    const [price, setPrice] = useState(0);
    const [priceDisplay, setPriceDisplay] = useState('0');
    const [stock, setStock] = useState(0);
    const [stockDisplay, setStockDisplay] = useState('0');
    const [commissionSale, setCommissionSale] = useState(0);
    const [commissionTech, setCommissionTech] = useState(0);
    const [image, setImage] = useState<string | null>(null);
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Reset form when product changes
    useEffect(() => {
        if (product) {
            setName(product.name || '');
            setUnit(product.unit || 'cái');
            setPrice(product.price || 0);
            setPriceDisplay(formatNumber(product.price || 0));
            setStock(product.stock || 0);
            setStockDisplay(formatNumber(product.stock || 0));
            setCommissionSale(product.commission_sale || 0);
            setCommissionTech(product.commission_tech || 0);
            setImage(product.image || null);
            setImageFile(null);
        } else {
            setName('');
            setUnit('cái');
            setPrice(0);
            setPriceDisplay('0');
            setStock(0);
            setStockDisplay('0');
            setCommissionSale(0);
            setCommissionTech(0);
            setImage(null);
            setImageFile(null);
        }
    }, [product, open]);

    const handlePriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        const numValue = parseNumber(value);
        setPrice(numValue);
        setPriceDisplay(numValue === 0 ? '0' : formatNumber(numValue));
    };

    const handleStockChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        const numValue = parseNumber(value);
        setStock(numValue);
        setStockDisplay(numValue === 0 ? '0' : formatNumber(numValue));
    };

    const handlePriceFocus = (e: React.FocusEvent<HTMLInputElement>) => {
        if (price === 0) e.target.select();
    };

    const handleStockFocus = (e: React.FocusEvent<HTMLInputElement>) => {
        if (stock === 0) e.target.select();
    };

    const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (!file.type.startsWith('image/')) {
                toast.error('Vui lòng chọn file hình ảnh');
                return;
            }
            if (file.size > 5 * 1024 * 1024) {
                toast.error('File không được lớn hơn 5MB');
                return;
            }
            setImageFile(file);
            const reader = new FileReader();
            reader.onloadend = () => {
                setImage(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleRemoveImage = () => {
        setImage(null);
        setImageFile(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const handleSubmit = async () => {
        if (!name || price <= 0) {
            toast.error('Vui lòng điền đầy đủ thông tin');
            return;
        }
        setSubmitting(true);
        try {
            let imageUrl = product?.image || null;

            // Upload new image if selected
            if (imageFile) {
                setUploading(true);
                const { url, error } = await uploadFile('products', 'images', imageFile);
                setUploading(false);
                if (error) {
                    toast.error('Lỗi khi tải lên hình ảnh');
                    console.error('Upload error:', error);
                    setSubmitting(false);
                    return;
                }
                imageUrl = url;
            } else if (!image && product?.image) {
                // Image was removed
                imageUrl = null;
            }

            await onSubmit({
                name,
                unit,
                price,
                stock,
                image: imageUrl || undefined,
                commission_sale: commissionSale,
                commission_tech: commissionTech,
                status: 'active'
            });
            onClose();
        } catch (error) {
            console.error('Error saving product:', error);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Package className="h-5 w-5 text-primary" />
                        {product ? 'Sửa sản phẩm' : 'Thêm sản phẩm mới'}
                    </DialogTitle>
                    <DialogDescription>Nhập thông tin sản phẩm</DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {/* Image Upload */}
                    <div className="space-y-2">
                        <Label>Hình ảnh sản phẩm</Label>
                        <div className="flex items-center gap-4">
                            {image ? (
                                <div className="relative w-24 h-24 rounded-lg overflow-hidden border">
                                    <img src={image} alt="Product" className="w-full h-full object-cover" />
                                    <button
                                        type="button"
                                        onClick={handleRemoveImage}
                                        className="absolute top-1 right-1 p-1 bg-black/50 rounded-full hover:bg-black/70 transition-colors"
                                    >
                                        <X className="h-3 w-3 text-white" />
                                    </button>
                                </div>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    className="w-24 h-24 rounded-lg border-2 border-dashed border-muted-foreground/30 flex flex-col items-center justify-center gap-1 hover:border-primary/50 hover:bg-muted/50 transition-colors"
                                >
                                    <Upload className="h-5 w-5 text-muted-foreground" />
                                    <span className="text-xs text-muted-foreground">Tải lên</span>
                                </button>
                            )}
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                onChange={handleImageSelect}
                                className="hidden"
                            />
                            <div className="text-xs text-muted-foreground">
                                <p>Định dạng: JPG, PNG, WebP</p>
                                <p>Tối đa: 5MB</p>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Mã sản phẩm</Label>
                        <Input value={product?.code || 'SP...'} disabled className="bg-muted" />
                        <p className="text-xs text-muted-foreground">Mã tự động sinh khi tạo</p>
                    </div>

                    <div className="space-y-2">
                        <Label>Tên sản phẩm *</Label>
                        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nhập tên sản phẩm" />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Đơn vị tính *</Label>
                            <Select value={unit} onValueChange={setUnit}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {unitOptions.map(u => (
                                        <SelectItem key={u} value={u}>{u}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Giá bán *</Label>
                            <Input
                                type="text"
                                value={priceDisplay}
                                onChange={handlePriceChange}
                                onFocus={handlePriceFocus}
                                placeholder="0"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Số lượng tồn</Label>
                        <Input
                            type="text"
                            value={stockDisplay}
                            onChange={handleStockChange}
                            onFocus={handleStockFocus}
                            placeholder="0"
                        />
                    </div>

                    {/* Commission Section */}
                    <div className="pt-2 border-t">
                        <Label className="text-sm font-medium text-muted-foreground">Hoa hồng (%)</Label>
                        <div className="grid grid-cols-2 gap-4 mt-2">
                            <div className="space-y-2">
                                <Label className="text-xs">Sale</Label>
                                <Input
                                    type="number"
                                    min={0}
                                    max={100}
                                    value={commissionSale}
                                    onChange={(e) => setCommissionSale(Number(e.target.value))}
                                    onFocus={(e) => e.target.select()}
                                    placeholder="0"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs">Kỹ thuật viên</Label>
                                <Input
                                    type="number"
                                    min={0}
                                    max={100}
                                    value={commissionTech}
                                    onChange={(e) => setCommissionTech(Number(e.target.value))}
                                    onFocus={(e) => e.target.select()}
                                    placeholder="0"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Huỷ</Button>
                    <Button onClick={handleSubmit} disabled={submitting || uploading}>
                        {uploading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Đang tải ảnh...
                            </>
                        ) : submitting ? 'Đang lưu...' : 'Lưu'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
