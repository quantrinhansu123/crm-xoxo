import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { DragDropContext } from '@hello-pangea/dnd';
import type { DropResult } from '@hello-pangea/dnd';
import { Search, Plus, Loader2, Phone, Users, TrendingUp, UserPlus, Filter } from 'lucide-react';
import { toast, Toaster } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLeads } from '@/hooks/useLeads';
import { useViewActionForRoles } from '@/hooks/useViewAction';
import type { Lead } from '@/hooks/useLeads';
import { useEmployees } from '@/hooks/useEmployees';
import { useUsers } from '@/hooks/useUsers';
import { CreateOrderDialog } from '@/components/orders/CreateOrderDialog';
import { OrderConfirmationDialog } from '@/components/orders/OrderConfirmationDialog';
import { OrderDetailDialog } from '@/components/orders/OrderDetailDialog';
import { useCustomers } from '@/hooks/useCustomers';
import { useProducts } from '@/hooks/useProducts';
import { usePackages } from '@/hooks/usePackages';
import { useVouchers } from '@/hooks/useVouchers';
import { useOrders } from '@/hooks/useOrders';

import {
    KanbanColumn,
    kanbanColumns,
    LeadHenQuaShipDialog,
    LeadUpdatePhoneDialog,
    LeadFailDialog,
    MobileStageBottomSheet,
    MobileFilterSheet,
} from '@/components/leads';
import type { CreateLeadFormData } from '@/components/leads';
import { MobileKanbanColumnTabs } from '@/components/kanban/mobileKanban';

export function LeadsPage() {
    const navigate = useNavigate();
    const { canRead, canEdit, canDelete } = useViewActionForRoles('leads', ['admin', 'manager', 'sale']);
    const { leads, loading, error, fetchLeads, createLead, updateLead, deleteLead, convertLead } = useLeads();
    const { employees, fetchEmployees } = useEmployees();
    const { users: technicians, fetchTechnicians } = useUsers();

    // Hooks for CreateOrderDialog
    const { customers, fetchCustomers } = useCustomers();
    const { products, services, fetchProducts, fetchServices } = useProducts();
    const { packages, fetchPackages } = usePackages();
    const { vouchers, fetchVouchers } = useVouchers();
    const { createOrder, getOrder } = useOrders();

    const [searchTerm, setSearchTerm] = useState('');
    const [selectedSources, setSelectedSources] = useState<string[]>([]);
    const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
    const [onlyUnassigned, setOnlyUnassigned] = useState<boolean>(false);

    // Mobile kanban state
    const [activeColumnIndex, setActiveColumnIndex] = useState(0);

    // State for CreateOrderDialog
    const [showOrderDialog, setShowOrderDialog] = useState(false);
    const [leadForOrder, setLeadForOrder] = useState<Lead | null>(null);
    const [showOrderConfirmation, setShowOrderConfirmation] = useState(false);
    const [createdOrder, setCreatedOrder] = useState<any>(null);
    const [showOrderDetail, setShowOrderDetail] = useState(false);
    const [confirmedOrder, setConfirmedOrder] = useState<any>(null);

    // State for HenQuaShipDialog
    const [showHenQuaShipDialog, setShowHenQuaShipDialog] = useState(false);
    const [leadForHenQuaShip, setLeadForHenQuaShip] = useState<Lead | null>(null);
    
    // State for FailDialog
    const [showFailDialog, setShowFailDialog] = useState(false);
    const [leadForFail, setLeadForFail] = useState<Lead | null>(null);

    // State for UpdatePhoneDialog
    const [showUpdatePhoneDialog, setShowUpdatePhoneDialog] = useState(false);
    const [leadForUpdatePhone, setLeadForUpdatePhone] = useState<Lead | null>(null);

    // State for MobileStageBottomSheet
    const [showMobileSheet, setShowMobileSheet] = useState(false);
    const [leadForMobileSheet, setLeadForMobileSheet] = useState<Lead | null>(null);

    // State for MobileFilterSheet
    const [showMobileFilters, setShowMobileFilters] = useState(false);

    // Fetch data on mount
    useEffect(() => {
        fetchLeads({ limit: 1000 });
        fetchEmployees({ role: 'sale' });
        // Fetch data for CreateOrderDialog
        fetchCustomers();
        fetchProducts();
        fetchServices();
        fetchPackages();
        fetchVouchers();
        fetchTechnicians(); // Fetch technicians for order dialog
    }, [fetchLeads, fetchEmployees, fetchCustomers, fetchProducts, fetchServices, fetchPackages, fetchVouchers, fetchTechnicians]);

    // Filter leads
    const filteredLeads = useMemo(() => {
        return leads.filter(lead => {
            const matchesSearch = (lead.name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
                (lead.phone || '').includes(searchTerm);
            
            const matchesSource = selectedSources.length === 0 || selectedSources.includes(lead.source || 'other');
            const matchesEmployee = selectedEmployees.length === 0 || selectedEmployees.includes(lead.assigned_to || '');
            
            // Unassigned leads filter (leads that haven't been assigned to anyone)
            const matchesUnassigned = !onlyUnassigned || !lead.assigned_to;
            
            return matchesSearch && matchesSource && matchesEmployee && matchesUnassigned;
        });
    }, [leads, searchTerm, selectedSources, selectedEmployees, onlyUnassigned]);

    // Group leads by pipeline_stage (or status as fallback) for Kanban
    const leadsByStatus = useMemo(() => {
        const grouped: Record<string, Lead[]> = {};
        kanbanColumns.forEach(col => {
            grouped[col.id] = [];
        });
        filteredLeads.forEach(lead => {
            const stage = (lead as any).pipeline_stage || lead.status || 'xac_dinh_nhu_cau';
            if (grouped[stage]) {
                grouped[stage].push(lead);
            } else {
                // Fallback to first column if status doesn't match any column
                grouped['xac_dinh_nhu_cau'].push(lead);
            }
        });
        return grouped;
    }, [filteredLeads]);

    const stageColumns = useMemo(
        () => kanbanColumns.map((c) => ({ id: c.id, title: c.label })),
        []
    );

    // Calculate stats
    const stats = useMemo(() => {
        const total = filteredLeads.length;
        const newLeads = leadsByStatus['xac_dinh_nhu_cau']?.length || 0;
        const qualified = (leadsByStatus['hen_qua_ship']?.length || 0) + (leadsByStatus['chot_don']?.length || 0);
        const nurturing = (leadsByStatus['hen_gui_anh']?.length || 0) + (leadsByStatus['dam_phan_gia']?.length || 0);
        return { total, newLeads, qualified, nurturing };
    }, [filteredLeads, leadsByStatus]);

    const handleDragEnd = async (result: DropResult) => {
        const { destination, source, draggableId } = result;

        if (!destination) return;
        if (destination.droppableId === source.droppableId && destination.index === source.index) {
            return;
        }

        const newPipelineStage = destination.droppableId;

        // Optimistic update - immediately update UI
        const leadToUpdate = leads.find(l => l.id === draggableId);
        if (!leadToUpdate) return;

        // Validation: Must have phone number to move to 'chot_don'
        if (newPipelineStage === 'chot_don' && !leadToUpdate.phone) {
            setLeadForUpdatePhone(leadToUpdate);
            setShowUpdatePhoneDialog(true);
            return;
        }

        try {
            // If pipeline_stage is 'hen_qua_ship', open dialog instead of immediate update
            if (newPipelineStage === 'hen_qua_ship') {
                setLeadForHenQuaShip(leadToUpdate);
                setShowHenQuaShipDialog(true);
                return;
            }

            // If pipeline_stage is 'fail', open dialog instead of immediate update
            if (newPipelineStage === 'fail') {
                setLeadForFail(leadToUpdate);
                setShowFailDialog(true);
                return;
            }

            await updateLead(draggableId, { pipeline_stage: newPipelineStage, status: newPipelineStage });
            const statusLabel = kanbanColumns.find(c => c.id === newPipelineStage)?.label || newPipelineStage;
            toast.success(`Đã chuyển "${leadToUpdate.name}" sang "${statusLabel}"`);

            // If pipeline_stage is 'chot_don' (Chốt đơn), navigate to create order page
            if (newPipelineStage === 'chot_don') {
                // Navigate to create order page with lead info
                const params = new URLSearchParams({
                    lead_id: leadToUpdate.id,
                    lead_name: leadToUpdate.name,
                    lead_phone: leadToUpdate.phone,
                    lead_email: leadToUpdate.email || '',
                });
                navigate(`/orders/new?${params.toString()}`);
            }

            await fetchLeads({ limit: 1000 }); // Refresh data
        } catch {
            toast.error('Lỗi khi cập nhật trạng thái');
            await fetchLeads({ limit: 1000 }); // Revert by refreshing
        }
    };

    const handleSubmitHenQuaShip = async (data: Partial<Lead>) => {
        if (!leadForHenQuaShip) return;
        try {
            await updateLead(leadForHenQuaShip.id, data);
            toast.success(`Đã cập nhật thông tin cho "${leadForHenQuaShip.name}"`);
            setShowHenQuaShipDialog(false);
            setLeadForHenQuaShip(null);
            await fetchLeads({ limit: 1000 });
        } catch {
            toast.error('Lỗi khi cập nhật thông tin');
        }
    };

    const handleSubmitFail = async (data: Partial<Lead>) => {
        if (!leadForFail) return;
        try {
            await updateLead(leadForFail.id, data);
            toast.success(`Đã chuyển "${leadForFail.name}" sang trạng thái Fail`);
            setShowFailDialog(false);
            setLeadForFail(null);
            await fetchLeads({ limit: 1000 });
        } catch {
            toast.error('Lỗi khi cập nhật trạng thái');
        }
    };

    const handleSubmitUpdatePhone = async (data: Partial<Lead>) => {
        if (!leadForUpdatePhone) return;
        try {
            await updateLead(leadForUpdatePhone.id, { ...data, pipeline_stage: 'chot_don', status: 'chot_don' });
            toast.success(`Đã cập nhật số điện thoại cho "${leadForUpdatePhone.name}"`);
            setShowUpdatePhoneDialog(false);
            
            // Navigate to create order page with lead info (including new phone)
            const params = new URLSearchParams({
                lead_id: leadForUpdatePhone.id,
                lead_name: leadForUpdatePhone.name,
                lead_phone: data.phone || leadForUpdatePhone.phone || '',
                lead_email: leadForUpdatePhone.email || '',
            });
            navigate(`/orders/new?${params.toString()}`);
            
            setLeadForUpdatePhone(null);
            await fetchLeads({ limit: 1000 });
        } catch {
            toast.error('Lỗi khi cập nhật số điện thoại');
        }
    };

    const handleConvert = async (lead: Lead) => {
        try {
            await convertLead(lead.id);
            toast.success(`Đã chuyển đổi ${lead.name} thành khách hàng!`);
            await fetchLeads({ limit: 1000 });
        } catch {
            toast.error('Lỗi khi chuyển đổi lead');
        }
    };

    const handleCreateLead = async (data: CreateLeadFormData) => {
        try {
            await createLead(data);
            toast.success('Đã tạo lead thành công!');
            await fetchLeads({ limit: 1000 });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Lỗi khi tạo lead';
            toast.error(message);
            throw error;
        }
    };

    const handleDeleteLead = async (id: string) => {
        if (!canDelete) return;
        try {
            await deleteLead(id);
            toast.success('Đã xóa lead thành công');
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Lỗi khi xóa lead';
            toast.error(message);
        }
    };

    // Handle stage change from mobile bottom sheet (mirrors handleDragEnd logic)
    const handleMobileStageChange = async (lead: Lead, newStageId: string) => {
        const currentStage = (lead as any).pipeline_stage || lead.status || 'xac_dinh_nhu_cau';
        if (newStageId === currentStage) return;

        // Validation: Must have phone number to move to 'chot_don'
        if (newStageId === 'chot_don' && !lead.phone) {
            setLeadForUpdatePhone(lead);
            setShowUpdatePhoneDialog(true);
            return;
        }

        try {
            if (newStageId === 'hen_qua_ship') {
                setLeadForHenQuaShip(lead);
                setShowHenQuaShipDialog(true);
                return;
            }

            if (newStageId === 'fail') {
                setLeadForFail(lead);
                setShowFailDialog(true);
                return;
            }

            await updateLead(lead.id, { pipeline_stage: newStageId, status: newStageId });
            const statusLabel = kanbanColumns.find(c => c.id === newStageId)?.label || newStageId;
            toast.success(`Đã chuyển "${lead.name}" sang "${statusLabel}"`);

            if (newStageId === 'chot_don') {
                const params = new URLSearchParams({
                    lead_id: lead.id,
                    lead_name: lead.name,
                    lead_phone: lead.phone,
                    lead_email: lead.email || '',
                });
                navigate(`/orders/new?${params.toString()}`);
            }

            await fetchLeads({ limit: 1000 });
        } catch {
            toast.error('Lỗi khi cập nhật trạng thái');
            await fetchLeads({ limit: 1000 });
        }
    };

    if (loading && leads.length === 0) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-10 w-10 animate-spin text-primary" />
                    <p className="text-muted-foreground">Đang tải dữ liệu...</p>
                </div>
            </div>
        );
    }

    if (!canRead) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
                <div className="h-20 w-20 rounded-2xl bg-red-100 flex items-center justify-center mb-4">
                    <span className="text-4xl">🔒</span>
                </div>
                <h2 className="text-2xl font-bold text-foreground mb-2">Không có quyền xem lead</h2>
                <p className="text-muted-foreground max-w-md">
                    Tài khoản của bạn chưa được cấp quyền xem danh sách lead.
                </p>
            </div>
        );
    }

    return (
        <>
            <Toaster position="top-right" richColors />
            <div className="space-y-5 animate-fade-in -mx-4 md:-mx-6 lg:-mx-8 px-4" style={{ contain: 'inline-size' }}>
                {/* Page Header + Stats + Filters Container - Contained width */}
                <div className="space-y-5">
                    {/* Page Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div>
                            <h1 className="text-2xl font-bold text-foreground">Quản lý Leads</h1>
                            <p className="text-muted-foreground">Theo dõi và chăm sóc khách hàng tiềm năng</p>
                        </div>
                        {canEdit && (
                            <Button onClick={() => navigate('/leads/new')} className="shadow-md w-full sm:w-auto">
                                <Plus className="h-4 w-4 mr-2" />
                                Thêm Lead
                            </Button>
                        )}
                    </div>

                    {/* Stats Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
                        <Card className="overflow-hidden">
                            <CardContent className="p-3 sm:p-4">
                                <div className="flex items-center gap-3">
                                    <div className="p-2.5 rounded-lg bg-blue-100 shrink-0">
                                        <Users className="h-5 w-5 text-blue-600" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-sm text-muted-foreground truncate">Tổng leads</p>
                                        <p className="text-xl sm:text-2xl font-bold text-foreground">{stats.total}</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                        <Card className="overflow-hidden">
                            <CardContent className="p-3 sm:p-4">
                                <div className="flex items-center gap-3">
                                    <div className="p-2.5 rounded-lg bg-amber-100 shrink-0">
                                        <UserPlus className="h-5 w-5 text-amber-600" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-sm text-muted-foreground truncate">Leads mới</p>
                                        <p className="text-xl sm:text-2xl font-bold text-foreground">{stats.newLeads}</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                        <Card className="overflow-hidden">
                            <CardContent className="p-3 sm:p-4">
                                <div className="flex items-center gap-3">
                                    <div className="p-2.5 rounded-lg bg-purple-100 shrink-0">
                                        <Phone className="h-5 w-5 text-purple-600" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-sm text-muted-foreground truncate">Đang chăm</p>
                                        <p className="text-xl sm:text-2xl font-bold text-foreground">{stats.nurturing}</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                        <Card className="overflow-hidden">
                            <CardContent className="p-3 sm:p-4">
                                <div className="flex items-center gap-3">
                                    <div className="p-2.5 rounded-lg bg-green-100 shrink-0">
                                        <TrendingUp className="h-5 w-5 text-green-600" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-sm text-muted-foreground truncate">Qualified</p>
                                        <p className="text-xl sm:text-2xl font-bold text-foreground">{stats.qualified}</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Error Message */}
                    {error && (
                        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-600">
                            {error}
                        </div>
                    )}

                    {/* Filters */}
                    {/* Mobile Filter Button & Search */}
                    <div className="flex flex-col md:hidden gap-3 px-1">
                        <div className="flex items-center gap-3">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    placeholder="Tìm theo tên, sđt..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-9 h-11 bg-white border-slate-200 shadow-sm"
                                />
                            </div>
                            <Button 
                                variant="outline" 
                                onClick={() => setShowMobileFilters(true)}
                                className="h-11 shrink-0 bg-white border-slate-200 shadow-sm relative group"
                            >
                                <Filter className="h-4 w-4 mr-2 text-primary" />
                                <span>Lọc</span>
                                {(selectedSources.length > 0 || selectedEmployees.length > 0 || onlyUnassigned) && (
                                    <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-primary text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-in zoom-in">
                                        {selectedSources.length + selectedEmployees.length + (onlyUnassigned ? 1 : 0)}
                                    </span>
                                )}
                            </Button>
                        </div>
                    </div>

                    {/* Desktop Filters */}
                    <Card className="hidden md:block">
                        <CardContent className="p-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                {/* Search */}
                                <div className="relative lg:col-span-2">
                                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                    <Input
                                        placeholder="Tìm theo tên, số điện thoại..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="pl-9"
                                    />
                                </div>

                                {/* Source Filter */}
                                <Select 
                                    value={selectedSources.length === 1 ? selectedSources[0] : 'all'} 
                                    onValueChange={(val) => setSelectedSources(val === 'all' ? [] : [val])}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Nguồn" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Tất cả nguồn</SelectItem>
                                        <SelectItem value="facebook">Facebook</SelectItem>
                                        <SelectItem value="google">Google</SelectItem>
                                        <SelectItem value="zalo">Zalo</SelectItem>
                                        <SelectItem value="website">Website</SelectItem>
                                        <SelectItem value="referral">Giới thiệu</SelectItem>
                                        <SelectItem value="walk-in">Walk-in</SelectItem>
                                    </SelectContent>
                                </Select>

                                {/* Employee Filter */}
                                <Select 
                                    value={onlyUnassigned ? 'unassigned' : selectedEmployees.length === 1 ? selectedEmployees[0] : 'all'} 
                                    onValueChange={(val) => {
                                        if (val === 'all') {
                                            setSelectedEmployees([]);
                                            setOnlyUnassigned(false);
                                        } else if (val === 'unassigned') {
                                            setSelectedEmployees([]);
                                            setOnlyUnassigned(true);
                                        } else {
                                            setSelectedEmployees([val]);
                                            setOnlyUnassigned(false);
                                        }
                                    }}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Nhân viên" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Tất cả NV</SelectItem>
                                        <SelectItem value="unassigned">Chưa phân công</SelectItem>
                                        {employees.map(user => (
                                            <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Mobile Column Tab Bar + single column */}
                <div className="md:hidden">
                    <DragDropContext onDragEnd={handleDragEnd}>
                        <MobileKanbanColumnTabs
                            columns={stageColumns}
                            activeId={kanbanColumns[activeColumnIndex]?.id ?? stageColumns[0]?.id}
                            onChange={(id) => {
                                const idx = kanbanColumns.findIndex((c) => c.id === id);
                                if (idx >= 0) setActiveColumnIndex(idx);
                            }}
                            getCount={(id) => (leadsByStatus[id] || []).length}
                            className="mb-3 px-1"
                        />
                        {kanbanColumns
                            .filter((_, idx) => idx === activeColumnIndex)
                            .map((column) => (
                                <KanbanColumn
                                    key={column.id}
                                    column={column}
                                    leads={leadsByStatus[column.id] || []}
                                    onCardClick={(lead) => navigate(`/leads/${lead.id}`)}
                                    onDeleteLead={handleDeleteLead}
                                    onLongPressLead={(lead) => {
                                        setLeadForMobileSheet(lead);
                                        setShowMobileSheet(true);
                                    }}
                                    stageColumns={stageColumns}
                                    onStageChange={handleDragEnd}
                                    isPhoneView
                                />
                            ))}
                    </DragDropContext>
                </div>

                {/* Kanban Board - Desktop */}
                <div className="hidden pb-6 md:block">
                    <DragDropContext onDragEnd={handleDragEnd}>
                        <div className="flex gap-3 pb-4 px-0">
                            {kanbanColumns.map((column) => (
                                <div key={column.id} className="flex-1 min-w-0">
                                    <KanbanColumn
                                        column={column}
                                        leads={leadsByStatus[column.id] || []}
                                        onCardClick={(lead) => navigate(`/leads/${lead.id}`)}
                                        onDeleteLead={handleDeleteLead}
                                        onLongPressLead={(lead) => {
                                            setLeadForMobileSheet(lead);
                                            setShowMobileSheet(true);
                                        }}
                                    />
                                </div>
                            ))}
                        </div>
                    </DragDropContext>
                </div>




                {/* Create Order Dialog - shown when lead is moved to 'chot_don' */}
                <CreateOrderDialog
                    open={showOrderDialog}
                    onClose={() => {
                        setShowOrderDialog(false);
                        setLeadForOrder(null);
                    }}
                    onSubmit={async (data) => {
                        const result = await createOrder(data);
                        setShowOrderDialog(false);
                        setLeadForOrder(null);
                        // Show confirmation dialog with created order
                        if (result) {
                            setCreatedOrder(result);
                            setShowOrderConfirmation(true);
                        } else {
                            toast.success('Đã tạo đơn hàng thành công!');
                        }
                    }}
                    customers={customers.map(c => ({ id: c.id, name: c.name, phone: c.phone, status: c.status }))}
                    products={products.map(p => ({ id: p.id, name: p.name, price: p.price }))}
                    services={services.map(s => ({ id: s.id, name: s.name, price: s.price, department: s.department }))}
                    packages={packages}
                    vouchers={vouchers}
                    technicians={technicians}
                    initialCustomer={leadForOrder ? { name: leadForOrder.name, phone: leadForOrder.phone } : undefined}
                />

                {/* Order Confirmation Dialog - shown after order is created */}
                <OrderConfirmationDialog
                    open={showOrderConfirmation}
                    onClose={() => {
                        setShowOrderConfirmation(false);
                        setCreatedOrder(null);
                    }}
                    order={createdOrder}
                    onConfirm={async () => {
                        // After confirming, fetch full order details and show detail dialog
                        if (createdOrder?.id) {
                            try {
                                const fullOrder = await getOrder(createdOrder.id);
                                setConfirmedOrder(fullOrder);
                                setShowOrderDetail(true);
                            } catch {
                                // Fallback to basic order data
                                setConfirmedOrder(createdOrder);
                                setShowOrderDetail(true);
                            }
                        }
                        setShowOrderConfirmation(false);
                        setCreatedOrder(null);
                        fetchLeads({ limit: 1000 }); // Refresh leads data
                    }}
                />

                {/* Order Detail Dialog - shown after confirming order */}
                <OrderDetailDialog
                    open={showOrderDetail}
                    onClose={() => {
                        setShowOrderDetail(false);
                        setConfirmedOrder(null);
                    }}
                    order={confirmedOrder}
                />

                <LeadHenQuaShipDialog
                    open={showHenQuaShipDialog}
                    onClose={() => {
                        setShowHenQuaShipDialog(false);
                        setLeadForHenQuaShip(null);
                    }}
                    onSubmit={handleSubmitHenQuaShip}
                    lead={leadForHenQuaShip}
                />

                <LeadFailDialog
                    open={showFailDialog}
                    onClose={() => {
                        setShowFailDialog(false);
                        setLeadForFail(null);
                    }}
                    onSubmit={handleSubmitFail}
                    lead={leadForFail}
                />

                <LeadUpdatePhoneDialog
                    open={showUpdatePhoneDialog}
                    onClose={() => {
                        setShowUpdatePhoneDialog(false);
                        setLeadForUpdatePhone(null);
                    }}
                    onSubmit={handleSubmitUpdatePhone}
                    lead={leadForUpdatePhone}
                />

                <MobileStageBottomSheet
                    open={showMobileSheet}
                    lead={leadForMobileSheet}
                    onClose={() => {
                        setShowMobileSheet(false);
                        setLeadForMobileSheet(null);
                    }}
                    onSelectStage={handleMobileStageChange}
                />
                <MobileFilterSheet
                    open={showMobileFilters}
                    onClose={() => setShowMobileFilters(false)}
                    selectedSources={selectedSources}
                    setSelectedSources={setSelectedSources}
                    selectedEmployees={selectedEmployees}
                    setSelectedEmployees={setSelectedEmployees}
                    onlyUnassigned={onlyUnassigned}
                    setOnlyUnassigned={setOnlyUnassigned}
                    leads={leads}
                    employees={employees}
                    onClear={() => {
                        setSelectedSources([]);
                        setSelectedEmployees([]);
                        setOnlyUnassigned(false);
                    }}
                />
            </div>
        </>
    );
}
