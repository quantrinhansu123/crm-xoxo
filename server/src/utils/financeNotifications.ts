import { supabaseAdmin } from '../config/supabase.js';
import { fireWebhook } from './webhookNotifier.js';

type Actor = {
    id: string;
    name: string;
    role: string;
};

type NotifyFinanceEventParams = {
    event: string;
    title: string;
    message: string;
    data: Record<string, any>;
    actor?: Actor;
    recipientRoles?: string[];
    recipientUserIds?: Array<string | null | undefined>;
};

async function getNotificationRecipients(
    roles: string[],
    userIds: Array<string | null | undefined> = []
): Promise<string[]> {
    const recipients = new Set<string>();

    userIds.filter(Boolean).forEach(userId => recipients.add(userId as string));

    const { data: users, error } = await supabaseAdmin
        .from('users')
        .select('id')
        .in('role', roles);

    if (error) {
        console.error('[FinanceNotifications] Error fetching recipients:', error);
        return Array.from(recipients);
    }

    (users || []).forEach(user => recipients.add(user.id));
    return Array.from(recipients);
}

export async function notifyFinanceEvent({
    event,
    title,
    message,
    data,
    actor,
    recipientRoles = ['admin', 'manager', 'accountant'],
    recipientUserIds = [],
}: NotifyFinanceEventParams): Promise<void> {
    const payload = {
        ...data,
        event,
        actor_id: actor?.id,
        actor_name: actor?.name,
        actor_role: actor?.role,
        occurred_at: new Date().toISOString(),
    };

    fireWebhook(event, payload);

    try {
        const recipientIds = await getNotificationRecipients(recipientRoles, recipientUserIds);

        if (recipientIds.length === 0) {
            return;
        }

        const notifications = recipientIds.map(user_id => ({
            user_id,
            type: event,
            title,
            message,
            data: payload,
        }));

        const { error } = await supabaseAdmin
            .from('notifications')
            .insert(notifications);

        if (error) {
            console.error('[FinanceNotifications] Error creating notifications:', error);
        }
    } catch (error) {
        console.error('[FinanceNotifications] Unexpected notification error:', error);
    }
}
