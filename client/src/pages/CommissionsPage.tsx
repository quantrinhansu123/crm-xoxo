import { useState, useEffect, useMemo, useRef, useCallback, Fragment } from 'react';
import { Search, Plus, Download, Upload, ChevronRight, ChevronDown, Loader2, Save, RotateCcw, Check } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { formatNumber } from '@/lib/utils';
import { toast } from 'sonner';
import { useProducts } from '@/hooks/useProducts';
import { useProductTypes } from '@/hooks/useProductTypes';
import { useUsers } from '@/hooks/useUsers';
import { usePackages } from '@/hooks/usePackages';
import { commissionTablesApi, salaryConfigsApi, departmentsApi } from '@/lib/api';
import { AddCommissionConditionDialog } from '@/components/commissions/AddCommissionConditionDialog';

// Commission table types
interface CommissionTable {
    id: string;
    name: string;
    type: 'common' | 'management' | 'ktv_weekly' | 'sale' | 'custom';
    checked: boolean;
    scope?: 'all' | 'branch';
    branchId?: string;
    status?: 'active' | 'inactive';
}

const defaultCommissionTables: CommissionTable[] = [
    { id: 'common', name: 'Bảng hoa hồng chung', type: 'common', checked: true },
    { id: 'management', name: 'Hoa Hồng Quản Lý', type: 'management', checked: false },
    { id: 'ktv_weekly', name: 'HOA HỒNG KTV TUẦN', type: 'ktv_weekly', checked: false },
    { id: 'sale', name: 'HOA HỒNG SALE', type: 'sale', checked: false },
];

// Product group tree structure
// Product types are parent nodes, their services/packages are children
interface ProductGroup {
    id: string;
    name: string;
    children?: ProductGroup[];
}

type DisplayMode = 'products' | 'employees';

export function CommissionsPage() {
    const { products, services, loading, fetchProducts, fetchServices, updateProduct, updateService } = useProducts();
    const { productTypes, fetchProductTypes } = useProductTypes();
    const { users, fetchUsers, updateUser } = useUsers();
    const { packages, fetchPackages, updatePackage } = usePackages();

    // Inline editing state: { id, value } of the cell currently being edited
    const [editingCommission, setEditingCommission] = useState<{ id: string; value: string } | null>(null);

    // New Popover State
    const [popoverOpen, setPopoverOpen] = useState<string | null>(null); // "itemId-tableId"
    const [popoverForm, setPopoverForm] = useState({
        value: '',
        isVND: false,
        applyAll: false
    });

    const [displayMode, setDisplayMode] = useState<DisplayMode>('products');
    const [searchTerm, setSearchTerm] = useState('');
    const [searchCodeTerm, setSearchCodeTerm] = useState('');
    const [searchNameTerm, setSearchNameTerm] = useState('');
    const [commissionTables, setCommissionTables] = useState<CommissionTable[]>([]);
    const [allDepartments, setAllDepartments] = useState<any[]>([]);
    const [commissionTableSearch, setCommissionTableSearch] = useState('');
    const [productGroups, setProductGroups] = useState<ProductGroup[]>([{ id: 'all', name: 'Tất cả' }]);
    const [selectedGroup, setSelectedGroup] = useState('all');
    const [groupSearch, setGroupSearch] = useState('');
    const [userSearch, setUserSearch] = useState('');
    const [selectedDepartment, setSelectedDepartment] = useState('all');
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
    const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
    const [selectAll, setSelectAll] = useState(false);
    const [showAddTableDialog, setShowAddTableDialog] = useState(false);

    const [salaryConfigs, setSalaryConfigs] = useState<any[]>([]);
    const [loadingConfigs, setLoadingConfigs] = useState(false);

    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 15;

    const fetchDepartments = useCallback(async () => {
        try {
            const response = await departmentsApi.getAll();
            const body = (response as any).data || response;
            // Handle both { data: [...] } and just [...]
            const depts = Array.isArray(body) ? body : (body.data || []);
            setAllDepartments(depts);
        } catch (error) {
            console.error('Error fetching departments:', error);
        }
    }, []);

    const fetchSalaryConfigs = useCallback(async () => {
        setLoadingConfigs(true);
        try {
            const response = await salaryConfigsApi.getAll();
            const body = (response as any).data || response;
            // Many routes return { data: { configs: [...] } }
            const configs = body.data?.configs || body.configs || (Array.isArray(body) ? body : []);
            setSalaryConfigs(configs);
        } catch (error) {
            console.error('Error fetching salary configs:', error);
        } finally {
            setLoadingConfigs(false);
        }
    }, []);

    const fetchCommissionTables = useCallback(async () => {
        try {
            const response = await commissionTablesApi.getAll();
            const body = (response as any).data || response;
            // Many routes return { data: { tables: [...] } }
            const tables = body.data?.tables || body.tables || (Array.isArray(body) ? body : []);
            
            const dbTables = tables.map((t: any) => ({ ...t, checked: true }));
            
            // Avoid duplication of "Bảng hoa hồng chung"
            const hasShared = dbTables.some((t: any) => 
                t.id === 'common' || 
                t.id === 'shared_table' || 
                t.name === 'Bảng hoa hồng chung'
            );

            if (hasShared) {
                setCommissionTables(dbTables);
            } else {
                setCommissionTables([
                    { id: 'shared_table', name: 'Bảng hoa hồng chung', type: 'common', checked: true },
                    ...dbTables
                ]);
            }
        } catch (error) {
            console.error('Error fetching commission tables:', error);
        }
    }, []);

    useEffect(() => {
        fetchProducts();
        fetchServices();
        fetchPackages();
        fetchProductTypes();
        fetchUsers();
        fetchCommissionTables();
        fetchSalaryConfigs();
        fetchDepartments();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fetchCommissionTables, fetchSalaryConfigs, fetchDepartments]);

    // Build product groups: product types as parents, services as children
    useEffect(() => {
        if (productTypes.length > 0) {
            const groups: ProductGroup[] = [
                { id: 'all', name: 'Tất cả' },
                ...productTypes.map(pt => {
                    // Find services that apply to this product type (check ID or Code)
                    const ptServices = services.filter(svc =>
                        (svc.applicable_product_types || []).some(ref => ref === pt.id || ref === pt.code)
                    );
                    return {
                        id: `pt:${pt.id}`,
                        name: pt.name,
                        children: ptServices.map(svc => ({
                            id: `pt:${pt.id}:svc:${svc.id}`,
                            name: svc.name,
                        })),
                    };
                }),
            ];

            // Add an "Other Services" group for services that don't belong to any product type
            const linkedServiceIds = new Set();
            groups.forEach(g => {
                if (g.id !== 'all' && g.children) {
                    g.children.forEach(c => {
                        const svcId = c.id.split(':svc:')[1];
                        linkedServiceIds.add(svcId);
                    });
                }
            });

            const unlinkedServices = services.filter(s => !linkedServiceIds.has(s.id));
            if (unlinkedServices.length > 0) {
                groups.push({
                    id: 'pt:other',
                    name: 'Dịch vụ khác',
                    children: unlinkedServices.map(s => ({
                        id: `pt:other:svc:${s.id}`,
                        name: s.name,
                    })),
                });
            }

            if (packages.length > 0) {
                groups.push({
                    id: 'packages',
                    name: 'Gói dịch vụ',
                });
            }

            setProductGroups(groups);
        }
    }, [services, productTypes, packages]);

    // Build a lookup: product_type_id or code → list of service IDs that apply to it
    const ptToServiceIds = useMemo(() => {
        const map = new Map<string, string[]>();
        services.forEach(svc => {
            (svc.applicable_product_types || []).forEach(ptRef => {
                if (!map.has(ptRef)) map.set(ptRef, []);
                map.get(ptRef)!.push(svc.id);
            });
        });
        return map;
    }, [services]);

    // Product type ID/Code → name lookup
    const ptNameMap = useMemo(() => {
        const map = new Map<string, string>();
        productTypes.forEach(pt => {
            map.set(pt.id, pt.name);
            map.set(pt.code, pt.name);
        });
        return map;
    }, [productTypes]);

    // Combine products and services for display
    const allItems = useMemo(() => {
        const items = [
            ...products.map(p => {
                const ptName = p.category ? ptNameMap.get(p.category) || '' : '';
                return {
                    id: p.id,
                    code: p.code,
                    name: p.name,
                    productTypeName: ptName,
                    unit: p.unit || '',
                    price: p.price || 0,
                    cost: p.cost || 0,
                    category: p.category || '',
                    itemType: 'product' as const,
                    commissionRate: 1,
                    serviceIds: p.category ? (ptToServiceIds.get(p.category) || []) : [],
                    productTypeIds: p.category ? [p.category] : [],
                    commission_data: p.commission_data,
                    commission_sale: p.commission_sale,
                    commission_tech: p.commission_tech,
                };
            }),
            ...services.map(s => {
                const ptIds = s.applicable_product_types || [];
                const ptName = ptIds.length > 0 ? ptNameMap.get(ptIds[0]) || '' : '';
                return {
                    id: s.id,
                    code: s.code,
                    name: s.name,
                    productTypeName: ptName,
                    unit: '',
                    price: s.price || 0,
                    cost: 0,
                    category: s.category || '',
                    itemType: 'service' as const,
                    commissionRate: s.commission_rate || 1,
                    serviceIds: [s.id],
                    productTypeIds: ptIds,
                    commission_data: s.commission_data,
                    commission_sale: s.commission_sale,
                    commission_tech: s.commission_tech,
                };
            }),
            ...packages.map(pkg => ({
                id: pkg.id,
                code: pkg.code,
                name: pkg.name,
                productTypeName: '',
                unit: '',
                price: pkg.price || 0,
                cost: 0,
                category: 'package',
                itemType: 'package' as const,
                commissionRate: 1,
                serviceIds: [] as string[],
                productTypeIds: [] as string[],
                commission_data: (pkg as any).commission_data,
                commission_sale: pkg.commission_sale,
                commission_tech: pkg.commission_tech,
            })),
        ];
        return items;
    }, [products, services, packages, ptToServiceIds, ptNameMap]);

    // 1. Base filtering (Search + Group)
    const baseFilteredItems = useMemo(() => {
        let items = allItems;

        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            items = items.filter(item =>
                item.code.toLowerCase().includes(term) ||
                item.name.toLowerCase().includes(term)
            );
        }

        if (searchCodeTerm) {
            items = items.filter(item =>
                item.code.toLowerCase().includes(searchCodeTerm.toLowerCase())
            );
        }

        if (searchNameTerm) {
            items = items.filter(item =>
                item.name.toLowerCase().includes(searchNameTerm.toLowerCase())
            );
        }

        if (selectedGroup && selectedGroup !== 'all') {
            if (selectedGroup.includes(':svc:')) {
                const svcId = selectedGroup.split(':svc:')[1];
                items = items.filter(item => item.serviceIds.includes(svcId));
            } else if (selectedGroup === 'packages') {
                items = items.filter(item => item.itemType === 'package');
            } else if (selectedGroup.startsWith('pt:')) {
                const ptRef = selectedGroup.replace('pt:', '');
                if (ptRef === 'other') {
                    const ptIds = new Set(productTypes.map(pt => pt.id));
                    const ptCodes = new Set(productTypes.map(pt => pt.code));
                    items = items.filter(item => {
                        if (item.productTypeIds.length === 0) return true;
                        return !item.productTypeIds.some(ref => ptIds.has(ref) || ptCodes.has(ref));
                    });
                } else {
                    const pt = productTypes.find(p => p.id === ptRef);
                    items = items.filter(item =>
                        item.productTypeIds.includes(ptRef) || (pt && item.productTypeIds.includes(pt.code))
                    );
                }
            }
        }
        return items;
    }, [allItems, searchTerm, searchCodeTerm, searchNameTerm, selectedGroup, productTypes]);

    const displayItems = baseFilteredItems;

    // Pagination
    const totalPages = Math.ceil(displayItems.length / itemsPerPage);
    const paginatedItems = displayItems.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    const toggleCommissionTable = async (id: string) => {
        const table = commissionTables.find(t => t.id === id);
        if (!table) return;

        const newChecked = !table.checked;

        // Optimistic update
        setCommissionTables(prev =>
            prev.map(t => t.id === id ? { ...t, checked: newChecked } : t)
        );

        try {
            await commissionTablesApi.update(id, { checked: newChecked });
        } catch (error) {
            console.error('Error updating table visibility:', error);
            // Rollback
            setCommissionTables(prev =>
                prev.map(t => t.id === id ? { ...t, checked: !newChecked } : t)
            );
            toast.error('Lỗi khi lưu trạng thái bảng');
        }
    };

    const toggleGroupExpand = (id: string) => {
        setExpandedGroups(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleSelectItem = (id: string) => {
        setSelectedItems(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (selectAll) {
            setSelectedItems(new Set());
        } else {
            setSelectedItems(new Set(paginatedItems.map(i => i.id)));
        }
        setSelectAll(!selectAll);
    };

    const handleSaveNewTable = async (data: {
        name: string;
        scope: 'all' | 'branch';
        branchId?: string;
        status: 'active' | 'inactive';
    }) => {
        const newTable: CommissionTable = {
            id: `custom-${Date.now()}`,
            name: data.name,
            type: 'custom',
            checked: true, // Auto-select the new table
            scope: data.scope,
            branchId: data.branchId,
            status: data.status,
        };

        try {
            await commissionTablesApi.create(newTable);
            setCommissionTables(prev => [...prev, newTable]);
            toast.success('Đã thêm bảng hoa hồng mới');
        } catch (error) {
            console.error('Error creating table:', error);
            toast.error('Lỗi khi tạo bảng hoa hồng mới');
        }
    };

    const handleBulkAssignToTables = async (groupId: string) => {
        const targetTables = commissionTables.filter(t => t.checked && t.id !== 'common');
        if (targetTables.length === 0) {
            toast.error('Vui lòng chọn ít nhất một bảng hoa hồng (khác bảng chung) để áp dụng');
            return;
        }

        const itemsToUpdate = baseFilteredItems;
        if (itemsToUpdate.length === 0) {
            toast.error('Không có sản phẩm/dịch vụ nào trong nhóm này để áp dụng');
            return;
        }

        const loadingToast = toast.loading(`Đang áp dụng cho ${itemsToUpdate.length} mục...`);

        try {
            let successCount = 0;
            for (const item of itemsToUpdate) {
                const newCommissionData = { ...(item.commission_data || {}) };

                targetTables.forEach(table => {
                    if (!newCommissionData[table.id]) {
                        newCommissionData[table.id] = {
                            sale_rate: item.commission_sale || 0,
                            tech_rate: item.commission_tech || (item.category === 'service' ? (item as any).commission_rate : 0) || 0
                        };
                    }
                });

                if (item.itemType === 'product') {
                    await updateProduct(item.id, { commission_data: newCommissionData });
                } else if (item.itemType === 'package') {
                    await updatePackage(item.id, { commission_data: newCommissionData } as any);
                } else {
                    await updateService(item.id, { commission_data: newCommissionData });
                }
                successCount++;
            }

            toast.dismiss(loadingToast);
            toast.success(`Đã áp dụng thành công cho ${successCount} mục`);

            // Refresh counts
            await fetchProducts();
            await fetchServices();
        } catch (error) {
            console.error('Apply all error:', error);
            toast.dismiss(loadingToast);
            toast.error('Đã xảy ra lỗi khi áp dụng hàng loạt');
        }
    };

    // Save commission rate for a product or service
    const handleSaveProductCommission = async (itemId: string, value: string) => {
        const rate = parseFloat(value);
        if (isNaN(rate) || rate < 0) {
            setEditingCommission(null);
            return;
        }

        try {
            // Check if item is a service or product
            const isService = services.some(s => s.id === itemId);
            if (isService) {
                await updateService(itemId, { commission_rate: rate });
            } else {
                await updateProduct(itemId, { commission_sale: rate });
            }
            toast.success('Đã cập nhật hoa hồng');
        } catch {
            toast.error('Lỗi khi cập nhật hoa hồng');
        }
        setEditingCommission(null);
    };

    // Save commission rate for an employee
    const handleSaveEmployeeCommission = async (userId: string, value: string) => {
        const rate = parseFloat(value);
        if (isNaN(rate) || rate < 0) {
            setEditingCommission(null);
            return;
        }

        try {
            await updateUser(userId, { commission: rate });
            toast.success('Đã cập nhật hoa hồng nhân viên');
        } catch {
            toast.error('Lỗi khi cập nhật hoa hồng');
        }
        setEditingCommission(null);
    };

    const employeesWithCommissions = useMemo(() => {
        let list = users.filter(u => u.status === 'active');

        if (userSearch) {
            const term = userSearch.toLowerCase().trim();
            list = list.filter(u => 
                u.name.toLowerCase().includes(term) || 
                (u as any).employee_code?.toLowerCase().includes(term)
            );
        }

        if (selectedDepartment && selectedDepartment !== 'all') {
            list = list.filter(u => {
                const dept = allDepartments.find(d => d.id === u.department);
                const deptName = dept ? dept.name : u.department;
                return deptName === selectedDepartment;
            });
        }

        const checkedTableIds = new Set(commissionTables.filter(t => t.checked).map(t => t.id));

        return list
            .map(user => {
                // Find config with case-insensitive and trimmed ID matching
                const config = salaryConfigs.find(c => 
                    String(c.user_id).toLowerCase().trim() === String(user.id).toLowerCase().trim()
                );
                
                // Be more lenient with truthiness check (handles string "true", number 1, etc)
                const isEnabled = config && (
                    config.commission_enabled === true || 
                    config.commission_enabled === 'true' || 
                    config.commission_enabled === 1 || 
                    config.commission_enabled === '1'
                );
                
                let rules = Array.isArray(config?.commission_rules) ? config.commission_rules : [];

                // If some tables are checked, filter the rules to ONLY show those tables
                if (checkedTableIds.size > 0) {
                    rules = rules.filter((r: any) => {
                        const type = r.commission_type;
                        if (checkedTableIds.has(type)) return true;
                        // Handle shared_table/common synonym
                        if (type === 'common' && checkedTableIds.has('shared_table')) return true;
                        if (type === 'shared_table' && checkedTableIds.has('common')) return true;
                        return false;
                    });
                }

                if (isEnabled && rules.length > 0) {
                    return { 
                        ...user, 
                        commission_rules: rules 
                    };
                }
                return null;
            })
            .filter((u): u is any => u !== null);
    }, [users, salaryConfigs, userSearch, commissionTables, selectedDepartment, allDepartments]);


    const COMMISSION_CATEGORIES: Record<string, string> = {
        sales_consulting: 'Tư vấn bán hàng',
        service: 'Thực hiện dịch vụ',
        other: 'Khác',
    };

    const COMMISSION_TYPES_LABELS: Record<string, string> = {
        shared_table: 'Bảng hoa hồng chung',
        common: 'Bảng hoa hồng chung',
        fixed_percent: 'Hoa hồng cố định (%)',
        fixed_amount: 'Hoa hồng cố định (VNĐ)',
    };

    if (loading && allItems.length === 0) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="flex h-[calc(100vh-6rem)] bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            {/* Left Sidebar */}
            <div className="w-[220px] border-r border-gray-200 bg-[#fbfcfd] flex flex-col flex-shrink-0 overflow-hidden">
                <div className="p-4 pb-2">
                    <h1 className="text-[16px] font-bold text-gray-900 tracking-tight">Bảng hoa hồng</h1>
                </div>

                <div className="flex-1 overflow-y-auto px-4 pb-4">
                    {/* Display Mode */}
                    <div className="mb-5">
                        <h3 className="text-[12px] font-semibold text-gray-500 uppercase tracking-wide mb-2.5">Kiểu hiển thị</h3>
                        <div className="space-y-2">
                            <label className="flex items-center gap-2.5 cursor-pointer">
                                <input
                                    type="radio"
                                    className="w-[15px] h-[15px] text-blue-600 border-gray-300 focus:ring-blue-500 cursor-pointer"
                                    name="displayMode"
                                    value="products"
                                    checked={displayMode === 'products'}
                                    onChange={() => setDisplayMode('products')}
                                />
                                <span className={displayMode === 'products' ? "text-[13px] text-blue-600 font-medium" : "text-[13px] text-gray-700"}>
                                    Hàng hóa
                                </span>
                            </label>
                            <label className="flex items-center gap-2.5 cursor-pointer">
                                <input
                                    type="radio"
                                    className="w-[15px] h-[15px] text-blue-600 border-gray-300 focus:ring-blue-500 cursor-pointer"
                                    name="displayMode"
                                    value="employees"
                                    checked={displayMode === 'employees'}
                                    onChange={() => setDisplayMode('employees')}
                                />
                                <span className={displayMode === 'employees' ? "text-[13px] text-blue-600 font-medium" : "text-[13px] text-gray-700"}>
                                    Nhân viên áp dụng
                                </span>
                            </label>
                        </div>
                    </div>

                    {/* Commission Tables */}
                    <div className="mb-5">
                        <h3 className="text-[12px] font-semibold text-gray-500 uppercase tracking-wide mb-2.5">Bảng hoa hồng</h3>
                        <div className="relative mb-2">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-[13px] w-[13px] text-gray-400" />
                            <input
                                type="text"
                                className="w-full pl-7 pr-3 h-[30px] text-[12px] border border-gray-200 rounded-md bg-white placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                placeholder="Tìm kiếm bảng hoa hồng"
                                value={commissionTableSearch}
                                onChange={(e) => setCommissionTableSearch(e.target.value)}
                            />
                        </div>
                        <div className="space-y-1.5">
                            {commissionTables
                                .filter(t => !commissionTableSearch || t.name.toLowerCase().includes(commissionTableSearch.toLowerCase()))
                                .map(table => (
                                    <label key={table.id} className="flex items-center gap-2 cursor-pointer group">
                                        <Checkbox
                                            checked={table.checked}
                                            onCheckedChange={() => toggleCommissionTable(table.id)}
                                            className="h-[15px] w-[15px] rounded border-gray-300"
                                        />
                                        <span className="text-[12px] text-gray-700 group-hover:text-gray-900 truncate">{table.name}</span>
                                    </label>
                                ))
                            }
                        </div>
                        <button
                            onClick={() => setShowAddTableDialog(true)}
                            className="flex items-center gap-1.5 mt-2.5 text-[12px] text-gray-500 hover:text-blue-600 transition-colors cursor-pointer"
                        >
                            <Plus className="h-3.5 w-3.5" />
                            Thêm bảng
                        </button>
                    </div>

                    {/* Switching Section based on displayMode */}
                    <div className="mt-5 border-t border-gray-100 pt-5">
                        {displayMode === 'products' ? (
                            /* Product Groups */
                            <div>
                                <h3 className="text-[12px] font-semibold text-gray-500 uppercase tracking-wide mb-2.5">Nhóm hàng</h3>
                                <div className="relative mb-2">
                                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-[13px] w-[13px] text-gray-400" />
                                    <input
                                        type="text"
                                        className="w-full pl-7 pr-3 h-[30px] text-[12px] border border-gray-200 rounded-md bg-white placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                        placeholder="Tìm kiếm nhóm hàng"
                                        value={groupSearch}
                                        onChange={(e) => setGroupSearch(e.target.value)}
                                    />
                                </div>
                                <div className="space-y-0.5 max-h-[400px] overflow-y-auto pr-1">
                                    {productGroups
                                        .filter(g => !groupSearch || g.name.toLowerCase().includes(groupSearch.toLowerCase()) ||
                                            (g.children || []).some(c => c.name.toLowerCase().includes(groupSearch.toLowerCase())))
                                        .map(group => (
                                            <div key={group.id}>
                                                <div
                                                    className={`w-full flex items-center gap-1.5 px-1.5 py-[5px] rounded text-left transition-colors cursor-pointer ${selectedGroup === group.id
                                                        ? 'bg-blue-50 text-blue-600 font-medium'
                                                        : 'text-gray-600 hover:bg-gray-50'
                                                    }`}
                                                    onClick={() => setSelectedGroup(group.id === selectedGroup ? 'all' : group.id)}
                                                >
                                                    {group.children && group.children.length > 0 && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); toggleGroupExpand(group.id); }}
                                                            className="p-0.5 hover:bg-blue-100 rounded transition-colors"
                                                        >
                                                            {expandedGroups.has(group.id) ? (
                                                                <ChevronDown className="h-3 w-3" />
                                                            ) : (
                                                                <ChevronRight className="h-3 w-3" />
                                                            )}
                                                        </button>
                                                    )}
                                                    <span className="text-[12px] truncate">{group.name}</span>
                                                    <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleBulkAssignToTables(group.id); }}
                                                            className="p-1 hover:text-blue-600 text-gray-400"
                                                            title="Áp dụng cho tất cả"
                                                        >
                                                            <RotateCcw className="h-3 w-3" />
                                                        </button>
                                                    </div>
                                                </div>

                                                {expandedGroups.has(group.id) && group.children && (
                                                    <div className="ml-4 mt-0.5 space-y-0.5 border-l border-gray-100 pl-2">
                                                        {group.children.map(child => (
                                                            <button
                                                                key={child.id}
                                                                className={`w-full text-left px-2 py-1 rounded text-[11px] transition-colors ${selectedGroup === child.id
                                                                    ? 'bg-blue-50 text-blue-600 font-medium'
                                                                    : 'text-gray-600 hover:bg-gray-50'
                                                                }`}
                                                                onClick={(e) => { e.stopPropagation(); setSelectedGroup(child.id); }}
                                                            >
                                                                {child.name}
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        ))
                                    }
                                </div>
                            </div>
                        ) : (
                            /* Departments */
                            <div>
                                <h3 className="text-[12px] font-semibold text-gray-500 uppercase tracking-wide mb-2.5">Phòng ban</h3>
                                <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
                                    <SelectTrigger className="w-full h-[36px] text-[13px] bg-white border-gray-200 focus:ring-1 focus:ring-blue-500">
                                        <SelectValue placeholder="Chọn phòng ban" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Tất cả phòng ban</SelectItem>
                                        {allDepartments
                                            .sort((a, b) => a.name.localeCompare(b.name))
                                            .map(dept => (
                                                <SelectItem key={dept.id} value={dept.name}>{dept.name}</SelectItem>
                                            ))
                                        }
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col min-w-0 bg-white">
                {/* Top Bar */}
                <div className="flex items-center justify-between p-3 border-b border-gray-100 bg-[#fbfcfd] gap-3">
                    <div className="flex-1 relative max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-[45%] h-[15px] w-[15px] text-gray-400" />
                        <Input
                            className="w-full pl-[34px] h-[36px] border-gray-200 text-[13px] placeholder:text-gray-400 bg-white shadow-sm rounded-lg focus-visible:ring-1 focus-visible:ring-blue-500"
                            placeholder={displayMode === 'employees' ? "Tìm theo tên hoặc mã nhân viên..." : "Thêm hàng hóa vào bảng hoa hồng"}
                            value={displayMode === 'employees' ? userSearch : searchTerm}
                            onChange={(e) => { 
                                if (displayMode === 'employees') {
                                    setUserSearch(e.target.value);
                                } else {
                                    setSearchTerm(e.target.value); 
                                    setCurrentPage(1); 
                                }
                            }}
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            className="h-[36px] px-3.5 border-gray-200 bg-white text-gray-700 text-[13px] font-semibold rounded-lg shadow-sm hover:bg-gray-50 flex items-center gap-1.5"
                        >
                            <Download className="h-[15px] w-[15px] text-gray-500" />
                            Import
                        </Button>
                        <Button
                            variant="outline"
                            className="h-[36px] px-3.5 text-blue-600 border border-blue-200 bg-white hover:bg-blue-50 text-[13px] font-semibold rounded-lg shadow-sm flex items-center gap-1.5"
                        >
                            <Upload className="h-[15px] w-[15px]" />
                            Xuất file
                        </Button>
                    </div>
                </div>

                {/* Table */}
                <div className="flex-1 overflow-auto">
                    {displayMode === 'products' ? (
                        <table className="w-full text-left border-collapse whitespace-nowrap">
                            <thead className="bg-[#f2f6ff] sticky top-0 z-10">
                                <tr>
                                    <th className="px-4 py-3 font-semibold text-gray-700 w-10 border-b border-gray-100">
                                        <input
                                            type="checkbox"
                                            className="w-[14px] h-[14px] rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                            checked={selectAll}
                                            onChange={toggleSelectAll}
                                        />
                                    </th>
                                    <th className="px-4 py-3 font-bold text-[11px] text-gray-900 border-b border-gray-100 tracking-wide min-w-[120px]">
                                        MÃ HÀNG
                                    </th>
                                    <th className="px-4 py-3 font-bold text-[11px] text-gray-900 border-b border-gray-100 tracking-wide min-w-[300px]">
                                        TÊN HÀNG
                                    </th>
                                    <th className="px-4 py-3 font-bold text-[11px] text-gray-900 border-b border-gray-100 tracking-wide text-center">
                                        ĐƠN VỊ TÍNH
                                    </th>
                                    <th className="px-4 py-3 font-bold text-[11px] text-gray-900 border-b border-gray-100 tracking-wide text-right">
                                        GIÁ BÁN CHUNG
                                    </th>
                                    <th className="px-4 py-3 font-bold text-[11px] text-gray-900 border-b border-gray-100 tracking-wide text-right">
                                        GIÁ VỐN
                                    </th>
                                    <th className="px-4 py-3 font-bold text-[11px] text-gray-900 border-b border-gray-100 tracking-wide text-right">
                                        LỢI NHUẬN TẠM TÍNH
                                    </th>
                                    {commissionTables.filter(t => t.checked).map(table => (
                                        <th key={table.id} className="px-4 py-3 font-bold text-[11px] text-gray-900 border-b border-gray-100 tracking-wide text-right">
                                            {table.name.toUpperCase()}
                                        </th>
                                    ))}
                                </tr>
                                {/* Sub-header filters */}
                                <tr className="bg-white">
                                    <th className="px-4 py-1.5 border-b border-gray-100"></th>
                                    <th className="px-4 py-1.5 border-b border-gray-100">
                                        <input
                                            type="text"
                                            className="w-full h-[28px] px-2 text-[12px] border border-gray-200 rounded bg-white placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                            placeholder="Tìm kiếm mã hàng"
                                            value={searchCodeTerm}
                                            onChange={(e) => { setSearchCodeTerm(e.target.value); setCurrentPage(1); }}
                                        />
                                    </th>
                                    <th className="px-4 py-1.5 border-b border-gray-100">
                                        <input
                                            type="text"
                                            className="w-full h-[28px] px-2 text-[12px] border border-gray-200 rounded bg-white placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                            placeholder="Tìm kiếm tên hàng"
                                            value={searchNameTerm}
                                            onChange={(e) => { setSearchNameTerm(e.target.value); setCurrentPage(1); }}
                                        />
                                    </th>
                                    <th className="px-4 py-1.5 border-b border-gray-100"></th>
                                    <th className="px-4 py-1.5 border-b border-gray-100"></th>
                                    <th className="px-4 py-1.5 border-b border-gray-100"></th>
                                    <th className="px-4 py-1.5 border-b border-gray-100"></th>
                                    {commissionTables.filter(t => t.checked).map(table => (
                                        <th key={`filter-${table.id}`} className="px-4 py-1.5 border-b border-gray-100"></th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {paginatedItems.map((item) => {
                                    const profit = item.price - item.cost;
                                    return (
                                        <tr
                                            key={item.id}
                                            className="hover:bg-blue-50/30 cursor-pointer transition-colors"
                                        >
                                            <td className="px-4 py-[11px]">
                                                <input
                                                    type="checkbox"
                                                    className="w-[14px] h-[14px] rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                                    checked={selectedItems.has(item.id)}
                                                    onChange={() => toggleSelectItem(item.id)}
                                                />
                                            </td>
                                            <td className="px-4 py-[11px] text-gray-800 font-medium text-[13px]">
                                                {item.code}
                                            </td>
                                            <td className="px-4 py-[11px] text-[13px] uppercase">
                                                {item.productTypeName ? (
                                                    <>
                                                        <span className="text-gray-500">{item.productTypeName}</span>
                                                        <span className="text-gray-400 mx-1">›</span>
                                                        <span className="text-blue-600 font-medium">{item.name}</span>
                                                    </>
                                                ) : (
                                                    <span className="text-blue-600 font-medium">{item.name}</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-[11px] text-gray-600 text-[13px] text-center">
                                                {item.unit || ''}
                                            </td>
                                            <td className="px-4 py-[11px] text-gray-800 text-[13px] font-medium text-right">
                                                {item.price > 0 ? formatNumber(item.price) : ''}
                                            </td>
                                            <td className="px-4 py-[11px] text-gray-800 text-[13px] text-right">
                                                {item.cost > 0 ? formatNumber(item.cost) : '0'}
                                            </td>
                                            <td className="px-4 py-[11px] text-gray-800 text-[13px] font-medium text-right">
                                                {item.price > 0 ? formatNumber(profit) : ''}
                                            </td>
                                            {commissionTables.filter(t => t.checked).map(table => {
                                                const commissionData = (item as any).commission_data || {};
                                                const tableConfig = commissionData[table.id];

                                                // Default to global rates if not explicitly set for this table
                                                const rate = tableConfig
                                                    ? (item.itemType === 'product' ? tableConfig.sale_rate : tableConfig.tech_rate)
                                                    : (table.id === 'common'
                                                        ? (item.itemType === 'product' ? (item as any).commission_sale : (item as any).commission_tech)
                                                        : undefined
                                                    );

                                                return (
                                                    <td key={table.id} className="px-4 py-[11px] text-right">
                                                        <Popover
                                                            open={popoverOpen === `${item.id}-${table.id}`}
                                                            onOpenChange={(open) => {
                                                                if (open) {
                                                                    setPopoverOpen(`${item.id}-${table.id}`);
                                                                    setPopoverForm({
                                                                        value: rate?.toString() || '0',
                                                                        isVND: tableConfig?.unit === 'vnd',
                                                                        applyAll: false
                                                                    });
                                                                } else {
                                                                    setPopoverOpen(null);
                                                                }
                                                            }}
                                                        >
                                                            <PopoverTrigger asChild>
                                                                <button className="inline-flex items-center gap-1 text-[13px] text-blue-600 font-medium cursor-pointer hover:bg-blue-50 px-2 py-0.5 rounded transition-colors w-full justify-end">
                                                                    {rate !== undefined ? formatNumber(rate) : '0'}
                                                                    <span className="text-gray-500">{tableConfig?.unit === 'vnd' ? 'đ' : '%'}</span>
                                                                </button>
                                                            </PopoverTrigger>
                                                            <PopoverContent className="w-[450px] p-4 bg-white border border-gray-200 shadow-xl rounded-lg z-[100]" align="end">
                                                                <div className="space-y-4">
                                                                    <div className="flex items-center gap-3">
                                                                        <span className="text-[13px] text-gray-600 flex-1 font-medium leading-tight">
                                                                            Mức hoa hồng áp dụng mỗi sản phẩm bán ra
                                                                        </span>
                                                                        <div className="flex items-center gap-2">
                                                                            <Input
                                                                                type="text"
                                                                                className="w-[120px] h-9 text-right font-medium border-blue-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                                                                value={popoverForm.isVND
                                                                                    ? popoverForm.value.replace(/\D/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.')
                                                                                    : popoverForm.value
                                                                                }
                                                                                onChange={(e) => {
                                                                                    const val = e.target.value;
                                                                                    if (popoverForm.isVND) {
                                                                                        // Only allow digits
                                                                                        const digits = val.replace(/\D/g, '');
                                                                                        setPopoverForm(prev => ({ ...prev, value: digits }));
                                                                                    } else {
                                                                                        setPopoverForm(prev => ({ ...prev, value: val }));
                                                                                    }
                                                                                }}
                                                                                autoFocus
                                                                            />
                                                                            <div className="flex bg-gray-100 p-0.5 rounded-lg border border-gray-200">
                                                                                <button
                                                                                    onClick={() => {
                                                                                        const numericValue = popoverForm.value.replace(/\D/g, '');
                                                                                        setPopoverForm(prev => ({ ...prev, isVND: true, value: numericValue }));
                                                                                    }}
                                                                                    className={`px-3 py-1.5 text-[10px] font-bold rounded-md transition-all ${popoverForm.isVND ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                                                                >
                                                                                    VNĐ
                                                                                </button>
                                                                                <button
                                                                                    onClick={() => {
                                                                                        const numericValue = popoverForm.value.replace(/\D/g, '');
                                                                                        setPopoverForm(prev => ({ ...prev, isVND: false, value: numericValue }));
                                                                                    }}
                                                                                    className={`px-3 py-1.5 text-[10px] font-bold rounded-md transition-all ${!popoverForm.isVND ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                                                                >
                                                                                    % DOANH THU
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                    </div>

                                                                    <div className="flex items-center space-x-2 bg-gray-50 p-3 rounded-lg border border-gray-100 group hover:border-blue-100 transition-colors">
                                                                        <Checkbox
                                                                            id={`apply-all-${item.id}`}
                                                                            className="border-gray-300 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                                                                            checked={popoverForm.applyAll}
                                                                            onCheckedChange={(checked) => setPopoverForm(prev => ({ ...prev, applyAll: checked as boolean }))}
                                                                        />
                                                                        <label
                                                                            htmlFor={`apply-all-${item.id}`}
                                                                            className="text-[12.5px] text-gray-700 cursor-pointer select-none font-medium flex-1"
                                                                        >
                                                                            Áp dụng cho <span className="text-blue-600 font-bold underline decoration-blue-200 underline-offset-2">{baseFilteredItems.length}</span> hàng hóa, nhóm hàng trong bảng hoa hồng
                                                                        </label>
                                                                    </div>

                                                                    <div className="flex justify-end gap-2 pt-3 border-t border-gray-100 mt-2">
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="sm"
                                                                            className="px-4 h-9 text-gray-500 hover:bg-gray-100 font-medium text-[13px]"
                                                                            onClick={() => setPopoverOpen(null)}
                                                                        >
                                                                            Bỏ qua
                                                                        </Button>
                                                                        <Button
                                                                            size="sm"
                                                                            className="px-6 h-9 bg-blue-600 hover:bg-blue-700 text-white shadow-md transition-all font-semibold text-[13px] active:scale-95"
                                                                            onClick={async () => {
                                                                                const rawValue = popoverForm.isVND
                                                                                    ? popoverForm.value.replace(/\D/g, '')
                                                                                    : popoverForm.value.replace(/[^0-9.]/g, '');
                                                                                const newValue = parseFloat(rawValue) || 0;
                                                                                const newUnit = popoverForm.isVND ? 'vnd' : 'percent';

                                                                                if (popoverForm.applyAll) {
                                                                                    const loadingToast = toast.loading(`Đang áp dụng cho ${baseFilteredItems.length} mục...`);
                                                                                    try {
                                                                                        let successCount = 0;
                                                                                        for (const di of baseFilteredItems) {
                                                                                            const currentData = { ...((di as any).commission_data || {}) };
                                                                                            currentData[table.id] = di.itemType === 'product'
                                                                                                ? { ...currentData[table.id], sale_rate: newValue, unit: newUnit }
                                                                                                : { ...currentData[table.id], tech_rate: newValue, unit: newUnit };

                                                                                            if (di.itemType === 'product') {
                                                                                                await updateProduct(di.id, { commission_data: currentData });
                                                                                            } else if (di.itemType === 'package') {
                                                                                                await updatePackage(di.id, { commission_data: currentData } as any);
                                                                                            } else {
                                                                                                await updateService(di.id, { commission_data: currentData });
                                                                                            }
                                                                                            successCount++;
                                                                                        }
                                                                                        toast.dismiss(loadingToast);
                                                                                        toast.success(`Đã áp dụng thành công cho ${successCount} mục`);
                                                                                        await fetchProducts();
                                                                                        await fetchServices();
                                                                                    } catch (err) {
                                                                                        console.error('Bulk apply error:', err);
                                                                                        toast.dismiss(loadingToast);
                                                                                        toast.error('Lỗi khi áp dụng hàng loạt');
                                                                                    }
                                                                                } else {
                                                                                    const currentData = { ...((item as any).commission_data || {}) };
                                                                                    currentData[table.id] = item.itemType === 'product'
                                                                                        ? { ...currentData[table.id], sale_rate: newValue, unit: newUnit }
                                                                                        : { ...currentData[table.id], tech_rate: newValue, unit: newUnit };

                                                                                    if (item.itemType === 'product') {
                                                                                        await updateProduct(item.id, { commission_data: currentData });
                                                                                    } else if (item.itemType === 'package') {
                                                                                        await updatePackage(item.id, { commission_data: currentData } as any);
                                                                                    } else {
                                                                                        await updateService(item.id, { commission_data: currentData });
                                                                                    }
                                                                                    toast.success('Đã cập nhật hoa hồng');
                                                                                    (item as any).commission_data = currentData;
                                                                                }
                                                                                setPopoverOpen(null);
                                                                            }}
                                                                        >
                                                                            Đồng ý
                                                                        </Button>
                                                                    </div>
                                                                </div>
                                                            </PopoverContent>
                                                        </Popover>
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    );
                                })}
                                {paginatedItems.length === 0 && (
                                    <tr>
                                        <td colSpan={8} className="px-4 py-8 text-center text-[13px] text-gray-500">
                                            Không tìm thấy hàng hóa nào
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    ) : (
                        /* Employee display mode */
                        /* Employee display mode */
                        <div className="flex-1 overflow-auto bg-white">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-[#f2f6ff] sticky top-0 z-10">
                                    <tr>
                                        <th className="px-6 py-3 font-bold text-[11px] text-gray-900 border-b border-gray-100 tracking-wide uppercase w-[300px]">
                                            Loại hình
                                        </th>
                                        <th className="px-6 py-3 font-bold text-[11px] text-gray-900 border-b border-gray-100 tracking-wide uppercase">
                                            Mức áp dụng
                                        </th>
                                        <th className="px-6 py-3 font-bold text-[11px] text-gray-900 border-b border-gray-100 tracking-wide uppercase">
                                            Hoa hồng thụ hưởng
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {employeesWithCommissions.length === 0 ? (
                                        <tr>
                                            <td colSpan={3} className="px-6 py-12 text-center text-gray-500 italic">
                                                {loadingConfigs ? 'Đang tải thiết lập...' : 'Không tìm thấy nhân viên nào có thiết lập hoa hồng'}
                                            </td>
                                        </tr>
                                    ) : (
                                        employeesWithCommissions.map((emp) => (
                                            <Fragment key={emp.id}>
                                                {/* Header Row for Employee */}
                                                <tr className="bg-gray-50/80">
                                                    <td colSpan={3} className="px-6 py-2.5">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-bold text-[13px] text-gray-900">
                                                                {emp.name.toUpperCase()} - {emp.employee_code || `NV${emp.id.substring(0, 6)}`}
                                                            </span>
                                                            <span className="px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded text-[10px] font-bold uppercase">
                                                                {emp.role === 'technician' ? 'Kỹ thuật viên' : 
                                                                 emp.role === 'sale' ? 'Bán hàng' : emp.role}
                                                            </span>
                                                            {(() => {
                                                                const dept = allDepartments.find(d => d.id === emp.department);
                                                                const deptName = dept ? dept.name : emp.department;
                                                                // Don't show if it looks like a UUID
                                                                const isUUID = (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
                                                                if (deptName && !isUUID(deptName)) {
                                                                    return (
                                                                        <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px] font-bold uppercase">
                                                                            {deptName}
                                                                        </span>
                                                                    );
                                                                }
                                                                return null;
                                                            })()}
                                                        </div>
                                                    </td>
                                                </tr>
                                                {/* Rule Rows */}
                                                {(emp.commission_rules || []).map((rule: any, idx: number) => (
                                                    <tr key={`${emp.id}-rule-${idx}`} className="hover:bg-blue-50/30 transition-colors border-b border-gray-50 last:border-b-2 last:border-gray-100">
                                                        <td className="px-10 py-3 text-[13px] text-gray-700">
                                                            <div className="flex items-center gap-2">
                                                                <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                                                                {COMMISSION_CATEGORIES[rule.category] || rule.category}
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-3 text-[13px] text-gray-600">
                                                            Từ {formatNumber(rule.from_amount || 0)}
                                                        </td>
                                                        <td className="px-6 py-3 text-[13px] font-medium text-blue-600">
                                                            {(() => {
                                                                const typeLabel = COMMISSION_TYPES_LABELS[rule.commission_type];
                                                                if (typeLabel) return typeLabel;
                                                                
                                                                // Lookup in custom tables
                                                                const table = commissionTables.find(t => t.id === rule.commission_type);
                                                                return table ? table.name : rule.commission_type;
                                                            })()}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </Fragment>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Pagination */}
                {displayMode === 'products' && (
                    <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-100 bg-[#fbfcfd] text-[12px] text-gray-600">
                        <div className="flex items-center gap-1.5">
                            <button
                                className="px-2 py-1 rounded hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                onClick={() => setCurrentPage(1)}
                                disabled={currentPage === 1}
                            >
                                ⏮
                            </button>
                            <button
                                className="px-2 py-1 rounded hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                            >
                                ◀
                            </button>
                            <span className="px-3 py-1 bg-white border border-gray-200 rounded text-[12px] font-medium min-w-[32px] text-center">
                                {currentPage}
                            </span>
                            <button
                                className="px-2 py-1 rounded hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages || totalPages === 0}
                            >
                                ▶
                            </button>
                            <button
                                className="px-2 py-1 rounded hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                onClick={() => setCurrentPage(totalPages)}
                                disabled={currentPage === totalPages || totalPages === 0}
                            >
                                ⏭
                            </button>
                        </div>
                        <span className="text-gray-500">
                            {displayItems.length > 0
                                ? `${(currentPage - 1) * itemsPerPage + 1} - ${Math.min(currentPage * itemsPerPage, displayItems.length)} trong ${displayItems.length} hàng hóa`
                                : '0 hàng hóa'
                            }
                        </span>
                    </div>
                )}
            </div>

            <AddCommissionConditionDialog
                open={showAddTableDialog}
                onClose={() => setShowAddTableDialog(false)}
                onSave={handleSaveNewTable}
            />
        </div>
    );
}
