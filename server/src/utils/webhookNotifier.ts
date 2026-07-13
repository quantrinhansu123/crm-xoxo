/**
 * Webhook Notifier Utility
 * Fire-and-forget: Gửi event sang n8n khi có sự kiện trong CRM.
 * Không block response của API chính.
 *
 * NOTE: dùng `any` cho fetch result vì trên CI `Response` bị lẫn với Express.Response.
 */

const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || '';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';
const CRM_MASTER_WEBHOOK_URL = process.env.CRM_MASTER_WEBHOOK_URL || 'https://dhsywwqoi.datadex.vn/webhook/crm-master-xoxo';

function createWebhookEventId(): string {
    const cryptoApi = (globalThis as any).crypto;
    if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
    return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

async function readResponsePreview(response: any): Promise<string | null> {
    try {
        const text = await response.text();
        return text ? String(text).slice(0, 500) : null;
    } catch {
        return null;
    }
}

async function postJson(url: string, body: unknown, headers: Record<string, string> = {}): Promise<any> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response: any = await (globalThis as any).fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...headers,
        },
        body: JSON.stringify(body),
    });
    return response;
}

/**
 * Gửi webhook event sang n8n.
 * Trả về và log status của n8n (dùng cho debug/test).
 */
export async function fireWebhook(event: string, data: Record<string, any>): Promise<{ ok: boolean, status: number } | void> {
    const eventId = data.event_id || createWebhookEventId();
    if (!N8N_WEBHOOK_URL) {
        console.log(`[WebhookNotifier] N8N_WEBHOOK_URL chưa cấu hình, bỏ qua event: ${event} (${eventId})`);
        return;
    }

    const payload = {
        event,
        event_id: eventId,
        occurred_at: data.occurred_at || new Date().toISOString(),
        timestamp: new Date().toISOString(),
        data,
    };

    try {
        const response = await postJson(N8N_WEBHOOK_URL, payload, {
            'x-webhook-secret': WEBHOOK_SECRET,
        });

        const responsePreview = await readResponsePreview(response);
        const ok = Boolean(response?.ok);
        const status = Number(response?.status || 0);
        if (!ok) {
            console.error(`[WebhookNotifier] ❌ n8n responded ${status} for event: ${event} (${eventId})${responsePreview ? `: ${responsePreview}` : ''}`);
        } else {
            console.log(`[WebhookNotifier] ✅ SUCCESS: Fired event "${event}" (${eventId}) to n8n`);
        }
        return { ok, status };
    } catch (err) {
        console.error(`[WebhookNotifier] ❌ ERROR: Failed to fire event "${event}" (${eventId}):`, err);
        return { ok: false, status: 500 };
    }
}

export async function fireCrmMasterWebhook(event: string, data: Record<string, any>): Promise<{ ok: boolean, status: number } | void> {
    const eventId = data.event_id || createWebhookEventId();
    const payload = data.event === event
        ? { event_id: eventId, occurred_at: data.occurred_at || data.created_at || new Date().toISOString(), ...data }
        : { event, event_id: eventId, occurred_at: data.occurred_at || data.created_at || new Date().toISOString(), ...data };

    try {
        const response = await postJson(CRM_MASTER_WEBHOOK_URL, payload);
        const responsePreview = await readResponsePreview(response);
        const ok = Boolean(response?.ok);
        const status = Number(response?.status || 0);
        if (!ok) {
            console.error(`[CrmMasterWebhook] ❌ n8n responded ${status} for event: ${event} (${eventId})${responsePreview ? `: ${responsePreview}` : ''}`);
        } else {
            console.log(`[CrmMasterWebhook] ✅ SUCCESS: Fired event "${event}" (${eventId}) to n8n`);
        }
        return { ok, status };
    } catch (err) {
        console.error(`[CrmMasterWebhook] ❌ ERROR: Failed to fire event "${event}":`, err);
        return { ok: false, status: 500 };
    }
}

export function notifyCrmMaster(event: string, data: Record<string, any>): void {
    fireCrmMasterWebhook(event, data).catch((err) => {
        console.error(`[CrmMasterWebhook] ❌ ERROR: Unhandled event "${event}":`, err);
    });
}
