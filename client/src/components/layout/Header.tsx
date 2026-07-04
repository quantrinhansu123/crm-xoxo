import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Search, Menu, LogOut, Clock, User, CheckCheck, X, Package } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import type { User as UserType, UserRole } from '@/types';
import { useLeadNotifications } from '@/hooks/useLeadNotifications';
import { useOrderNotifications, type OrderNotification } from '@/hooks/useOrderNotifications';

const roleLabels: Record<UserRole, string> = {
    admin: 'Quản trị viên',
    manager: 'Quản lý',
    accountant: 'Kế toán',
    sale: 'Nhân viên Sale',
    technician: 'Kỹ thuật viên',
    cashier: 'Thu ngân',
};

const getMilestoneColor = (hours: number): string => {
    if (hours <= 1) return 'bg-yellow-100 text-yellow-700';
    if (hours <= 3) return 'bg-orange-100 text-orange-700';
    if (hours <= 7) return 'bg-red-100 text-red-700';
    return 'bg-red-200 text-red-800';
};

interface HeaderProps {
    onMenuToggle?: () => void;
    isMobile: boolean;
    currentUser: UserType;
    onLogout?: () => void;
}

export function Header({ onMenuToggle, isMobile, currentUser, onLogout }: HeaderProps) {
    const navigate = useNavigate();
    const [showNotifications, setShowNotifications] = useState(false);
    const [notificationTab, setNotificationTab] = useState<'leads' | 'orders'>('leads');
    const [currentTime, setCurrentTime] = useState(() => Date.now());
    const { notifications: leadNotifications, unreadCount: leadUnreadCount, markAsRead: markLeadAsRead, loading: leadLoading } = useLeadNotifications();
    const { notifications: orderNotifications, unreadCount: orderUnreadCount, markAsRead: markOrderAsRead, loading: orderLoading, refresh: refreshOrderNotifications } = useOrderNotifications();

    const totalUnreadCount = leadUnreadCount + orderUnreadCount;

    useEffect(() => {
        if (showNotifications) {
            refreshOrderNotifications();
        }
    }, [refreshOrderNotifications, showNotifications]);

    useEffect(() => {
        const interval = setInterval(() => setCurrentTime(Date.now()), 60 * 1000);
        return () => clearInterval(interval);
    }, []);

    const handleLeadNotificationClick = (leadId: string, notificationId: string) => {
        markLeadAsRead(notificationId);
        setShowNotifications(false);
        navigate(`/leads/${leadId}`);
    };

    const handleOrderNotificationClick = (notification: OrderNotification) => {
        markOrderAsRead(notification.id);
        setShowNotifications(false);

        if (notification.data?.invoice_id || notification.type?.startsWith('invoice.')) {
            navigate('/invoices');
            return;
        }

        if (notification.data?.transaction_id || notification.type === 'transaction.created' || notification.type === 'finance.transaction.created') {
            navigate('/income');
            return;
        }

        const orderId = notification.data?.order_id || notification.data?.entity_id;
        if (orderId) {
            const isMention = notification.type === 'mention';
            if (isMention && notification.data?.entity_id) {
                navigate(`/orders/${orderId}`, {
                    state: {
                        openChat: {
                            entityId: notification.data.entity_id,
                            roomId: notification.data.room_id,
                            messageId: notification.data.message_id,
                        }
                    }
                });
            } else {
                navigate(`/orders/${orderId}`);
            }
        }
    };

    const formatTimeAgo = (dateStr: string): string => {
        const diff = currentTime - new Date(dateStr).getTime();
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days} ngày trước`;
        if (hours > 0) return `${hours} giờ trước`;
        return 'Vừa xong';
    };

    return (
        <header className="fixed top-0 left-0 right-0 z-40 h-16 border-b bg-white/95 backdrop-blur-sm">
            <div className="flex h-full items-center justify-between px-4 lg:px-6">
                {/* Left section - Logo & Search */}
                <div className="flex items-center gap-4">
                    {isMobile && (
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={onMenuToggle}
                            className="relative z-10 min-h-[44px] min-w-[44px] touch-manipulation"
                        >
                            <Menu className="h-6 w-6" />
                        </Button>
                    )}
                    <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-blue-600 text-white font-bold text-lg">
                            C
                        </div>
                        <span className="hidden font-semibold text-lg text-foreground sm:block">
                            CRM<span className="text-primary">Pro</span>
                        </span>
                    </div>

                    {/* Search */}
                    <div className="hidden md:block relative w-64 lg:w-80">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            placeholder="Tìm kiếm khách hàng, đơn hàng..."
                            className="pl-9 bg-muted/50 border-0 focus-visible:ring-1"
                        />
                    </div>
                </div>

                {/* Right section - Notifications & User */}
                <div className="flex items-center gap-2">
                    {/* Notifications */}
                    <div className="relative">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="relative"
                            onClick={() => setShowNotifications(!showNotifications)}
                        >
                            <Bell className="h-5 w-5" />
                            {totalUnreadCount > 0 && (
                                <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-[10px] animate-pulse">
                                    {totalUnreadCount > 9 ? '9+' : totalUnreadCount}
                                </Badge>
                            )}
                        </Button>

                        {/* Notification Dropdown */}
                        {showNotifications && (
                            <>
                                {/* Backdrop */}
                                <div
                                    className="fixed inset-0 z-40"
                                    onClick={() => setShowNotifications(false)}
                                />

                                {/* Dropdown */}
                                <Card className="fixed left-2 right-2 top-16 sm:absolute sm:left-auto sm:right-0 sm:top-12 sm:w-96 z-50 shadow-lg border max-h-[70vh] overflow-hidden">
                                    <CardHeader className="pb-2 border-b">
                                        <div className="flex items-center justify-between">
                                            <div className="flex gap-2">
                                                <Button
                                                    variant={notificationTab === 'leads' ? 'default' : 'ghost'}
                                                    size="sm"
                                                    className="h-7 text-xs"
                                                    onClick={() => setNotificationTab('leads')}
                                                >
                                                    <Clock className="h-3 w-3 mr-1" />
                                                    Lead {leadUnreadCount > 0 && `(${leadUnreadCount})`}
                                                </Button>
                                                <Button
                                                    variant={notificationTab === 'orders' ? 'default' : 'ghost'}
                                                    size="sm"
                                                    className="h-7 text-xs"
                                                    onClick={() => setNotificationTab('orders')}
                                                >
                                                    <Package className="h-3 w-3 mr-1" />
                                                    Đơn hàng/TC {orderUnreadCount > 0 && `(${orderUnreadCount})`}
                                                </Button>
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7"
                                                onClick={() => setShowNotifications(false)}
                                            >
                                                <X className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="p-0 max-h-[50vh] overflow-y-auto">
                                        {/* Lead Notifications Tab */}
                                        {notificationTab === 'leads' && (
                                            <>
                                                {leadLoading ? (
                                                    <div className="flex items-center justify-center py-8">
                                                        <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent" />
                                                    </div>
                                                ) : leadNotifications.length === 0 ? (
                                                    <div className="flex flex-col items-center justify-center py-8 text-center px-4">
                                                        <Clock className="h-10 w-10 text-muted-foreground/50 mb-2" />
                                                        <p className="text-sm text-muted-foreground">Không có thông báo Lead</p>
                                                    </div>
                                                ) : (
                                                    <div className="divide-y">
                                                        {leadNotifications.slice(0, 10).map((notification) => (
                                                            <div
                                                                key={notification.id}
                                                                className={`p-3 hover:bg-muted/50 cursor-pointer transition-colors ${!notification.isRead ? 'bg-blue-50/50' : ''}`}
                                                                onClick={() => handleLeadNotificationClick(notification.leadId, notification.id)}
                                                            >
                                                                <div className="flex gap-3">
                                                                    <div className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${getMilestoneColor(notification.milestoneHours)}`}>
                                                                        <Clock className="h-4 w-4" />
                                                                    </div>
                                                                    <div className="flex-1 min-w-0">
                                                                        <p className="text-sm font-medium truncate">{notification.leadName}</p>
                                                                        <p className="text-xs text-muted-foreground truncate">{notification.leadPhone}</p>
                                                                        <p className="text-xs text-muted-foreground mt-1">
                                                                            Tạo {formatTimeAgo(notification.createdAt)}
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </>
                                        )}

                                        {/* Order Notifications Tab */}
                                        {notificationTab === 'orders' && (
                                            <>
                                                {orderLoading ? (
                                                    <div className="flex items-center justify-center py-8">
                                                        <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent" />
                                                    </div>
                                                ) : orderNotifications.length === 0 ? (
                                                    <div className="flex flex-col items-center justify-center py-8 text-center px-4">
                                                        <Package className="h-10 w-10 text-muted-foreground/50 mb-2" />
                                                        <p className="text-sm text-muted-foreground">Không có thông báo đơn hàng/tài chính</p>
                                                    </div>
                                                ) : (
                                                    <div className="divide-y">
                                                        {orderNotifications.slice(0, 10).map((notification) => (
                                                            <div
                                                                key={notification.id}
                                                                className={`p-3 hover:bg-muted/50 cursor-pointer transition-colors ${!notification.is_read ? 'bg-green-50/50' : ''}`}
                                                                onClick={() => handleOrderNotificationClick(notification)}
                                                            >
                                                                <div className="flex gap-3">
                                                                    <div className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${notification.type === 'mention'
                                                                        ? 'bg-blue-100 text-blue-700'
                                                                        : 'bg-green-100 text-green-700'
                                                                        }`}>
                                                                        {notification.type === 'mention' ? (
                                                                            <User className="h-4 w-4" />
                                                                        ) : (
                                                                            <CheckCheck className="h-4 w-4" />
                                                                        )}
                                                                    </div>
                                                                    <div className="flex-1 min-w-0">
                                                                        <p className="text-sm font-medium">{notification.title}</p>
                                                                        <p className="text-xs text-muted-foreground line-clamp-2">{notification.message}</p>
                                                                        <p className="text-xs text-muted-foreground mt-1">
                                                                            {formatTimeAgo(notification.created_at)}
                                                                        </p>
                                                                    </div>
                                                                    {!notification.is_read && (
                                                                        <div className={`h-2 w-2 rounded-full shrink-0 ${notification.type === 'mention' ? 'bg-blue-500' : 'bg-green-500'
                                                                            }`} />
                                                                    )}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </CardContent>
                                </Card>
                            </>
                        )}
                    </div>

                    {/* Settings
                    <Button variant="ghost" size="icon" className="hidden sm:flex">
                        <Settings className="h-5 w-5" />
                    </Button> */}

                    {/* User Info */}
                    <div className="flex items-center gap-3 ml-2 pl-3 border-l">
                        <div className="hidden sm:block text-right">
                            <p className="text-sm font-medium">{currentUser?.name || 'User'}</p>
                            <p className="text-xs text-muted-foreground">{roleLabels[currentUser.role]}</p>
                        </div>
                        <Avatar className="h-9 w-9 cursor-pointer ring-2 ring-transparent hover:ring-primary/20 transition-all">
                            <AvatarImage src={currentUser?.avatar} alt={currentUser?.name} />
                            <AvatarFallback>{currentUser?.name?.charAt(0) || 'U'}</AvatarFallback>
                        </Avatar>
                    </div>

                    {/* Logout button */}
                    {onLogout && (
                        <Button variant="ghost" size="icon" onClick={onLogout} className="text-red-500 hover:bg-red-50">
                            <LogOut className="h-5 w-5" />
                        </Button>
                    )}

                </div>
            </div>
        </header>
    );
}
