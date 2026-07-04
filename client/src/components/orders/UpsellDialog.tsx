
import { useState, useEffect, useMemo } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Trash2, ShoppingBag, Wrench, Package, Info, Sparkles } from 'lucide-react';
import { ServiceSelector } from './ServiceSelector';
import { servicesApi, packagesApi, productsApi, ordersApi } from '@/lib/api';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface FormattedNumberInputProps {
    value: number;
    onChange: (value: number) => void;
    className?: string;
    disabled?: boolean;
}

function FormattedNumberInput({ value, onChange, className, disabled }: FormattedNumberInputProps) {
    const [displayValue, setDisplayValue] = useState(value.toString());

    useEffect(() => {
        const formatted = value.toLocaleString('vi-VN');
        if (formatted !== displayValue.replace(/\./g, '')) {
            setDisplayValue(formatted);
        }
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const rawValue = e.target.value.replace(/\D/g, '');
        const numValue = parseInt(rawValue, 10) || 0;
        setDisplayValue(numValue.toLocaleString('vi-VN'));
        onChange(numValue);
    };

    return (
        <Input
            type="text"
            className={className}
            value={displayValue}
            onChange={handleChange}
            disabled={disabled}
        />
    );
}

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    orderId: string;
    order?: any;
    preselectedProduct?: {
        id: string;
        name: string;
        type: string;
    } | null;
    onSuccess?: () => void;
}

export function UpsellDialog({ open, onOpenChange, orderId, order, preselectedProduct, onSuccess }: Props) {
    const [loading, setLoading] = useState(false);
    const [services, setServices] = useState<any[]>([]);
    const [packages, setPackages] = useState<any[]>([]);
    const [catalogProducts, setCatalogProducts] = useState<any[]>([]);

    // items to be serviced (V2 style)
    const [customerItems, setCustomerItems] = useState<any[]>([]);
    // items for direct sale (V1 style)
    const [saleItems, setSaleItems] = useState<any[]>([]);
    const [notes, setNotes] = useState('');

    useEffect(() => {
        if (open) {
            fetchCatalog();

            // Initialize from existing order items if available
            if (order && order.items) {
                const items: any[] = order.items;
                let customerItemGroups: any[] = [];
                let existingSaleItems: any[] = [];

                let i = 0;
                while (i < items.length) {
                    const item = items[i];

                    if (item.is_customer_item) {
                        if (item.item_type === 'product') {
                            const productGroup = {
                                order_product_id: item.id,
                                name: item.item_name,
                                type: normalizeProductType(item.product?.type || item.item_type_label || (item as any).product_type),
                                brand: item.product?.brand || (item as any).product_brand || '',
                                color: item.product?.color || (item as any).product_color || '',
                                material: item.product?.material || (item as any).product_material || '',
                                is_existing: true,
                                services: [] as any[]
                            };

                            let j = i + 1;
                            while (j < items.length) {
                                const next = items[j];
                                if (!next.is_customer_item || next.item_type === 'product') break;

                                productGroup.services.push({
                                    id: next.service_id || next.package_id || next.id,
                                    db_id: next.id,
                                    type: next.item_type === 'package' ? 'package' : 'service',
                                    name: next.item_name,
                                    price: Number(next.unit_price),
                                    original_price: Number(next.unit_price),
                                    is_existing: true
                                });
                                j++;
                            }
                            customerItemGroups.push(productGroup);
                            i = j;
                        } else {
                            // Lone service item (possibly V1 or standalone)
                            customerItemGroups.push({
                                order_product_id: null,
                                name: item.item_name,
                                type: 'khác',
                                is_existing: true,
                                services: [{
                                    id: item.service_id || item.package_id || item.id,
                                    db_id: item.id,
                                    type: item.item_type === 'package' ? 'package' : 'service',
                                    name: item.item_name,
                                    price: Number(item.unit_price),
                                    original_price: Number(item.unit_price),
                                    is_existing: true
                                }]
                            });
                            i++;
                        }
                    } else {
                        // Retail/Sale item
                        existingSaleItems.push({
                            id: item.id,
                            product_id: item.product_id,
                            name: item.item_name,
                            quantity: item.quantity,
                            unit_price: Number(item.unit_price),
                            original_price: Number(item.unit_price),
                            original_quantity: item.quantity,
                            is_existing: true
                        });
                        i++;
                    }
                }

                if (preselectedProduct) {
                    customerItemGroups = customerItemGroups.filter(
                        g => g.order_product_id === preselectedProduct.id
                    );
                    existingSaleItems = [];
                }

                setCustomerItems(customerItemGroups);
                setSaleItems(existingSaleItems);
            } else if (preselectedProduct) {
                setCustomerItems([{
                    order_product_id: preselectedProduct.id,
                    name: preselectedProduct.name,
                    type: normalizeProductType(preselectedProduct.type),
                    services: []
                }]);
                setSaleItems([]);
            } else {
                setCustomerItems([]);
                setSaleItems([]);
            }

            setNotes('');
        }
    }, [open, order, preselectedProduct]);

    const fetchCatalog = async () => {
        try {
            const [svcRes, pkgRes, prodRes] = await Promise.all([
                servicesApi.getAll(),
                packagesApi.getAll(),
                productsApi.getAll()
            ]);
            setServices(svcRes.data?.data?.services || []);
            setPackages(pkgRes.data?.data?.packages || []);
            setCatalogProducts(prodRes.data?.data?.products || []);
        } catch (error) {
            console.error('Error fetching catalog:', error);
            toast.error('Không thể tải danh sách dịch vụ');
        }
    };

    const normalizeProductType = (type: any): string => {
        if (!type) return 'khác';
        const lower = String(type).toLowerCase().trim();
        if (lower === 'shoe' || lower.includes('giày') || lower.includes('giay') || lower.includes('giây')) return 'giày';
        if (lower === 'bag' || lower.includes('túi') || lower.includes('tui')) return 'túi';
        if (lower === 'wallet' || lower.includes('ví') || lower.includes('vi')) return 'ví';
        if (lower === 'belt' || lower.includes('thắt lưng') || lower.includes('that lung')) return 'thắt lưng';
        if (lower.includes('dép') || lower.includes('dep')) return 'dép';
        if (lower.includes('mũ') || lower.includes('mu') || lower.includes('nón') || lower.includes('non')) return 'mũ';
        return 'khác';
    };

    const addCustomerItem = () => {
        setCustomerItems([...customerItems, {
            name: '',
            type: 'giày',
            services: []
        }]);
    };

    const removeCustomerItem = (index: number) => {
        setCustomerItems(customerItems.filter((_, i) => i !== index));
    };

    const updateCustomerItem = (index: number, field: string, value: any) => {
        const newItems = [...customerItems];
        newItems[index] = { ...newItems[index], [field]: value };
        setCustomerItems(newItems);
    };

    const addServiceToItem = (itemIndex: number, service: any) => {
        const newItems = [...customerItems];
        const item = newItems[itemIndex];

        if (item.services.find((s: any) => s.id === service.id && s.type === service.type)) {
            toast.warning('Dịch vụ này đã được chọn');
            return;
        }

        item.services.push({ ...service, price: Number(service.price) });
        setCustomerItems(newItems);
    };

    const removeServiceFromItem = (itemIndex: number, svcIndex: number) => {
        const newItems = [...customerItems];
        newItems[itemIndex].services.splice(svcIndex, 1);
        setCustomerItems(newItems);
    };

    const updateServicePrice = (itemIndex: number, svcIndex: number, newPrice: number) => {
        const newItems = [...customerItems];
        newItems[itemIndex].services[svcIndex].price = newPrice;
        setCustomerItems(newItems);
    };

    const addSaleItem = (product: any) => {
        const existing = saleItems.find(p => p.id === product.id);
        if (existing) {
            updateSaleItemQuantity(product.id, existing.quantity + 1);
        } else {
            setSaleItems([...saleItems, {
                ...product,
                quantity: 1,
                unit_price: Number(product.price)
            }]);
        }
    };

    const updateSaleItemQuantity = (id: string, quantity: number) => {
        if (quantity < 1) return;
        setSaleItems(saleItems.map(p => p.id === id ? { ...p, quantity } : p));
    };

    const updateSaleItemPrice = (id: string, unit_price: number) => {
        setSaleItems(saleItems.map(p => p.id === id ? { ...p, unit_price } : p));
    };

    const removeSaleItem = (id: string) => {
        setSaleItems(saleItems.filter(p => p.id !== id));
    };

    const sidebarItems = useMemo(() => {
        if (!order?.items) return [];
        const items = order.items;
        const result = [];
        let i = 0;
        while (i < items.length) {
            const item = items[i];
            if (item.is_customer_item && item.item_type === 'product') {
                let productTotal = 0;
                let j = i + 1;
                while (j < items.length) {
                    const next = items[j];
                    if (!next.is_customer_item || next.item_type === 'product') break;
                    productTotal += Number(next.unit_price) * (next.quantity || 1);
                    j++;
                }
                result.push({
                    name: item.item_name,
                    price: productTotal,
                });
                i = j;
            } else if (item.is_customer_item) {
                // Standalone service
                result.push({
                    name: item.item_name,
                    price: Number(item.unit_price) * (item.quantity || 1),
                });
                i++;
            } else {
                // Sale item
                result.push({
                    name: item.item_name,
                    price: Number(item.total_price),
                });
                i++;
            }
        }
        return result;
    }, [order?.items]);

    const calculateTotal = () => {
        let totalIncrement = 0;
        customerItems.forEach(item => {
            item.services.forEach((s: any) => {
                const currentPrice = Number(s.price) || 0;
                const originalPrice = s.is_existing ? (Number(s.original_price) || 0) : 0;
                totalIncrement += (currentPrice - originalPrice);
            });
        });
        saleItems.forEach(item => {
            const currentTotal = (Number(item.unit_price) || 0) * (item.quantity || 1);
            const originalTotal = item.is_existing ? ((Number(item.original_price) || 0) * (item.original_quantity || 1)) : 0;
            totalIncrement += (currentTotal - originalTotal);
        });
        return totalIncrement;
    };

    const handleUpsell = async () => {
        const totalAmount = calculateTotal();
        if (totalAmount <= 0 && customerItems.length === 0 && saleItems.length === 0) {
            toast.warning('Vui lòng thêm mục mới hoặc thay đổi giá để đề xuất upsell');
            return;
        }

        for (const item of customerItems) {
            if (!item.name.trim()) {
                toast.warning('Vui lòng nhập tên sản phẩm');
                return;
            }
            if (item.services.length === 0) {
                toast.warning(`Vui lòng chọn dịch vụ cho ${item.name}`);
                return;
            }
        }

        setLoading(true);
        try {
            const data = {
                customer_items: customerItems.map(item => ({
                    ...item,
                    services: item.services.map((s: any) => ({
                        id: s.is_existing ? s.db_id : s.id,
                        type: s.type,
                        name: s.name,
                        price: Number(s.price),
                        is_existing: s.is_existing
                    }))
                })),
                sale_items: saleItems.map(item => ({
                    id: item.id,
                    product_id: item.product_id || item.id,
                    name: item.name,
                    quantity: item.quantity,
                    unit_price: Number(item.unit_price),
                    is_existing: item.is_existing
                })),
                notes,
                total_amount: totalAmount
            };

            const response = await ordersApi.createUpsellTicket(orderId, data);
            if (response.data.status === 'success') {
                toast.success(response.data.message || 'Đã gửi yêu cầu upsell thành công.');
                onOpenChange(false);
                if (onSuccess) onSuccess();
            }
        } catch (error: any) {
            console.error('Upsell error:', error);
            toast.error(error.response?.data?.message || 'Có lỗi xảy ra khi thực hiện upsell');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-6xl h-[92vh] flex flex-col p-0 overflow-hidden border-none shadow-2xl bg-white">
                <DialogHeader className="px-6 py-4 bg-gradient-to-r from-indigo-600 to-violet-600 text-white flex-shrink-0">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="bg-white/20 p-2 rounded-lg backdrop-blur-sm">
                                <Sparkles className="h-5 w-5 text-yellow-300 fill-yellow-300" />
                            </div>
                            <div>
                                <DialogTitle className="text-xl font-bold">
                                    Đề xuất Upsell
                                </DialogTitle>
                                <DialogDescription className="text-indigo-100 text-xs italic">
                                    Gia tăng giá trị đơn hàng bằng cách đề xuất thêm dịch vụ hoặc sản phẩm.
                                </DialogDescription>
                            </div>
                        </div>
                        {order && (
                            <div className="text-right hidden sm:block">
                                <p className="text-[10px] uppercase font-bold text-indigo-200 tracking-wider">Mã đơn hàng</p>
                                <p className="font-mono font-bold">#{order.order_code || orderId.slice(-6).toUpperCase()}</p>
                            </div>
                        )}
                    </div>
                </DialogHeader>

                <div className="flex-1 min-h-0 flex bg-slate-50 overflow-hidden">
                    {/* Left Sidebar - Order Context */}
                    <div className="w-80 border-r bg-white flex flex-col hidden lg:flex">
                        <div className="p-6 border-b bg-slate-50/50">
                            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-4">
                                <Info className="h-4 w-4 text-indigo-500" />
                                Thông tin đơn hàng
                            </h3>
                            <div className="space-y-4">
                                <div>
                                    <Label className="text-[10px] font-bold text-slate-400 uppercase">Khách hàng</Label>
                                    <p className="text-sm font-semibold text-slate-700">{order?.customer?.name || 'N/A'}</p>
                                    <p className="text-xs text-slate-500">{order?.customer?.phone || ''}</p>
                                </div>
                                <div>
                                    <Label className="text-[10px] font-bold text-slate-400 uppercase">Giá trị hiện tại</Label>
                                    <p className="text-lg font-black text-slate-800">{formatCurrency(order?.total_amount || 0)}</p>
                                </div>
                                <div>
                                    <Label className="text-[10px] font-bold text-slate-400 uppercase">Trạng thái</Label>
                                    <div className="mt-1">
                                        <Badge variant="outline" className="bg-blue-50 text-blue-600 border-blue-100 text-[10px]">
                                            {order?.status || 'Đang xử lý'}
                                        </Badge>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="flex-1 overflow-hidden flex flex-col">
                            <div className="p-4 bg-slate-50 border-b">
                                <span className="text-[10px] font-bold text-slate-500 uppercase">Sản phẩm hiện có ({order?.items?.filter((i: any) => i.item_type === 'product').length || 0})</span>
                            </div>
                            <ScrollArea className="flex-1 p-4">
                                <div className="space-y-3">
                                    {sidebarItems.map((item: any, idx: number) => (
                                        <div key={idx} className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                                            <p className="text-xs font-bold text-slate-700 line-clamp-1">{item.name}</p>
                                            <p className="text-[10px] text-slate-500">{formatCurrency(item.price)}</p>
                                        </div>
                                    ))}
                                </div>
                            </ScrollArea>
                        </div>
                    </div>

                    {/* Main Content Areas */}
                    <div className="flex-1 flex flex-col min-w-0">
                        <Tabs defaultValue="customer_items" className="flex-1 flex flex-col min-h-0">
                            <div className="px-6 pt-6 flex-shrink-0">
                                <TabsList className="grid w-full grid-cols-2 bg-slate-100 p-1 rounded-xl border">
                                    <TabsTrigger value="customer_items" className="flex items-center gap-2 rounded-lg py-2 data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-sm text-sm font-medium">
                                        <Wrench className="h-4 w-4" />
                                        Dịch vụ / Gửi đồ mới
                                    </TabsTrigger>
                                    <TabsTrigger value="sale_items" className="flex items-center gap-2 rounded-lg py-2 data-[state=active]:bg-white data-[state=active]:text-violet-700 data-[state=active]:shadow-sm text-sm font-medium">
                                        <Package className="h-4 w-4" />
                                        Sản phẩm bán kèm
                                    </TabsTrigger>
                                </TabsList>
                            </div>

                            <div className="flex-1 min-h-0 relative p-6 pt-4">
                                <TabsContent value="customer_items" className="absolute inset-x-6 inset-y-4 m-0 focus-visible:outline-none data-[state=active]:flex flex-col min-h-0">
                                    <ScrollArea className="flex-1 -mr-4 pr-4">
                                        <div className="space-y-4 pb-6">
                                            {customerItems.map((item, index) => (
                                                <Card key={index} className="border border-slate-200 shadow-none overflow-hidden bg-white hover:border-indigo-200 transition-colors">
                                                    <div className="bg-slate-50/80 px-4 py-2 border-b flex justify-between items-center">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Hạng mục #{index + 1}</span>
                                                            {item.is_existing && (
                                                                <Badge variant="secondary" className="bg-indigo-50 text-indigo-600 border-indigo-100 text-[9px] h-4 py-0">
                                                                    Sẵn có
                                                                </Badge>
                                                            )}
                                                        </div>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="text-slate-400 hover:text-red-500 h-6 w-6"
                                                            onClick={() => removeCustomerItem(index)}
                                                            disabled={item.is_existing}
                                                        >
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                        </Button>
                                                    </div>
                                                    <CardContent className="p-4 space-y-4">
                                                        <div className="grid grid-cols-12 gap-3">
                                                            <div className="col-span-8 space-y-1.5">
                                                                <Label className="text-[10px] font-bold text-slate-500 uppercase">Tên sản phẩm / Model</Label>
                                                                <Input
                                                                    placeholder="VD: Jordan 1 High OG..."
                                                                    value={item.name}
                                                                    className="h-9 border-slate-200 focus:border-indigo-500 bg-white text-sm"
                                                                    onChange={(e) => updateCustomerItem(index, 'name', e.target.value)}
                                                                    disabled={item.is_existing}
                                                                />
                                                            </div>
                                                            <div className="col-span-4 space-y-1.5">
                                                                <Label className="text-[10px] font-bold text-slate-500 uppercase">Loại</Label>
                                                                <Select
                                                                    value={item.type}
                                                                    onValueChange={(val) => updateCustomerItem(index, 'type', val)}
                                                                >
                                                                    <SelectTrigger className="h-9 border-slate-200 bg-white text-sm" disabled={item.is_existing}>
                                                                        <SelectValue placeholder="Loại" />
                                                                    </SelectTrigger>
                                                                    <SelectContent>
                                                                        <SelectItem value="giày">Giày</SelectItem>
                                                                        <SelectItem value="túi">Túi xách</SelectItem>
                                                                        <SelectItem value="ví">Ví</SelectItem>
                                                                        <SelectItem value="thắt lưng">Thắt lưng</SelectItem>
                                                                        <SelectItem value="dép">Dép</SelectItem>
                                                                        <SelectItem value="mũ">Mũ/Nón</SelectItem>
                                                                        <SelectItem value="khác">Khác</SelectItem>
                                                                    </SelectContent>
                                                                </Select>
                                                            </div>
                                                        </div>

                                                        {item.is_existing && (
                                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                                                <div className="space-y-1.5">
                                                                    <Label className="text-[10px] font-bold text-slate-500 uppercase">Hãng</Label>
                                                                    <div className="h-8 flex items-center px-3 border border-slate-200 bg-slate-50 text-xs rounded-md text-slate-600 truncate">{item.brand || '---'}</div>
                                                                </div>
                                                                <div className="space-y-1.5">
                                                                    <Label className="text-[10px] font-bold text-slate-500 uppercase">Màu sắc</Label>
                                                                    <div className="h-8 flex items-center px-3 border border-slate-200 bg-slate-50 text-xs rounded-md text-slate-600 truncate">{item.color || '---'}</div>
                                                                </div>
                                                                <div className="space-y-1.5">
                                                                    <Label className="text-[10px] font-bold text-slate-500 uppercase">Chất liệu</Label>
                                                                    <div className="h-8 flex items-center px-3 border border-slate-200 bg-slate-50 text-xs rounded-md text-slate-600 truncate">{item.material || '---'}</div>
                                                                </div>
                                                            </div>
                                                        )}

                                                        <div className="space-y-2.5 bg-slate-50/50 p-3 rounded-xl border border-dashed border-slate-200">
                                                            <div className="flex items-center justify-between gap-4">
                                                                <div className="flex items-center gap-2">
                                                                    <Wrench className="h-3.5 w-3.5 text-indigo-500" />
                                                                    <span className="text-[10px] font-bold text-slate-700 uppercase">Dịch vụ áp dụng</span>
                                                                </div>
                                                                <div className="w-48">
                                                                    <ServiceSelector
                                                                        services={services}
                                                                        packages={packages}
                                                                        productType={item.type}
                                                                        onSelect={(svc) => addServiceToItem(index, svc)}
                                                                    />
                                                                </div>
                                                            </div>

                                                            <div className="space-y-1.5">
                                                                {item.services.length === 0 ? (
                                                                    <div className="py-2 text-center border border-dashed rounded-lg">
                                                                        <p className="text-[10px] text-slate-400 italic">Chưa chọn dịch vụ nào.</p>
                                                                    </div>
                                                                ) : (
                                                                    item.services.map((svc: any, sIdx: number) => (
                                                                        <div key={sIdx} className="flex items-center gap-2 bg-white border border-slate-100 p-2 rounded-lg shadow-sm">
                                                                            <span className="text-xs font-medium text-slate-700 flex-1 truncate">{svc.name}</span>
                                                                            <div className="w-24">
                                                                                <FormattedNumberInput
                                                                                    className="h-7 text-[11px] text-right border-slate-200 focus:border-indigo-500"
                                                                                    value={svc.price}
                                                                                    onChange={(val) => updateServicePrice(index, sIdx, val)}
                                                                                />
                                                                            </div>
                                                                            <Badge variant="outline" className={`text-[8px] h-4 py-0 px-1 ${svc.is_existing ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-blue-50 text-blue-600 border-blue-100'}`}>
                                                                                {svc.is_existing ? 'Đã có' : 'Mới'}
                                                                            </Badge>
                                                                            <button
                                                                                onClick={() => removeServiceFromItem(index, sIdx)}
                                                                                className="hover:bg-red-50 text-red-400 rounded-md p-0.5 transition-colors"
                                                                                disabled={svc.is_existing}
                                                                            >
                                                                                <Trash2 className="h-3.5 w-3.5" />
                                                                            </button>
                                                                        </div>
                                                                    ))
                                                                )}
                                                            </div>
                                                        </div>
                                                    </CardContent>
                                                </Card>
                                            ))}

                                            <Button
                                                variant="outline"
                                                className="w-full border-dashed border-2 py-6 flex flex-col items-center gap-2 hover:bg-indigo-50/50 hover:border-indigo-300 hover:text-indigo-600 transition-all bg-transparent group"
                                                onClick={addCustomerItem}
                                            >
                                                <Plus className="h-4 w-4 text-slate-400 group-hover:text-indigo-500" />
                                                <span className="text-xs text-slate-500 group-hover:text-indigo-600 font-medium">Thêm sản phẩm khách gửi mới</span>
                                            </Button>
                                        </div>
                                    </ScrollArea>
                                </TabsContent>

                                <TabsContent value="sale_items" className="absolute inset-x-6 inset-y-4 m-0 focus-visible:outline-none data-[state=active]:flex flex-col min-h-0 gap-4">
                                    <div className="space-y-2 flex-shrink-0">
                                        <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">Catalog sản phẩm</Label>
                                        <ScrollArea className="w-full whitespace-nowrap pb-2">
                                            <div className="flex gap-2 p-1">
                                                {catalogProducts.filter(p => p.status === 'active' && (p.stock || 0) > 0).map(product => (
                                                    <Button
                                                        key={product.id}
                                                        variant="outline"
                                                        size="sm"
                                                        className="h-auto py-2 flex-col items-start gap-0.5 w-[130px] flex-shrink-0 bg-white border-slate-200 hover:border-violet-300 hover:bg-violet-50 transition-all text-left"
                                                        onClick={() => addSaleItem(product)}
                                                    >
                                                        <span className="text-[10px] font-bold line-clamp-1">{product.name}</span>
                                                        <span className="text-[10px] text-emerald-600 font-bold">{formatCurrency(product.price)}</span>
                                                        <span className="text-[8px] text-slate-400">Kho: {product.stock || 0}</span>
                                                    </Button>
                                                ))}
                                            </div>
                                        </ScrollArea>
                                    </div>

                                    <div className="flex-1 min-h-0 flex flex-col min-w-0">
                                        <div className="flex items-center justify-between mb-2 flex-shrink-0">
                                            <Label className="text-[10px] font-bold text-slate-500 uppercase">Sản phẩm đã chọn</Label>
                                            <span className="text-[10px] text-slate-400">{saleItems.length} mặt hàng</span>
                                        </div>
                                        <ScrollArea className="flex-1 bg-white border border-slate-200 rounded-xl shadow-sm">
                                            <div className="p-3 space-y-2">
                                                {saleItems.length === 0 ? (
                                                    <div className="flex flex-col items-center justify-center py-8 text-slate-300">
                                                        <ShoppingBag className="h-8 w-8 mb-2" />
                                                        <p className="text-[11px]">Chưa có sản phẩm nào</p>
                                                    </div>
                                                ) : (
                                                    saleItems.map(item => (
                                                        <div key={item.id} className="flex items-center justify-between group bg-slate-50/50 p-2 rounded-lg hover:bg-violet-50/30 transition-colors border border-slate-100">
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-xs font-bold text-slate-700 truncate">{item.name}</p>
                                                                <div className="mt-1 w-24">
                                                                    <FormattedNumberInput
                                                                        className="h-6 text-[10px] text-emerald-600 font-bold border-emerald-100 text-right"
                                                                        value={item.unit_price}
                                                                        onChange={(val) => updateSaleItemPrice(item.id, val)}
                                                                    />
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-3">
                                                                <div className="flex items-center bg-white border rounded-md shadow-sm h-7">
                                                                    <button
                                                                        className="w-6 h-full flex items-center justify-center hover:bg-slate-50 text-slate-500 text-xs"
                                                                        onClick={() => updateSaleItemQuantity(item.id, item.quantity - 1)}
                                                                    >
                                                                        -
                                                                    </button>
                                                                    <span className="w-6 text-center text-xs font-bold text-slate-700">{item.quantity}</span>
                                                                    <button
                                                                        className="w-6 h-full flex items-center justify-center hover:bg-slate-50 text-slate-500 text-xs"
                                                                        onClick={() => updateSaleItemQuantity(item.id, item.quantity + 1)}
                                                                    >
                                                                        +
                                                                    </button>
                                                                </div>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="text-slate-300 hover:text-red-500 h-7 w-7"
                                                                    onClick={() => removeSaleItem(item.id)}
                                                                    disabled={item.is_existing}
                                                                >
                                                                    <Trash2 className="h-3.5 w-3.5" />
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                        </ScrollArea>
                                    </div>
                                </TabsContent>
                            </div>
                        </Tabs>

                        <div className="px-6 pb-6 bg-slate-50 flex-shrink-0">
                            <Label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Ghi chú cho quản lý</Label>
                            <Input
                                placeholder="Lý do upsell, thỏa thuận với khách..."
                                className="h-10 border-slate-200 focus:border-indigo-500 bg-white text-sm"
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                            />
                        </div>
                    </div>
                </div>

                <div className="bg-white px-6 py-4 flex items-center justify-between border-t shadow-[0_-4px_20px_-5px_rgba(0,0,0,0.05)] flex-shrink-0">
                    <div className="flex items-center gap-6">
                        <div className="flex flex-col">
                            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Tổng đơn sau Upsell</span>
                            <div className="flex items-baseline gap-1">
                                <span className="text-lg font-bold text-slate-700">{((order?.total_amount || 0) + calculateTotal()).toLocaleString()}</span>
                                <span className="text-[10px] font-bold text-slate-400">VNĐ</span>
                            </div>
                        </div>
                        <div className="w-px h-8 bg-slate-100" />
                        <div className="flex flex-col">
                            <span className="text-[10px] uppercase font-bold text-indigo-400 tracking-wider">Giá trị tăng thêm</span>
                            <div className="flex items-baseline gap-1">
                                <span className="text-2xl font-black text-indigo-600">{calculateTotal().toLocaleString()}</span>
                                <span className="text-[10px] font-bold text-indigo-400 pr-1">VNĐ</span>
                            </div>
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <Button variant="outline" className="px-5 h-10 font-bold text-slate-600 text-sm border-slate-200" onClick={() => onOpenChange(false)}>
                            Bỏ qua
                        </Button>
                        <Button
                            className="bg-indigo-600 hover:bg-indigo-700 px-6 h-10 font-bold shadow-lg shadow-indigo-200 text-sm"
                            onClick={handleUpsell}
                            disabled={loading}
                        >
                            {loading ? "Đang xử lý..." : "Xác nhận Upsell"}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
