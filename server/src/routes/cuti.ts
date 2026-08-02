import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.js';
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

export default router;
