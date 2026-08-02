import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.js';
import { supabaseAdmin } from '../config/supabase.js';
import {
    assignOwner,
    changeAppointment,
    markFailed,
    markWon,
    reclaimLead,
    recordNote,
} from '../cuti/commands.js';
import type { CutiCommonCommand } from '../cuti/types.js';
import { publishPendingOutbox } from '../cuti/outbox.js';
import {
    receiveLeadActivityAppend,
    receiveLeadProjectionUpsert,
} from '../cuti/receivers.js';
import { OUTBOX_ACTIVITY, OUTBOX_PROJECTION } from '../cuti/types.js';

const router = Router();

/** In-memory last test echo (read-only probe; no business writes). */
let lastCutiTestEcho: {
    received_at: string;
    body: unknown;
    readable_fields: Record<string, unknown>;
} | null = null;

function pickFirst(obj: any, keys: string[]): unknown {
    if (!obj || typeof obj !== 'object') return null;
    for (const key of keys) {
        const parts = key.split('.');
        let cur: any = obj;
        let ok = true;
        for (const p of parts) {
            if (cur == null || typeof cur !== 'object' || !(p in cur)) {
                ok = false;
                break;
            }
            cur = cur[p];
        }
        if (ok && cur !== undefined && cur !== null && cur !== '') return cur;
    }
    return null;
}

/** Extract fields webapp typically maps — read-only, no side effects. */
function extractReadableCutiFields(body: any): Record<string, unknown> {
    const payload = body?.payload && typeof body.payload === 'object' ? body.payload : body;
    const nested =
        payload?.data && typeof payload.data === 'object'
            ? payload.data
            : payload?.message && typeof payload.message === 'object'
              ? payload.message
              : {};
    const flat = { ...(payload || {}), ...(nested || {}) };

    const attachments =
        pickFirst(flat, ['attachments', 'attachment', 'files', 'media', 'photos', 'images']) ??
        pickFirst(body, ['attachments', 'payload.attachments']);

    return {
        envelope: {
            contract_version: body?.contract_version ?? null,
            outbox_id: body?.outbox_id ?? null,
            message_id: body?.message_id ?? null,
            message_type: body?.message_type ?? null,
            occurred_at: body?.occurred_at ?? null,
        },
        customer: {
            name: pickFirst(flat, [
                'customer_name',
                'name',
                'customer.name',
                'from.name',
                'sender_name',
            ]),
            phone: pickFirst(flat, ['customer_phone', 'phone', 'customer.phone', 'from.phone']),
            customer_external_id: pickFirst(flat, [
                'customer_external_id',
                'pancake_customer_id',
                'customer_id',
                'from.id',
            ]),
        },
        page: {
            page_id: pickFirst(flat, ['page_id', 'pageId', 'page.id']),
            page_name: pickFirst(flat, ['page_name', 'page.name']),
        },
        conversation: {
            conversation_id: pickFirst(flat, [
                'conversation_id',
                'pancake_conversation_id',
                'fb_thread_id',
                'thread_id',
            ]),
            external_lead_key: pickFirst(flat, ['external_lead_key']),
        },
        message: {
            message_id: pickFirst(flat, ['message_id', 'id', 'mid']) ?? body?.message_id ?? null,
            request_id: pickFirst(flat, ['request_id']),
            message_time: pickFirst(flat, [
                'message_time',
                'last_message_time',
                'occurred_at',
                'inserted_at',
                'created_at',
                'event_time',
            ]),
            content: pickFirst(flat, [
                'content',
                'text',
                'message',
                'last_message_text',
                'summary',
                'body',
            ]),
            message_direction: pickFirst(flat, ['message_direction', 'direction']),
            attachments_present: Array.isArray(attachments)
                ? attachments.length > 0
                : Boolean(attachments),
            attachments_meta: attachments ?? null,
        },
        top_level_keys: body && typeof body === 'object' ? Object.keys(body) : [],
        payload_keys:
            payload && typeof payload === 'object' && !Array.isArray(payload)
                ? Object.keys(payload)
                : [],
    };
}

/** Machine auth for Backend/n8n → CRM receivers (not legacy Pancake webhooks). */
function verifyCutiReceiverSecret(req: Request, res: Response, next: NextFunction) {
    const secret = req.headers['x-webhook-secret'] as string | undefined;
    const expected = process.env.CUTI_RECEIVER_SECRET || process.env.WEBHOOK_SECRET;
    if (!expected) {
        return res.status(500).json({
            status: 'error',
            message: 'CUTI receiver secret chưa được cấu hình',
        });
    }
    if (!secret || secret !== expected) {
        return res.status(401).json({
            status: 'error',
            message: 'Unauthorized - Invalid receiver secret',
        });
    }
    return next();
}

function commonFromRequest(req: AuthenticatedRequest): CutiCommonCommand {
    const body = req.body || {};
    return {
        actor_id: body.actor_id || req.user!.id,
        actor_role: body.actor_role || req.user!.role,
        command_id: body.command_id,
        expected_state_version: Number(body.expected_state_version),
        occurred_at: body.occurred_at || new Date().toISOString(),
        correlation_id: body.correlation_id,
    };
}

function sendResult(res: any, result: { httpStatus: number; body: unknown }) {
    return res.status(result.httpStatus).json(result.body);
}

/** POST /v1/cuti/leads/:lead_id/owner-assignment */
router.post('/leads/:lead_id/owner-assignment', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const common = commonFromRequest(req);
        const result = await assignOwner(req.params.lead_id, {
            ...common,
            target_owner_id: req.body.target_owner_id,
            reason: req.body.reason,
        });
        return sendResult(res, result);
    } catch (error) {
        next(error);
    }
});

/** POST /v1/cuti/leads/:lead_id/reclaim */
router.post('/leads/:lead_id/reclaim', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const common = commonFromRequest(req);
        const result = await reclaimLead(req.params.lead_id, {
            ...common,
            reason: req.body.reason,
        });
        return sendResult(res, result);
    } catch (error) {
        next(error);
    }
});

/** POST /v1/cuti/leads/:lead_id/outcome/won */
router.post('/leads/:lead_id/outcome/won', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const common = commonFromRequest(req);
        const result = await markWon(req.params.lead_id, {
            ...common,
            note: req.body.note,
        });
        return sendResult(res, result);
    } catch (error) {
        next(error);
    }
});

/** POST /v1/cuti/leads/:lead_id/outcome/failed */
router.post('/leads/:lead_id/outcome/failed', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const common = commonFromRequest(req);
        const result = await markFailed(req.params.lead_id, {
            ...common,
            reason: req.body.reason,
            note: req.body.note,
        });
        return sendResult(res, result);
    } catch (error) {
        next(error);
    }
});

/** POST /v1/cuti/leads/:lead_id/notes */
router.post('/leads/:lead_id/notes', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const common = commonFromRequest(req);
        const result = await recordNote(req.params.lead_id, {
            ...common,
            note: req.body.note,
        });
        return sendResult(res, result);
    } catch (error) {
        next(error);
    }
});

/** POST /v1/cuti/leads/:lead_id/appointment */
router.post('/leads/:lead_id/appointment', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const common = commonFromRequest(req);
        const result = await changeAppointment(req.params.lead_id, {
            ...common,
            appointment_scheduled_at:
                req.body.appointment_scheduled_at === undefined
                    ? undefined
                    : req.body.appointment_scheduled_at,
            previous_appointment_scheduled_at: req.body.previous_appointment_scheduled_at,
        });
        return sendResult(res, result);
    } catch (error) {
        next(error);
    }
});

/** POST /v1/cuti/outbox/publish — flush pending outbox (cron / ops) */
router.post('/outbox/publish', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        if (!['admin', 'manager'].includes(req.user!.role)) {
            return res.status(403).json({ status: 'FORBIDDEN' });
        }
        const delivered = await publishPendingOutbox(Number(req.body?.limit) || 50);
        return res.json({ status: 'ok', delivered });
    } catch (error) {
        next(error);
    }
});

/**
 * Backend/n8n → CRM receivers (CUTI outbox envelope).
 * Do NOT reuse /api/webhooks/n8n or /api/webhooks/n8n/raw.
 *
 * POST /v1/cuti/receivers/lead.projection.upsert.v1
 * POST /v1/cuti/receivers/lead.activity.append.v1
 * (also mounted at /api/v1/cuti/...)
 */
router.post(
    `/receivers/${OUTBOX_PROJECTION}`,
    verifyCutiReceiverSecret,
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const result = await receiveLeadProjectionUpsert(req.body || {});
            return res.status(result.httpStatus).json(result.body);
        } catch (error) {
            next(error);
        }
    },
);

router.post(
    `/receivers/${OUTBOX_ACTIVITY}`,
    verifyCutiReceiverSecret,
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const result = await receiveLeadActivityAppend(req.body || {});
            return res.status(result.httpStatus).json(result.body);
        } catch (error) {
            next(error);
        }
    },
);

/**
 * Temporary read-only probe — nhận 1 payload thật, echo field mapping.
 * KHÔNG tạo/cập nhật lead, customer, hay chạy automation.
 *
 * POST /v1/cuti/receivers/test/echo
 * GET  /v1/cuti/receivers/test/last
 */
router.post('/receivers/test/echo', verifyCutiReceiverSecret, async (req: Request, res: Response) => {
    const body = req.body ?? {};
    const readable_fields = extractReadableCutiFields(body);
    const received_at = new Date().toISOString();

    lastCutiTestEcho = { received_at, body, readable_fields };

    console.log(
        '[CUTI test/echo] received',
        JSON.stringify({
            received_at,
            message_type: (body as any)?.message_type ?? null,
            message_id: (body as any)?.message_id ?? null,
            readable_fields,
        }).slice(0, 2000),
    );

    // Persist raw body for mapping review only (webhook_logs) — no lead/customer writes
    try {
        await supabaseAdmin.from('webhook_logs').insert({
            event: 'cuti.test.echo',
            payload: {
                received_at,
                readable_fields,
                body,
            },
            status: 'success',
            error_message: null,
            source: 'cuti-test',
            created_at: received_at,
        });
    } catch (err) {
        console.warn('[CUTI test/echo] webhook_logs insert skipped:', err);
    }

    return res.status(200).json({
        status: 'ok',
        mode: 'read_only_test',
        message: 'Payload received; no lead/customer/automation side effects',
        received_at,
        readable_fields,
        body,
    });
});

router.get('/receivers/test/last', verifyCutiReceiverSecret, async (_req: Request, res: Response) => {
    if (lastCutiTestEcho) {
        return res.status(200).json({
            status: 'ok',
            source: 'memory',
            ...lastCutiTestEcho,
        });
    }

    try {
        const { data } = await supabaseAdmin
            .from('webhook_logs')
            .select('id, created_at, payload')
            .eq('event', 'cuti.test.echo')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (data?.payload) {
            return res.status(200).json({
                status: 'ok',
                source: 'webhook_logs',
                log_id: data.id,
                received_at: data.created_at,
                body: (data.payload as any).body ?? data.payload,
                readable_fields: (data.payload as any).readable_fields ?? null,
            });
        }
    } catch (err) {
        console.warn('[CUTI test/last] lookup failed:', err);
    }

    return res.status(404).json({
        status: 'empty',
        message: 'Chưa có payload test nào',
    });
});

export default router;
