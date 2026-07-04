import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';

export interface OrderNotification {
    id: string;
    user_id: string;
    type: string;
    title: string;
    message: string;
    data: {
        order_id?: string;
        order_code?: string;
        invoice_id?: string;
        transaction_id?: string;
        entity_id?: string;
        room_id?: string;
        message_id?: string;
    };
    is_read: boolean;
    created_at: string;
}

export function useOrderNotifications() {
    const [notifications, setNotifications] = useState<OrderNotification[]>([]);
    const [loading, setLoading] = useState(false);

    const fetchNotifications = useCallback(async () => {
        setLoading(true);
        try {
            const response = await api.get('/notifications', {
                params: {
                    limit: 50
                }
            });
            const data = response.data?.data || response.data || [];
            setNotifications(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error('Error fetching order notifications:', error);
            setNotifications([]);
        } finally {
            setLoading(false);
        }
    }, []);

    // Mark notification as read
    const markAsRead = useCallback(async (notificationId: string) => {
        try {
            await api.put(`/notifications/${notificationId}/read`);
            setNotifications(prev =>
                prev.map(n => n.id === notificationId ? { ...n, is_read: true } : n)
            );
        } catch (error) {
            console.error('Error marking notification as read:', error);
        }
    }, []);

    // Mark all as read
    const markAllAsRead = useCallback(async () => {
        try {
            await api.put('/notifications/read-all');
            setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
        } catch (error) {
            console.error('Error marking all as read:', error);
        }
    }, []);

    // Get unread count
    const unreadCount = notifications.filter(n => !n.is_read).length;

    // Fetch on mount and every 1 minute
    useEffect(() => {
        fetchNotifications();
        const interval = setInterval(fetchNotifications, 60 * 1000);
        return () => clearInterval(interval);
    }, [fetchNotifications]);

    return {
        notifications,
        loading,
        unreadCount,
        markAsRead,
        markAllAsRead,
        refresh: fetchNotifications,
    };
}
