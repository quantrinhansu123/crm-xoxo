import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
    ArrowLeft, Save, Loader2, Package, Info, DollarSign, Database, Percent
} from 'lucide-react';
import { toast, Toaster } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useProducts } from '@/hooks/useProducts';
import { formatNumber, parseNumber } from '@/components/products/utils';
import { unitOptions } from '@/components/products/types';
import { ImageUpload } from '@/components/products/ImageUpload';

export function CreateProductPage() {
    const navigate = useNavigate();
    const { id } = useParams<{ id: string }>();
    const isEditing = Boolean(id);

    const { products, createProduct, updateProduct, fetchProducts } = useProducts();

    const [loading, setLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Form state
    const [formData, setFormData] = useState({
        name: '',
        unit: 'cái',
        price: 0,
        priceDisplay: '0',
        stock: 0,
        stockDisplay: '0',
        commission_sale: 0,
        commission_tech: 0,
        image: null as string | null,
    });

    // Fetch products on mount if needed
    useEffect(() => {
        if (!products.length) fetchProducts();
    }, [fetchProducts, products.length]);

    // Load product data if editing
    useEffect(() => {
        if (id && products.length > 0) {
            setLoading(true);
            const product = products.find(p => p.id === id);
            if (product) {
                setFormData({
                    name: product.name || '',
                    unit: product.unit || 'cái',
                    price: product.price || 0,
                    priceDisplay: formatNumber(product.price || 0),
                    stock: product.stock || 0,
                    stockDisplay: formatNumber(product.stock || 0),
                    commission_sale: product.commission_sale || 0,
                    commission_tech: product.commission_tech || 0,
                    image: product.image || null,
                });
            }
            setLoading(false);
        }
    }, [id, products]);

    const handlePriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        const numValue = parseNumber(value);
        setFormData(prev => ({
            ...prev,
            price: numValue,
            priceDisplay: numValue === 0 ? '0' : formatNumber(numValue),
        }));
    };

    const handleStockChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        const numValue = parseNumber(value);
        setFormData(prev => ({
            ...prev,
            stock: numValue,
            stockDisplay: numValue === 0 ? '0' : formatNumber(numValue),
        }));
    };

    const handleSubmit = async () => {
        if (!formData.name.trim()) {
            toast.error('Vui lòng nhập tên sản phẩm');
            return;
        }
        if (formData.price <= 0) {
            toast.error('Vui lòng nhập giá sản phẩm');
            return;
        }

        setIsSubmitting(true);
        try {
            const data = {
                name: formData.name,
                unit: formData.unit,
                price: formData.price,
                stock: formData.stock,
                image: formData.image || undefined,
                commission_sale: formData.commission_sale,
                commission_tech: formData.commission_tech,
                status: 'active' as const,
            };

            if (isEditing && id) {
                await updateProduct(id, data);
                toast.success('Cập nhật sản phẩm thành công!');
            } else {
                await createProduct(data);
                toast.success('Tạo sản phẩm thành công!');
            }

            navigate('/product-list');
        } catch (error) {
            console.error('Error saving product:', error);
            toast.error('Có lỗi xảy ra khi lưu sản phẩm');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="px-1 pt-0.5 pb-4 space-y-2 animate-fade-in max-w-[1600px] mx-auto">
            <Toaster richColors position="top-right" />

            {/* Header */}
            <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-3">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => navigate('/product-list')}
                        className="hover:bg-muted h-9 w-9"
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">
                            {isEditing ? 'Sửa sản phẩm' : 'Thêm sản phẩm mới'}
                        </h1>
                        <p className="text-muted-foreground text-sm">
                            {isEditing ? `Mã sản phẩm: ${products.find(p => p.id === id)?.code}` : 'Tạo sản phẩm mới trong hệ thống'}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <Button variant="outline" onClick={() => navigate('/product-list')}>
                        Huỷ
                    </Button>
                    <Button onClick={handleSubmit} disabled={isSubmitting} className="gap-2 px-6">
                        {isSubmitting ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Save className="h-4 w-4" />
                        )}
                        {isEditing ? 'Cập nhật' : 'Tạo mới'}
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Left Column - Media & Commissions (1/3 width) */}
                <div className="space-y-6">
                    {/* Media Card */}
                    <Card className="shadow-sm border-border/60">
                        <CardHeader className="pb-4">
                            <CardTitle className="text-lg flex items-center gap-2">
                                <Package className="h-5 w-5 text-primary" />
                                Hình ảnh sản phẩm
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="bg-muted/30 rounded-xl p-6 border-2 border-dashed border-muted-foreground/10">
                                <ImageUpload
                                    value={formData.image}
                                    onChange={(img) => setFormData(prev => ({ ...prev, image: img }))}
                                    folder="products"
                                    className="w-full aspect-square max-w-[280px] mx-auto"
                                    hideInfo
                                />
                                <div className="mt-4 text-center">
                                    <p className="text-xs text-muted-foreground">
                                        Định dạng: JPG, PNG, WebP (Tối đa 5MB)
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Commissions Card */}
                    <Card className="shadow-sm border-border/60">
                        <CardHeader className="pb-4">
                            <CardTitle className="text-lg flex items-center gap-2">
                                <Percent className="h-5 w-5 text-primary" />
                                Hoa hồng nhân viên
                            </CardTitle>
                            <CardDescription className="text-xs">Phần trăm hoa hồng trên đơn giá</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <Label className="text-sm font-medium">Sale</Label>
                                    <span className="text-xs text-primary font-bold">{formData.commission_sale}%</span>
                                </div>
                                <Input
                                    type="number"
                                    min={0}
                                    max={100}
                                    value={formData.commission_sale}
                                    onChange={(e) => setFormData(prev => ({ ...prev, commission_sale: Number(e.target.value) }))}
                                    onFocus={(e) => e.target.select()}
                                    className="h-11"
                                />
                            </div>

                            <div className="space-y-3 pt-2">
                                <div className="flex items-center justify-between">
                                    <Label className="text-sm font-medium">Kỹ thuật viên</Label>
                                    <span className="text-xs text-primary font-bold">{formData.commission_tech}%</span>
                                </div>
                                <Input
                                    type="number"
                                    min={0}
                                    max={100}
                                    value={formData.commission_tech}
                                    onChange={(e) => setFormData(prev => ({ ...prev, commission_tech: Number(e.target.value) }))}
                                    onFocus={(e) => e.target.select()}
                                    className="h-11"
                                />
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Right Column - Main Details (2/3 width) */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Basic Info */}
                    <Card className="shadow-sm border-border/60">
                        <CardHeader className="pb-4">
                            <CardTitle className="text-lg flex items-center gap-2">
                                <Info className="h-5 w-5 text-primary" />
                                Thông tin cơ bản
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="name" className="text-sm font-medium">
                                    Tên sản phẩm <span className="text-destructive">*</span>
                                </Label>
                                <Input
                                    id="name"
                                    value={formData.name}
                                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                    placeholder=""
                                    className="h-12 text-lg font-medium"
                                />
                            </div>
                        </CardContent>
                    </Card>

                    {/* Pricing & Inventory */}
                    <Card className="shadow-sm border-border/60">
                        <CardHeader className="pb-4">
                            <CardTitle className="text-lg flex items-center gap-2">
                                <DollarSign className="h-5 w-5 text-primary" />
                                Giá & Tồn kho
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <Label className="text-sm font-medium">Đơn vị tính *</Label>
                                    <Select
                                        value={formData.unit}
                                        onValueChange={(v) => setFormData(prev => ({ ...prev, unit: v }))}
                                    >
                                        <SelectTrigger className="h-11">
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
                                    <Label className="text-sm font-medium">
                                        Giá bán <span className="text-destructive">*</span>
                                    </Label>
                                    <div className="relative">
                                        <Input
                                            type="text"
                                            value={formData.priceDisplay}
                                            onChange={handlePriceChange}
                                            onFocus={(e) => formData.price === 0 && e.target.select()}
                                            placeholder="0"
                                            className="h-11 pr-12 text-right font-bold text-primary"
                                        />
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium">
                                            VNĐ
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                                <div className="space-y-2">
                                    <Label className="text-sm font-medium flex items-center gap-2">
                                        <Database className="h-4 w-4" />
                                        Số lượng tồn kho ban đầu
                                    </Label>
                                    <Input
                                        type="text"
                                        value={formData.stockDisplay}
                                        onChange={handleStockChange}
                                        onFocus={(e) => formData.stock === 0 && e.target.select()}
                                        placeholder="0"
                                        className="h-11 text-right"
                                    />
                                    <p className="text-xs text-muted-foreground mt-1">
                                        Lưu ý: Số lượng này sẽ được ghi nhận vào kho sau khi tạo.
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
