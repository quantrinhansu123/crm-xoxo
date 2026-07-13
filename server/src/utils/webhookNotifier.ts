/**
 * Webhook Notifier Utility
 * Fire-and-forget: Gửi event sang n8n khi có sự kiện trong CRM.
 * Không block response của API chính.
 */

const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || '';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';
const CRM_MASTER_WEBHOOK_URL = process.env.CRM_MASTER_WEBHOOK_URL || 'https://dhsywwqoi.datadex.vn/webhook/crm-master-xoxo';

/** Tránh đụng Express.Response khi CI resolve type `Response` sai */
interface HttpFetchResponse {
    ok: boolean;
    status: number;
    text(): Promise<string>;
}

async function httpFetch(
    url: string,
    init: { method?: string; headers?: Record<string, string>; body?: string }
): Promise<HttpFetchResponse> {
    return (await fetch(url, init)) as unknown as HttpFetchResponse;
}

function createWebhookEventId(): string {
    const cryptoApi = (globalThis as any).crypto;
    if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
    return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

async function readResponsePreview(response: HttpFetchResponse): Promise<string | null> {
    try {
        const text = await response.text();
        return text ? text.slice(0, 500) : null;
    } catch {
        return null;
    }
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
        const response = await httpFetch(N8N_WEBHOOK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-webhook-secret': WEBHOOK_SECRET,
            },
            body: JSON.stringify(payload),
        });

        const responsePreview = await readResponsePreview(response);
        if (!response.ok) {
            console.error(`[WebhookNotifier] ❌ n8n responded ${response.status} for event: ${event} (${eventId})${responsePreview ? `: ${responsePreview}` : ''}`);
        } else {
            console.log(`[WebhookNotifier] ✅ SUCCESS: Fired event "${event}" (${eventId}) to n8n`);
        }
        return { ok: response.ok, status: response.status };
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
        const response = await httpFetch(CRM_MASTER_WEBHOOK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        const responsePreview = await readResponsePreview(response);
        if (!response.ok) {
            console.error(`[CrmMasterWebhook] ❌ n8n responded ${response.status} for event: ${event} (${eventId})${responsePreview ? `: ${responsePreview}` : ''}`);
        } else {
            console.log(`[CrmMasterWebhook] ✅ SUCCESS: Fired event "${event}" (${eventId}) to n8n`);
        }
        return { ok: response.ok, status: response.status };
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
