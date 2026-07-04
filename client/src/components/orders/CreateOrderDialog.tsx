import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Plus, Trash, Package, Gift, Search, Sparkles, ShoppingBag, Loader2, User, Wrench, QrCode } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatCurrency } from '@/lib/utils';
import type { Package as PackageType, Voucher, User as UserType } from '@/types';
import { getItemTypeLabel, getItemTypeColor, type CreateOrderData, type OrderItem, type CustomerOption } from './constants';

// Simple helper to display department - look up name from ID
const getDepartmentLabel = (deptId: string | undefined, departments: { id: string; name: string }[]) => {
    if (!deptId) return '';
    const dept = departments.find(d => d.id === deptId);
    return dept?.name || '';
};

interface CreateOrderDialogProps {
    open: boolean;
    onClose: () => void;
    onSubmit: (data: CreateOrderData) => Promise<void>;
    customers: CustomerOption[];
    products: { id: string; name: string; price: number; image?: string; commission_sale?: number; commission_tech?: number }[];
    services: { id: string; name: string; price: number; image?: string; department?: string; commission_sale?: number; commission_tech?: number }[];
    packages: PackageType[];
    vouchers: Voucher[];
    technicians?: UserType[]; // List of technicians for assignment
    departments?: { id: string; name: string }[]; // Departments for lookup
    initialCustomer?: { id?: string; name: string; phone: string }; // Pre-populated from lead
}

export function CreateOrderDialog({
    open,
    onClose,
    onSubmit,
    customers,
    products,
    services,
    packages,
    vouchers,
    technicians = [],
    departments = [],
    initialCustomer
}: CreateOrderDialogProps) {
    const [customerId, setCustomerId] = useState('');
    const [customerSearch, setCustomerSearch] = useState('');
    const [notes, setNotes] = useState('');
    const [manualDiscount, setManualDiscount] = useState(0);
    const [itemSearch, setItemSearch] = useState('');
    const [activeTab, setActiveTab] = useState('product');
    const [appliedVoucher, setAppliedVoucher] = useState<Voucher | null>(null);
    const [items, setItems] = useState<OrderItem[]>([]);
    const [submitting, setSubmitting] = useState(false);

    // When dialog opens with initialCustomer, find matching customer or show search
    useEffect(() => {
        if (open && initialCustomer) {
            // Try to find customer by phone
            const matchedCustomer = customers.find(c => c.phone === initialCustomer.phone);
            if (matchedCustomer) {
                setCustomerId(matchedCustomer.id);
                setCustomerSearch('');
            } else {
                // Set search to help find the customer
                setCustomerSearch(initialCustomer.phone || initialCustomer.name);
            }
        }
    }, [open, initialCustomer, customers]);

    // Filter only active customers
    const activeCustomers = customers.filter(c => c.status === 'active' || !c.status);

    // Filter customers by search
    const filteredCustomers = activeCustomers.filter(c =>
        c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
        c.phone.includes(customerSearch)
    );

    // Get selected customer info
    const selectedCustomer = customers.find(c => c.id === customerId);

    // Filter technicians by department (role = tech or technician)
    const availableTechnicians = technicians.filter(t =>
        t.role === 'technician' || t.role === 'tech' as string
    );

    // Get technicians for a specific department
    const getTechniciansForDepartment = (department?: string) => {
        if (!department) return availableTechnicians;
        return availableTechnicians.filter(t =>
            t.department?.toLowerCase().includes(department.toLowerCase()) ||
            !t.department // Show technicians without department as available
        );
    };

    // Generate unique item code for QR
    const generateItemCode = () => {
        const timestamp = Date.now().toString(36).toUpperCase();
        const random = Math.random().toString(36).substring(2, 6).toUpperCase();
        return `IT${timestamp}${random}`;
    };

    // Filter items by search
    const filteredProducts = products.filter(p =>
        p.name.toLowerCase().includes(itemSearch.toLowerCase())
    );
    const filteredServices = services.filter(s =>
        s.name.toLowerCase().includes(itemSearch.toLowerCase())
    );
    const filteredPackages = packages.filter(p =>
        p.name.toLowerCase().includes(itemSearch.toLowerCase()) &&
        p.status === 'active'
    );
    const filteredVouchers = vouchers.filter(v =>
        (v.name.toLowerCase().includes(itemSearch.toLowerCase()) ||
            v.code.toLowerCase().includes(itemSearch.toLowerCase())) &&
        v.status === 'active'
    );

    const handleAddItem = (type: 'product' | 'service' | 'package' | 'voucher', itemId: string) => {
        // Handle voucher separately - apply as discount
        if (type === 'voucher') {
            const voucher = vouchers.find(i => i.id === itemId);
            if (voucher) {
                // Check if already applied
                if (appliedVoucher?.id === voucher.id) {
                    toast.info('Voucher này đã được áp dụng');
                    return;
                }
                setAppliedVoucher(voucher);
                toast.success(`Đã áp dụng voucher: ${voucher.name}`);
            }
            return;
        }

        let item: { id: string; name: string; price: number; department?: string; commission_sale?: number; commission_tech?: number } | undefined;
        let packageServices: { service_id: string; service_name: string; department?: string }[] | undefined;

        if (type === 'product') {
            const prod = products.find(i => i.id === itemId);
            if (prod) {
                item = { id: prod.id, name: prod.name, price: prod.price, commission_sale: prod.commission_sale, commission_tech: prod.commission_tech };
            }
        } else if (type === 'service') {
            const svc = services.find(i => i.id === itemId);
            if (svc) {
                item = { id: svc.id, name: svc.name, price: svc.price, department: svc.department, commission_sale: svc.commission_sale, commission_tech: svc.commission_tech };
            }
        } else if (type === 'package') {
            const pkg = packages.find(i => i.id === itemId);
            if (pkg) {
                item = { id: pkg.id, name: pkg.name, price: pkg.price, commission_sale: pkg.commission_sale, commission_tech: pkg.commission_tech };
                // Get services in package with their department info
                if (pkg.items && pkg.items.length > 0) {
                    packageServices = pkg.items
                        .filter(pkgItem => pkgItem.service_id)
                        .map(pkgItem => {
                            const svc = services.find(s => s.id === pkgItem.service_id);
                            return {
                                service_id: pkgItem.service_id as string,
                                service_name: svc?.name || pkgItem.service_name || 'Dịch vụ',
                                department: svc?.department
                            };
                        })
                        .filter(s => !!s.department); // Only include services with department
                }
            }
        }

        if (!item) return;

        // Check if item already exists
        const existingIndex = items.findIndex(i => i.item_id === itemId && i.type === type);
        if (existingIndex >= 0) {
            // Increase quantity
            setItems(prev => prev.map((item, i) =>
                i === existingIndex ? { ...item, quantity: item.quantity + 1 } : item
            ));
        } else {
            setItems(prev => [...prev, {
                type,
                item_id: item!.id,
                item_code: generateItemCode(),
                name: item!.name,
                quantity: 1,
                unit_price: item!.price,
                commission_sale: item!.commission_sale || 0,
                commission_tech: item!.commission_tech || 0,
                department: item!.department,
                package_services: type === 'package' && packageServices && packageServices.length > 0 ? packageServices : undefined
            }]);
        }

        // Clear search after adding
        setItemSearch('');
    };

    const handleRemoveVoucher = () => {
        setAppliedVoucher(null);
        toast.info('Đã gỡ voucher');
    };

    const handleRemoveItem = (index: number) => {
        setItems(prev => prev.filter((_, i) => i !== index));
    };

    const handleUpdateQuantity = (index: number, quantity: number) => {
        if (quantity < 1) return;
        setItems(prev => prev.map((item, i) => i === index ? { ...item, quantity } : item));
    };

    const handleUpdateCommission = (index: number, field: 'commission_sale' | 'commission_tech', value: number) => {
        if (value < 0 || value > 100) return;
        setItems(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item));
    };

    // Toggle technician selection with commission (multi-select)
    const handleToggleTechnician = (index: number, technicianId: string, technicianName: string, defaultCommission: number = 0) => {
        setItems(prev => prev.map((item, i) => {
            if (i !== index) return item;
            const currentTechs = item.technicians || [];
            const exists = currentTechs.find(t => t.technician_id === technicianId);
            const newTechs = exists
                ? currentTechs.filter(t => t.technician_id !== technicianId)
                : [...currentTechs, { technician_id: technicianId, technician_name: technicianName, commission_rate: defaultCommission }];
            return { ...item, technicians: newTechs.length > 0 ? newTechs : undefined };
        }));
    };

    // Update commission rate for a specific technician
    const handleUpdateTechnicianCommission = (index: number, technicianId: string, commissionRate: number) => {
        setItems(prev => prev.map((item, i) => {
            if (i !== index || !item.technicians) return item;
            return {
                ...item,
                technicians: item.technicians.map(t =>
                    t.technician_id === technicianId ? { ...t, commission_rate: commissionRate } : t
                )
            };
        }));
    };

    // Toggle technician for a specific service within a package
    const handleTogglePackageServiceTechnician = (itemIndex: number, serviceId: string, technicianId: string, technicianName: string, defaultCommission: number = 0) => {
        setItems(prev => prev.map((item, i) => {
            if (i !== itemIndex || !item.package_services) return item;
            return {
                ...item,
                package_services: item.package_services.map(svc => {
                    if (svc.service_id !== serviceId) return svc;
                    const currentTechs = svc.technicians || [];
                    const exists = currentTechs.find(t => t.technician_id === technicianId);
                    const newTechs = exists
                        ? currentTechs.filter(t => t.technician_id !== technicianId)
                        : [...currentTechs, { technician_id: technicianId, technician_name: technicianName, commission_rate: defaultCommission }];
                    return { ...svc, technicians: newTechs.length > 0 ? newTechs : undefined };
                })
            };
        }));
    };

    // Update commission rate for technician in package service
    const handleUpdatePackageServiceTechnicianCommission = (itemIndex: number, serviceId: string, technicianId: string, commissionRate: number) => {
        setItems(prev => prev.map((item, i) => {
            if (i !== itemIndex || !item.package_services) return item;
            return {
                ...item,
                package_services: item.package_services.map(svc => {
                    if (svc.service_id !== serviceId || !svc.technicians) return svc;
                    return {
                        ...svc,
                        technicians: svc.technicians.map(t =>
                            t.technician_id === technicianId ? { ...t, commission_rate: commissionRate } : t
                        )
                    };
                })
            };
        }));
    };

    // Calculate totals
    const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);

    // Calculate voucher discount
    const voucherDiscount = appliedVoucher
        ? (appliedVoucher.type === 'percentage'
            ? Math.min(
                (subtotal * appliedVoucher.value) / 100,
                appliedVoucher.max_discount || Infinity
            )
            : appliedVoucher.value)
        : 0;

    // Check min order value for voucher
    const voucherValid = !appliedVoucher || subtotal >= (appliedVoucher.min_order_value || 0);
    const effectiveVoucherDiscount = voucherValid ? voucherDiscount : 0;

    // Total discount = voucher + manual discount
    const totalDiscount = effectiveVoucherDiscount + manualDiscount;
    const total = Math.max(0, subtotal - totalDiscount);

    const handleSubmit = async () => {
        if (!customerId || items.length === 0) {
            toast.error('Vui lòng chọn khách hàng và thêm ít nhất một sản phẩm/dịch vụ');
            return;
        }

        if (appliedVoucher && !voucherValid) {
            toast.error(`Đơn hàng phải đạt tối thiểu ${formatCurrency(appliedVoucher.min_order_value || 0)} để áp dụng voucher`);
            return;
        }

        setSubmitting(true);
        try {
            await onSubmit({
                customer_id: customerId,
                items: items.map(item => ({
                    type: item.type,
                    item_id: item.item_id,
                    name: item.name,
                    quantity: item.quantity,
                    unit_price: item.unit_price,
                    technicians: item.technicians
                })),
                notes: notes || undefined,
                discount: totalDiscount > 0 ? totalDiscount : undefined
            });
            // Reset form
            setCustomerId('');
            setCustomerSearch('');
            setNotes('');
            setManualDiscount(0);
            setAppliedVoucher(null);
            setItems([]);
            setItemSearch('');
            onClose();
        } catch {
            // Error handled in parent
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <ShoppingBag className="h-5 w-5 text-primary" />
                        Tạo đơn hàng mới
                    </DialogTitle>
                    <DialogDescription>Chọn khách hàng và thêm sản phẩm/dịch vụ vào đơn hàng</DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto space-y-4 py-4">
                    {/* Customer Selection with Search */}
                    <div className="space-y-2">
                        <Label className="flex items-center gap-1">
                            <User className="h-4 w-4" />
                            Khách hàng <span className="text-red-500">*</span>
                            <span className="text-xs text-muted-foreground ml-2">(Chỉ hiển thị khách hàng đang hoạt động)</span>
                        </Label>

                        {selectedCustomer ? (
                            <div className="flex items-center gap-3 p-3 bg-primary/5 rounded-lg border border-primary/20">
                                <Avatar className="h-10 w-10">
                                    <AvatarFallback className="bg-primary text-white">
                                        {selectedCustomer.name.charAt(0)}
                                    </AvatarFallback>
                                </Avatar>
                                <div className="flex-1">
                                    <p className="font-semibold">{selectedCustomer.name}</p>
                                    <p className="text-sm text-muted-foreground">{selectedCustomer.phone}</p>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setCustomerId('')}
                                    className="text-muted-foreground hover:text-foreground"
                                >
                                    Thay đổi
                                </Button>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        placeholder="Tìm kiếm theo tên hoặc số điện thoại..."
                                        value={customerSearch}
                                        onChange={(e) => setCustomerSearch(e.target.value)}
                                        className="pl-9"
                                    />
                                </div>
                                <div className="max-h-40 overflow-y-auto border rounded-lg">
                                    {filteredCustomers.length === 0 ? (
                                        <p className="text-sm text-muted-foreground text-center py-4">
                                            Không tìm thấy khách hàng
                                        </p>
                                    ) : (
                                        <div className="divide-y">
                                            {filteredCustomers.slice(0, 10).map(c => (
                                                <button
                                                    key={c.id}
                                                    type="button"
                                                    onClick={() => {
                                                        setCustomerId(c.id);
                                                        setCustomerSearch('');
                                                    }}
                                                    className="w-full flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors text-left"
                                                >
                                                    <Avatar className="h-8 w-8">
                                                        <AvatarFallback className="text-xs bg-primary/10 text-primary">
                                                            {c.name.charAt(0)}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="font-medium text-sm truncate">{c.name}</p>
                                                        <p className="text-xs text-muted-foreground">{c.phone}</p>
                                                    </div>
                                                </button>
                                            ))}
                                            {filteredCustomers.length > 10 && (
                                                <p className="text-xs text-center py-2 text-muted-foreground">
                                                    Và {filteredCustomers.length - 10} khách hàng khác...
                                                </p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Add Items with Tabs */}
                    <div className="space-y-3">
                        <Label className="flex items-center gap-1">
                            <Plus className="h-4 w-4" />
                            Thêm vào đơn hàng
                        </Label>

                        <Tabs value={activeTab} onValueChange={setActiveTab}>
                            <TabsList className="grid grid-cols-4 w-full">
                                <TabsTrigger value="product" className="gap-1">
                                    <ShoppingBag className="h-3.5 w-3.5" />
                                    <span className="hidden sm:inline">Sản phẩm</span>
                                    <span className="sm:hidden">SP</span>
                                    <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                                        {products.length}
                                    </Badge>
                                </TabsTrigger>
                                <TabsTrigger value="service" className="gap-1">
                                    <Sparkles className="h-3.5 w-3.5" />
                                    <span className="hidden sm:inline">Dịch vụ</span>
                                    <span className="sm:hidden">DV</span>
                                    <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                                        {services.length}
                                    </Badge>
                                </TabsTrigger>
                                <TabsTrigger value="package" className="gap-1">
                                    <Package className="h-3.5 w-3.5" />
                                    <span className="hidden sm:inline">Gói DV</span>
                                    <span className="sm:hidden">Gói</span>
                                    <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                                        {packages.filter(p => p.status === 'active').length}
                                    </Badge>
                                </TabsTrigger>
                                <TabsTrigger value="voucher" className="gap-1">
                                    <Gift className="h-3.5 w-3.5" />
                                    <span className="hidden sm:inline">Voucher</span>
                                    <span className="sm:hidden">VC</span>
                                    <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                                        {vouchers.filter(v => v.status === 'active').length}
                                    </Badge>
                                </TabsTrigger>
                            </TabsList>

                            {/* Search */}
                            <div className="relative mt-3">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder={`Tìm kiếm ${activeTab === 'product' ? 'sản phẩm' : activeTab === 'service' ? 'dịch vụ' : activeTab === 'package' ? 'gói dịch vụ' : 'voucher'}...`}
                                    value={itemSearch}
                                    onChange={(e) => setItemSearch(e.target.value)}
                                    className="pl-9"
                                />
                            </div>

                            {/* Product Tab */}
                            <TabsContent value="product" className="mt-2">
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-48 overflow-y-auto p-1">
                                    {filteredProducts.length === 0 ? (
                                        <p className="col-span-full text-sm text-muted-foreground text-center py-4">
                                            Không tìm thấy sản phẩm
                                        </p>
                                    ) : (
                                        filteredProducts.map(p => (
                                            <button
                                                key={p.id}
                                                type="button"
                                                onClick={() => handleAddItem('product', p.id)}
                                                className="flex items-center gap-2 p-3 rounded-lg border hover:border-primary hover:bg-primary/5 transition-colors text-left"
                                            >
                                                {p.image ? (
                                                    <img src={p.image} alt={p.name} className="w-10 h-10 rounded-lg object-cover border shrink-0" />
                                                ) : (
                                                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                                                        <ShoppingBag className="h-4 w-4 text-muted-foreground" />
                                                    </div>
                                                )}
                                                <div className="flex-1 min-w-0">
                                                    <span className="font-medium text-sm truncate block">{p.name}</span>
                                                    <span className="text-primary font-semibold text-sm">{formatCurrency(p.price)}</span>
                                                </div>
                                            </button>
                                        ))
                                    )}
                                </div>
                            </TabsContent>

                            {/* Service Tab */}
                            <TabsContent value="service" className="mt-2">
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-48 overflow-y-auto p-1">
                                    {filteredServices.length === 0 ? (
                                        <p className="col-span-full text-sm text-muted-foreground text-center py-4">
                                            Không tìm thấy dịch vụ
                                        </p>
                                    ) : (
                                        filteredServices.map(s => (
                                            <button
                                                key={s.id}
                                                type="button"
                                                onClick={() => handleAddItem('service', s.id)}
                                                className="flex items-center gap-2 p-3 rounded-lg border hover:border-purple-500 hover:bg-purple-50 transition-colors text-left"
                                            >
                                                {s.image ? (
                                                    <img src={s.image} alt={s.name} className="w-10 h-10 rounded-lg object-cover border shrink-0" />
                                                ) : (
                                                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                                                        <Sparkles className="h-4 w-4 text-muted-foreground" />
                                                    </div>
                                                )}
                                                <div className="flex-1 min-w-0">
                                                    <span className="font-medium text-sm truncate block">{s.name}</span>
                                                    <span className="text-purple-600 font-semibold text-sm">{formatCurrency(s.price)}</span>
                                                    {s.department && getDepartmentLabel(s.department, departments) && (
                                                        <span className="text-xs text-muted-foreground block truncate">
                                                            {getDepartmentLabel(s.department, departments)}
                                                        </span>
                                                    )}
                                                </div>
                                            </button>
                                        ))
                                    )}
                                </div>
                            </TabsContent>

                            {/* Package Tab */}
                            <TabsContent value="package" className="mt-2">
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-48 overflow-y-auto p-1">
                                    {filteredPackages.length === 0 ? (
                                        <p className="col-span-full text-sm text-muted-foreground text-center py-4">
                                            Không có gói dịch vụ nào
                                        </p>
                                    ) : (
                                        filteredPackages.map(pkg => (
                                            <button
                                                key={pkg.id}
                                                type="button"
                                                onClick={() => handleAddItem('package', pkg.id)}
                                                className="flex flex-col items-start p-3 rounded-lg border hover:border-emerald-500 hover:bg-emerald-50 transition-colors text-left"
                                            >
                                                <div className="flex items-center gap-1 mb-1">
                                                    <Package className="h-3.5 w-3.5 text-emerald-600" />
                                                    <span className="font-medium text-sm truncate">{pkg.name}</span>
                                                </div>
                                                <span className="text-emerald-600 font-semibold">{formatCurrency(pkg.price)}</span>
                                                {pkg.items && pkg.items.length > 0 && (
                                                    <span className="text-xs text-muted-foreground mt-1">
                                                        {pkg.items.length} dịch vụ
                                                    </span>
                                                )}
                                            </button>
                                        ))
                                    )}
                                </div>
                            </TabsContent>

                            {/* Voucher Tab */}
                            <TabsContent value="voucher" className="mt-2">
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-48 overflow-y-auto p-1">
                                    {filteredVouchers.length === 0 ? (
                                        <p className="col-span-full text-sm text-muted-foreground text-center py-4">
                                            Không có voucher nào
                                        </p>
                                    ) : (
                                        filteredVouchers.map(v => (
                                            <button
                                                key={v.id}
                                                type="button"
                                                onClick={() => handleAddItem('voucher', v.id)}
                                                className="flex flex-col items-start p-3 rounded-lg border hover:border-amber-500 hover:bg-amber-50 transition-colors text-left"
                                            >
                                                <div className="flex items-center gap-1 mb-1">
                                                    <Gift className="h-3.5 w-3.5 text-amber-600" />
                                                    <span className="font-medium text-sm truncate">{v.name}</span>
                                                </div>
                                                <Badge variant="outline" className="text-xs">{v.code}</Badge>
                                                <span className="text-amber-600 font-semibold mt-1">
                                                    {v.type === 'percentage' ? `Giảm ${v.value}%` : formatCurrency(v.value)}
                                                </span>
                                            </button>
                                        ))
                                    )}
                                </div>
                            </TabsContent>
                        </Tabs>
                    </div>

                    {/* Items List */}
                    {items.length > 0 && (
                        <div className="space-y-2">
                            <Label className="flex items-center justify-between">
                                <span>Danh sách đã chọn ({items.length})</span>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-xs text-red-500 hover:text-red-600 h-7"
                                    onClick={() => setItems([])}
                                >
                                    Xóa tất cả
                                </Button>
                            </Label>
                            <div className="border rounded-lg divide-y max-h-64 overflow-y-auto">
                                {items.map((item, index) => (
                                    <div key={index} className="p-3 hover:bg-muted/30">
                                        <div className="flex items-center gap-3">
                                            <div className="shrink-0 p-1 bg-white border rounded-lg">
                                                {item.item_code ? (
                                                    <QRCodeSVG
                                                        value={`${window.location.origin}/item/${item.type}/${item.item_id}`}
                                                        size={40}
                                                        level="M"
                                                    />
                                                ) : (
                                                    <QrCode className="h-10 w-10 text-muted-foreground" />
                                                )}
                                            </div>
                                            <Badge className={`${getItemTypeColor(item.type)} shrink-0`}>
                                                {getItemTypeLabel(item.type)}
                                            </Badge>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-medium text-sm truncate">{item.name}</p>
                                                <p className="text-xs text-muted-foreground">{formatCurrency(item.unit_price)}</p>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <Button
                                                    variant="outline"
                                                    size="icon"
                                                    className="h-7 w-7"
                                                    onClick={() => handleUpdateQuantity(index, item.quantity - 1)}
                                                    disabled={item.quantity <= 1}
                                                >
                                                    -
                                                </Button>
                                                <Input
                                                    type="number"
                                                    min="1"
                                                    value={item.quantity}
                                                    onChange={(e) => handleUpdateQuantity(index, Number(e.target.value))}
                                                    className="w-14 text-center h-7"
                                                />
                                                <Button
                                                    variant="outline"
                                                    size="icon"
                                                    className="h-7 w-7"
                                                    onClick={() => handleUpdateQuantity(index, item.quantity + 1)}
                                                >
                                                    +
                                                </Button>
                                            </div>
                                            <div className="w-28 text-right font-semibold shrink-0">
                                                {formatCurrency(item.quantity * item.unit_price)}
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => handleRemoveItem(index)}
                                                className="text-red-500 hover:bg-red-50 shrink-0 h-8 w-8"
                                            >
                                                <Trash className="h-4 w-4" />
                                            </Button>
                                        </div>

                                        {/* Commission Display/Edit */}
                                        <div className="mt-2 ml-16 flex items-center gap-4 text-sm">
                                            <span className="text-muted-foreground">Hoa hồng:</span>
                                            <div className="flex items-center gap-1">
                                                <span className="text-xs text-muted-foreground">Sale</span>
                                                <Input
                                                    type="number"
                                                    min={0}
                                                    max={100}
                                                    value={item.commission_sale || 0}
                                                    onChange={(e) => handleUpdateCommission(index, 'commission_sale', Number(e.target.value))}
                                                    className="w-16 h-7 text-center text-xs"
                                                />
                                                <span className="text-xs text-muted-foreground">%</span>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <span className="text-xs text-muted-foreground">KTV</span>
                                                <Input
                                                    type="number"
                                                    min={0}
                                                    max={100}
                                                    value={item.commission_tech || 0}
                                                    onChange={(e) => handleUpdateCommission(index, 'commission_tech', Number(e.target.value))}
                                                    className="w-16 h-7 text-center text-xs"
                                                />
                                                <span className="text-xs text-muted-foreground">%</span>
                                            </div>
                                        </div>

                                        {/* Technician Assignment for Services */}
                                        {item.type === 'service' && (
                                            <div className="mt-2 ml-16">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <Wrench className="h-4 w-4 text-muted-foreground" />
                                                    <span className="text-sm text-muted-foreground">KTV:</span>
                                                    {item.department && (
                                                        <Badge variant="outline" className="text-xs">
                                                            {getDepartmentLabel(item.department, departments)}
                                                        </Badge>
                                                    )}
                                                </div>
                                                {availableTechnicians.length > 0 ? (
                                                    <div className="space-y-2 ml-6">
                                                        {/* Technician selection checkboxes */}
                                                        <div className="flex flex-wrap gap-3">
                                                            {getTechniciansForDepartment(item.department).map(tech => (
                                                                <label key={tech.id} className="flex items-center gap-1.5 cursor-pointer">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={item.technicians?.some(t => t.technician_id === tech.id) || false}
                                                                        onChange={() => handleToggleTechnician(index, tech.id, tech.name, 0)}
                                                                        className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                                                                    />
                                                                    <span className="text-sm">{tech.name}</span>
                                                                </label>
                                                            ))}
                                                        </div>
                                                        {/* Commission inputs for selected technicians */}
                                                        {item.technicians && item.technicians.length > 0 && (
                                                            <div className="mt-2 space-y-1 border-l-2 border-primary/30 pl-3">
                                                                {item.technicians.map(t => {
                                                                    const commissionAmount = Math.round(item.unit_price * item.quantity * t.commission_rate / 100);
                                                                    return (
                                                                        <div key={t.technician_id} className="flex items-center gap-2">
                                                                            <span className="text-xs text-muted-foreground w-28 truncate">{t.technician_name}</span>
                                                                            <span className="text-xs text-muted-foreground">Hoa hồng:</span>
                                                                            <input
                                                                                type="number"
                                                                                min="0"
                                                                                max="100"
                                                                                value={t.commission_rate || ''}
                                                                                onChange={(e) => handleUpdateTechnicianCommission(index, t.technician_id, Number(e.target.value) || 0)}
                                                                                onFocus={(e) => e.target.select()}
                                                                                placeholder="0"
                                                                                className="w-16 h-6 text-xs px-2 border rounded text-center"
                                                                            />
                                                                            <span className="text-xs text-muted-foreground">%</span>
                                                                            <span className="text-xs font-medium text-green-600 ml-1">
                                                                                = {formatCurrency(commissionAmount)}
                                                                            </span>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="text-xs text-muted-foreground italic ml-6">Không có KTV</span>
                                                )}
                                            </div>
                                        )}

                                        {/* Technician Assignment for Package Services */}
                                        {item.type === 'package' && item.package_services && item.package_services.length > 0 && availableTechnicians.length > 0 && (
                                            <div className="mt-2 ml-16 space-y-3 border-l-2 border-purple-200 pl-3">
                                                <span className="text-xs text-muted-foreground font-medium">Phân công KTV cho dịch vụ trong gói:</span>
                                                {item.package_services.map(svc => (
                                                    <div key={svc.service_id} className="space-y-2">
                                                        <div className="flex items-center gap-2">
                                                            <Wrench className="h-3 w-3 text-purple-500" />
                                                            <span className="text-xs font-medium text-foreground" title={svc.service_name}>
                                                                {svc.service_name}
                                                            </span>
                                                            {svc.department && (
                                                                <Badge variant="outline" className="text-xs">
                                                                    {getDepartmentLabel(svc.department, departments)}
                                                                </Badge>
                                                            )}
                                                        </div>
                                                        {/* Technician checkboxes */}
                                                        <div className="flex flex-wrap gap-2 ml-5">
                                                            {getTechniciansForDepartment(svc.department).map(tech => (
                                                                <label key={tech.id} className="flex items-center gap-1.5 cursor-pointer">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={svc.technicians?.some(t => t.technician_id === tech.id) || false}
                                                                        onChange={() => handleTogglePackageServiceTechnician(index, svc.service_id, tech.id, tech.name, 0)}
                                                                        className="w-3.5 h-3.5 rounded border-gray-300 text-primary focus:ring-primary"
                                                                    />
                                                                    <span className="text-xs">{tech.name}</span>
                                                                </label>
                                                            ))}
                                                        </div>
                                                        {/* Commission inputs for selected technicians */}
                                                        {svc.technicians && svc.technicians.length > 0 && (
                                                            <div className="ml-5 space-y-1 border-l-2 border-purple-200 pl-2">
                                                                {svc.technicians.map(t => (
                                                                    <div key={t.technician_id} className="flex items-center gap-2">
                                                                        <span className="text-xs text-muted-foreground w-24 truncate">{t.technician_name}</span>
                                                                        <span className="text-xs text-muted-foreground">Hoa hồng:</span>
                                                                        <input
                                                                            type="number"
                                                                            min="0"
                                                                            max="100"
                                                                            value={t.commission_rate}
                                                                            onChange={(e) => handleUpdatePackageServiceTechnicianCommission(index, svc.service_id, t.technician_id, Number(e.target.value))}
                                                                            className="w-14 h-5 text-xs px-1 border rounded text-center"
                                                                        />
                                                                        <span className="text-xs text-muted-foreground">%</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Applied Voucher */}
                    {appliedVoucher && (
                        <div className={`p-3 rounded-lg border ${voucherValid ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'}`}>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Gift className={`h-4 w-4 ${voucherValid ? 'text-amber-600' : 'text-red-600'}`} />
                                    <div>
                                        <span className={`font-medium text-sm ${voucherValid ? 'text-amber-700' : 'text-red-700'}`}>
                                            {appliedVoucher.name}
                                        </span>
                                        <Badge variant="outline" className="ml-2 text-xs">
                                            {appliedVoucher.code}
                                        </Badge>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className={`font-semibold ${voucherValid ? 'text-amber-700' : 'text-red-700'}`}>
                                        {appliedVoucher.type === 'percentage'
                                            ? `-${appliedVoucher.value}%`
                                            : `-${formatCurrency(appliedVoucher.value)}`}
                                    </span>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 text-red-500 hover:bg-red-100"
                                        onClick={handleRemoveVoucher}
                                    >
                                        <Trash className="h-3 w-3" />
                                    </Button>
                                </div>
                            </div>
                            {!voucherValid && appliedVoucher.min_order_value && (
                                <p className="text-xs text-red-600 mt-1">
                                    Đơn hàng tối thiểu {formatCurrency(appliedVoucher.min_order_value)} để áp dụng voucher này
                                </p>
                            )}
                            {appliedVoucher.max_discount && voucherValid && (
                                <p className="text-xs text-amber-600 mt-1">
                                    Giảm tối đa: {formatCurrency(appliedVoucher.max_discount)}
                                </p>
                            )}
                        </div>
                    )}

                    {/* Summary */}
                    {items.length > 0 && (
                        <div className="space-y-2 p-4 bg-gradient-to-r from-primary/5 to-primary/10 rounded-lg border border-primary/10">
                            <div className="flex justify-between text-sm">
                                <span>Tạm tính ({items.length} sản phẩm):</span>
                                <span className="font-semibold">{formatCurrency(subtotal)}</span>
                            </div>

                            {/* Voucher Discount */}
                            {appliedVoucher && voucherValid && effectiveVoucherDiscount > 0 && (
                                <div className="flex justify-between text-sm text-amber-600">
                                    <span className="flex items-center gap-1">
                                        <Gift className="h-3.5 w-3.5" />
                                        Voucher ({appliedVoucher.code}):
                                    </span>
                                    <span className="font-semibold">-{formatCurrency(effectiveVoucherDiscount)}</span>
                                </div>
                            )}

                            {/* Manual Discount */}
                            <div className="flex justify-between items-center">
                                <span className="text-sm">Giảm giá thêm:</span>
                                <div className="flex items-center gap-2">
                                    <Input
                                        type="number"
                                        min="0"
                                        max={subtotal - effectiveVoucherDiscount}
                                        value={manualDiscount}
                                        onChange={(e) => setManualDiscount(Math.min(subtotal - effectiveVoucherDiscount, Number(e.target.value)))}
                                        className="w-32 text-right h-8"
                                    />
                                </div>
                            </div>

                            {/* Total Discount */}
                            {totalDiscount > 0 && (
                                <div className="flex justify-between text-sm text-green-600 pt-1">
                                    <span>Tổng giảm:</span>
                                    <span className="font-semibold">-{formatCurrency(totalDiscount)}</span>
                                </div>
                            )}

                            <div className="flex justify-between text-lg font-bold pt-3 border-t border-primary/20">
                                <span>Tổng thanh toán:</span>
                                <span className="text-primary text-xl">{formatCurrency(total)}</span>
                            </div>
                        </div>
                    )}

                    {/* Notes */}
                    <div className="space-y-2">
                        <Label>Ghi chú</Label>
                        <textarea
                            className="w-full min-h-16 px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Ghi chú thêm về đơn hàng..."
                        />
                    </div>
                </div>

                <DialogFooter className="border-t pt-4">
                    <Button variant="outline" onClick={onClose} disabled={submitting}>Huỷ</Button>
                    <Button onClick={handleSubmit} disabled={submitting || !customerId || items.length === 0}>
                        {submitting ? (
                            <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Đang tạo...
                            </>
                        ) : (
                            <>
                                <Plus className="h-4 w-4 mr-2" />
                                Tạo đơn hàng
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
