import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
    ArrowLeft, Save, Loader2, Gift, Wrench, Package as PackageIcon, Trash2, Plus, Info, Search, Percent
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
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useProducts } from '@/hooks/useProducts';
import { usePackages } from '@/hooks/usePackages';
import { ImageUpload } from '@/components/products/ImageUpload';
import { formatNumber, parseNumber } from '@/components/products/utils';
import { formatCurrency } from '@/lib/utils';

export function CreatePackagePage() {
    const navigate = useNavigate();
    const { id } = useParams<{ id: string }>();
    const isEditing = Boolean(id);

    const { services, products, fetchServices, fetchProducts } = useProducts();
    const { packages, createPackage, updatePackage, fetchPackages } = usePackages();

    const [loading, setLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Form state
    const [formData, setFormData] = useState({
        name: '',
        code: '',
        description: '',
        price: 0,
        priceDisplay: '0',
        commission_sale: 0,
        commission_tech: 0,
        image: null as string | null,
        items: [] as { service_id?: string; product_id?: string; quantity: number }[],
    });

    // Fetch data on mount
    useEffect(() => {
        fetchServices();
        fetchProducts();
        if (!packages.length) fetchPackages();
    }, [fetchServices, fetchProducts, fetchPackages, packages.length]);

    // Load package data if editing
    useEffect(() => {
        if (id && packages.length > 0) {
            setLoading(true);
            const pkg = packages.find(p => p.id === id);
            if (pkg) {
                setFormData({
                    name: pkg.name || '',
                    code: pkg.code || '',
                    description: pkg.description || '',
                    price: pkg.price || 0,
                    priceDisplay: formatNumber(pkg.price || 0),
                    commission_sale: pkg.commission_sale || 0,
                    commission_tech: pkg.commission_tech || 0,
                    image: pkg.image || null,
                    items: pkg.items?.map(item => 
                        item.service_id
                            ? { service_id: item.service_id, quantity: item.quantity }
                            : { product_id: item.product_id || '', quantity: item.quantity }
                    ) || [],
                });
            }
            setLoading(false);
        }
    }, [id, packages]);

    const handlePriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        const numValue = parseNumber(value);
        setFormData(prev => ({
            ...prev,
            price: numValue,
            priceDisplay: numValue === 0 ? '0' : formatNumber(numValue),
        }));
    };

    const addItem = (type: 'service' | 'product', id?: string) => {
        setFormData(prev => ({
            ...prev,
            items: [
                ...prev.items,
                type === 'service'
                    ? { service_id: id || '', quantity: 1 }
                    : { product_id: id || '', quantity: 1 }
            ]
        }));
    };

    const updateItem = (index: number, field: string, value: any) => {
        setFormData(prev => ({
            ...prev,
            items: prev.items.map((item, i) => {
                if (i !== index) return item;
                return { ...item, [field]: value };
            })
        }));
    };

    const removeItem = (index: number) => {
        setFormData(prev => ({
            ...prev,
            items: prev.items.filter((_, i) => i !== index)
        }));
    };

    const handleSubmit = async () => {
        if (!formData.name.trim()) {
            toast.error('Vui lòng nhập tên gói');
            return;
        }
        if (formData.price <= 0) {
            toast.error('Vui lòng nhập giá bán gói');
            return;
        }
        if (formData.items.length === 0) {
            toast.error('Vui lòng thêm ít nhất một dịch vụ hoặc sản phẩm vào gói');
            return;
        }

        // Validate items
        const invalidItem = formData.items.find(item => !item.service_id && !item.product_id);
        if (invalidItem) {
            toast.error('Vui lòng chọn dịch vụ hoặc sản phẩm cho tất cả các mục');
            return;
        }

        setIsSubmitting(true);
        try {
            const data = {
                name: formData.name,
                code: formData.code,
                description: formData.description,
                price: formData.price,
                image: formData.image || undefined,
                commission_sale: formData.commission_sale,
                commission_tech: formData.commission_tech,
                items: formData.items.map(item => ({
                    service_id: item.service_id || undefined,
                    product_id: item.product_id || undefined,
                    quantity: item.quantity
                })),
                status: 'active' as const,
            };

            if (isEditing && id) {
                await updatePackage(id, data);
                toast.success('Cập nhật gói dịch vụ thành công!');
            } else {
                await createPackage(data);
                toast.success('Tạo gói dịch vụ thành công!');
            }

            navigate('/packages');
        } catch (error) {
            console.error('Error saving package:', error);
            toast.error((error as Error).message || 'Có lỗi xảy ra khi lưu gói dịch vụ');
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

    const serviceItems = formData.items.filter(item => item.service_id && !item.product_id);
    const productItems = formData.items.filter(item => item.product_id && !item.service_id);

    const availableServices = services.filter(s => !formData.items.some(item => item.service_id === s.id));
    const availableProducts = products.filter(p => !formData.items.some(item => item.product_id === p.id));

    return (
        <div className="px-1 pt-0.5 pb-4 space-y-2 animate-fade-in max-w-[1600px] mx-auto">
            <Toaster richColors position="top-right" />

            {/* Header */}
            <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-3">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => navigate('/packages')}
                        className="hover:bg-muted h-9 w-9"
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">
                            {isEditing ? 'Sửa gói dịch vụ' : 'Thêm gói dịch vụ mới'}
                        </h1>
                        <p className="text-muted-foreground text-sm">
                            {isEditing ? `Mã gói: ${formData.code}` : 'Thông tin gói combo / liệu trình'}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <Button variant="outline" onClick={() => navigate('/packages')}>
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

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                {/* Left Column - General Info (2/5) */}
                <div className="lg:col-span-2 space-y-6">
                    <Card className="shadow-sm border-border/60">
                        <CardHeader className="pb-4 pt-5 px-5">
                            <CardTitle className="text-lg flex items-center gap-2">
                                <Info className="h-5 w-5 text-primary" />
                                Thông tin chung
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6 px-5 pb-6">
                            <div className="space-y-3">
                                <Label className="text-sm font-medium">Hình ảnh đại diện</Label>
                                <div className="bg-muted/30 rounded-xl p-4 border border-dashed border-muted-foreground/10">
                                    <ImageUpload
                                        value={formData.image}
                                        onChange={(img) => setFormData(prev => ({ ...prev, image: img }))}
                                        folder="packages"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="name" className="text-sm font-medium">
                                    Tên gói <span className="text-destructive">*</span>
                                </Label>
                                <Input
                                    id="name"
                                    value={formData.name}
                                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                    placeholder=""
                                    className="h-12 text-md font-bold"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="price" className="text-sm font-medium">
                                    Giá bán gói <span className="text-destructive">*</span>
                                </Label>
                                <div className="relative">
                                    <Input
                                        id="price"
                                        type="text"
                                        value={formData.priceDisplay}
                                        onChange={handlePriceChange}
                                        onFocus={(e) => e.target.select()}
                                        placeholder="0"
                                        className="h-11 pr-12 text-right font-bold text-primary text-xl"
                                    />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">
                                        VNĐ
                                    </span>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="description" className="text-sm font-medium">Mô tả chi tiết</Label>
                                <textarea
                                    id="description"
                                    className="w-full min-h-[120px] px-4 py-3 text-sm rounded-xl border-border/60 border bg-muted/5 focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none transition-all"
                                    value={formData.description}
                                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                                    placeholder="Chi tiết ưu đãi hoặc điều kiện áp dụng..."
                                />
                            </div>

                            <div className="pt-4 border-t space-y-4">
                                <div className="flex items-center gap-2">
                                    <Percent className="h-4 w-4 text-primary" />
                                    <Label className="text-sm font-bold text-primary uppercase tracking-tight">Cấu hình hoa hồng (%)</Label>
                                </div>
                                <div className="grid grid-cols-2 gap-6">
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between">
                                            <Label className="text-sm font-medium">Sale</Label>
                                            <span className="text-xs font-bold text-primary">{formData.commission_sale}%</span>
                                        </div>
                                        <Input
                                            type="number"
                                            value={formData.commission_sale}
                                            onChange={(e) => setFormData(prev => ({ ...prev, commission_sale: Number(e.target.value) }))}
                                            onFocus={(e) => e.target.select()}
                                            className="h-11 font-bold"
                                            min={0}
                                            max={100}
                                        />
                                    </div>
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between">
                                            <Label className="text-sm font-medium">KTV</Label>
                                            <span className="text-xs font-bold text-primary">{formData.commission_tech}%</span>
                                        </div>
                                        <Input
                                            type="number"
                                            value={formData.commission_tech}
                                            onChange={(e) => setFormData(prev => ({ ...prev, commission_tech: Number(e.target.value) }))}
                                            onFocus={(e) => e.target.select()}
                                            className="h-11 font-bold"
                                            min={0}
                                            max={100}
                                        />
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Right Column - Items (3/5) */}
                <div className="lg:col-span-3 space-y-6">
                    {/* Services Section */}
                    <Card className="shadow-sm border-border/60">
                        <CardHeader className="pb-3 pt-4 px-4 flex flex-row items-center justify-between space-y-0 text-pretty">
                            <div>
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <Wrench className="h-5 w-5 text-primary" />
                                    Dịch vụ trong gói
                                </CardTitle>
                                <CardDescription className="text-xs">Các dịch vụ chính của gói combo này</CardDescription>
                            </div>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" size="sm" className="h-9 gap-1.5 border-primary/20 text-primary hover:bg-primary/5">
                                        <Plus className="h-4 w-4" /> Thêm dịch vụ
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-[300px] max-h-[400px] overflow-y-auto">
                                    {availableServices.length === 0 ? (
                                        <div className="p-4 text-center text-sm text-muted-foreground italic">
                                            {services.length === 0 ? 'Không có dữ liệu dịch vụ' : 'Tất cả dịch vụ đã được thêm'}
                                        </div>
                                    ) : (
                                        availableServices.map(s => (
                                            <DropdownMenuItem key={s.id} onClick={() => addItem('service', s.id)} className="flex flex-col items-start gap-1 py-2 cursor-pointer">
                                                <div className="font-medium text-sm">{s.name}</div>
                                                <div className="text-xs text-primary font-semibold">{formatCurrency(s.price)}</div>
                                            </DropdownMenuItem>
                                        ))
                                    )}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </CardHeader>
                        <CardContent className="px-4 pb-4">
                            <div className="space-y-3">
                                {formData.items.map((item, index) => {
                                    if (!item.service_id || item.product_id) return null;
                                    return (
                                        <div key={index} className="flex items-center gap-3 p-3 bg-muted/20 rounded-xl border border-border/40 transition-all hover:bg-muted/40 group">
                                            <div className="flex-1 min-w-0">
                                                <Select
                                                    value={item.service_id}
                                                    onValueChange={(v) => updateItem(index, 'service_id', v)}
                                                >
                                                    <SelectTrigger className="border-none bg-transparent shadow-none focus:ring-0 px-0 h-auto font-semibold text-base truncate">
                                                        <SelectValue placeholder="Chọn dịch vụ..." />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {services.map(s => (
                                                            <SelectItem key={s.id} value={s.id}>
                                                                <div className="flex items-center justify-between w-full min-w-[300px]">
                                                                    <span>{s.name}</span>
                                                                    <span className="text-xs text-muted-foreground ml-2">{formatCurrency(s.price)}</span>
                                                                </div>
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="flex items-center gap-4 shrink-0">
                                                <div className="flex items-center gap-2">
                                                    <Label className="text-xs font-bold text-muted-foreground uppercase">SL:</Label>
                                                    <Input
                                                        type="number"
                                                        value={item.quantity}
                                                        onChange={(e) => updateItem(index, 'quantity', Number(e.target.value))}
                                                        onFocus={(e) => e.target.select()}
                                                        className="w-16 h-9 text-center font-bold"
                                                        min={1}
                                                    />
                                                </div>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => removeItem(index)}
                                                    className="h-9 w-9 text-destructive hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    );
                                })}

                                {serviceItems.length === 0 && (
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <div className="text-center py-10 border-2 border-dashed rounded-xl border-muted-foreground/10 bg-muted/5 hover:bg-muted/10 transition-colors cursor-pointer group">
                                                <div className="flex flex-col items-center gap-2">
                                                    <div className="h-12 w-12 rounded-full bg-primary/5 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                                                        <Plus className="h-6 w-6 text-primary" />
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-semibold text-muted-foreground">Chưa có dịch vụ nào</p>
                                                        <p className="text-xs text-muted-foreground/60 mt-1">Nhấn để chọn và thêm nhanh dịch vụ vào gói</p>
                                                    </div>
                                                </div>
                                            </div>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="center" className="w-[300px] max-h-[400px] overflow-y-auto">
                                            {availableServices.length === 0 ? (
                                                <div className="p-4 text-center text-sm text-muted-foreground italic">
                                                    {services.length === 0 ? 'Không có dữ liệu dịch vụ' : 'Tất cả dịch vụ đã được thêm'}
                                                </div>
                                            ) : (
                                                availableServices.map(s => (
                                                    <DropdownMenuItem key={s.id} onClick={() => addItem('service', s.id)} className="flex flex-col items-start gap-1 py-2 cursor-pointer">
                                                        <div className="font-medium text-sm">{s.name}</div>
                                                        <div className="text-xs text-primary font-semibold">{formatCurrency(s.price)}</div>
                                                    </DropdownMenuItem>
                                                ))
                                            )}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Products Section (Cross-sell) */}
                    <Card className="shadow-sm border-border/60">
                        <CardHeader className="pb-3 pt-4 px-4 flex flex-row items-center justify-between space-y-0 text-pretty">
                            <div>
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <PackageIcon className="h-5 w-5 text-primary" />
                                    Sản phẩm bán kèm
                                </CardTitle>
                                <CardDescription className="text-xs">Phụ kiện hoặc sản phẩm tặng kèm / bán kèm</CardDescription>
                            </div>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" size="sm" className="h-9 gap-1.5 border-primary/20 text-primary hover:bg-primary/5">
                                        <Plus className="h-4 w-4" /> Thêm sản phẩm
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-[300px] max-h-[400px] overflow-y-auto">
                                    {availableProducts.length === 0 ? (
                                        <div className="p-4 text-center text-sm text-muted-foreground italic">
                                            {products.length === 0 ? 'Không có dữ liệu sản phẩm' : 'Tất cả sản phẩm đã được thêm'}
                                        </div>
                                    ) : (
                                        availableProducts.map(p => (
                                            <DropdownMenuItem key={p.id} onClick={() => addItem('product', p.id)} className="flex flex-col items-start gap-1 py-2 cursor-pointer">
                                                <div className="font-medium text-sm">{p.name}</div>
                                                <div className="text-xs text-primary font-semibold">{formatCurrency(p.price)}</div>
                                            </DropdownMenuItem>
                                        ))
                                    )}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </CardHeader>
                        <CardContent className="px-4 pb-4">
                            <div className="space-y-3">
                                {formData.items.map((item, index) => {
                                    if (!item.product_id || item.service_id) return null;
                                    return (
                                        <div key={index} className="flex items-center gap-3 p-3 bg-muted/20 rounded-xl border border-border/40 transition-all hover:bg-muted/40 group">
                                            <div className="flex-1 min-w-0">
                                                <Select
                                                    value={item.product_id}
                                                    onValueChange={(v) => updateItem(index, 'product_id', v)}
                                                >
                                                    <SelectTrigger className="border-none bg-transparent shadow-none focus:ring-0 px-0 h-auto font-semibold text-base truncate">
                                                        <SelectValue placeholder="Chọn sản phẩm..." />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {products.map(p => (
                                                            <SelectItem key={p.id} value={p.id}>
                                                                <div className="flex items-center justify-between w-full min-w-[300px]">
                                                                    <span>{p.name}</span>
                                                                    <span className="text-xs text-muted-foreground ml-2">{formatCurrency(p.price)}</span>
                                                                </div>
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="flex items-center gap-4 shrink-0">
                                                <div className="flex items-center gap-2">
                                                    <Label className="text-xs font-bold text-muted-foreground uppercase">SL:</Label>
                                                    <Input
                                                        type="number"
                                                        value={item.quantity}
                                                        onChange={(e) => updateItem(index, 'quantity', Number(e.target.value))}
                                                        onFocus={(e) => e.target.select()}
                                                        className="w-16 h-9 text-center font-bold"
                                                        min={1}
                                                    />
                                                </div>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => removeItem(index)}
                                                    className="h-9 w-9 text-destructive hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    );
                                })}

                                {productItems.length === 0 && (
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <div className="text-center py-10 border-2 border-dashed rounded-xl border-muted-foreground/10 bg-muted/5 hover:bg-muted/10 transition-colors cursor-pointer group">
                                                <div className="flex flex-col items-center gap-2">
                                                    <div className="h-12 w-12 rounded-full bg-primary/5 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                                                        <Plus className="h-6 w-6 text-primary" />
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-semibold text-muted-foreground">Chưa có sản phẩm nào</p>
                                                        <p className="text-xs text-muted-foreground/60 mt-1">Nhấn để chọn và thêm nhanh sản phẩm vào gói</p>
                                                    </div>
                                                </div>
                                            </div>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="center" className="w-[300px] max-h-[400px] overflow-y-auto">
                                            {availableProducts.length === 0 ? (
                                                <div className="p-4 text-center text-sm text-muted-foreground italic">
                                                    {products.length === 0 ? 'Không có dữ liệu sản phẩm' : 'Tất cả sản phẩm đã được thêm'}
                                                </div>
                                            ) : (
                                                availableProducts.map(p => (
                                                    <DropdownMenuItem key={p.id} onClick={() => addItem('product', p.id)} className="flex flex-col items-start gap-1 py-2 cursor-pointer">
                                                        <div className="font-medium text-sm">{p.name}</div>
                                                        <div className="text-xs text-primary font-semibold">{formatCurrency(p.price)}</div>
                                                    </DropdownMenuItem>
                                                ))
                                            )}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
