import { useState, useEffect, useCallback } from 'react';
import { leadsApi } from '@/lib/api';

// Milestone hours for lead reminders
// NOTE: 1/60 = 1 minute for testing, remove in production!
const MILESTONE_HOURS = [1, 3, 5, 7, 24, 48];

export interface LeadNotification {
    id: string;
    leadId: string;
    leadName: string;
    leadPhone: string;
    milestoneHours: number;
    message: string;
    createdAt: string;
    isRead: boolean;
}

// Get milestone label in Vietnamese
const getMilestoneLabel = (hours: number): string => {
    if (hours < 24) return `${hours} giờ`;
    return `${hours / 24} ngày`;
};

// Calculate which milestone a lead is at based on hours since creation
const getActiveMilestone = (createdAt: string): number | null => {
    const created = new Date(createdAt);
    const now = new Date();
    const diffHours = (now.getTime() - created.getTime()) / (1000 * 60 * 60);

    // Find the highest milestone that has passed
    for (let i = MILESTONE_HOURS.length - 1; i >= 0; i--) {
        if (diffHours >= MILESTONE_HOURS[i]) {
            return MILESTONE_HOURS[i];
        }
    }
    return null;
};

export function useLeadNotifications() {
    const [notifications, setNotifications] = useState<LeadNotification[]>([]);
    const [loading, setLoading] = useState(false);
    const [readNotifications, setReadNotifications] = useState<Set<string>>(() => {
        // Load read notifications from localStorage
        const stored = localStorage.getItem('readLeadNotifications');
        return stored ? new Set(JSON.parse(stored)) : new Set();
    });

    const fetchNotifications = useCallback(async () => {
        setLoading(true);
        try {
            // Fetch all leads that are not yet converted (still active leads)
            const response = await leadsApi.getAll({ limit: 100 });
            const leads = response.data?.data?.leads || [];

            const newNotifications: LeadNotification[] = [];

            leads.forEach((lead: any) => {
                // Skip converted leads
                if (lead.pipeline_stage === 'converted' || lead.status === 'converted') {
                    return;
                }

                const milestone = getActiveMilestone(lead.created_at);
                if (milestone) {
                    const notificationId = `${lead.id}-${milestone}`;
                    newNotifications.push({
                        id: notificationId,
                        leadId: lead.id,
                        leadName: lead.name,
                        leadPhone: lead.phone,
                        milestoneHours: milestone,
                        message: `Lead "${lead.name}" đã được tạo ${getMilestoneLabel(milestone)} trước. Hãy liên hệ ngay!`,
                        createdAt: lead.created_at,
                        isRead: readNotifications.has(notificationId),
                    });
                }
            });

            // Sort by milestone (most urgent first - smaller milestone = more urgent)
            newNotifications.sort((a, b) => {
                // Unread first
                if (a.isRead !== b.isRead) return a.isRead ? 1 : -1;
                // Then by milestone (smaller = more urgent)
                return a.milestoneHours - b.milestoneHours;
            });

            setNotifications(newNotifications);
        } catch (error) {
            console.error('Error fetching lead notifications:', error);
        } finally {
            setLoading(false);
        }
    }, [readNotifications]);

    // Mark notification as read
    const markAsRead = useCallback((notificationId: string) => {
        setReadNotifications(prev => {
            const newSet = new Set(prev);
            newSet.add(notificationId);
            localStorage.setItem('readLeadNotifications', JSON.stringify([...newSet]));
            return newSet;
        });
        setNotifications(prev =>
            prev.map(n => n.id === notificationId ? { ...n, isRead: true } : n)
        );
    }, []);

    // Mark all as read
    const markAllAsRead = useCallback(() => {
        setReadNotifications(prev => {
            const newSet = new Set(prev);
            notifications.forEach(n => newSet.add(n.id));
            localStorage.setItem('readLeadNotifications', JSON.stringify([...newSet]));
            return newSet;
        });
        setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    }, [notifications]);

    // Get unread count
    const unreadCount = notifications.filter(n => !n.isRead).length;

    // Fetch on mount and every 5 minutes
    useEffect(() => {
        fetchNotifications();
        const interval = setInterval(fetchNotifications, 5 * 60 * 1000);
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
