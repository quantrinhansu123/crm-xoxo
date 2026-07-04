import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    LayoutDashboard,
    Users,
    ClipboardList,
    ClipboardCheck,
    FileText,
    Wallet,
    Package,
    Wrench,
    UserCog,
    BarChart3,
    // Settings,
    ChevronDown,
    ChevronRight,
    X,
    LogOut,
    // QrCode
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { User, UserRole } from '@/types';
import { canAccessView } from '@/lib/viewPermissions';
import { confirmLeavePage } from '@/lib/navigationGuard';

interface SidebarProps {
    isOpen: boolean;
    onClose: () => void;
    isMobile: boolean;
    currentUser: User;
    onLogout?: () => void;
}

interface MenuItem {
    id: string;
    label: string;
    icon: React.ReactNode;
    children?: { id: string; label: string; roles?: UserRole[] }[];
    roles?: UserRole[];
}

// Permission configuration based on requirements:
// Sale: CRM, tạo hóa đơn, tạo thu/chi (không sửa/hủy)
// Kỹ thuật: kỹ thuật, mua phụ kiện, xin gia hạn, nâng dịch vụ
// Quản lý: duyệt nâng dịch vụ, gia hạn, % hoa hồng, dashboard (all access)
// Kế toán: thu–chi, lương, khóa kỳ

const menuItems: MenuItem[] = [
    {
        id: 'dashboard',
        label: 'Dashboard',
        icon: <LayoutDashboard className="h-5 w-5" />,
        roles: ['admin', 'manager', 'accountant', 'sale'] // Kỹ thuật không thấy dashboard tài chính
    },
    {
        id: 'crm',
        label: 'CRM',
        icon: <Users className="h-5 w-5" />,
        roles: ['admin', 'manager', 'sale'], // Only Sale and Manager can access CRM
        children: [
            { id: 'leads', label: 'Leads', roles: ['admin', 'manager', 'sale'] },
            { id: 'customers', label: 'Khách hàng', roles: ['admin', 'manager', 'sale'] }
        ]
    },
    {
        id: 'orders',
        label: 'Đơn hàng',
        icon: <ClipboardList className="h-5 w-5" />,
        roles: ['admin', 'manager', 'sale', 'technician']
    },
    {
        id: 'requests',
        label: 'Yêu cầu',
        icon: <ClipboardCheck className="h-5 w-5" />,
        roles: ['admin', 'manager', 'sale', 'technician'],
        children: [
            { id: 'requests', label: 'Tất cả yêu cầu', roles: ['admin', 'manager', 'sale', 'technician'] },
            { id: 'orders/upsell-tickets', label: 'Mục phê duyệt', roles: ['admin', 'manager'] },
        ],
    },
    {
        id: 'invoices',
        label: 'Hóa đơn',
        icon: <FileText className="h-5 w-5" />,
        roles: ['admin', 'manager', 'accountant', 'sale'] // Sale can create, Accountant can manage
    },
    {
        id: 'finance',
        label: 'Sổ Quỹ',
        icon: <Wallet className="h-5 w-5" />,
        roles: ['admin', 'manager', 'accountant', 'sale'], // Sale can create but not edit/delete
        children: [
            { id: 'income', label: 'Phiếu thu', roles: ['admin', 'manager', 'accountant', 'sale'] },
            { id: 'expense', label: 'Phiếu chi', roles: ['admin', 'manager', 'accountant', 'sale'] },
            //{ id: 'adjustment', label: 'Điều chỉnh', roles: ['admin', 'manager', 'accountant'] } // Only accountant can adjust
        ]
    },
    {
        id: 'products',
        label: 'Sản phẩm & Dịch vụ',
        icon: <Package className="h-5 w-5" />,
        roles: ['admin', 'manager', 'accountant', 'sale', 'technician'], // All can view
        children: [
            { id: 'product-list', label: 'Sản phẩm' },
            { id: 'services', label: 'Dịch vụ' },
            { id: 'packages', label: 'Gói dịch vụ' },
            { id: 'vouchers', label: 'Thẻ/Voucher' }
        ]
    },
    {
        id: 'technical',
        label: 'Kỹ thuật',
        icon: <Wrench className="h-5 w-5" />,
        roles: ['admin', 'manager', 'technician'], // Only Technician and Manager
        children: [
            // { id: 'scan', label: 'Quét mã QR', roles: ['admin', 'manager', 'technician'] },
            // { id: 'workflow-board', label: 'Bảng quy trình 360', roles: ['admin', 'manager', 'sale', 'technician'] },
            // { id: 'tasks', label: 'Danh sách công việc', roles: ['admin', 'manager', 'technician'] },
            // { id: 'departments', label: 'Phòng ban', roles: ['admin', 'manager'] },
            { id: 'workflows', label: 'Quy trình', roles: ['admin', 'manager'] },
            // { id: 'accessories', label: 'Mua phụ kiện', roles: ['admin', 'manager', 'technician'] },
            // { id: 'extension', label: 'Xin gia hạn', roles: ['admin', 'manager', 'technician'] },
            // { id: 'upgrade', label: 'Nâng dịch vụ', roles: ['admin', 'manager', 'technician'] }
        ]
    },
    {
        id: 'hr',
        label: 'Nhân viên',
        icon: <UserCog className="h-5 w-5" />,
        roles: ['admin', 'manager', 'accountant', 'sale', 'technician'],
        children: [
            { id: 'employees', label: 'Danh sách nhân viên', roles: ['admin', 'manager'] },
            { id: 'employees/departments', label: 'Phòng ban', roles: ['admin', 'manager'] },
            { id: 'work-schedule', label: 'Lịch làm việc', roles: ['admin', 'manager', 'accountant', 'sale', 'technician'] },
            { id: 'attendance-mobile', label: 'Chấm công (Mobile)', roles: ['admin', 'manager', 'accountant', 'sale', 'technician'] },
            { id: 'timesheets', label: 'Bảng chấm công', roles: ['admin', 'manager', 'accountant'] },
            { id: 'leave-requests', label: 'Xin nghỉ/Xin muộn', roles: ['admin', 'manager', 'accountant', 'sale', 'technician'] },
            { id: 'kpi', label: 'KPI', roles: ['admin', 'manager'] },
            { id: 'commissions', label: 'Bảng hoa hồng', roles: ['admin', 'manager', 'accountant'] },
            { id: 'salary-advances', label: 'Ứng lương', roles: ['admin', 'manager', 'accountant'] },
            { id: 'violations', label: 'Vi phạm/Thưởng', roles: ['admin', 'manager', 'accountant'] },
            { id: 'salary', label: 'Bảng lương', roles: ['admin', 'manager', 'accountant'] },
            { id: 'training', label: 'Đào tạo', roles: ['admin', 'manager', 'accountant', 'sale', 'technician'] },
            { id: 'recruitment', label: 'Tuyển dụng', roles: ['admin', 'manager', 'accountant'] },
            { id: 'employee-settings', label: 'Thiết lập nhân viên', roles: ['admin', 'manager'] }
        ]
    },
    {
        id: 'reports',
        label: 'Báo cáo',
        icon: <BarChart3 className="h-5 w-5" />,
        roles: ['admin', 'manager', 'accountant'] // Only Manager and Accountant
    },
    // {
    //     id: 'settings',
    //     label: 'Cài đặt',
    //     icon: <Settings className="h-5 w-5" />,
    //     roles: ['admin', 'manager'] // Only Admin and Manager
    // }
];

export function Sidebar({ isOpen, onClose, isMobile, currentUser, onLogout }: SidebarProps) {
    const navigate = useNavigate();
    const location = useLocation();
    const [expandedItems, setExpandedItems] = useState<string[]>(['crm', 'finance']);
    const userRole = currentUser.role;

    const toggleExpand = (id: string) => {
        setExpandedItems(prev =>
            prev.includes(id)
                ? prev.filter(item => item !== id)
                : [...prev, id]
        );
    };

    const handleNavigate = (page: string) => {
        const currentPath = location.pathname.slice(1);
        if (page !== currentPath && !confirmLeavePage()) return;
        navigate(`/${page}`);
        if (isMobile) {
            onClose();
        }
    };

    const isActive = (id: string, children?: { id: string }[]) => {
        const currentPath = location.pathname.slice(1); // Remove leading slash
        if (currentPath === id) return true;
        if (children?.some(child => child.id === currentPath)) return true;
        return false;
    };

    const isCurrentPage = (id: string) => {
        const currentPath = location.pathname.slice(1);
        return currentPath === id;
    };

    const canViewItem = (item: { id: string; roles?: UserRole[] }) => {
        const roleAllowed = !item.roles || item.roles.includes(userRole);
        return canAccessView(currentUser, item.id, roleAllowed);
    };

    const canView = (item: MenuItem) => {
        if (item.children?.length) {
            return item.children.some((child) => canViewItem(child));
        }
        return canViewItem(item);
    };

    return (
        <>
            {/* Overlay for mobile */}
            {isMobile && isOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 lg:hidden"
                    onClick={onClose}
                />
            )}

            {/* Sidebar */}
            <aside
                className={cn(
                    "fixed top-16 bottom-0 z-50 w-64 border-r bg-white transition-transform duration-300 ease-in-out flex flex-col",
                    // Position on the LEFT side
                    "left-0",
                    isMobile
                        ? isOpen ? "translate-x-0" : "-translate-x-full"
                        : "translate-x-0"
                )}
            >
                {/* Mobile close button */}
                {isMobile && (
                    <div className="flex items-center justify-between p-4 border-b">
                        <span className="font-semibold">Menu</span>
                        <Button variant="ghost" size="icon" onClick={onClose}>
                            <X className="h-5 w-5" />
                        </Button>
                    </div>
                )}

                {/* Menu items */}
                <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
                    {menuItems.filter(canView).map((item) => (
                        <div key={item.id}>
                            {item.children ? (
                                <>
                                    {/* Parent item with children */}
                                    <button
                                        onClick={() => toggleExpand(item.id)}
                                        className={cn(
                                            "w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer",
                                            isActive(item.id, item.children)
                                                ? "bg-primary/10 text-primary"
                                                : "text-muted-foreground hover:bg-muted hover:text-foreground"
                                        )}
                                    >
                                        <div className="flex items-center gap-3">
                                            {item.icon}
                                            <span>{item.label}</span>
                                        </div>
                                        {expandedItems.includes(item.id) ? (
                                            <ChevronDown className="h-4 w-4" />
                                        ) : (
                                            <ChevronRight className="h-4 w-4" />
                                        )}
                                    </button>

                                    {/* Children */}
                                    {expandedItems.includes(item.id) && (
                                        <div className="ml-5 mt-1 space-y-1 border-l-2 border-muted pl-4">
                                            {item.children.filter(canViewItem).map((child) => (
                                                <button
                                                    key={child.id}
                                                    onClick={() => handleNavigate(child.id)}
                                                    className={cn(
                                                        "w-full flex items-center px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer",
                                                        isCurrentPage(child.id)
                                                            ? "bg-primary text-white font-medium"
                                                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                                                    )}
                                                >
                                                    {child.label}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </>
                            ) : (
                                /* Single item without children */
                                <button
                                    onClick={() => handleNavigate(item.id)}
                                    className={cn(
                                        "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer",
                                        isCurrentPage(item.id)
                                            ? "bg-primary text-white"
                                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                                    )}
                                >
                                    {item.icon}
                                    <span>{item.label}</span>
                                </button>
                            )}
                        </div>
                    ))}
                </nav>

                {/* Logout Button */}
                {onLogout && (
                    <div className="p-3 border-t">
                        <button
                            onClick={onLogout}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
                        >
                            <LogOut className="h-5 w-5" />
                            <span>Đăng xuất</span>
                        </button>
                    </div>
                )}
            </aside>
        </>
    );
}
