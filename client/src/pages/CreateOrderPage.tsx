import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams, useParams, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import {
    ArrowLeft, ArrowRight, Plus, Trash2, Camera, Package, Sparkles,
    Loader2, User, Search, CheckCircle, ShoppingBag, QrCode, Image as ImageIcon,
    Tag, Palette, Layers, Check, Wrench, UserCheck, X, UserPlus,
    Percent, DollarSign, ChevronDown, CreditCard, Calendar, Pencil, Wallet, Smartphone, Receipt
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { cn, formatCurrency } from '@/lib/utils';
import { useCustomers } from '@/hooks/useCustomers';
import { useProducts } from '@/hooks/useProducts';
import { usePackages } from '@/hooks/usePackages';
import { useUsers } from '@/hooks/useUsers';
import { ordersApi, transactionsApi, salaryConfigsApi, commissionTablesApi } from '@/lib/api';
import { CreateCustomerDialog } from '@/components/customers/CreateCustomerDialog';
import { ImageUpload } from '@/components/products/ImageUpload';
import { useProductTypes, type ProductType } from '@/hooks/useProductTypes';
import { useAuth } from '@/contexts/AuthContext';
import { ServiceSelector } from '@/components/orders/ServiceSelector';
import { PrintThermalInvoiceDialog } from '@/components/orders/PrintThermalInvoiceDialog';
import type { Order } from '@/hooks/useOrders';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import {
    CREATE_ORDER_DRAFT_KEY,
    clearOrderDraft,
    getEditOrderDraftKey,
    loadOrderDraft,
    saveOrderDraft,
    type OrderFormDraft,
} from '@/lib/orderFormDraft';
import { setNavigationGuard } from '@/lib/navigationGuard';

// Product types will be fetched from API

// Common surcharge types
const SURCHARGE_TYPES = [
    { value: 'shipping', label: 'Phí giao hàng' },
    { value: 'express', label: 'Phí gấp' },
    { value: 'insurance', label: 'Phí bảo hiểm' },
    { value: 'special_material', label: 'Phí chất liệu đặc biệt' },
    { value: 'pickup', label: 'Phí lấy hàng' },
    { value: 'other', label: 'Phụ phí khác' },
];

// Common brands
const COMMON_BRANDS = [
    'Nike', 'Adidas', 'Gucci', 'Louis Vuitton', 'Chanel', 'Hermes',
    'Prada', 'Dior', 'Balenciaga', 'Converse', 'Vans', 'Khác'
];

interface BrandComboboxProps {
    value: string;
    onChange: (value: string) => void;
}

function BrandCombobox({ value, onChange }: BrandComboboxProps) {
    const [open, setOpen] = useState(false);
    const [searchValue, setSearchValue] = useState('');
    const trimmedSearch = searchValue.trim();
    const normalizedSearch = trimmedSearch.toLocaleLowerCase('vi-VN');
    const filteredBrands = normalizedSearch
        ? COMMON_BRANDS.filter(brand => brand.toLocaleLowerCase('vi-VN').includes(normalizedSearch))
        : COMMON_BRANDS;
    const canCreateBrand = Boolean(trimmedSearch)
        && !COMMON_BRANDS.some(brand => brand.toLocaleLowerCase('vi-VN') === normalizedSearch);

    const handleSelect = (brand: string) => {
        onChange(brand);
        setSearchValue('');
        setOpen(false);
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className={cn(
                        "h-12 w-full justify-between px-4 text-left font-normal",
                        !value && "text-muted-foreground"
                    )}
                >
                    <span className="truncate">{value || 'Chọn hoặc nhập'}</span>
                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command shouldFilter={false}>
                    <CommandInput
                        placeholder="Tìm hoặc nhập thương hiệu..."
                        value={searchValue}
                        onValueChange={setSearchValue}
                    />
                    <CommandList>
                        <CommandGroup>
                            {filteredBrands.map(brand => (
                                <CommandItem
                                    key={brand}
                                    value={brand}
                                    onSelect={() => handleSelect(brand)}
                                >
                                    <Check className={cn(
                                        "mr-2 h-4 w-4",
                                        value === brand ? "opacity-100" : "opacity-0"
                                    )} />
                                    {brand}
                                </CommandItem>
                            ))}
                            {canCreateBrand && (
                                <CommandItem
                                    value={trimmedSearch}
                                    onSelect={() => handleSelect(trimmedSearch)}
                                >
                                    <Plus className="mr-2 h-4 w-4" />
                                    Thêm mới "{trimmedSearch}"
                                </CommandItem>
                            )}
                            {!filteredBrands.length && !canCreateBrand && (
                                <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                                    Không tìm thấy thương hiệu.
                                </div>
                            )}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}

interface ProductTypeComboboxProps {
    value: string;
    productTypes: ProductType[];
    onChange: (value: string) => void;
    onCreate: (data: Partial<ProductType>) => Promise<ProductType>;
}

function ProductTypeCombobox({ value, productTypes, onChange, onCreate }: ProductTypeComboboxProps) {
    const [open, setOpen] = useState(false);
    const [searchValue, setSearchValue] = useState('');
    const [creating, setCreating] = useState(false);
    const selectedType = productTypes.find(type => type.code === value);
    const trimmedSearch = searchValue.trim();
    const normalizedSearch = trimmedSearch.toLocaleLowerCase('vi-VN');
    const filteredTypes = normalizedSearch
        ? productTypes.filter(type =>
            type.name.toLocaleLowerCase('vi-VN').includes(normalizedSearch)
            || type.code.toLocaleLowerCase('vi-VN').includes(normalizedSearch)
        )
        : productTypes;
    const generatedCode = trimmedSearch
        .toUpperCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^A-Z0-9]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '');
    const canCreateType = Boolean(trimmedSearch && generatedCode)
        && !productTypes.some(type =>
            type.name.toLocaleLowerCase('vi-VN') === normalizedSearch
            || type.code.toLocaleLowerCase('vi-VN') === generatedCode.toLocaleLowerCase('vi-VN')
        );

    const handleSelect = (code: string) => {
        onChange(code);
        setSearchValue('');
        setOpen(false);
    };

    const handleCreate = async () => {
        if (!canCreateType || creating) return;
        setCreating(true);
        try {
            const newType = await onCreate({
                name: trimmedSearch,
                code: generatedCode,
                description: 'Created via quick add'
            });
            handleSelect(newType.code);
        } finally {
            setCreating(false);
        }
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className={cn(
                        "h-12 w-full justify-between px-4 text-left font-normal",
                        !selectedType && "text-muted-foreground"
                    )}
                >
                    <span className="truncate">{selectedType?.name || value || 'Chọn hoặc nhập'}</span>
                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command shouldFilter={false}>
                    <CommandInput
                        placeholder="Tìm hoặc nhập loại sản phẩm..."
                        value={searchValue}
                        onValueChange={setSearchValue}
                    />
                    <CommandList>
                        <CommandGroup>
                            {filteredTypes.map(type => (
                                <CommandItem
                                    key={type.code}
                                    value={type.name}
                                    onSelect={() => handleSelect(type.code)}
                                >
                                    <Check className={cn(
                                        "mr-2 h-4 w-4",
                                        value === type.code ? "opacity-100" : "opacity-0"
                                    )} />
                                    {type.name}
                                </CommandItem>
                            ))}
                            {canCreateType && (
                                <CommandItem
                                    value={trimmedSearch}
                                    disabled={creating}
                                    onSelect={handleCreate}
                                >
                                    {creating ? (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    ) : (
                                        <Plus className="mr-2 h-4 w-4" />
                                    )}
                                    Thêm mới "{trimmedSearch}"
                                </CommandItem>
                            )}
                            {!filteredTypes.length && !canCreateType && (
                                <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                                    Không tìm thấy loại sản phẩm.
                                </div>
                            )}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}

interface Surcharge {
    id: string;
    type: string;
    label: string;
    value: number;
    isPercent: boolean;
}

interface CustomerProduct {
    id: string;
    name: string;
    type: string;
    brand: string;
    color: string;
    size: string;
    material: string;
    condition_before: string;
    images: string[];
    notes: string;
    due_at?: string;
    services: Array<{
        id: string;
        type: 'service' | 'package';
        name: string;
        price: number;
        /** Tiền cọc khách trả cho dịch vụ này (khi tạo đơn) */
        deposit_amount?: number;
        technicians: Array<{
            id: string;
            name: string;
            commission: number; // phần trăm hoa hồng
        }>;
        sales: Array<{
            id: string;
            name: string;
            commission: number; // phần trăm hoa hồng
        }>;
    }>;
    surcharges: Surcharge[];
}

const generateTempId = () => `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

const toNumberOrNull = (value: unknown): number | null => {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};

const resolveFirstCommission = (...values: Array<number | null | undefined>): number => {
    for (const value of values) {
        if (value !== null && value !== undefined) return value;
    }
    return 0;
};

const clampCommissionPercent = (value: unknown): number => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(0, Math.min(100, parsed));
};

const getOrderPaymentRecords = (order: any): any[] => {
    if (Array.isArray(order?.payments)) return order.payments;
    if (Array.isArray(order?.payment_records)) return order.payment_records;
    if (Array.isArray(order?.transactions)) return order.transactions;
    return [];
};

const resolveOrderPaidAmount = (order: any): number => {
    const paymentRecords = getOrderPaymentRecords(order);
    const paidFromRecords = paymentRecords.reduce((sum: number, record: any) => {
        const amount = toNumberOrNull(record?.amount ?? record?.payment_amount ?? record?.paid_amount);
        return sum + (amount ?? 0);
    }, 0);

    const totalAmount = toNumberOrNull(order?.total_amount) ?? 0;
    const remainingDebt = toNumberOrNull(order?.remaining_debt);
    const paidFromRemaining = remainingDebt !== null ? Math.max(0, totalAmount - remainingDebt) : null;

    const candidates = [
        toNumberOrNull(order?.paid_amount),
        toNumberOrNull(order?.total_paid),
        toNumberOrNull(order?.amount_paid),
        paidFromRemaining,
        paidFromRecords,
    ].filter((value): value is number => value !== null);

    if (candidates.length === 0) return 0;
    return Math.max(0, ...candidates);
};

const resolveOrderPaymentMethod = (order: any): 'cash' | 'transfer' | 'zalopay' | null => {
    const normalize = (method: unknown): 'cash' | 'transfer' | 'zalopay' | null => {
        if (typeof method !== 'string') return null;
        const value = method.trim().toLowerCase();
        if (value === 'cash' || value === 'transfer' || value === 'zalopay') return value;
        return null;
    };

    const directMethod = normalize(order?.payment_method);
    if (directMethod) return directMethod;

    const paymentRecords = getOrderPaymentRecords(order);
    for (let index = paymentRecords.length - 1; index >= 0; index -= 1) {
        const method = normalize(paymentRecords[index]?.payment_method ?? paymentRecords[index]?.method);
        if (method) return method;
    }

    return null;
};

export function CreateOrderPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const [searchParams] = useSearchParams();
    const { id } = useParams();
    const isEditMode = !!id;
    const { user } = useAuth();

    // Steps: 1 = Customer, 2 = Products (with Services), 3 = Review
    const [step, setStep] = useState(1);

    // Data hooks
    const { customers, fetchCustomers, createCustomer, updateCustomer } = useCustomers();
    const { products: catalogProducts, services, fetchProducts, fetchServices } = useProducts();
    const { packages, fetchPackages } = usePackages();
    const { users, fetchUsers, fetchTechnicians, fetchSales } = useUsers();
    const { productTypes, fetchProductTypes, createProductType } = useProductTypes();

    const [salaryConfigs, setSalaryConfigs] = useState<any[]>([]);
    const [commissionTables, setCommissionTables] = useState<any[]>([]);

    // Form state
    const [customerId, setCustomerId] = useState('');
    const [customerSearch, setCustomerSearch] = useState('');
    const [products, setProducts] = useState<CustomerProduct[]>([]);
    const [currentProductId, setCurrentProductId] = useState<string | null>(null);
    const [notes, setNotes] = useState('');
    const [discount, setDiscount] = useState(0);
    const [discountType, setDiscountType] = useState<'amount' | 'percent'>('amount');
    const [surcharges, setSurcharges] = useState<Surcharge[]>([]);
    const [paidAmount, setPaidAmount] = useState(0);
    const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer' | 'zalopay'>('cash');

    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [createdOrder, setCreatedOrder] = useState<any>(null);
    const [showInvoicePrintDialog, setShowInvoicePrintDialog] = useState(false);
    const [invoicePrintOrder, setInvoicePrintOrder] = useState<Order | null>(null);
    const [loadingInvoiceOrder, setLoadingInvoiceOrder] = useState(false);

    // Confirmation dialog state
    const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);

    // Technician selection dialog state
    const [techDialogOpen, setTechDialogOpen] = useState(false);
    const [pendingService, setPendingService] = useState<{
        productIndex: number;
        service: {
            id: string;
            type: 'service' | 'package';
            name: string;
            price: number;
            commission_sale?: number;
            commission_tech?: number;
        };
    } | null>(null);

    // Create/Edit customer dialog state
    const [showCreateCustomerDialog, setShowCreateCustomerDialog] = useState(false);
    const [isEditingCustomer, setIsEditingCustomer] = useState(false);
    const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);

    // Track confirmed products (products with info confirmed, ready for services)
    const [confirmedProductIds, setConfirmedProductIds] = useState<Set<string>>(new Set());

    // Next order code for QR preview
    const [nextOrderCode, setNextOrderCode] = useState<string>('');

    // Sản phẩm bán kèm (từ danh mục, không gắn dịch vụ)
    interface AddOnProduct {
        id: string;
        name: string;
        price: number;
        quantity: number;
        sales: Array<{
            id: string;
            name: string;
            commission: number;
        }>;
        surcharges: Surcharge[];
    }
    const [addOnProducts, setAddOnProducts] = useState<AddOnProduct[]>([]);
    const [addOnDialogOpen, setAddOnDialogOpen] = useState(false);
    const [addOnSearch, setAddOnSearch] = useState('');

    // Sales selection dialog state
    const [saleDialogOpen, setSaleDialogOpen] = useState(false);
    const [pendingSaleItem, setPendingSaleItem] = useState<{
        type: 'service' | 'addon';
        productIndex?: number;
        serviceIndex?: number;
        addonId?: string;
    } | null>(null);

    const [lastAddedAddOnSale, setLastAddedAddOnSale] = useState<{ addOnId: string; saleId: string } | null>(null);

    // Fetch data
    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const promises: Promise<any>[] = [
                    fetchCustomers({ status: 'active' }),
                    fetchProducts({ status: 'active' }),
                    fetchServices({ status: 'active' }),
                    fetchPackages(),
                    fetchTechnicians(),
                    fetchSales(),
                    fetchProductTypes(),
                    salaryConfigsApi.getAll().then(res => setSalaryConfigs(res.data?.data?.configs || [])).catch(() => {}),
                    commissionTablesApi.getAll().then(res => setCommissionTables(res.data?.data?.tables || [])).catch(() => {})
                ];

                // If editing, add order fetch to the parallel pool
                if (isEditMode && id && !orderFetchedRef.current) {
                    promises.push(fetchOrderForEdit(id));
                }

                await Promise.all(promises);
            } catch (err) {
                console.error('Error loading data:', err);
                toast.error('Lỗi khi tải dữ liệu');
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [id, isEditMode]);

    const fetchOrderForEdit = async (orderId: string) => {
        try {
            const response = await ordersApi.getById(orderId);
            const order = response.data.data?.order;
            if (order) {
                setCustomerId(order.customer_id);
                setNotes(order.notes || '');
                setDiscount(order.discount_value || order.discount || 0);
                setDiscountType(order.discount_type || 'amount');
                const statePaidAmount = toNumberOrNull((location.state as any)?.existingPaidAmount) ?? 0;
                setPaidAmount(Math.max(resolveOrderPaidAmount(order), statePaidAmount));

                const resolvedPaymentMethod = resolveOrderPaymentMethod(order)
                    || resolveOrderPaymentMethod({ payment_method: (location.state as any)?.existingPaymentMethod });
                if (resolvedPaymentMethod) {
                    setPaymentMethod(resolvedPaymentMethod);
                }


                // Map Customer Items (order_products + services)
                const customerItems: CustomerProduct[] = (order.customer_items || []).map((item: any) => ({
                    id: item.id,
                    name: item.name,
                    type: item.type || 'giày',
                    brand: item.brand || '',
                    color: item.color || '',
                    size: item.size || '',
                    material: item.material || '',
                    condition_before: item.condition_before || '',
                    images: item.images || [],
                    notes: item.notes || '',
                    due_at: item.due_at ? new Date(item.due_at).toISOString().split('T')[0] : '',
                    services: (item.services || []).map((s: any) => ({
                        id: s.service_id || s.package_id || s.id,
                        type: s.item_type,
                        name: s.item_name,
                        price: s.unit_price,
                        deposit_amount: Number(s.deposit_amount) || 0,
                        technicians: (s.technicians || []).map((t: any) => ({
                            id: t.technician_id,
                            name: t.technician?.name || 'Unknown',
                            commission: t.commission ?? 0
                        })),
                        sales: (s.sales || []).map((sale: any) => ({
                            id: sale.sale_id || sale.id,
                            name: sale.sale?.name || 'Unknown',
                            commission: sale.commission ?? 0
                        }))
                    }))
                }));

                // Map Sale Items (add-on products)
                const saleItems: AddOnProduct[] = (order.sale_items || []).map((item: any) => ({
                    id: item.product_id || item.id,
                    name: item.item_name,
                    price: item.unit_price,
                    quantity: item.quantity,
                    sales: (item.sales || []).map((s: any) => ({
                        id: s.sale_id || s.id,
                        name: s.sale?.name || 'Unknown',
                        commission: s.commission ?? 0
                    }))
                }));

                setProducts(customerItems);
                setAddOnProducts(saleItems);

                // Set surcharges
                if (order.surcharges && Array.isArray(order.surcharges)) {
                    setSurcharges(order.surcharges.map((s: any) => ({
                        id: generateTempId(),
                        type: s.type,
                        label: s.label,
                        value: s.value,
                        isPercent: s.is_percent
                    })));
                }

                // Mark all products as confirmed since it's an existing order
                const confirmed = new Set<string>();
                customerItems.forEach(item => confirmed.add(item.id));
                setConfirmedProductIds(confirmed);

                orderFetchedRef.current = true;
            }
        } catch (err) {
            console.error('Error fetching order for edit:', err);
            throw err;
        }
    };

    // Fetch next order code separately (for QR preview)
    useEffect(() => {
        const fetchNextCode = async () => {
            try {
                const codeResponse = await fetch('/api/orders/next-code', {
                    headers: {
                        'Authorization': `Bearer ${localStorage.getItem('token')}`
                    }
                });
                if (codeResponse.ok) {
                    const codeData = await codeResponse.json();
                    setNextOrderCode(codeData.data?.nextOrderCode || 'HĐ1');
                } else {
                    setNextOrderCode('HĐ1');
                }
            } catch {
                setNextOrderCode('HĐ1');
            }
        };
        fetchNextCode();
    }, []);

    // Flag to prevent duplicate lead processing
    const leadProcessedRef = useRef(false);
    const orderFetchedRef = useRef(false);

    // Removed separate fetchOrderData useEffect and integrated into the main fetchData parallel process

    // Handle lead info from URL params (when coming from Lead Detail page)
    useEffect(() => {
        // Skip if already processed
        if (leadProcessedRef.current) return;

        const leadId = searchParams.get('lead_id');
        const leadName = searchParams.get('lead_name');
        const leadPhone = searchParams.get('lead_phone');
        const leadEmail = searchParams.get('lead_email');

        if (leadPhone && customers.length > 0) {
            leadProcessedRef.current = true; // Mark as processed

            // Try to find existing customer by phone
            const existingCustomer = customers.find(c => c.phone === leadPhone);

            if (existingCustomer) {
                // Auto-select the existing customer
                setCustomerId(existingCustomer.id);
                setStep(2); // Move to products step
                toast.success(`Đã chọn khách hàng: ${existingCustomer.name}`);
            } else if (leadName) {
                // Create new customer from lead info
                const createNewCustomer = async () => {
                    try {
                        const newCustomer = await createCustomer({
                            name: leadName,
                            phone: leadPhone,
                            email: leadEmail || undefined,
                            status: 'active',
                            notes: leadId ? `Tạo từ lead #${leadId}` : undefined,
                        });
                        setCustomerId(newCustomer.id);
                        setStep(2); // Move to products step
                        toast.success(`Đã tạo khách hàng mới: ${leadName}`);
                    } catch (error) {
                        toast.error('Không thể tạo khách hàng từ lead');
                    }
                };
                createNewCustomer();
            }
        }
    }, [searchParams, customers, createCustomer]);

    const draftKey = useMemo(
        () => (isEditMode && id ? getEditOrderDraftKey(id) : CREATE_ORDER_DRAFT_KEY),
        [isEditMode, id]
    );
    const draftRestoredRef = useRef(false);

    const isDirty = useMemo(() => {
        if (step >= 4) return false;
        return (
            step > 1 ||
            !!customerId ||
            products.length > 0 ||
            addOnProducts.length > 0 ||
            !!notes.trim() ||
            discount > 0 ||
            surcharges.length > 0 ||
            paidAmount > 0
        );
    }, [step, customerId, products, addOnProducts, notes, discount, surcharges, paidAmount]);

    const applyOrderDraft = useCallback((draft: OrderFormDraft) => {
        setStep(Math.min(3, Math.max(1, draft.step || 1)));
        setCustomerId(draft.customerId || '');
        setCustomerSearch(draft.customerSearch || '');
        setProducts((draft.products || []) as CustomerProduct[]);
        setCurrentProductId(draft.currentProductId ?? null);
        setNotes(draft.notes || '');
        setDiscount(draft.discount || 0);
        setDiscountType(draft.discountType || 'amount');
        setSurcharges((draft.surcharges || []) as Surcharge[]);
        setPaidAmount(draft.paidAmount || 0);
        setPaymentMethod(draft.paymentMethod || 'cash');
        setAddOnProducts((draft.addOnProducts || []) as AddOnProduct[]);
        setConfirmedProductIds(new Set(draft.confirmedProductIds || []));
    }, []);

    useEffect(() => {
        if (loading || draftRestoredRef.current) return;
        if (searchParams.get('lead_phone') || searchParams.get('lead_id')) {
            draftRestoredRef.current = true;
            return;
        }

        const draft = loadOrderDraft(draftKey);
        draftRestoredRef.current = true;
        if (!draft) return;

        const restore = () => {
            applyOrderDraft(draft);
            toast.info('Đã khôi phục bản nháp đơn hàng');
        };

        if (isEditMode) {
            if (window.confirm('Có bản nháp chỉnh sửa đơn chưa gửi. Khôi phục bản nháp?')) {
                restore();
            } else {
                clearOrderDraft(draftKey);
            }
        } else {
            restore();
        }
    }, [loading, draftKey, isEditMode, applyOrderDraft, searchParams]);

    useEffect(() => {
        if (loading || step >= 4 || !isDirty) return;
        saveOrderDraft(draftKey, {
            step,
            customerId,
            customerSearch,
            products,
            currentProductId,
            notes,
            discount,
            discountType,
            surcharges,
            paidAmount,
            paymentMethod,
            addOnProducts,
            confirmedProductIds: Array.from(confirmedProductIds),
            savedAt: Date.now(),
        });
    }, [
        loading,
        step,
        isDirty,
        draftKey,
        customerId,
        customerSearch,
        products,
        currentProductId,
        notes,
        discount,
        discountType,
        surcharges,
        paidAmount,
        paymentMethod,
        addOnProducts,
        confirmedProductIds,
    ]);

    useEffect(() => {
        if (!isDirty) {
            setNavigationGuard(null);
            return;
        }
        setNavigationGuard(() =>
            window.confirm(
                'Bạn đang tạo đơn dở. Dữ liệu đã được lưu nháp tự động.\n\nRời trang và quay lại sẽ khôi phục bản nháp.\n\nBạn có chắc muốn rời trang?'
            )
        );
        return () => setNavigationGuard(null);
    }, [isDirty]);

    useEffect(() => {
        if (!isDirty) return;
        const onBeforeUnload = (e: BeforeUnloadEvent) => {
            e.preventDefault();
            e.returnValue = '';
        };
        window.addEventListener('beforeunload', onBeforeUnload);
        return () => window.removeEventListener('beforeunload', onBeforeUnload);
    }, [isDirty]);

    const leavePage = useCallback(
        (to: string) => {
            if (!isDirty || window.confirm(
                'Bạn đang tạo đơn dở. Dữ liệu đã được lưu nháp tự động.\n\nRời trang và quay lại sẽ khôi phục bản nháp.\n\nBạn có chắc muốn rời trang?'
            )) {
                navigate(to);
            }
        },
        [isDirty, navigate]
    );

    // List of users filtered by role for selection
    const availableTechnicians = users.filter(t => {
        const role = String(t.role || '').toLowerCase();
        return role === 'technician' || role === 'tech';
    });
    const availableSales = users.filter(u => {
        const role = String(u.role || '').toLowerCase();
        return role === 'sale' || role === 'sales';
    });

    // Helpers
    const activeCustomers = customers.filter(c => c.status === 'active' || !c.status);
    const filteredCustomers = activeCustomers.filter(c =>
        c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
        c.phone.includes(customerSearch)
    );
    const selectedCustomer = customers.find(c => c.id === customerId);
    
    // Handle create new customer
    const handleCreateCustomer = async (data: Parameters<typeof createCustomer>[0]) => {
        try {
            const newCustomer = await createCustomer(data);
            toast.success('Đã thêm khách hàng mới!');
            setShowCreateCustomerDialog(false);
            // Auto-select the newly created customer
            setCustomerId(newCustomer.id);
            await fetchCustomers({ status: 'active' });
            return newCustomer;
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Lỗi khi tạo khách hàng';
            toast.error(message);
            throw error;
        }
    };
    
    // Handle edit existing customer
    const handleUpdateCustomer = async (data: any) => {
        if (!customerId) return;
        try {
            await updateCustomer(customerId, data);
            toast.success('Đã cập nhật thông tin khách hàng!');
            setShowCreateCustomerDialog(false);
            setIsEditingCustomer(false);
            await fetchCustomers({ status: 'active' });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Lỗi khi cập nhật khách hàng';
            toast.error(message);
            throw error;
        }
    };

    // Add new product
    const handleAddProduct = () => {
        // Tự động xác nhận sản phẩm hiện tại trước khi thêm sản phẩm mới
        if (currentProductId) {
            setConfirmedProductIds(prev => new Set([...prev, currentProductId]));
        }

        const newProduct: CustomerProduct = {
            id: generateTempId(),
            name: '',
            type: 'giày',
            brand: '',
            color: '',
            size: '',
            material: '',
            condition_before: '',
            images: [],
            notes: '',
            due_at: '',
            services: [],
            surcharges: []
        };
        setProducts(prev => [newProduct, ...prev]);
        setCurrentProductId(newProduct.id);
    };

    // Update product
    const handleUpdateProduct = (index: number, field: keyof CustomerProduct, value: any) => {
        setProducts(prev => prev.map((p, i) => i === index ? { ...p, [field]: value } : p));
    };

    // Remove product
    const handleRemoveProduct = (index: number) => {
        const productToRemove = products[index];
        setProducts(prev => prev.filter((_, i) => i !== index));
        if (currentProductId === productToRemove?.id) {
            setCurrentProductId(null);
        }
        if (productToRemove) {
            const nextConfirmed = new Set(confirmedProductIds);
            nextConfirmed.delete(productToRemove.id);
            setConfirmedProductIds(nextConfirmed);
        }
    };

    // Add service to product (opens technician dialog first)
    const handleServiceClick = (productIndex: number, service: {
        id: string;
        type: 'service' | 'package';
        name: string;
        price: number;
        commission_sale?: number;
        commission_tech?: number;
    }) => {
        // Check if service already exists
        const product = products[productIndex];
        const exists = product?.services.find(s => s.id === service.id && s.type === service.type);
        if (exists) {
            toast.info('Dịch vụ này đã được thêm');
            return;
        }
        // Open dialog to select technician
        setPendingService({ productIndex, service });
        setTechDialogOpen(true);
    };

    // Helper: Resolve dynamic commission rate from salary configuration
    const resolveCommissionRate = (employeeId: string, itemCatalogId: string, itemCategoryType: 'service' | 'sales_consulting', isProduct: boolean) => {
        // Find employee's salary config
        const config = salaryConfigs.find(c => c.user_id === employeeId);
        if (!config || !config.commission_enabled) return undefined;

        // Find matching rule in commission_rules
        const rule = config.commission_rules?.find((r: any) => r.category === itemCategoryType);
        if (!rule || !rule.commission_type) return undefined;

        const tableId = rule.commission_type;

        // Look up item from catalog to get its commission_data
        let catalogItem: any = null;
        if (isProduct) {
            catalogItem = catalogProducts.find(p => p.id === itemCatalogId);
        } else {
            catalogItem = services.find(s => s.id === itemCatalogId) || packages.find(p => p.id === itemCatalogId);
        }

        if (!catalogItem) return undefined;

        const commissionData = catalogItem.commission_data || {};

        if (tableId === 'shared_table' || tableId === 'common') {
            if (itemCategoryType === 'service') {
                return catalogItem.commission_tech ?? catalogItem.commission_rate;
            } else {
                return catalogItem.commission_sale;
            }
        } else {
            const tableConfig = commissionData[tableId];
            if (tableConfig) {
                 return itemCategoryType === 'service' ? tableConfig.tech_rate : tableConfig.sale_rate;
            }
        }
        return undefined;
    };

    // Confirm adding service with technicians
    const handleConfirmAddService = (selectedTechnicians: Array<{ id: string; name: string; commission?: number }> = []) => {
        if (!pendingService) return;

        const { productIndex, service } = pendingService;

        setProducts(prev => prev.map((p, i) => {
            if (i !== productIndex) return p;
            return {
                ...p,
                services: [...p.services, {
                    ...service,
                    deposit_amount: 0,
                    technicians: selectedTechnicians.map(t => {
                        const dynamicRate = resolveCommissionRate(t.id, service.id, 'service', false);
                        return {
                            ...t,
                            commission: resolveFirstCommission(
                                t.commission,
                                dynamicRate,
                                service.commission_tech,
                                availableTechnicians.find(at => at.id === t.id)?.commission,
                                0
                            )
                        };
                    }),
                    sales: [] // Initialize with empty sales
                }]
            };
        }));

        setTechDialogOpen(false);
        setPendingService(null);
        const techNames = selectedTechnicians.map(t => t.name).join(', ');
        toast.success(`Đã thêm ${service.name}${techNames ? ` - KTV: ${techNames}` : ''}`);
    };

    // Add technician to a service
    const handleAddTechnicianToService = (productIndex: number, serviceIndex: number, technicianId: string, commission?: number) => {
        const technician = availableTechnicians.find(t => t.id === technicianId);
        if (!technician) return;

        setProducts(prev => prev.map((p, i) => {
            if (i !== productIndex) return p;
            return {
                ...p,
                services: p.services.map((s, si) => {
                    if (si !== serviceIndex) return s;
                    // Check if already added
                    if (s.technicians.some(t => t.id === technicianId)) {
                        toast.error('KTV đã được thêm');
                        return s;
                    }
                    const service = s.type === 'service'
                        ? services.find(sv => sv.id === s.id)
                        : packages.find(pk => pk.id === s.id);

                    const dynamicRate = resolveCommissionRate(technicianId, s.id, 'service', false);

                    return {
                        ...s,
                        technicians: [...s.technicians, {
                            id: technician.id,
                            name: technician.name,
                            commission: resolveFirstCommission(
                                commission,
                                dynamicRate,
                                service?.commission_tech,
                                technician.commission,
                                0
                            )
                        }]
                    };
                })
            };
        }));
    };

    // Remove technician from service
    const handleRemoveTechnicianFromService = (productIndex: number, serviceIndex: number, technicianId: string) => {
        setProducts(prev => prev.map((p, i) => {
            if (i !== productIndex) return p;
            return {
                ...p,
                services: p.services.map((s, si) => {
                    if (si !== serviceIndex) return s;
                    return {
                        ...s,
                        technicians: s.technicians.filter(t => t.id !== technicianId)
                    };
                })
            };
        }));
    };

    // Update technician commission
    const handleUpdateTechnicianCommission = (productIndex: number, serviceIndex: number, technicianId: string, commission: number) => {
        setProducts(prev => prev.map((p, i) => {
            if (i !== productIndex) return p;
            return {
                ...p,
                services: p.services.map((s, si) => {
                    if (si !== serviceIndex) return s;
                    return {
                        ...s,
                        technicians: s.technicians.map(t =>
                            t.id === technicianId ? { ...t, commission } : t
                        )
                    };
                })
            };
        }));
    };

    // Remove service from product
    const handleRemoveService = (productIndex: number, serviceIndex: number) => {
        setProducts(prev => prev.map((p, i) => {
            if (i !== productIndex) return p;
            return { ...p, services: p.services.filter((_, si) => si !== serviceIndex) };
        }));
    };

    // Update service price
    const handleUpdateServicePrice = (productIndex: number, serviceIndex: number, price: number) => {
        setProducts(prev => prev.map((p, i) => {
            if (i !== productIndex) return p;
            return {
                ...p,
                services: p.services.map((s, si) =>
                    si === serviceIndex
                        ? {
                            ...s,
                            price,
                            deposit_amount: Math.min(s.deposit_amount || 0, Math.max(0, price)),
                        }
                        : s
                )
            };
        }));
    };

    const maxServiceDeposit = products.reduce(
        (sum, p) => sum + p.services.reduce((ss, s) => ss + (s.price || 0), 0),
        0
    );
    const hasServices = products.some(p => p.services.length > 0);

    const handleSetProductDeposit = (productIndex: number, totalDeposit: number) => {
        setProducts(prev => prev.map((p, i) => {
            if (i !== productIndex) return p;
            const maxProductDeposit = p.services.reduce((ss, s) => ss + (s.price || 0), 0);
            const amount = Math.min(Math.max(0, totalDeposit), maxProductDeposit);
            if (p.services.length === 0) return p;

            const totalPrice = p.services.reduce((a, s) => a + (s.price || 0), 0);
            const capped = Math.min(amount, totalPrice);
            let remaining = capped;
            const shares = p.services.map((s, idx) => {
                if (idx === p.services.length - 1) return remaining;
                const share = totalPrice > 0 ? Math.floor((capped * (s.price || 0)) / totalPrice) : 0;
                remaining -= share;
                return share;
            });

            return {
                ...p,
                services: p.services.map((s, si) => ({
                    ...s,
                    deposit_amount: shares[si],
                })),
            };
        }));
    };

    const getProductDepositTotal = (product: CustomerProduct) =>
        product.services.reduce((ss, s) => ss + (s.deposit_amount || 0), 0);

    const handleSetTotalServiceDeposit = (totalDeposit: number) => {
        const amount = Math.min(Math.max(0, totalDeposit), maxServiceDeposit);
        setProducts(prev => {
            const entries = prev.flatMap(p =>
                p.services.map(s => ({ price: s.price || 0 }))
            );
            if (entries.length === 0) return prev;

            const totalPrice = entries.reduce((a, e) => a + e.price, 0);
            const capped = Math.min(amount, totalPrice);
            let remaining = capped;
            const shares = entries.map((e, idx) => {
                if (idx === entries.length - 1) return remaining;
                const share = totalPrice > 0 ? Math.floor((capped * e.price) / totalPrice) : 0;
                remaining -= share;
                return share;
            });

            let shareIdx = 0;
            return prev.map(p => ({
                ...p,
                services: p.services.map(s => ({
                    ...s,
                    deposit_amount: shares[shareIdx++],
                })),
            }));
        });
    };

    // Add sale to a service
    const handleAddSaleToService = (productIndex: number, serviceIndex: number, saleId: string, commission?: number) => {
        const sale = availableSales.find(s => s.id === saleId);
        if (!sale) return;

        setProducts(prev => prev.map((p, i) => {
            if (i !== productIndex) return p;
            return {
                ...p,
                services: p.services.map((s, si) => {
                    if (si !== serviceIndex) return s;
                    // Check if already added
                    if (s.sales.some(sl => sl.id === saleId)) {
                        toast.error('Sales này đã được thêm');
                        return s;
                    }
                    const service = s.type === 'service'
                        ? services.find(sv => sv.id === s.id)
                        : packages.find(pk => pk.id === s.id);

                    const dynamicRate = resolveCommissionRate(saleId, s.id, 'sales_consulting', false);

                    return {
                        ...s,
                        sales: [...s.sales, {
                            id: sale.id,
                            name: sale.name,
                            commission: resolveFirstCommission(
                                commission,
                                dynamicRate,
                                service?.commission_sale,
                                sale.commission,
                                0
                            )
                        }]
                    };
                })
            };
        }));
    };

    // Remove sale from service
    const handleRemoveSaleFromService = (productIndex: number, serviceIndex: number, saleId: string) => {
        setProducts(prev => prev.map((p, i) => {
            if (i !== productIndex) return p;
            return {
                ...p,
                services: p.services.map((s, si) => {
                    if (si !== serviceIndex) return s;
                    return {
                        ...s,
                        sales: s.sales.filter(sl => sl.id !== saleId)
                    };
                })
            };
        }));
    };

    // Update sale commission for service
    const handleUpdateSaleCommission = (productIndex: number, serviceIndex: number, saleId: string, commission: number) => {
        setProducts(prev => prev.map((p, i) => {
            if (i !== productIndex) return p;
            return {
                ...p,
                services: p.services.map((s, si) => {
                    if (si !== serviceIndex) return s;
                    return {
                        ...s,
                        sales: s.sales.map(sl =>
                            sl.id === saleId ? { ...sl, commission } : sl
                        )
                    };
                })
            };
        }));
    };

    // Add sản phẩm bán kèm
    const handleAddAddOn = (product: { id: string; name: string; price: number }, quantity: number = 1) => {
        const existing = addOnProducts.find(a => a.id === product.id);
        if (existing) {
            setAddOnProducts(prev => prev.map(a => a.id === product.id ? { ...a, quantity: a.quantity + quantity } : a));
        } else {
            setAddOnProducts(prev => [...prev, {
                id: product.id,
                name: product.name,
                price: product.price,
                quantity: 1,
                sales: [],
                surcharges: []
            }]);
        }
        setAddOnDialogOpen(false);
        setAddOnSearch('');
    };

    const handleUpdateAddOnQuantity = (id: string, quantity: number) => {
        if (quantity < 1) {
            setAddOnProducts(prev => prev.filter(a => a.id !== id));
            return;
        }
        setAddOnProducts(prev => prev.map(a => a.id === id ? { ...a, quantity } : a));
    };

    const handleRemoveAddOn = (id: string) => {
        setAddOnProducts(prev => prev.filter(a => a.id !== id));
    };

    // Add sale to an add-on product
    const handleAddSaleToAddOn = (addOnId: string, saleId: string, commission?: number) => {
        const sale = availableSales.find(s => s.id === saleId);
        if (!sale) return;

        setAddOnProducts(prev => prev.map(a => {
            if (a.id !== addOnId) return a;
            if (a.sales.some(sl => sl.id === saleId)) {
                toast.error('Sales này đã được thêm');
                return a;
            }
            const catalogProduct = catalogProducts.find(p => p.id === addOnId);
            const dynamicRate = resolveCommissionRate(saleId, addOnId, 'sales_consulting', true);
            setLastAddedAddOnSale({ addOnId, saleId });
            return {
                ...a,
                sales: [...a.sales, {
                    id: sale.id,
                    name: sale.name,
                    commission: resolveFirstCommission(
                        commission,
                        dynamicRate,
                        catalogProduct?.commission_sale,
                        sale.commission,
                        0
                    )
                }]
            };
        }));
    };

    // Remove sale from add-on product
    const handleRemoveSaleFromAddOn = (addOnId: string, saleId: string) => {
        setAddOnProducts(prev => prev.map(a => {
            if (a.id !== addOnId) return a;
            return {
                ...a,
                sales: a.sales.filter(sl => sl.id !== saleId)
            };
        }));
    };

    // Update sale commission for add-on product
    const handleUpdateAddOnSaleCommission = (addOnId: string, saleId: string, commission: number) => {
        setAddOnProducts(prev => prev.map(a => {
            if (a.id !== addOnId) return a;
            return {
                ...a,
                sales: a.sales.map(sl =>
                    sl.id === saleId ? { ...sl, commission } : sl
                )
            };
        }));
    };

    // Product Surcharge handlers
    const handleAddProductSurcharge = (productIndex: number, type: string) => {
        const surchargeType = SURCHARGE_TYPES.find(s => s.value === type);
        if (!surchargeType) return;
        setProducts(prev => prev.map((p, i) => {
            if (i !== productIndex) return p;
            if ((p.surcharges || []).some(s => s.type === type)) return p;
            return {
                ...p,
                surcharges: [...(p.surcharges || []), {
                    id: `psurcharge_${Date.now()}`,
                    type: type,
                    label: surchargeType.label,
                    value: 0,
                    isPercent: false
                }]
            };
        }));
    };

    const handleUpdateProductSurcharge = (productIndex: number, id: string, field: 'value' | 'isPercent', value: any) => {
        setProducts(prev => prev.map((p, i) => {
            if (i !== productIndex) return p;
            return {
                ...p,
                surcharges: (p.surcharges || []).map(s => {
                    if (s.id !== id) return s;
                    if (field === 'value') {
                        const val = parseFloat(value) || 0;
                        return { ...s, value: s.isPercent ? Math.min(100, val) : val };
                    }
                    if (field === 'isPercent') {
                        const isPercent = !!value;
                        return { ...s, isPercent, value: isPercent && s.value > 100 ? 100 : s.value };
                    }
                    return s;
                })
            };
        }));
    };

    const handleRemoveProductSurcharge = (productIndex: number, id: string) => {
        setProducts(prev => prev.map((p, i) => {
            if (i !== productIndex) return p;
            return { ...p, surcharges: (p.surcharges || []).filter(s => s.id !== id) };
        }));
    };

    // AddOn Surcharge handlers
    const handleAddAddOnSurcharge = (addOnId: string, type: string) => {
        const surchargeType = SURCHARGE_TYPES.find(s => s.value === type);
        if (!surchargeType) return;
        setAddOnProducts(prev => prev.map(a => {
            if (a.id !== addOnId) return a;
            if ((a.surcharges || []).some(s => s.type === type)) return a;
            return {
                ...a,
                surcharges: [...(a.surcharges || []), {
                    id: `asurcharge_${Date.now()}`,
                    type,
                    label: surchargeType.label,
                    value: 0,
                    isPercent: false
                }]
            };
        }));
    };

    const handleUpdateAddOnSurcharge = (addOnId: string, id: string, field: 'value' | 'isPercent', value: any) => {
        setAddOnProducts(prev => prev.map(a => {
            if (a.id !== addOnId) return a;
            return {
                ...a,
                surcharges: (a.surcharges || []).map(s => {
                    if (s.id !== id) return s;
                    if (field === 'value') {
                        const val = parseFloat(value) || 0;
                        return { ...s, value: s.isPercent ? Math.min(100, val) : val };
                    }
                    if (field === 'isPercent') {
                        const isPercent = !!value;
                        return { ...s, isPercent, value: isPercent && s.value > 100 ? 100 : s.value };
                    }
                    return s;
                })
            };
        }));
    };

    const handleRemoveAddOnSurcharge = (addOnId: string, id: string) => {
        setAddOnProducts(prev => prev.map(a => {
            if (a.id !== addOnId) return a;
            return { ...a, surcharges: (a.surcharges || []).filter(s => s.id !== id) };
        }));
    };

    // Calculate totals (sản phẩm khách + dịch vụ + sản phẩm bán kèm)
    const subtotalFromCustomerProducts = products.reduce((sum, p) => {
        const servicesPrice = p.services.reduce((ssum, s) => ssum + s.price, 0);
        const productSurcharges = (p.surcharges || []).reduce((ssum, s) => {
            return ssum + (s.isPercent ? Math.round(servicesPrice * (s.value || 0) / 100) : (s.value || 0));
        }, 0);
        return sum + servicesPrice + productSurcharges;
    }, 0);

    const subtotalFromAddOns = addOnProducts.reduce((sum, a) => {
        const basePrice = (a.price || 0) * (a.quantity || 1);
        const addonSurcharges = (a.surcharges || []).reduce((asum, s) => {
            return asum + (s.isPercent ? Math.round(basePrice * (s.value || 0) / 100) : (s.value || 0));
        }, 0);
        return sum + basePrice + addonSurcharges;
    }, 0);
    const subtotal = subtotalFromCustomerProducts + subtotalFromAddOns;

    // Calculate discount amount
    const discountAmount = discountType === 'percent'
        ? Math.round(subtotal * discount / 100)
        : discount;

    // Calculate total surcharges
    const totalSurcharges = surcharges.reduce((sum, s) => {
        return sum + (s.isPercent ? Math.round(subtotal * s.value / 100) : s.value);
    }, 0);

    const total = Math.max(0, subtotal - discountAmount + totalSurcharges);
    const totalServiceDeposits = products.reduce(
        (sum, p) => sum + p.services.reduce((ss, s) => ss + (s.deposit_amount || 0), 0),
        0
    );
    const remainingDebt = total - (totalServiceDeposits > 0 ? totalServiceDeposits : paidAmount);

    useEffect(() => {
        if (totalServiceDeposits > 0) {
            setPaidAmount(totalServiceDeposits);
        }
    }, [totalServiceDeposits]);

    // Helper to format number with dots for display
    const formatInputCurrency = (value: number): string => {
        if (!value) return '';
        return value.toLocaleString('vi-VN');
    };

    // Helper to parse formatted string back to number
    const parseInputCurrency = (value: string): number => {
        const cleanValue = value.replace(/\./g, '').replace(/,/g, '');
        return Number(cleanValue) || 0;
    };

    const serviceDepositInput = hasServices ? (
        <div className="space-y-2">
            <Label className="text-xs font-bold uppercase text-amber-800">Cọc đơn hàng</Label>
            <Input
                type="text"
                value={totalServiceDeposits ? formatInputCurrency(totalServiceDeposits) : ''}
                onFocus={(e) => e.target.select()}
                onChange={(e) => handleSetTotalServiceDeposit(parseInputCurrency(e.target.value))}
                placeholder="VD: 500.000"
                className="h-9 border-amber-200 bg-amber-50/40 focus-visible:ring-amber-400"
            />
            {totalServiceDeposits > 0 && (
                <p className="text-[10px] text-muted-foreground">
                    Còn lại khi trả đồ (dịch vụ): {formatCurrency(Math.max(0, maxServiceDeposit - totalServiceDeposits))}
                </p>
            )}
        </div>
    ) : null;

    // Add surcharge handler
    const handleAddSurcharge = (type: string) => {
        const surchargeType = SURCHARGE_TYPES.find(s => s.value === type);
        if (!surchargeType) return;

        // Check if already exists
        if (surcharges.some(s => s.type === type)) {
            return;
        }

        setSurcharges(prev => [...prev, {
            id: `surcharge_${Date.now()}`,
            type: type,
            label: surchargeType.label,
            value: 0,
            isPercent: false
        }]);
    };

    const handleUpdateSurcharge = (id: string, field: 'value' | 'isPercent', value: number | boolean) => {
        setSurcharges(prev => prev.map(s => {
            if (s.id !== id) return s;

            if (field === 'value' && typeof value === 'number') {
                // If percent mode, limit to 100
                if (s.isPercent && value > 100) {
                    return { ...s, value: 100 };
                }
                return { ...s, value };
            }

            if (field === 'isPercent' && typeof value === 'boolean') {
                // When switching to percent, limit existing value to 100
                const newValue = value && s.value > 100 ? 100 : s.value;
                return { ...s, isPercent: value, value: newValue };
            }

            return s;
        }));
    };

    const handleRemoveSurcharge = (id: string) => {
        setSurcharges(prev => prev.filter(s => s.id !== id));
    };

    // Order Sidebar JSX - not a component to avoid re-mount on state changes
    const orderSidebarContent = (
        <div className="space-y-4 sticky top-4">
            {/* Customer Info */}
            {selectedCustomer && (
                <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
                    <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-sm flex items-center gap-2">
                                <User className="h-4 w-4" />
                                Khách hàng
                            </CardTitle>
                            <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8 text-primary hover:text-primary hover:bg-primary/10"
                                onClick={() => {
                                    setIsEditingCustomer(true);
                                    setShowCreateCustomerDialog(true);
                                }}
                            >
                                <Pencil className="h-4 w-4" />
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <div className="flex items-center gap-3">
                            <Avatar className="h-12 w-12">
                                <AvatarFallback className="bg-primary text-white">
                                    {selectedCustomer.name.charAt(0)}
                                </AvatarFallback>
                            </Avatar>
                            <div>
                                <p className="font-semibold">{selectedCustomer.name}</p>
                                <p className="text-sm text-muted-foreground">{selectedCustomer.phone}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Order Summary - Compact */}
            {products.length > 0 && (
                <Card>
                    <CardContent className="p-4">
                        <div className="grid grid-cols-4 gap-3 text-center">
                            <div>
                                <p className="text-xs text-muted-foreground">Tổng tiền</p>
                                <p className="font-bold text-primary">{formatCurrency(total)}</p>
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground">Đã thanh toán</p>
                                <p className="font-bold text-green-600">{formatCurrency(paidAmount)}</p>
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground">Còn nợ</p>
                                <p className={`font-bold ${remainingDebt > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                    {formatCurrency(remainingDebt)}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground">Trạng thái</p>
                                <Badge
                                    variant={remainingDebt <= 0 ? 'default' : 'destructive'}
                                    className={remainingDebt <= 0 ? 'bg-green-500' : ''}
                                >
                                    {remainingDebt <= 0 ? 'Không nợ' : 'Còn nợ'}
                                </Badge>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {serviceDepositInput && (
                <Card className="border-amber-200 bg-amber-50/30">
                    <CardContent className="p-4">
                        {serviceDepositInput}
                    </CardContent>
                </Card>
            )}
        </div>
    );

    // Submit order
    const handleSubmit = async (status: 'before_sale' | 'in_progress' | 'after_sale' = 'before_sale') => {
        if (!customerId) {
            toast.error('Vui lòng chọn khách hàng');
            return;
        }
        if (products.length === 0) {
            toast.error('Vui lòng thêm ít nhất một sản phẩm');
            return;
        }
        if (products.some(p => p.services.length === 0)) {
            toast.error('Mỗi sản phẩm cần có ít nhất một dịch vụ');
            return;
        }
        if (products.some(p => !p.name.trim())) {
            toast.error('Vui lòng nhập tên cho tất cả sản phẩm');
            return;
        }

        setSubmitting(true);
        setConfirmDialogOpen(false);
        try {
            const effectiveDepositTotal =
                totalServiceDeposits > 0 ? totalServiceDeposits : paidAmount > 0 ? paidAmount : 0;

            const productsForSubmit =
                effectiveDepositTotal > 0 && totalServiceDeposits === 0
                    ? (() => {
                        const entries = products.flatMap((p) =>
                            p.services.map((s) => ({ price: s.price || 0 }))
                        );
                        const totalPrice = entries.reduce((a, e) => a + e.price, 0);
                        const capped = Math.min(effectiveDepositTotal, totalPrice);
                        let remaining = capped;
                        const shares = entries.map((e, idx) => {
                            if (idx === entries.length - 1) return remaining;
                            const share =
                                totalPrice > 0 ? Math.floor((capped * e.price) / totalPrice) : 0;
                            remaining -= share;
                            return share;
                        });
                        let shareIdx = 0;
                        return products.map((p) => ({
                            ...p,
                            services: p.services.map((s) => ({
                                ...s,
                                deposit_amount: shares[shareIdx++],
                            })),
                        }));
                    })()
                    : products;

            const payload = {
                customer_id: customerId,
                status: isEditMode ? undefined : status, // keep status if editing, or handle separately
                customer_items: productsForSubmit.map(p => {
                    const servicesPrice = p.services.reduce((ssum, s) => ssum + s.price, 0);
                    const surchargeAmount = (p.surcharges || []).reduce((ssum, s) => {
                        return ssum + (s.isPercent ? Math.round(servicesPrice * (s.value || 0) / 100) : (s.value || 0));
                    }, 0);
                    return {
                        id: p.id.startsWith('temp_') ? undefined : p.id,
                        name: p.name,
                        type: p.type,
                        brand: p.brand,
                        color: p.color,
                        size: p.size,
                        material: p.material,
                        condition_before: p.condition_before,
                        images: p.images,
                        notes: p.notes,
                        due_at: p.due_at ? new Date(p.due_at + 'T17:00:00').toISOString() : undefined,
                        surcharges: p.surcharges || [],
                        surcharge_amount: surchargeAmount,
                            services: p.services.map(s => ({
                                id: s.id.startsWith('temp_') ? undefined : s.id,
                                type: s.type,
                                name: s.name,
                                price: s.price,
                                deposit_amount: Math.max(0, Number(s.deposit_amount) || 0),
                                technicians: s.technicians
                                    .filter(t => Boolean(t.id))
                                    .map(t => ({
                                        technician_id: t.id,
                                        commission: clampCommissionPercent(t.commission)
                                    })),
                                sales: s.sales
                                    .filter(sl => Boolean(sl.id))
                                    .map(sl => ({
                                        sale_id: sl.id,
                                        commission: clampCommissionPercent(sl.commission)
                                    }))
                        }))
                    };
                }),
                sale_items: addOnProducts.map(a => {
                    const basePrice = (a.price || 0) * (a.quantity || 1);
                    const surchargeAmount = (a.surcharges || []).reduce((ssum, s) => {
                        return ssum + (s.isPercent ? Math.round(basePrice * (s.value || 0) / 100) : (s.value || 0));
                    }, 0);
                    return {
                        product_id: a.id,
                        name: a.name,
                        unit_price: a.price,
                        quantity: a.quantity,
                        surcharges: a.surcharges || [],
                        surcharge_amount: surchargeAmount,
                        sales: a.sales
                            .filter(sl => Boolean(sl.id))
                            .map(sl => ({
                                sale_id: sl.id,
                                commission: clampCommissionPercent(sl.commission)
                            }))
                    };
                }),
                notes,
                discount: discountAmount,
                discount_type: discountType,
                discount_value: discount,
                surcharges: surcharges.map(s => ({
                    type: s.type,
                    label: s.label,
                    value: s.value,
                    is_percent: s.isPercent,
                    amount: s.isPercent ? Math.round(subtotal * s.value / 100) : s.value
                })),
                paid_amount: effectiveDepositTotal,
                payment_method: paymentMethod,

            };

            if (isEditMode && id) {
                await ordersApi.createOrderEditTicket(id, {
                    update_payload: {
                        ...payload,
                        total_amount: total,
                        request_type: 'order_edit'
                    },
                    notes: notes || 'Yêu cầu sửa đơn'
                });
                toast.success('Đã gửi yêu cầu sửa đơn. Vui lòng chờ quản lý duyệt.');
                clearOrderDraft(draftKey);
                navigate(`/orders/${id}`, {
                    state: {
                        pendingEditApproval: true
                    }
                });
                return;
            }

            const response = isEditMode && id
                ? await ordersApi.updateFull(id, payload)
                : await ordersApi.create(payload);

            const orderResult = response.data.data;
            setCreatedOrder(orderResult);
            clearOrderDraft(draftKey);

            setStep(4); // Success step
            toast.success(isEditMode ? 'Đã cập nhật đơn hàng thành công!' : 'Đã tạo đơn hàng thành công!');
        } catch (error: any) {
            toast.error(error.response?.data?.message || (isEditMode ? 'Lỗi khi cập nhật đơn hàng' : 'Lỗi khi tạo đơn hàng'));
        } finally {
            setSubmitting(false);
        }
    };

    // Navigation - Now 3 steps: Customer, Products (with Services), Review
    const canGoNext = () => {
        switch (step) {
            case 1: return !!customerId;
            case 2: return products.length > 0 && products.every(p => p.name.trim() && p.services.length > 0);
            case 3: return true;
            default: return false;
        }
    };

    const handleOpenPrintInvoice = async () => {
        const orderId = createdOrder?.order?.id;
        if (!orderId) {
            toast.error('Không tìm thấy mã đơn để in hóa đơn');
            return;
        }
        setLoadingInvoiceOrder(true);
        try {
            const response = await ordersApi.getById(orderId);
            const order = response.data.data?.order as Order | undefined;
            if (!order) {
                throw new Error('Order not found');
            }
            setInvoicePrintOrder(order);
            setShowInvoicePrintDialog(true);
        } catch {
            toast.error('Không tải được thông tin đơn để in hóa đơn');
        } finally {
            setLoadingInvoiceOrder(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-[60vh] flex items-center justify-center">
                <div className="text-center">
                    <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
                    <p className="mt-4 text-muted-foreground">Đang tải dữ liệu...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-w-0 max-w-full space-y-4 animate-fade-in w-full overflow-x-hidden">
            {/* Header */}
            <div className="flex min-w-0 items-start gap-3">
                <Button variant="ghost" size="icon" className="shrink-0" onClick={() => leavePage('/orders')}>
                    <ArrowLeft className="h-5 w-5" />
                </Button>
                <div className="min-w-0 flex-1">
                    <h1 className="flex flex-wrap items-center gap-2 text-xl font-bold sm:text-2xl">
                        {isEditMode ? (
                            <>
                                <Wrench className="h-5 w-5 shrink-0 text-orange-500 sm:h-6 sm:w-6" />
                                <span className="min-w-0">Chỉnh sửa đơn hàng</span>
                                <Badge variant="outline" className="bg-orange-50 text-[10px] font-bold uppercase tracking-wider text-orange-600 border-orange-200">
                                    Edit Mode
                                </Badge>
                            </>
                        ) : (
                            <>
                                <ShoppingBag className="h-5 w-5 shrink-0 text-primary sm:h-6 sm:w-6" />
                                <span>Tạo đơn hàng mới</span>
                            </>
                        )}
                    </h1>
                    <p className="text-sm text-muted-foreground sm:text-base">
                        {isEditMode
                            ? "Cập nhật thông tin sản phẩm, dịch vụ và các mục bán kèm cho đơn hàng hiện tại"
                            : "Nhận sản phẩm khách và chọn dịch vụ"}
                    </p>
                    {isDirty && step < 4 && (
                        <p className="mt-1 text-xs font-medium text-amber-700">
                            Đã lưu nháp tự động — bấm nhầm menu vẫn khôi phục được khi quay lại
                        </p>
                    )}
                </div>
            </div>

            {/* Progress Steps - 3 steps now */}
            {step < 4 && (
                <div className="flex min-w-0 items-center justify-between gap-2">
                    {[
                        { num: 1, label: 'Khách hàng', shortLabel: 'Khách', icon: User },
                        { num: 2, label: 'Sản phẩm & Dịch vụ', shortLabel: 'Sản phẩm', icon: Package },
                        { num: 3, label: 'Xác nhận', shortLabel: 'Xác nhận', icon: CheckCircle }
                    ].map((s, i) => (
                        <div key={s.num} className="flex min-w-0 flex-1 items-center">
                            <div
                                className={cn(
                                    'flex min-w-0 flex-1 flex-col items-center gap-1 sm:flex-row sm:justify-center sm:gap-2',
                                    step >= s.num ? 'text-primary' : 'text-muted-foreground'
                                )}
                                title={s.label}
                            >
                                <div className={cn(
                                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                                    step > s.num ? 'bg-primary text-white' :
                                        step === s.num ? 'border-2 border-primary bg-primary/10' :
                                            'bg-muted'
                                )}>
                                    {step > s.num ? <Check className="h-5 w-5" /> : <s.icon className="h-5 w-5" />}
                                </div>
                                <span className="whitespace-nowrap text-center text-[11px] font-medium leading-none sm:hidden">
                                    {s.shortLabel}
                                </span>
                                <span className="hidden whitespace-nowrap font-medium sm:inline md:hidden">
                                    {s.shortLabel}
                                </span>
                                <span className="hidden whitespace-nowrap font-medium md:inline">
                                    {s.label}
                                </span>
                            </div>
                            {i < 2 && (
                                <div className={cn('mx-1 h-0.5 min-w-[12px] flex-1 rounded sm:mx-2', step > s.num ? 'bg-primary' : 'bg-muted')} />
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Step 1: Customer Selection */}
            {step === 1 && (
                <Card className="min-w-0 overflow-visible">
                    <CardHeader className="space-y-3 pb-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <CardTitle className="flex shrink-0 items-center gap-2 text-base whitespace-nowrap sm:text-lg">
                                <User className="h-5 w-5 shrink-0 text-primary" />
                                Chọn khách hàng
                            </CardTitle>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    setIsEditingCustomer(false);
                                    setShowCreateCustomerDialog(true);
                                }}
                                className="h-9 w-full shrink-0 gap-2 sm:w-auto"
                            >
                                <UserPlus className="h-4 w-4 shrink-0" />
                                Thêm khách hàng
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                        {selectedCustomer ? (
                            <div className="flex flex-col gap-4 rounded-xl border border-primary/20 bg-primary/5 p-4 sm:flex-row sm:items-center">
                                <div className="flex min-w-0 items-center gap-3 sm:flex-1">
                                    <Avatar className="h-14 w-14 shrink-0 sm:h-16 sm:w-16">
                                        <AvatarFallback className="bg-primary text-lg text-white sm:text-xl">
                                            {selectedCustomer.name.charAt(0)}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-lg font-semibold sm:text-xl">{selectedCustomer.name}</p>
                                        <p className="text-sm text-muted-foreground sm:text-base">{selectedCustomer.phone}</p>
                                    </div>
                                </div>
                                <Button
                                    variant="outline"
                                    className="h-9 w-full shrink-0 sm:w-auto"
                                    onClick={() => setCustomerId('')}
                                >
                                    Đổi khách
                                </Button>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <div className="relative">
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                        <Input
                                            placeholder="Tìm theo tên hoặc số điện thoại..."
                                            value={customerSearch}
                                            onChange={(e) => setCustomerSearch(e.target.value)}
                                            onFocus={() => setCustomerDropdownOpen(true)}
                                            className="pl-10"
                                        />
                                    </div>

                                    {/* Dropdown results */}
                                    {customerDropdownOpen && (
                                        <div className="absolute z-50 left-0 right-0 mt-1 w-full min-w-0 bg-background border rounded-xl shadow-lg max-h-[min(320px,55vh)] overflow-y-auto overflow-x-hidden">
                                            {filteredCustomers.length === 0 ? (
                                                <div className="text-center py-4 px-3">
                                                    <p className="text-sm text-muted-foreground mb-2">
                                                        Không tìm thấy khách hàng
                                                    </p>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => {
                                                            setIsEditingCustomer(false);
                                                            setShowCreateCustomerDialog(true);
                                                            setCustomerDropdownOpen(false);
                                                        }}
                                                        className="gap-1"
                                                    >
                                                        <UserPlus className="h-3 w-3" />
                                                        Thêm mới
                                                    </Button>
                                                </div>
                                            ) : (
                                                filteredCustomers.slice(0, 10).map(c => (
                                                    <button
                                                        key={c.id}
                                                        type="button"
                                                        onClick={() => {
                                                            setCustomerId(c.id);
                                                            setCustomerSearch('');
                                                            setCustomerDropdownOpen(false);
                                                        }}
                                                        className="w-full flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors text-left border-b border-border/60 last:border-b-0"
                                                    >
                                                        <Avatar className="h-9 w-9 shrink-0">
                                                            <AvatarFallback className="bg-primary/10 text-primary text-sm">
                                                                {c.name.charAt(0)}
                                                            </AvatarFallback>
                                                        </Avatar>
                                                        <div className="min-w-0 flex-1">
                                                            <p className="font-medium text-sm leading-snug break-words">{c.name}</p>
                                                            <p className="text-xs text-muted-foreground tabular-nums mt-0.5">{c.phone}</p>
                                                        </div>
                                                    </button>
                                                ))
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Click outside to close dropdown */}
                                {customerDropdownOpen && (
                                    <div
                                        className="fixed inset-0 z-40"
                                        onClick={() => setCustomerDropdownOpen(false)}
                                    />
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Step 2: Add Products */}
            {step === 2 && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 space-y-4">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <h2 className="text-base font-semibold sm:text-lg">Sản phẩm khách hàng ({products.length})</h2>
                            <Button onClick={handleAddProduct} className="w-full gap-2 sm:w-auto">
                                <Plus className="h-4 w-4" />
                                Thêm sản phẩm
                            </Button>
                        </div>

                        {products.length === 0 ? (
                            <Card className="border-dashed">
                                <CardContent className="py-8 text-center">
                                    <Package className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                                    <h3 className="text-lg font-medium mb-2">Chưa có sản phẩm nào</h3>
                                    <p className="text-muted-foreground mb-4">
                                        Thêm sản phẩm khách hàng mang đến (giày, túi, ví...)
                                    </p>
                                    <Button onClick={handleAddProduct} className="gap-2">
                                        <Plus className="h-4 w-4" />
                                        Thêm sản phẩm đầu tiên
                                    </Button>
                                </CardContent>
                            </Card>
                        ) : (
                            <div className="space-y-4">
                                {products.map((product, index) => {
                                    const productNumber = products.length - index;
                                    const isCurrent = currentProductId === product.id;
                                    const isConfirmed = confirmedProductIds.has(product.id);

                                    return (
                                    <Card key={product.id} className={cn('min-w-0 overflow-hidden', isCurrent ? 'ring-2 ring-primary' : '')}>
                                        <CardHeader className="space-y-3 pb-3">
                                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                                <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center">
                                                    {isConfirmed && (
                                                        <div className="flex shrink-0 flex-col items-center rounded border bg-white p-1 shadow-sm">
                                                            <QRCodeSVG
                                                                value={`${nextOrderCode || 'HĐ1'}.${productNumber}`}
                                                                size={50}
                                                                level="M"
                                                            />
                                                            <p className="mt-0.5 text-center font-mono text-[10px] font-bold text-primary">
                                                                {nextOrderCode || 'HĐ1'}.{productNumber}
                                                            </p>
                                                        </div>
                                                    )}
                                                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                                                        <Badge variant="outline" className="shrink-0">
                                                            {productTypes.find(t => t.code === product.type)?.name || 'Khác'}
                                                        </Badge>
                                                        <CardTitle className="min-w-0 break-words text-base leading-snug">
                                                            {product.name || `Sản phẩm ${productNumber}`}
                                                        </CardTitle>
                                                    </div>
                                                </div>
                                                <div className="flex shrink-0 items-center justify-end gap-1">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-9 px-3"
                                                        onClick={() => {
                                                            if (isCurrent) {
                                                                setConfirmedProductIds(prev => new Set([...prev, product.id]));
                                                                setCurrentProductId(null);
                                                            } else {
                                                                if (currentProductId) {
                                                                    setConfirmedProductIds(prev => new Set([...prev, currentProductId]));
                                                                }
                                                                setCurrentProductId(product.id);
                                                            }
                                                        }}
                                                    >
                                                        {isCurrent ? 'Thu gọn' : 'Sửa'}
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-9 w-9 text-red-500 hover:text-red-600"
                                                        onClick={() => handleRemoveProduct(index)}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </div>
                                            <div className="flex flex-col gap-2 rounded-lg border border-dashed bg-muted/40 p-2.5 sm:flex-row sm:items-center sm:border-0 sm:bg-transparent sm:p-0">
                                                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                                                    <Calendar className="h-4 w-4 shrink-0 text-primary" />
                                                    <span>Hạn trả đồ</span>
                                                </div>
                                                <Input
                                                    type="date"
                                                    value={product.due_at || ''}
                                                    onChange={(e) => handleUpdateProduct(index, 'due_at', e.target.value)}
                                                    className="h-9 w-full border-dashed text-sm transition-all focus:border-solid sm:w-[160px]"
                                                />
                                            </div>
                                        </CardHeader>

                                        {isCurrent && (
                                            <CardContent className="space-y-4 border-t pt-4">
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    <div className="space-y-2">
                                                        <Label>Tên sản phẩm *</Label>
                                                        <Input
                                                            placeholder="VD: Giày Nike Air Max đen"
                                                            value={product.name}
                                                            onChange={(e) => handleUpdateProduct(index, 'name', e.target.value)}
                                                        />
                                                    </div>

                                                    <div className="space-y-2">
                                                        <Label>Loại sản phẩm</Label>
                                                        <ProductTypeCombobox
                                                            value={product.type}
                                                            productTypes={productTypes}
                                                            onChange={(v) => handleUpdateProduct(index, 'type', v)}
                                                            onCreate={createProductType}
                                                        />
                                                    </div>

                                                    <div className="space-y-2">
                                                        <Label>Hãng/Thương hiệu</Label>
                                                        <BrandCombobox
                                                            value={product.brand}
                                                            onChange={(v) => handleUpdateProduct(index, 'brand', v)}
                                                        />
                                                    </div>

                                                    <div className="space-y-2">
                                                        <Label>Màu sắc</Label>
                                                        <Input
                                                            placeholder="VD: Đen, trắng, xanh navy"
                                                            value={product.color}
                                                            onChange={(e) => handleUpdateProduct(index, 'color', e.target.value)}
                                                        />
                                                    </div>

                                                    <div className="space-y-2">
                                                        <Label>Size</Label>
                                                        <Input
                                                            placeholder="VD: 42, M, 25cm"
                                                            value={product.size}
                                                            onChange={(e) => handleUpdateProduct(index, 'size', e.target.value)}
                                                        />
                                                    </div>

                                                    <div className="space-y-2">
                                                        <Label>Chất liệu</Label>
                                                        <Input
                                                            placeholder="VD: Da thật, vải canvas"
                                                            value={product.material}
                                                            onChange={(e) => handleUpdateProduct(index, 'material', e.target.value)}
                                                        />
                                                    </div>
                                                </div>

                                                <div className="space-y-2">
                                                    <Label>Tình trạng ban đầu</Label>
                                                    <Textarea
                                                        placeholder="Mô tả tình trạng sản phẩm khi nhận: vết bẩn, trầy xước, phai màu..."
                                                        value={product.condition_before}
                                                        onChange={(e) => handleUpdateProduct(index, 'condition_before', e.target.value)}
                                                        rows={2}
                                                    />
                                                </div>

                                                <div className="space-y-2">
                                                    <Label>Ảnh sản phẩm</Label>
                                                    <ImageUpload
                                                        value={product.images[0] ?? null}
                                                        onChange={(url) => handleUpdateProduct(index, 'images', url ? [url] : [])}
                                                        bucket="products"
                                                        folder="images"
                                                    />
                                                </div>


                                                {/* Confirm Button */}
                                                <div className="flex justify-end pt-2 border-t">
                                                    <Button
                                                        onClick={() => {
                                                            if (!product.name.trim()) {
                                                                toast.error('Vui lòng nhập tên sản phẩm');
                                                                return;
                                                            }
                                                            setConfirmedProductIds(prev => new Set([...prev, product.id]));
                                                            setCurrentProductId(null);
                                                        }}
                                                        className="bg-green-600 hover:bg-green-700"
                                                    >
                                                        <Check className="h-4 w-4 mr-2" />
                                                        Xác nhận & Thu gọn
                                                    </Button>
                                                </div>
                                            </CardContent>
                                        )}

                                        {/* Show service selection and product info when confirmed OR when name is entered */}
                                        {(isConfirmed || (!isCurrent && product.name)) && (
                                            <CardContent className={`${isCurrent ? 'pt-0 border-t-0' : 'pt-0'} space-y-3`}>
                                                {/* Product info badges (only show when collapsed) */}
                                                {!isCurrent && (
                                                    <div className="flex flex-wrap gap-2 text-sm text-muted-foreground pb-2">
                                                        {product.brand && <Badge variant="outline">{product.brand}</Badge>}
                                                        {product.color && <Badge variant="outline">{product.color}</Badge>}
                                                        {product.size && <Badge variant="outline">Size {product.size}</Badge>}
                                                        {product.due_at && (
                                                            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                                                                <Calendar className="h-3 w-3 mr-1" /> Trả: {new Date(product.due_at).toLocaleDateString('vi-VN')}
                                                            </Badge>
                                                        )}
                                                        {isConfirmed && (
                                                            <Badge className="bg-green-100 text-green-700">
                                                                <Check className="h-3 w-3 mr-1" /> Đã xác nhận
                                                            </Badge>
                                                        )}
                                                    </div>
                                                )}

                                                {/* Show service count for non-confirmed products */}
                                                {!isConfirmed && product.services.length > 0 && (
                                                    <Badge className="bg-green-100 text-green-700">
                                                        {product.services.length} dịch vụ
                                                    </Badge>
                                                )}

                                                {/* Surcharge section for product */}
                                                {(isConfirmed || product.name) && (
                                                    <div className="border-t pt-3 space-y-2">
                                                        <div className="flex items-center justify-between">
                                                            <p className="text-sm font-medium text-orange-700">Phụ phí cho sản phẩm:</p>
                                                            <Select value="" onValueChange={(type) => handleAddProductSurcharge(index, type)}>
                                                                <SelectTrigger className="h-7 w-[150px] text-[10px] bg-orange-50 border-orange-200">
                                                                    <SelectValue placeholder="+ Thêm phụ phí" />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    {SURCHARGE_TYPES.filter(t => !(product.surcharges || []).some(ps => ps.type === t.value)).map(t => (
                                                                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                                                                    ))}
                                                                </SelectContent>
                                                            </Select>
                                                        </div>
                                                        
                                                        {product.surcharges && product.surcharges.length > 0 && (
                                                            <div className="space-y-2">
                                                                {product.surcharges.map((surcharge) => {
                                                                    const servicesPrice = product.services.reduce((ssum, s) => ssum + s.price, 0);
                                                                    const amount = surcharge.isPercent ? Math.round(servicesPrice * (surcharge.value || 0) / 100) : (surcharge.value || 0);
                                                                    
                                                                    return (
                                                                        <div key={surcharge.id} className="flex items-center gap-2 bg-orange-50/50 p-2 rounded-lg border border-orange-200/50 text-xs">
                                                                            <span className="flex-1 font-medium">{surcharge.label}</span>
                                                                            <div className="flex items-center gap-1.5">
                                                                                <Input
                                                                                    type="number"
                                                                                    value={surcharge.value}
                                                                                    onFocus={(e) => e.target.select()}
                                                                                    onChange={(e) => handleUpdateProductSurcharge(index, surcharge.id, 'value', e.target.value)}
                                                                                    className="w-16 h-7 text-xs text-center"
                                                                                />
                                                                                <Button
                                                                                    variant="ghost"
                                                                                    size="sm"
                                                                                    className={`h-7 px-2 text-[10px] ${surcharge.isPercent ? 'bg-orange-200 text-orange-800' : 'bg-gray-100'}`}
                                                                                    onClick={() => handleUpdateProductSurcharge(index, surcharge.id, 'isPercent', !surcharge.isPercent)}
                                                                                >
                                                                                    {surcharge.isPercent ? '%' : 'đ'}
                                                                                </Button>
                                                                                <span className="font-semibold text-orange-600 min-w-[70px] text-right">
                                                                                    = {formatCurrency(amount)}
                                                                                </span>
                                                                                <Button
                                                                                    variant="ghost"
                                                                                    size="icon"
                                                                                    className="h-7 w-7 text-red-400"
                                                                                    onClick={() => handleRemoveProductSurcharge(index, surcharge.id)}
                                                                                >
                                                                                    <X className="h-3.5 w-3.5" />
                                                                                </Button>
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                {/* Tiền cọc theo SP */}
                                                {(isCurrent || isConfirmed) && product.services.length > 0 && (
                                                    <div className="border-t pt-3 space-y-2 rounded-lg border border-amber-200 bg-amber-50/40 p-3">
                                                        <Label className="text-xs font-bold uppercase text-amber-800">
                                                            Tiền cọc sản phẩm ({nextOrderCode || 'HĐ'}.{productNumber})
                                                        </Label>
                                                        <Input
                                                            type="text"
                                                            value={getProductDepositTotal(product) ? formatInputCurrency(getProductDepositTotal(product)) : ''}
                                                            onFocus={(e) => e.target.select()}
                                                            onChange={(e) => handleSetProductDeposit(index, parseInputCurrency(e.target.value))}
                                                            placeholder="VD: 500.000"
                                                            className="h-9 border-amber-200 bg-white focus-visible:ring-amber-400"
                                                            disabled={false}
                                                        />
                                                        {getProductDepositTotal(product) > 0 && (
                                                            <p className="text-[10px] text-amber-800">
                                                                Đã cọc: {formatCurrency(getProductDepositTotal(product))}
                                                                {' · '}
                                                                Còn lại dịch vụ: {formatCurrency(
                                                                    Math.max(
                                                                        0,
                                                                        product.services.reduce((s, sv) => s + sv.price, 0) -
                                                                            getProductDepositTotal(product)
                                                                    )
                                                                )}
                                                            </p>
                                                        )}
                                                    </div>
                                                )}

                                                {/* Service selection for confirmed products */}
                                                {isConfirmed && (
                                                    <div className="border-t pt-3 space-y-3">
                                                        {/* Added services list with technicians */}
                                                        {product.services.length > 0 && (
                                                            <div className="space-y-3">
                                                                <p className="text-sm font-medium text-green-700">Dịch vụ đã chọn:</p>
                                                                {product.services.map((s, si) => (
                                                                    <div key={si} className="bg-green-50 p-2 rounded-lg space-y-1">
                                                                        {/* Service info row */}
                                                                        <div className="flex items-center justify-between">
                                                                            <div className="flex-1 min-w-0">
                                                                                <p className="text-sm font-medium">{s.name}</p>
                                                                                <div className="flex flex-wrap items-center gap-2 mt-0.5">
                                                                                    <div className="flex items-center gap-1">
                                                                                        <Input
                                                                                            type="text"
                                                                                            value={formatInputCurrency(s.price)}
                                                                                            onFocus={(e) => e.target.select()}
                                                                                            onChange={(e) => handleUpdateServicePrice(index, si, parseInputCurrency(e.target.value))}
                                                                                            className="h-6 w-28 text-xs text-green-600 font-semibold px-1.5 border-dashed focus:border-solid"
                                                                                        />
                                                                                        <span className="text-[10px] text-green-600">đ</span>
                                                                                    </div>
                                                                                    <div className="flex items-center gap-1">
                                                                                        <span className="text-[10px] text-amber-700">Cọc:</span>
                                                                                        <Input
                                                                                            type="text"
                                                                                            value={s.deposit_amount ? formatInputCurrency(s.deposit_amount) : ''}
                                                                                            onFocus={(e) => e.target.select()}
                                                                                            onChange={(e) => {
                                                                                                const val = Math.min(
                                                                                                    parseInputCurrency(e.target.value),
                                                                                                    s.price || 0
                                                                                                );
                                                                                                setProducts(prev => prev.map((p, pi) => {
                                                                                                    if (pi !== index) return p;
                                                                                                    return {
                                                                                                        ...p,
                                                                                                        services: p.services.map((svc, sii) =>
                                                                                                            sii === si ? { ...svc, deposit_amount: val } : svc
                                                                                                        ),
                                                                                                    };
                                                                                                }));
                                                                                            }}
                                                                                            className="h-6 w-24 text-xs text-amber-700 font-semibold px-1.5 border-amber-200"
                                                                                        />
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                            <Button
                                                                                variant="ghost"
                                                                                size="icon"
                                                                                className="h-6 w-6 text-red-500 hover:text-red-600"
                                                                                onClick={() => handleRemoveService(index, si)}
                                                                            >
                                                                                <Trash2 className="h-3 w-3" />
                                                                            </Button>
                                                                        </div>

                                                                        {/* Technicians section - compact */}
                                                                        <div className="pt-1">
                                                                            <p className="text-xs text-muted-foreground mb-1">Kỹ thuật viên:</p>

                                                                            {/* Assigned technicians */}
                                                                            {s.technicians && s.technicians.length > 0 ? (
                                                                                <div className="mb-2 space-y-2">
                                                                                    {s.technicians.map((tech, ti) => (
                                                                                        <div key={ti} className="rounded-lg border bg-white p-2.5 text-xs">
                                                                                            <div className="flex items-start gap-2">
                                                                                                <Avatar className="h-7 w-7 shrink-0">
                                                                                                    <AvatarFallback className="bg-blue-100 text-[10px] text-blue-700">
                                                                                                        {tech.name.charAt(0)}
                                                                                                    </AvatarFallback>
                                                                                                </Avatar>
                                                                                                <p className="min-w-0 flex-1 break-words font-medium leading-snug">
                                                                                                    {tech.name}
                                                                                                </p>
                                                                                                <Button
                                                                                                    variant="ghost"
                                                                                                    size="icon"
                                                                                                    className="-mr-1 h-7 w-7 shrink-0 text-red-400 hover:text-red-600 touch-manipulation"
                                                                                                    onClick={() => handleRemoveTechnicianFromService(index, si, tech.id)}
                                                                                                >
                                                                                                    <X className="h-3.5 w-3.5" />
                                                                                                </Button>
                                                                                            </div>
                                                                                            <div className="mt-2 flex items-center gap-2 border-t border-dashed border-muted/60 pt-2 pl-9 sm:pl-0 sm:mt-1.5 sm:border-0 sm:pt-0">
                                                                                                <div className="flex items-center gap-1">
                                                                                                    <Input
                                                                                                        type="number"
                                                                                                        min="0"
                                                                                                        max="100"
                                                                                                        value={tech.commission || 0}
                                                                                                        onChange={(e) => handleUpdateTechnicianCommission(index, si, tech.id, Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)))}
                                                                                                        onFocus={(e) => e.target.select()}
                                                                                                        className="h-8 w-16 text-center text-xs p-1"
                                                                                                    />
                                                                                                    <span className="text-[10px] text-muted-foreground">%</span>
                                                                                                </div>
                                                                                                <span className="ml-auto text-right text-xs font-semibold text-emerald-600">
                                                                                                    {formatCurrency(s.price * (tech.commission || 0) / 100)}
                                                                                                </span>
                                                                                            </div>
                                                                                        </div>
                                                                                    ))}
                                                                                </div>
                                                                            ) : null}

                                                                            {/* Add technician dropdown */}
                                                                            <Select
                                                                                value=""
                                                                                onValueChange={(techId) => {
                                                                                    if (techId) handleAddTechnicianToService(index, si, techId);
                                                                                }}
                                                                            >
                                                                                <SelectTrigger className="h-7 text-xs">
                                                                                    <SelectValue placeholder="+ Chọn kỹ thuật viên" />
                                                                                </SelectTrigger>
                                                                                <SelectContent>
                                                                                    {availableTechnicians
                                                                                        .filter(tech => !s.technicians?.some(t => t.id === tech.id))
                                                                                        .map(tech => (
                                                                                            <SelectItem key={tech.id} value={tech.id}>
                                                                                                {tech.name}
                                                                                            </SelectItem>
                                                                                        ))}
                                                                                </SelectContent>
                                                                            </Select>
                                                                        </div>

                                                                        {/* Sales section - compact */}
                                                                        <div className="pt-1 mt-2 border-t border-dashed">
                                                                            <p className="text-xs text-muted-foreground mb-1">Nhân viên sales:</p>

                                                                            {/* Assigned sales */}
                                                                            {s.sales && s.sales.length > 0 ? (
                                                                                <div className="mb-2 space-y-2">
                                                                                    {s.sales.map((sale, sai) => (
                                                                                        <div key={sai} className="rounded-lg border bg-white p-2.5 text-xs">
                                                                                            <div className="flex items-start gap-2">
                                                                                                <Avatar className="h-7 w-7 shrink-0">
                                                                                                    <AvatarFallback className="bg-amber-100 text-[10px] text-amber-700">
                                                                                                        {sale.name.charAt(0)}
                                                                                                    </AvatarFallback>
                                                                                                </Avatar>
                                                                                                <p className="min-w-0 flex-1 break-words font-medium leading-snug">
                                                                                                    {sale.name}
                                                                                                </p>
                                                                                                <Button
                                                                                                    variant="ghost"
                                                                                                    size="icon"
                                                                                                    className="-mr-1 h-7 w-7 shrink-0 text-red-400 hover:text-red-600 touch-manipulation"
                                                                                                    onClick={() => handleRemoveSaleFromService(index, si, sale.id)}
                                                                                                >
                                                                                                    <X className="h-3.5 w-3.5" />
                                                                                                </Button>
                                                                                            </div>
                                                                                            <div className="mt-2 flex items-center gap-2 border-t border-dashed border-muted/60 pt-2 pl-9 sm:pl-0 sm:mt-1.5 sm:border-0 sm:pt-0">
                                                                                                <div className="flex items-center gap-1">
                                                                                                    <Input
                                                                                                        type="number"
                                                                                                        min="0"
                                                                                                        max="100"
                                                                                                        value={sale.commission || 0}
                                                                                                        onChange={(e) => handleUpdateSaleCommission(index, si, sale.id, Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)))}
                                                                                                        onFocus={(e) => e.target.select()}
                                                                                                        className="h-8 w-16 text-center text-xs p-1"
                                                                                                    />
                                                                                                    <span className="text-[10px] text-muted-foreground">%</span>
                                                                                                </div>
                                                                                                <span className="ml-auto text-right text-xs font-semibold text-amber-600">
                                                                                                    {formatCurrency(s.price * (sale.commission || 0) / 100)}
                                                                                                </span>
                                                                                            </div>
                                                                                        </div>
                                                                                    ))}
                                                                                </div>
                                                                            ) : null}

                                                                            {/* Add sale dropdown */}
                                                                            <Select
                                                                                value=""
                                                                                onValueChange={(saleId) => {
                                                                                    if (saleId) handleAddSaleToService(index, si, saleId);
                                                                                }}
                                                                            >
                                                                                <SelectTrigger className="h-7 text-xs">
                                                                                    <SelectValue placeholder="+ Chọn nhân viên sales" />
                                                                                </SelectTrigger>
                                                                                <SelectContent>
                                                                                    {availableSales
                                                                                        .filter(sale => !s.sales?.some(sl => sl.id === sale.id))
                                                                                        .map(sale => (
                                                                                            <SelectItem key={sale.id} value={sale.id}>
                                                                                                {sale.name}
                                                                                            </SelectItem>
                                                                                        ))}
                                                                                </SelectContent>
                                                                            </Select>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}

                                                        {/* Add Service Button */}
                                                        <div className="w-full">
                                                            <ServiceSelector
                                                                services={services}
                                                                packages={packages}
                                                                productType={product.type}
                                                                onSelect={(service) => handleServiceClick(index, service)}
                                                            />
                                                        </div>
                                                    </div>
                                                )}
                                            </CardContent>
                                        )}
                                    </Card>
                                    );
                                })}
                            </div>
                        )}

                        {/* Sản phẩm bán kèm */}
                        <Card>
                            <CardHeader className="pb-3">
                                <div className="flex items-center justify-between">
                                    <CardTitle className="text-base flex items-center gap-2">
                                        <Tag className="h-5 w-5 text-amber-600" />
                                        Sản phẩm bán kèm
                                    </CardTitle>
                                    <Button variant="outline" size="sm" onClick={() => setAddOnDialogOpen(true)} className="gap-1">
                                        <Plus className="h-4 w-4" />
                                        Thêm SP bán kèm
                                    </Button>
                                </div>
                                <p className="text-sm text-muted-foreground">Sản phẩm từ danh mục bán kèm theo đơn (không gắn dịch vụ)</p>
                            </CardHeader>
                            {addOnProducts.length > 0 ? (
                                <CardContent className="space-y-2">
                                    {addOnProducts.map((a) => (
                                        <div key={a.id} className="flex flex-col gap-3 p-3 bg-amber-50/50 rounded-lg border border-amber-200/50">
                                            <div className="flex items-center justify-between gap-3">
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-medium truncate">{a.name}</p>
                                                    <p className="text-sm text-muted-foreground">{formatCurrency(a.price)} × {a.quantity}</p>
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0">
                                                    <Input
                                                        type="number"
                                                        min={1}
                                                        value={a.quantity}
                                                        onChange={(e) => handleUpdateAddOnQuantity(a.id, Math.max(1, parseInt(e.target.value, 10) || 1))}
                                                        className="w-16 h-8 text-center"
                                                    />
                                                    <span className="font-semibold text-amber-700 w-24 text-right">{formatCurrency(a.price * a.quantity)}</span>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => handleRemoveAddOn(a.id)}>
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </div>

                                            {/* Sales assignment for add-on */}
                                            <div className="pt-2 border-t border-amber-200/60">
                                                <p className="text-[10px] font-medium text-amber-800 uppercase mb-2">Nhân viên sales</p>
                                                {a.sales && a.sales.length > 0 && (
                                                    <div className="mb-2 space-y-2">
                                                        {a.sales.map((sale, sai) => (
                                                            <div key={sai} className="rounded-lg border bg-white p-2.5 text-xs">
                                                                <div className="flex items-start gap-2">
                                                                    <Avatar className="h-7 w-7 shrink-0">
                                                                        <AvatarFallback className="bg-amber-100 text-[10px] text-amber-700">
                                                                            {sale.name.charAt(0)}
                                                                        </AvatarFallback>
                                                                    </Avatar>
                                                                    <p className="min-w-0 flex-1 break-words font-medium leading-snug">
                                                                        {sale.name}
                                                                    </p>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        className="-mr-1 h-7 w-7 shrink-0 text-red-400 hover:text-red-600 touch-manipulation"
                                                                        onClick={() => handleRemoveSaleFromAddOn(a.id, sale.id)}
                                                                    >
                                                                        <X className="h-3.5 w-3.5" />
                                                                    </Button>
                                                                </div>
                                                                <div className="mt-2 flex items-center gap-2 border-t border-dashed border-muted/60 pt-2 pl-9">
                                                                    <div className="flex items-center gap-1">
                                                                        <Input
                                                                            type="number"
                                                                            min="0"
                                                                            max="100"
                                                                            value={sale.commission || 0}
                                                                            onChange={(e) => handleUpdateAddOnSaleCommission(a.id, sale.id, Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)))}
                                                                            onFocus={(e) => {
                                                                                e.target.select();
                                                                                if (lastAddedAddOnSale?.addOnId === a.id && lastAddedAddOnSale?.saleId === sale.id) {
                                                                                    setLastAddedAddOnSale(null);
                                                                                }
                                                                            }}
                                                                            className="h-8 w-16 text-center text-xs p-1"
                                                                            autoFocus={lastAddedAddOnSale?.addOnId === a.id && lastAddedAddOnSale?.saleId === sale.id}
                                                                        />
                                                                        <span className="text-[10px] text-muted-foreground">%</span>
                                                                    </div>
                                                                    <span className="ml-auto text-right text-xs font-semibold text-amber-600">
                                                                        {formatCurrency(((a.price * a.quantity) * (sale.commission || 0)) / 100)}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                                <Select value="" onValueChange={(val) => handleAddSaleToAddOn(a.id, val)}>
                                                    <SelectTrigger className="h-7 text-[10px] bg-white/40 border-amber-200/50">
                                                        <SelectValue placeholder="+ Thêm nhân viên sales" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {availableSales
                                                            .filter(s => !a.sales?.some(as => as.id === s.id))
                                                            .map(s => (
                                                                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                                            ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>

                                            {/* Surcharges for add-on */}
                                            <div className="pt-2 mt-2 border-t border-amber-200/60">
                                                <div className="flex items-center justify-between mb-2">
                                                    <p className="text-[10px] font-medium text-amber-800 uppercase">Phụ phí sản phẩm</p>
                                                    <Select value="" onValueChange={(type) => handleAddAddOnSurcharge(a.id, type)}>
                                                        <SelectTrigger className="h-6 w-[120px] text-[9px] bg-white/40 border-amber-200/50">
                                                            <SelectValue placeholder="+ Phụ phí" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {SURCHARGE_TYPES.filter(t => !(a.surcharges || []).some(as => as.type === t.value)).map(t => (
                                                                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                                
                                                {a.surcharges && a.surcharges.length > 0 && (
                                                    <div className="space-y-1.5">
                                                        {a.surcharges.map((s) => {
                                                            const basePrice = (a.price || 0) * (a.quantity || 1);
                                                            const amount = s.isPercent ? Math.round(basePrice * (s.value || 0) / 100) : (s.value || 0);
                                                            return (
                                                                <div key={s.id} className="flex items-center gap-1.5 bg-white p-1.5 rounded border text-[10px]">
                                                                    <span className="flex-1 font-medium">{s.label}</span>
                                                                    <div className="flex items-center gap-1.5">
                                                                        <Input
                                                                            type="number"
                                                                            value={s.value}
                                                                            onFocus={(e) => e.target.select()}
                                                                            onChange={(e) => handleUpdateAddOnSurcharge(a.id, s.id, 'value', e.target.value)}
                                                                            className="w-12 h-6 text-[10px] text-center p-0.5"
                                                                        />
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="sm"
                                                                            className={`h-6 px-1 text-[9px] ${s.isPercent ? 'bg-amber-100' : 'bg-gray-50'}`}
                                                                            onClick={() => handleUpdateAddOnSurcharge(a.id, s.id, 'isPercent', !s.isPercent)}
                                                                        >
                                                                            {s.isPercent ? '%' : 'đ'}
                                                                        </Button>
                                                                        <span className="font-semibold text-amber-700 min-w-[55px] text-right">
                                                                            = {formatCurrency(amount)}
                                                                        </span>
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="icon"
                                                                            className="h-6 w-6 text-red-400"
                                                                            onClick={() => handleRemoveAddOnSurcharge(a.id, s.id)}
                                                                        >
                                                                            <X className="h-3 w-3" />
                                                                        </Button>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                    <p className="text-sm text-muted-foreground pt-1">Tổng SP bán kèm: <span className="font-semibold text-foreground">{formatCurrency(subtotalFromAddOns)}</span></p>
                                </CardContent>
                            ) : (
                                <CardContent className="py-6 text-center text-muted-foreground">
                                    <Tag className="h-10 w-10 mx-auto mb-2 opacity-50" />
                                    <p className="text-sm">Chưa có sản phẩm bán kèm</p>
                                    <Button variant="outline" size="sm" className="mt-2" onClick={() => setAddOnDialogOpen(true)}>Thêm sản phẩm bán kèm</Button>
                                </CardContent>
                            )}
                        </Card>
                    </div>

                    {serviceDepositInput && (
                        <div className="lg:hidden">
                            <Card className="border-amber-200 bg-amber-50/30">
                                <CardContent className="p-4">
                                    {serviceDepositInput}
                                </CardContent>
                            </Card>
                        </div>
                    )}

                    {/* Sidebar */}
                    <div className="hidden lg:block">
                        {orderSidebarContent}
                    </div>
                </div>
            )}

            {/* Step 3: Review */}
            {step === 3 && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left Column - Products */}
                    <div className="lg:col-span-2 space-y-4">
                        {/* Products Summary */}
                        <Card>
                            <CardHeader className="pb-3 border-b">
                                <div className="flex items-center justify-between">
                                    <CardTitle className="text-base flex items-center gap-2">
                                        <ShoppingBag className="h-5 w-5 text-primary" />
                                        Sản phẩm & Dịch vụ
                                    </CardTitle>
                                    <Badge variant="secondary" className="text-sm">
                                        {products.length} sản phẩm khách
                                        {addOnProducts.length > 0 && ` + ${addOnProducts.length} SP bán kèm`}
                                    </Badge>
                                </div>
                            </CardHeader>
                            <CardContent className="p-4 space-y-3">
                                {/* Sản phẩm của khách + dịch vụ */}
                                {products.map((product, index) => (
                                    <div key={product.id} className="bg-muted/30 rounded-xl p-4 hover:bg-muted/50 transition-colors">
                                        <div className="flex items-start gap-4">
                                            {/* QR Code Preview */}
                                            <div className="shrink-0 p-2 bg-white rounded-lg border shadow-sm">
                                                <QRCodeSVG
                                                    value={`${nextOrderCode}.${index + 1}`}
                                                    size={64}
                                                    level="M"
                                                />
                                                <p className="text-[10px] text-center text-muted-foreground mt-1 font-mono font-bold">
                                                    {nextOrderCode}.{index + 1}
                                                </p>
                                            </div>

                                            {/* Product Info */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <Badge className="bg-primary/10 text-primary border-0">
                                                        {productTypes.find(t => t.code === product.type)?.name || 'Khác'}
                                                    </Badge>
                                                    {product.brand && (
                                                        <Badge variant="outline" className="text-xs bg-white">
                                                            {product.brand}
                                                        </Badge>
                                                    )}
                                                </div>
                                                <p className="font-semibold text-lg">{product.name}</p>
                                                <div className="flex flex-wrap gap-1.5 mt-2">
                                                    {product.color && (
                                                        <span className="text-xs text-muted-foreground bg-white px-2 py-1 rounded border">
                                                            Màu: {product.color}
                                                        </span>
                                                    )}
                                                    {product.size && (
                                                        <span className="text-xs text-muted-foreground bg-white px-2 py-1 rounded border">
                                                            Size: {product.size}
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Due date */}
                                                {product.due_at && (
                                                    <div className="mt-2">
                                                        <Badge variant="outline" className="text-xs py-0.5 px-2 bg-blue-50 text-blue-700 border-blue-200 gap-1">
                                                            <Calendar className="h-3 w-3" />
                                                            Hạn trả: {new Date(product.due_at).toLocaleDateString('vi-VN')}
                                                        </Badge>
                                                    </div>
                                                )}

                                                {/* Services */}
                                                {product.services.length > 0 && (
                                                    <div className="mt-3 space-y-2">
                                                        {product.services.map((s, si) => (
                                                            <div key={si} className="flex flex-col gap-2 rounded-lg border bg-white p-3 sm:flex-row sm:items-start sm:justify-between">
                                                                <div className="min-w-0 flex-1">
                                                                    <div className="flex items-center gap-2">
                                                                        <Sparkles className="h-4 w-4 shrink-0 text-purple-500" />
                                                                        <span className="font-medium break-words">{s.name}</span>
                                                                    </div>
                                                                    {(s.technicians.length > 0 || (s.sales && s.sales.length > 0)) && (
                                                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                                                            {s.technicians.map((tech, ti) => (
                                                                                <span key={ti} className="whitespace-nowrap rounded-full bg-blue-50 px-2 py-1 text-[10px] text-blue-600">
                                                                                    KTV: {tech.name} ({tech.commission}%)
                                                                                </span>
                                                                            ))}
                                                                            {s.sales && s.sales.length > 0 && s.sales.map((sale, sai) => (
                                                                                <span key={`s-${sai}`} className="whitespace-nowrap rounded-full bg-amber-50 px-2 py-1 text-[10px] text-amber-600">
                                                                                    Sales: {sale.name} ({sale.commission}%)
                                                                                </span>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                <div className="shrink-0 text-right space-y-0.5">
                                                                    <p className="text-[10px] uppercase text-muted-foreground">Giá dịch vụ</p>
                                                                    <p className="text-base font-bold text-green-600 sm:text-lg">{formatCurrency(s.price)}</p>
                                                                    {(s.deposit_amount || 0) > 0 && (
                                                                        <p className="text-xs font-semibold text-amber-700">
                                                                            Cọc: {formatCurrency(s.deposit_amount || 0)}
                                                                        </p>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                                
                                                {/* Product Surcharges - Step 3 Review */}
                                                {product.surcharges && product.surcharges.length > 0 && (
                                                    <div className="mt-3 space-y-1.5 p-2 bg-orange-50/30 rounded-lg border border-dashed border-orange-200">
                                                        <div className="flex items-center gap-1.5 mb-1">
                                                            <div className="w-1 h-3 bg-orange-400 rounded-full" />
                                                            <span className="text-[11px] font-bold text-orange-700 uppercase tracking-wider">Phụ phí sản phẩm</span>
                                                        </div>
                                                        {product.surcharges.map((surcharge) => {
                                                            const servicesPrice = product.services.reduce((ssum, s) => ssum + s.price, 0);
                                                            const amount = surcharge.isPercent ? Math.round(servicesPrice * (surcharge.value || 0) / 100) : (surcharge.value || 0);
                                                            return (
                                                                <div key={surcharge.id} className="flex justify-between items-center text-xs bg-white/50 px-2 py-1.5 rounded border border-orange-100/50">
                                                                    <span className="text-orange-800 font-medium">
                                                                        {surcharge.label} 
                                                                        {surcharge.isPercent && <span className="ml-1 opacity-70">({surcharge.value}%)</span>}
                                                                    </span>
                                                                    <span className="font-bold text-orange-600">+{formatCurrency(amount)}</span>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}

                                                {product.services.length === 0 && (
                                                    <p className="text-sm text-muted-foreground mt-2 italic">Chưa có dịch vụ</p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}

                                {/* Sản phẩm bán kèm - Step 3 Review */}
                                {addOnProducts.length > 0 && (
                                    <div className="pt-4 border-t mt-4">
                                        <p className="text-sm font-medium text-amber-700 mb-2 flex items-center gap-2">
                                            <Tag className="h-4 w-4" />
                                            Sản phẩm bán kèm
                                        </p>
                                        <div className="space-y-2">
                                            {addOnProducts.map((a) => (
                                                <div key={a.id} className="bg-amber-50/50 p-3 rounded-lg border border-amber-200/50">
                                                    <div className="flex justify-between items-center mb-1">
                                                        <span className="font-medium">{a.name}</span>
                                                        <span className="text-amber-700 font-semibold">{a.quantity} × {formatCurrency(a.price)} = {formatCurrency(a.price * a.quantity)}</span>
                                                    </div>
                                                    {a.surcharges && a.surcharges.length > 0 && (
                                                        <div className="mt-2 space-y-1 pt-2 border-t border-dashed border-amber-200/40">
                                                            {a.surcharges.map((s) => {
                                                                const basePrice = (a.price || 0) * (a.quantity || 1);
                                                                const amount = s.isPercent ? Math.round(basePrice * (s.value || 0) / 100) : (s.value || 0);
                                                                return (
                                                                    <div key={s.id} className="flex justify-between items-center text-[11px]">
                                                                        <span className="text-amber-800 italic opacity-80">
                                                                            {s.label} {s.isPercent ? `(${s.value}%)` : ''}
                                                                        </span>
                                                                        <span className="font-medium text-amber-700">+{formatCurrency(amount)}</span>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                    {a.sales && a.sales.length > 0 && (
                                                        <div className="flex flex-wrap gap-1 mt-1">
                                                            {a.sales.map((sale, sai) => (
                                                                <span key={sai} className="text-[10px] text-amber-600 bg-amber-100/50 px-1.5 py-0.5 rounded border border-amber-200/50">
                                                                    Sales: {sale.name} ({sale.commission}%)
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                    </div>

                    {/* Right Column - Summary & Payment */}
                    <div className="space-y-4">
                        {/* Customer Info */}
                        <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm flex items-center gap-2">
                                    <User className="h-4 w-4" />
                                    Khách hàng
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="flex items-center gap-3">
                                    <Avatar className="h-12 w-12 ring-2 ring-primary/20">
                                        <AvatarFallback className="bg-primary text-white font-bold">
                                            {selectedCustomer?.name.charAt(0)}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div>
                                        <p className="font-semibold">{selectedCustomer?.name}</p>
                                        <p className="text-sm text-muted-foreground">{selectedCustomer?.phone}</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>



                        {/* Discount & Surcharges */}
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm">Giảm giá & Phụ phí</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {/* Discount */}
                                <div className="space-y-2">
                                    <Label className="text-xs text-muted-foreground">Giảm giá</Label>
                                    <div className="flex gap-2">
                                        <div className="relative flex-1">
                                            <Input
                                                type="text"
                                                value={discountType === 'amount' ? formatInputCurrency(discount) : (discount || '')}
                                                onFocus={(e) => e.target.select()}
                                                onChange={(e) => {
                                                    if (discountType === 'amount') {
                                                        setDiscount(parseInputCurrency(e.target.value));
                                                    } else {
                                                        const val = Number(e.target.value.replace(/[^0-9]/g, '')) || 0;
                                                        setDiscount(Math.min(val, 100));
                                                    }
                                                }}
                                                placeholder="0"
                                                className="pr-10"
                                            />
                                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                                                {discountType === 'percent' ? '%' : 'đ'}
                                            </span>
                                        </div>
                                        <div className="flex border rounded-md overflow-hidden">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setDiscountType('amount');
                                                }}
                                                className={`px-2.5 py-1.5 text-xs transition-colors ${discountType === 'amount' ? 'bg-primary text-white' : 'bg-muted hover:bg-muted/80'}`}
                                            >
                                                <DollarSign className="h-4 w-4" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setDiscountType('percent');
                                                    if (discount > 100) setDiscount(100);
                                                }}
                                                className={`px-2.5 py-1.5 text-xs transition-colors ${discountType === 'percent' ? 'bg-primary text-white' : 'bg-muted hover:bg-muted/80'}`}
                                            >
                                                <Percent className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Surcharges */}
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-xs text-muted-foreground">Phụ phí</Label>
                                        <Select onValueChange={handleAddSurcharge}>
                                            <SelectTrigger className="w-auto h-7 text-xs gap-1 px-2">
                                                <Plus className="h-3 w-3" />
                                                <span>Thêm</span>
                                            </SelectTrigger>
                                            <SelectContent>
                                                {SURCHARGE_TYPES.filter(st => !surcharges.some(s => s.type === st.value)).map(st => (
                                                    <SelectItem key={st.value} value={st.value}>
                                                        {st.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    {surcharges.length > 0 && (
                                        <div className="space-y-2">
                                            {surcharges.map(surcharge => (
                                                <div key={surcharge.id} className="p-2 bg-muted/50 rounded-lg">
                                                    <div className="flex items-center justify-between mb-1.5">
                                                        <span className="text-xs font-medium">{surcharge.label}</span>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleRemoveSurcharge(surcharge.id)}
                                                            className="p-1 text-red-500 hover:bg-red-50 rounded"
                                                        >
                                                            <X className="h-3 w-3" />
                                                        </button>
                                                    </div>
                                                    <div className="flex gap-1.5">
                                                        <div className="relative flex-1">
                                                            <Input
                                                                type="text"
                                                                value={surcharge.isPercent ? (surcharge.value || '') : formatInputCurrency(surcharge.value)}
                                                                onFocus={(e) => e.target.select()}
                                                                onChange={(e) => {
                                                                    if (surcharge.isPercent) {
                                                                        const val = Number(e.target.value.replace(/[^0-9]/g, '')) || 0;
                                                                        handleUpdateSurcharge(surcharge.id, 'value', Math.min(val, 100));
                                                                    } else {
                                                                        handleUpdateSurcharge(surcharge.id, 'value', parseInputCurrency(e.target.value));
                                                                    }
                                                                }}
                                                                className="h-8 text-sm pr-8"
                                                                placeholder="0"
                                                            />
                                                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
                                                                {surcharge.isPercent ? '%' : 'đ'}
                                                            </span>
                                                        </div>
                                                        <div className="flex border rounded overflow-hidden">
                                                            <button
                                                                type="button"
                                                                onClick={() => handleUpdateSurcharge(surcharge.id, 'isPercent', false)}
                                                                className={`px-1.5 py-1 text-xs ${!surcharge.isPercent ? 'bg-primary text-white' : 'bg-background'}`}
                                                            >
                                                                <DollarSign className="h-3 w-3" />
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleUpdateSurcharge(surcharge.id, 'isPercent', true)}
                                                                className={`px-1.5 py-1 text-xs ${surcharge.isPercent ? 'bg-primary text-white' : 'bg-background'}`}
                                                            >
                                                                <Percent className="h-3 w-3" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>

                        {/* Payment Summary */}
                        <Card className="bg-gradient-to-br from-green-50 to-emerald-50 border-green-200">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm flex items-center gap-2 text-green-700">
                                    <CreditCard className="h-4 w-4" />
                                    Thanh toán
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {/* Totals */}
                                <div className="space-y-1.5 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Tạm tính</span>
                                        <span>{formatCurrency(subtotal)}</span>
                                    </div>
                                    {discountAmount > 0 && (
                                        <div className="flex justify-between text-red-600">
                                            <span>Giảm giá {discountType === 'percent' ? `(${discount}%)` : ''}</span>
                                            <span>-{formatCurrency(discountAmount)}</span>
                                        </div>
                                    )}
                                    {totalSurcharges > 0 && (
                                        <div className="flex justify-between text-orange-600">
                                            <span>Phụ phí</span>
                                            <span>+{formatCurrency(totalSurcharges)}</span>
                                        </div>
                                    )}
                                    <div className="flex justify-between text-lg font-bold pt-2 border-t border-green-200">
                                        <span>Tổng cộng</span>
                                        <span className="text-green-600">{formatCurrency(total)}</span>
                                    </div>
                                </div>

                                {/* Service deposit */}
                                {serviceDepositInput && (
                                    <div className="space-y-2 pt-2 border-t border-amber-200">
                                        {serviceDepositInput}
                                    </div>
                                )}

                                {/* Payment Method Selection */}
                                 <div className="space-y-2 pt-2 border-t border-green-200">
                                     <Label className="text-xs text-green-700">Phương thức thanh toán</Label>
                                     <div className="grid grid-cols-3 gap-2 pb-2">
                                         <Button
                                             type="button"
                                             variant={paymentMethod === 'cash' ? 'default' : 'outline'}
                                             size="sm"
                                             onClick={() => setPaymentMethod('cash')}
                                             className={`flex flex-col items-center gap-1 h-auto py-2 px-1 ${paymentMethod === 'cash' ? 'bg-green-600 hover:bg-green-700' : 'border-green-200 text-green-700'}`}
                                         >
                                             <DollarSign className="h-4 w-4" />
                                             <span className="text-[10px]">Tiền mặt</span>
                                         </Button>
                                         <Button
                                             type="button"
                                             variant={paymentMethod === 'transfer' ? 'default' : 'outline'}
                                             size="sm"
                                             onClick={() => setPaymentMethod('transfer')}
                                             className={`flex flex-col items-center gap-1 h-auto py-2 px-1 ${paymentMethod === 'transfer' ? 'bg-green-600 hover:bg-green-700' : 'border-green-200 text-green-700'}`}
                                         >
                                             <Smartphone className="h-4 w-4" />
                                             <span className="text-[10px]">Chuyển khoản</span>
                                         </Button>
                                         <Button
                                             type="button"
                                             variant={paymentMethod === 'zalopay' ? 'default' : 'outline'}
                                             size="sm"
                                             onClick={() => setPaymentMethod('zalopay')}
                                             className={`flex flex-col items-center gap-1 h-auto py-2 px-1 ${paymentMethod === 'zalopay' ? 'bg-blue-600 hover:bg-blue-700' : 'border-blue-200 text-blue-700'}`}
                                         >
                                             <Wallet className="h-4 w-4" />
                                             <span className="text-[10px]">Zalo Pay</span>
                                         </Button>
                                     </div>
                                 </div>

                                 {/* Payment Input */}                                <div className="space-y-2 pt-2 border-t border-green-200">
                                    <div className="flex items-center justify-between gap-2">
                                        <Label className="text-xs text-green-700">Số tiền khách thanh toán</Label>
                                        {totalServiceDeposits > 0 && (
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="h-7 px-2 text-[10px] text-green-700 hover:bg-green-100"
                                                onClick={() => setPaidAmount(Math.min(total, totalServiceDeposits))}
                                            >
                                                Dùng tổng cọc
                                            </Button>
                                        )}
                                    </div>
                                    <div className="flex gap-2">
                                        <Input
                                            type="text"
                                            value={formatInputCurrency(paidAmount)}
                                            onFocus={(e) => e.target.select()}
                                            onChange={(e) => setPaidAmount(parseInputCurrency(e.target.value))}
                                            placeholder="Số tiền khách trả"
                                            className="flex-1 border-green-200 focus:ring-green-500"
                                        />
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setPaidAmount(total)}
                                            className="whitespace-nowrap border-green-300 text-green-600 hover:bg-green-50"
                                        >
                                            Đủ
                                        </Button>
                                    </div>
                                </div>

                                {/* Payment Status */}
                                <div className="flex items-center justify-between pt-2 border-t border-green-200">
                                    <div>
                                        <p className="text-xs text-muted-foreground">Còn nợ</p>
                                        <p className={`text-lg font-bold ${remainingDebt > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                            {formatCurrency(remainingDebt)}
                                        </p>
                                    </div>
                                    <Badge
                                        className={remainingDebt <= 0 ? 'bg-green-500' : remainingDebt < total ? 'bg-yellow-500' : 'bg-red-500'}
                                    >
                                        {remainingDebt <= 0 ? 'Đã thanh toán' : remainingDebt < total ? 'Một phần' : 'Chưa thanh toán'}
                                    </Badge>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            )}

            {/* Step 4: Success */}
            {step === 4 && createdOrder && (
                <Card className="text-center py-12">
                    <CardContent>
                        <CheckCircle className="h-20 w-20 text-green-500 mx-auto mb-6" />
                        <h2 className="text-2xl font-bold mb-2">{isEditMode ? 'Cập nhật đơn hàng thành công!' : 'Tạo đơn hàng thành công!'}</h2>
                        <p className="text-muted-foreground mb-6">
                            Mã đơn: <span className="font-mono font-bold">{createdOrder.order?.order_code}</span>
                        </p>

                        {/* QR Codes */}
                        {createdOrder.customer_items && createdOrder.customer_items.length > 0 && (
                            <div className="mb-8">
                                <h3 className="font-semibold mb-4">Mã QR sản phẩm</h3>
                                <div className="flex flex-wrap justify-center gap-6">
                                    {createdOrder.customer_items.map((p: any, index: number) => (
                                        <div key={index} className="p-4 border rounded-lg bg-white shadow-sm">
                                            <QRCodeSVG
                                                value={p.product_code || p.qr_code || `Product-${index + 1}`}
                                                size={140}
                                                level="M"
                                                includeMargin={true}
                                            />
                                            <p className="text-lg font-mono font-bold mt-3 text-primary">{p.product_code || p.qr_code}</p>
                                            <p className="text-sm text-muted-foreground">{p.name}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="mx-auto flex w-full max-w-lg flex-col gap-2 px-1 sm:max-w-none sm:flex-row sm:flex-wrap sm:justify-center sm:gap-3">
                            <Button
                                variant="outline"
                                className="h-10 w-full sm:w-auto"
                                disabled={loadingInvoiceOrder}
                                onClick={handleOpenPrintInvoice}
                            >
                                {loadingInvoiceOrder ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                    <Receipt className="mr-2 h-4 w-4" />
                                )}
                                In hóa đơn
                            </Button>
                            <Button
                                variant="outline"
                                className="h-10 w-full sm:w-auto"
                                onClick={() => {
                                    const printWindow = window.open('', '_blank');
                                    if (printWindow) {
                                        const qrHtml = createdOrder.customer_items?.map((p: any) => `
                                            <div style="display: inline-block; padding: 20px; margin: 10px; border: 1px solid #ccc; border-radius: 8px; text-align: center;">
                                                <canvas id="qr-${p.product_code || p.qr_code}"></canvas>
                                                <p style="font-family: monospace; font-size: 14px; margin-top: 10px;">${p.product_code || p.qr_code}</p>
                                                <p style="font-size: 12px; color: #666;">${p.name || ''}</p>
                                            </div>
                                        `).join('') || '';

                                        printWindow.document.write(`
                                            <html>
                                                <head>
                                                    <title>In mã QR - ${createdOrder.order?.order_code}</title>
                                                    <script src="https://cdn.jsdelivr.net/npm/qrcode/build/qrcode.min.js"></script>
                                                    <style>
                                                        body { font-family: Arial, sans-serif; padding: 20px; text-align: center; }
                                                        h2 { margin-bottom: 20px; }
                                                        .qr-container { display: flex; flex-wrap: wrap; justify-content: center; gap: 20px; }
                                                        @media print { button { display: none; } }
                                                    </style>
                                                </head>
                                                <body>
                                                    <h2>Mã QR sản phẩm - Đơn hàng ${createdOrder.order?.order_code}</h2>
                                                    <div class="qr-container">${qrHtml}</div>
                                                    <script>
                                                        ${createdOrder.customer_items?.map((p: any) => `
                                                            QRCode.toCanvas(document.getElementById('qr-${p.product_code || p.qr_code}'), 
                                                                '${window.location.origin}/product/${p.product_code || p.qr_code}', 
                                                                { width: 150 }, function(err) { if(err) console.error(err); });
                                                        `).join('') || ''}
                                                        setTimeout(() => window.print(), 500);
                                                    </script>
                                                </body>
                                            </html>
                                        `);
                                        printWindow.document.close();
                                    }
                                }}
                            >
                                <QrCode className="mr-2 h-4 w-4" />
                                In mã QR
                            </Button>
                            <Button
                                className="h-10 w-full sm:w-auto"
                                onClick={() => navigate(`/orders/${createdOrder.order?.id}`)}
                            >
                                Xem chi tiết đơn
                            </Button>
                            <Button
                                variant="outline"
                                className="h-10 w-full sm:w-auto"
                                onClick={() => navigate('/orders')}
                            >
                                Về danh sách đơn
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Navigation Buttons */}
            {step < 4 && (
                <div className="flex gap-2 border-t pt-4 sm:gap-3">
                    <Button
                        variant="outline"
                        className="h-10 flex-1 sm:flex-none"
                        onClick={() => setStep(s => Math.max(1, s - 1))}
                        disabled={step === 1}
                    >
                        <ArrowLeft className="mr-2 h-4 w-4 shrink-0" />
                        Quay lại
                    </Button>

                    {step < 3 ? (
                        <Button
                            className="h-10 flex-1 sm:flex-none"
                            onClick={() => setStep(s => s + 1)}
                            disabled={!canGoNext()}
                        >
                            Tiếp tục
                            <ArrowRight className="ml-2 h-4 w-4 shrink-0" />
                        </Button>
                    ) : (
                        <Button
                            onClick={() => handleSubmit('before_sale')}
                            disabled={submitting}
                            className="h-10 flex-1 bg-green-600 hover:bg-green-700 sm:flex-none"
                        >
                            {submitting ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    {isEditMode ? 'Đang cập nhật...' : 'Đang tạo...'}
                                </>
                            ) : (
                                <>
                                    <CheckCircle className="h-4 w-4 mr-2" />
                                    {isEditMode ? 'Cập nhật đơn hàng' : 'Tạo đơn hàng'}
                                </>
                            )}
                        </Button>
                    )}
                </div >
            )}

            {/* Confirmation Dialog */}


            {/* Technician Selection Dialog */}
            <Dialog open={techDialogOpen} onOpenChange={setTechDialogOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Wrench className="h-5 w-5 text-primary" />
                            Chọn kỹ thuật viên
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                            Dịch vụ: <span className="font-medium text-foreground">{pendingService?.service.name}</span>
                        </p>
                        <p className="text-sm text-muted-foreground">
                            Giá: <span className="font-medium text-green-600">{formatCurrency(pendingService?.service.price || 0)}</span>
                            {pendingService?.service.commission_tech !== undefined && (
                                <span className="ml-3">
                                    Hoa hồng: <span className="font-medium text-blue-600">{pendingService.service.commission_tech}%</span>
                                </span>
                            )}
                        </p>

                        <div className="space-y-2 max-h-64 overflow-y-auto">
                            {availableTechnicians.length === 0 ? (
                                <p className="text-center text-muted-foreground py-4">
                                    Không có kỹ thuật viên nào
                                </p>
                            ) : (
                                availableTechnicians.map(tech => (
                                    <button
                                        key={tech.id}
                                        onClick={() => handleConfirmAddService([{ id: tech.id, name: tech.name }])}
                                        className="w-full flex items-center gap-3 p-3 border rounded-lg hover:border-primary hover:bg-primary/5 transition-colors group"
                                    >
                                        <Avatar className="h-10 w-10">
                                            {tech.avatar ? (
                                                <AvatarImage src={tech.avatar} alt={tech.name} />
                                            ) : null}
                                            <AvatarFallback className="bg-blue-100 text-blue-700">
                                                {tech.name.charAt(0)}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className="text-left flex-1">
                                            <p className="font-medium">{tech.name}</p>
                                            <p className="text-xs text-muted-foreground">{tech.phone}</p>
                                        </div>
                                        <UserCheck className="h-5 w-5 text-primary opacity-0 group-hover:opacity-100" />
                                    </button>
                                ))
                            )}
                        </div>
                    </div>
                    <DialogFooter className="flex gap-2">
                        <Button
                            variant="outline"
                            onClick={() => {
                                setTechDialogOpen(false);
                                setPendingService(null);
                            }}
                        >
                            Hủy
                        </Button>
                        <Button
                            variant="secondary"
                            onClick={() => handleConfirmAddService()}
                        >
                            Thêm không chọn KTV
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Create/Edit Customer Dialog */}
            <CreateCustomerDialog
                open={showCreateCustomerDialog}
                onClose={() => {
                    setShowCreateCustomerDialog(false);
                    setIsEditingCustomer(false);
                }}
                customer={isEditingCustomer ? selectedCustomer : null}
                onSubmit={isEditingCustomer ? handleUpdateCustomer : handleCreateCustomer}
                initialName={!isEditingCustomer && /^[a-zA-Z\sÀ-ỹ]+$/.test(customerSearch) ? customerSearch : ''}
                initialPhone={!isEditingCustomer && /^[0-9\s.+]+$/.test(customerSearch) && customerSearch.replace(/[^0-9]/g, '').length >= 9 ? customerSearch : ''}
                employees={availableSales}
            />

            {/* Sản phẩm bán kèm Dialog */}
            <Dialog open={addOnDialogOpen} onOpenChange={setAddOnDialogOpen}>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Tag className="h-5 w-5 text-amber-600" />
                            Chọn sản phẩm bán kèm
                        </DialogTitle>
                        <p className="text-sm text-muted-foreground">Sản phẩm từ danh mục bán kèm theo đơn (không gắn dịch vụ)</p>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Tìm sản phẩm..."
                                value={addOnSearch}
                                onChange={(e) => setAddOnSearch(e.target.value)}
                                className="pl-10"
                            />
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-[50vh] overflow-y-auto">
                            {(catalogProducts || [])
                                .filter((p: { status: string; name: string }) => p.status === 'active')
                                .filter((p: { name: string }) => !addOnSearch.trim() || p.name.toLowerCase().includes(addOnSearch.toLowerCase()))
                                .map((p: any) => (
                                    <button
                                        key={p.id}
                                        type="button"
                                        onClick={() => handleAddAddOn(p)}
                                        className="p-3 text-left border rounded-lg hover:border-amber-500 hover:bg-amber-50/50 transition-colors"
                                    >
                                        <p className="font-medium text-sm truncate">{p.name}</p>
                                        <p className="text-amber-700 font-semibold text-sm mt-1">{formatCurrency(p.price)}</p>
                                    </button>
                                ))}
                        </div>
                        {(catalogProducts || []).filter((p: { status: string }) => p.status === 'active').length === 0 && (
                            <p className="text-sm text-muted-foreground text-center py-4">Chưa có sản phẩm trong danh mục</p>
                        )}
                    </div>
                </DialogContent>
            </Dialog>


            {/* Service Selection Dialog for confirmed products - REMOVED */}

            <PrintThermalInvoiceDialog
                order={invoicePrintOrder}
                open={showInvoicePrintDialog}
                onClose={() => setShowInvoicePrintDialog(false)}
            />
        </div>
    );
}
