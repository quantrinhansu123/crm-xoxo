import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Package, Wrench, Gift, CreditCard, Tags } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { useProducts } from '@/hooks/useProducts';
import { usePackages } from '@/hooks/usePackages';
import { useVouchers } from '@/hooks/useVouchers';
import { useDepartments } from '@/hooks/useDepartments';
import { useProductTypes, type ProductType } from '@/hooks/useProductTypes';
import { toast } from 'sonner';

import {
    VoucherFormDialog,
    ProductTypeFormDialog,
    ProductsTable,
    ServicesTable,
    PackagesTable,
    VouchersTable,
    ProductTypesTable,
    type Product,
    type Service,
    type ServicePackage,
    type APIVoucher,
} from '@/components/products';
import { type ServiceDepartment } from '@/components/products/types';
import api from '@/lib/api';

// Main Page Component
interface ProductsPageProps {
    initialTab?: 'products' | 'services' | 'packages' | 'vouchers' | 'product-types';
    onTabChange?: (tab: string) => void;
}

export function ProductsPage({ initialTab = 'products', onTabChange }: ProductsPageProps) {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState(initialTab);
    const [searchTerm, setSearchTerm] = useState('');

    const {
        products,
        services,
        loading,
        fetchProducts,
        fetchServices,
        createProduct,
        updateProduct,
        deleteProduct,
        createService,
        updateService,
        deleteService,
    } = useProducts();

    const {
        packages,
        fetchPackages,
        createPackage,
        updatePackage,
        deletePackage,
    } = usePackages();

    const {
        vouchers,
        fetchVouchers,
        createVoucher,
        updateVoucher,
        deleteVoucher,
    } = useVouchers();

    const {
        productTypes,
        fetchProductTypes,
        createProductType,
        updateProductType,
        deleteProductType,
    } = useProductTypes();

    const { departments, fetchDepartments } = useDepartments();

    // Fetch data on mount
    useEffect(() => {
        fetchProducts();
        fetchServices();
        fetchPackages();
        fetchVouchers();
        fetchProductTypes();
        fetchDepartments();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Sync activeTab with initialTab when sidebar navigation changes
    useEffect(() => {
        setActiveTab(initialTab);
    }, [initialTab]);

    // Handle tab change and notify parent
    const handleTabChange = (tab: string) => {
        const typedTab = tab as 'products' | 'services' | 'packages' | 'vouchers' | 'product-types';
        setActiveTab(typedTab);
        const tabToPageMap: Record<string, string> = {
            'products': 'product-list',
            'services': 'services',
            'packages': 'packages',
            'vouchers': 'vouchers',
            'product-types': 'product-types'
        };
        if (onTabChange) {
            onTabChange(tabToPageMap[tab] || tab);
        }
    };

    // Dialog states
    const [showVoucherForm, setShowVoucherForm] = useState(false);
    const [showProductTypeForm, setShowProductTypeForm] = useState(false);
    const [editingItem, setEditingItem] = useState<any>(null);

    // Filtered data
    const filteredProducts = products.filter(p =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.code.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const filteredServices = services.filter(s =>
        s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.code.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const filteredPackages = packages.filter(p =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.code.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const filteredVouchers = vouchers.filter(v =>
        v.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        v.code.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const filteredProductTypes = productTypes.filter(t =>
        t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.code.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Product handlers
    const handleCreateProduct = async (data: Partial<Product>) => {
        try {
            await createProduct(data);
            toast.success('Đã tạo sản phẩm mới!');
        } catch (error) {
            const err = error as { response?: { data?: { message?: string } } };
            toast.error(err.response?.data?.message || 'Lỗi khi tạo sản phẩm');
        }
    };

    const handleUpdateProduct = async (data: Partial<Product>) => {
        if (!editingItem?.id) return;
        try {
            await updateProduct(editingItem.id, data);
            toast.success('Đã cập nhật sản phẩm!');
        } catch (error) {
            const err = error as { response?: { data?: { message?: string } } };
            toast.error(err.response?.data?.message || 'Lỗi khi cập nhật sản phẩm');
        }
    };

    const handleDeleteProduct = async (id: string) => {
        if (!confirm('Bạn có chắc muốn xóa sản phẩm này?')) return;
        try {
            await deleteProduct(id);
            toast.success('Đã xóa sản phẩm!');
        } catch (error) {
            const err = error as { response?: { data?: { message?: string } } };
            toast.error(err.response?.data?.message || 'Lỗi khi xóa sản phẩm');
        }
    };

    // Service handlers
    const handleCreateService = async (data: Partial<Service>, departments?: ServiceDepartment[]) => {
        try {
            const newService = await createService(data);
            // Save service-department relationships if departments provided
            if (departments && departments.length > 0 && newService?.id) {
                await api.put(`/services/${newService.id}/departments`, { departments });
            }
            toast.success('Đã tạo dịch vụ mới!');
        } catch (error) {
            const err = error as { response?: { data?: { message?: string } } };
            toast.error(err.response?.data?.message || 'Lỗi khi tạo dịch vụ');
        }
    };

    const handleUpdateService = async (data: Partial<Service>, departments?: ServiceDepartment[]) => {
        if (!editingItem?.id) return;
        try {
            await updateService(editingItem.id, data);
            // Update service-department relationships
            if (departments) {
                await api.put(`/services/${editingItem.id}/departments`, { departments });
            }
            toast.success('Đã cập nhật dịch vụ!');
        } catch (error) {
            const err = error as { response?: { data?: { message?: string } } };
            toast.error(err.response?.data?.message || 'Lỗi khi cập nhật dịch vụ');
        }
    };

    const handleDeleteService = async (id: string) => {
        if (!confirm('Bạn có chắc muốn xóa dịch vụ này?')) return;
        try {
            await deleteService(id);
            toast.success('Đã xóa dịch vụ!');
        } catch (error) {
            const err = error as { response?: { data?: { message?: string } } };
            toast.error(err.response?.data?.message || 'Lỗi khi xóa dịch vụ');
        }
    };

    const handleDeletePackage = async (id: string) => {
        const pkg = packages.find(p => p.id === id);
        if (!confirm(`Bạn có chắc muốn xóa gói "${pkg?.name || 'này'}"?`)) return;
        try {
            await deletePackage(id);
            toast.success('Xóa gói dịch vụ thành công');
        } catch (error) {
            toast.error('Lỗi khi xóa gói dịch vụ');
        }
    };

    // Voucher handlers
    const handleCreateVoucher = async (data: Partial<APIVoucher>) => {
        try {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { code, used_count, ...voucherData } = data;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await createVoucher(voucherData as any);
            toast.success('Đã tạo voucher mới!');
        } catch (error) {
            const err = error as { response?: { data?: { message?: string } } };
            toast.error(err.response?.data?.message || 'Lỗi khi tạo voucher');
        }
    };

    const handleUpdateVoucher = async (data: Partial<APIVoucher>) => {
        if (!editingItem?.id) return;
        try {
            await updateVoucher(editingItem.id, data);
            toast.success('Đã cập nhật voucher!');
        } catch (error) {
            const err = error as { response?: { data?: { message?: string } } };
            toast.error(err.response?.data?.message || 'Lỗi khi cập nhật voucher');
        }
    };

    const handleDeleteVoucher = async (id: string) => {
        if (!confirm('Bạn có chắc muốn xóa voucher này?')) return;
        try {
            await deleteVoucher(id);
            toast.success('Đã xóa voucher!');
        } catch (error) {
            const err = error as { response?: { data?: { message?: string } } };
            toast.error(err.response?.data?.message || 'Lỗi khi xóa voucher');
        }
    };

    // Product Type handlers
    const handleCreateProductType = async (data: any) => {
        await createProductType(data);
    };

    const handleUpdateProductType = async (data: any) => {
        if (!editingItem?.id) return;
        await updateProductType(editingItem.id, data);
    };

    const handleDeleteProductType = async (id: string) => {
        if (!confirm('Bạn có chắc muốn xóa loại sản phẩm này?')) return;
        await deleteProductType(id);
    };

    // Helper to open add dialog based on active tab
    const handleAddClick = () => {
        setEditingItem(null);
        if (activeTab === 'products') navigate('/products/new');
        else if (activeTab === 'services') navigate('/services/new');
        else if (activeTab === 'packages') navigate('/packages/new');
        else if (activeTab === 'vouchers') setShowVoucherForm(true);
        else if (activeTab === 'product-types') setShowProductTypeForm(true);
    };

    return (
        <div className="w-full overflow-x-hidden space-y-4 sm:space-y-6 animate-fade-in">
            {/* Page Header */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <div>
                    <h1 className="text-xl font-bold text-foreground sm:text-2xl">Sản phẩm & Dịch vụ</h1>
                    <p className="hidden text-muted-foreground sm:block">Quản lý danh mục sản phẩm, dịch vụ, gói và thẻ</p>
                </div>
            </div>

            {activeTab === 'services' && (
                <div className="mx-auto w-full max-w-[390px] space-y-3 md:hidden">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <h2 className="text-base font-bold text-foreground">Dịch vụ</h2>
                            <p className="text-xs text-muted-foreground">{filteredServices.length} mục</p>
                        </div>
                        <Button onClick={handleAddClick} size="icon" className="h-10 w-10 shrink-0 rounded-xl">
                            <Plus className="h-5 w-5" />
                        </Button>
                    </div>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            placeholder="Tìm theo mã, tên..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="h-10 rounded-xl pl-9"
                        />
                    </div>
                    <ServicesTable
                        services={filteredServices}
                        loading={loading}
                        onEdit={(service) => navigate(`/services/${service.id}/edit`)}
                        onDelete={handleDeleteService}
                        departments={departments}
                    />
                </div>
            )}

            {/* Tabs */}
            <Card className={activeTab === 'services' ? 'hidden overflow-hidden md:block' : 'overflow-hidden'}>
                <CardContent className="p-0">
                    <Tabs value={activeTab} onValueChange={handleTabChange}>
                        <div className="border-b px-3 pt-3 sm:px-4 sm:pt-4">
                            <TabsList className={`${activeTab === 'services' ? 'hidden sm:flex' : 'flex'} mb-3 h-auto w-full justify-start gap-2 overflow-x-auto bg-transparent p-0 sm:mb-4`}>
                                <TabsTrigger value="products" className="h-9 shrink-0 rounded-lg border bg-white px-3 text-xs sm:text-sm">
                                    <Package className="h-4 w-4" />
                                    Sản phẩm
                                    <Badge variant="secondary">{products.length}</Badge>
                                </TabsTrigger>
                                <TabsTrigger value="services" className="h-9 shrink-0 rounded-lg border bg-white px-3 text-xs sm:text-sm">
                                    <Wrench className="h-4 w-4" />
                                    Dịch vụ
                                    <Badge variant="secondary">{services.length}</Badge>
                                </TabsTrigger>
                                <TabsTrigger value="packages" className="h-9 shrink-0 rounded-lg border bg-white px-3 text-xs sm:text-sm">
                                    <Gift className="h-4 w-4" />
                                    Gói dịch vụ
                                    <Badge variant="secondary">{packages.length}</Badge>
                                </TabsTrigger>
                                <TabsTrigger value="vouchers" className="h-9 shrink-0 rounded-lg border bg-white px-3 text-xs sm:text-sm">
                                    <CreditCard className="h-4 w-4" />
                                    Thẻ/Voucher
                                    <Badge variant="secondary">{vouchers.length}</Badge>
                                </TabsTrigger>
                                <TabsTrigger value="product-types" className="h-9 shrink-0 rounded-lg border bg-white px-3 text-xs sm:text-sm">
                                    <Tags className="h-4 w-4" />
                                    Loại sản phẩm
                                    <Badge variant="secondary">{productTypes.length}</Badge>
                                </TabsTrigger>
                            </TabsList>

                            {/* Search & Add Button */}
                            <div className="flex flex-col gap-2 pb-3 sm:flex-row sm:gap-3 sm:pb-4">
                                <div className="relative flex-1">
                                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                    <Input
                                        placeholder="Tìm theo mã, tên..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="h-10 rounded-xl pl-9"
                                    />
                                </div>
                                <Button onClick={handleAddClick} className="h-10 w-full sm:w-auto">
                                    <Plus className="h-4 w-4 mr-2" />
                                    Thêm mới
                                </Button>
                            </div>
                        </div>

                        {/* Products Tab */}
                        <TabsContent value="products" className="m-0">
                            <ProductsTable
                                products={filteredProducts}
                                loading={loading}
                                onEdit={(product) => navigate(`/products/${product.id}/edit`)}
                                onDelete={handleDeleteProduct}
                            />
                        </TabsContent>

                        {/* Services Tab */}
                        <TabsContent value="services" className="m-0">
                            <ServicesTable
                                services={filteredServices}
                                loading={loading}
                                onEdit={(service) => navigate(`/services/${service.id}/edit`)}
                                onDelete={handleDeleteService}
                                departments={departments}
                            />
                        </TabsContent>

                        {/* Packages Tab */}
                        <TabsContent value="packages" className="m-0">
                            <PackagesTable
                                packages={filteredPackages}
                                onEdit={(pkg) => navigate(`/packages/${pkg.id}/edit`)}
                                onDelete={handleDeletePackage}
                            />
                        </TabsContent>

                        {/* Vouchers Tab */}
                        <TabsContent value="vouchers" className="m-0">
                            <VouchersTable
                                vouchers={filteredVouchers}
                                onEdit={(voucher) => { setEditingItem(voucher); setShowVoucherForm(true); }}
                                onDelete={handleDeleteVoucher}
                            />
                        </TabsContent>

                        {/* Product Types Tab */}
                        <TabsContent value="product-types" className="m-0">
                            <ProductTypesTable
                                productTypes={filteredProductTypes}
                                loading={loading}
                                onEdit={(type) => { setEditingItem(type); setShowProductTypeForm(true); }}
                                onDelete={handleDeleteProductType}
                            />
                        </TabsContent>
                    </Tabs>
                </CardContent>
            </Card>

            {/* Dialogs */}
            <VoucherFormDialog
                open={showVoucherForm}
                onClose={() => { setShowVoucherForm(false); setEditingItem(null); }}
                voucher={editingItem as APIVoucher}
                onSubmit={editingItem ? handleUpdateVoucher : handleCreateVoucher}
            />
            <ProductTypeFormDialog
                open={showProductTypeForm}
                onClose={() => { setShowProductTypeForm(false); setEditingItem(null); }}
                productType={editingItem as ProductType}
                onSubmit={editingItem ? handleUpdateProductType : handleCreateProductType}
            />
        </div>
    );
}
