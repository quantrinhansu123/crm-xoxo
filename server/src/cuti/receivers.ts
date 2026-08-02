/**
 * CUTI Backend → CRM receivers (projection / activity).
 * Envelope: { contract_version, outbox_id, message_id, message_type, occurred_at, payload }
 * Durable dedup by message_id. Separate from legacy Pancake /api/webhooks/n8n*.
 */
import { createHash } from 'crypto';
import { supabaseAdmin } from '../config/supabase.js';
import {
    CUTI_CONTRACT_VERSION,
    OUTBOX_ACTIVITY,
    OUTBOX_PROJECTION,
    normalizeCutiLeadState,
} from './types.js';
import { findInboxByIdempotency, recordInbox } from './outbox.js';

export type CutiReceiverEnvelope = {
    contract_version?: string;
    outbox_id?: string;
    message_id?: string;
    message_type?: string;
    occurred_at?: string;
    payload?: Record<string, unknown>;
};

export type CutiReceiverResult = {
    httpStatus: number;
    body: Record<string, unknown>;
};

const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
    return typeof value === 'string' && UUID_RE.test(value);
}

/** Deterministic UUID for activity PK when message_id is not a UUID. */
function durableEventUuid(messageId: string, payloadEventId?: unknown): string {
    if (isUuid(payloadEventId)) return String(payloadEventId);
    if (isUuid(messageId)) return messageId;
    const h = createHash('sha256').update(`cuti-act:${messageId}`).digest();
    const bytes = Buffer.from(h.subarray(0, 16));
    bytes[6] = (bytes[6]! & 0x0f) | 0x40;
    bytes[8] = (bytes[8]! & 0x3f) | 0x80;
    const hex = bytes.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function stableHash(value: unknown): string {
    const json = JSON.stringify(value, (_, v) => {
        if (v && typeof v === 'object' && !Array.isArray(v)) {
            return Object.keys(v as object)
                .sort()
                .reduce((acc: Record<string, unknown>, k) => {
                    acc[k] = (v as Record<string, unknown>)[k];
                    return acc;
                }, {});
        }
        return v;
    });
    return createHash('sha256').update(json || 'null').digest('hex');
}

function inboxKey(messageId: string): string {
    return `cuti-recv:${messageId}`;
}

function validateEnvelope(
    body: CutiReceiverEnvelope,
    expectedType: string,
): { ok: true; envelope: Required<Pick<CutiReceiverEnvelope, 'message_id' | 'message_type' | 'occurred_at' | 'payload'>> & CutiReceiverEnvelope } | { ok: false; result: CutiReceiverResult } {
    const fields: Record<string, string> = {};
    if (!body?.message_id || typeof body.message_id !== 'string') {
        fields.message_id = 'required';
    }
    if (!body?.message_type || typeof body.message_type !== 'string') {
        fields.message_type = 'required';
    } else if (body.message_type !== expectedType) {
        fields.message_type = `expected ${expectedType}`;
    }
    if (!body?.occurred_at || typeof body.occurred_at !== 'string') {
        fields.occurred_at = 'required';
    }
    if (!body?.payload || typeof body.payload !== 'object' || Array.isArray(body.payload)) {
        fields.payload = 'must be object';
    }
    if (Object.keys(fields).length) {
        return {
            ok: false,
            result: {
                httpStatus: 400,
                body: {
                    status: 'VALIDATION_ERROR',
                    code: 'INVALID_ENVELOPE',
                    fields,
                    message_id: body?.message_id ?? null,
                    message_type: body?.message_type ?? null,
                    outbox_id: body?.outbox_id ?? null,
                },
            },
        };
    }
    return {
        ok: true,
        envelope: body as Required<Pick<CutiReceiverEnvelope, 'message_id' | 'message_type' | 'occurred_at' | 'payload'>> &
            CutiReceiverEnvelope,
    };
}

async function dedupLookup(messageId: string, payloadHash: string): Promise<CutiReceiverResult | null> {
    const existing = await findInboxByIdempotency(inboxKey(messageId));
    if (!existing) return null;

    const prevHash =
        (existing.result_body && (existing.result_body as any).payload_hash) ||
        (existing.payload && (existing.payload as any)._payload_hash) ||
        null;

    if (prevHash && prevHash !== payloadHash) {
        return {
            httpStatus: 409,
            body: {
                status: 'CONFLICT',
                code: 'MESSAGE_ID_PAYLOAD_MISMATCH',
                message_id: messageId,
                message_type: existing.event_name,
                outbox_id: (existing.payload as any)?.outbox_id ?? null,
                detail: 'Same message_id already stored with a different payload',
            },
        };
    }

    return {
        httpStatus: 200,
        body: {
            status: 'DUPLICATE_NOOP',
            message_id: messageId,
            message_type: existing.event_name,
            outbox_id: (existing.payload as any)?.outbox_id ?? null,
            original_result: existing.result_status,
            state_version: existing.result_state_version ?? null,
        },
    };
}

async function persistDedup(opts: {
    messageId: string;
    messageType: string;
    outboxId: string | null;
    occurredAt: string;
    leadId: string | null;
    envelope: Record<string, unknown>;
    payloadHash: string;
    resultStatus: string;
    resultStateVersion: number | null;
    resultBody: Record<string, unknown>;
}) {
    return recordInbox({
        idempotencyKey: inboxKey(opts.messageId),
        leadId: opts.leadId,
        eventName: opts.messageType,
        occurredAt: opts.occurredAt,
        payload: {
            ...opts.envelope,
            _payload_hash: opts.payloadHash,
        },
        resultStatus: opts.resultStatus,
        resultStateVersion: opts.resultStateVersion,
        resultBody: {
            ...opts.resultBody,
            payload_hash: opts.payloadHash,
            outbox_id: opts.outboxId,
        },
    });
}

/** Comparable projection slice for same-version conflict detection */
function projectionCompareSlice(payload: Record<string, unknown>): Record<string, unknown> {
    const keys = [
        'lead_id',
        'external_lead_key',
        'lead_state',
        'state_version',
        'owner_id',
        'owner_name',
        'sla_id',
        'sla_type',
        'sla_status',
        'sla_started_at',
        'sla_deadline_at',
        'sla_warning_at',
        'sla_paused_at',
        'sla_remaining_seconds',
        'followup_started_at',
        'followup_milestone_index',
        'next_followup_at',
        'quiet_hours_paused',
        'outcome',
        'outcome_reason',
        'closed_at',
        'appointment_scheduled_at',
        'customer_name',
        'customer_phone',
        'page_id',
        'conversation_id',
        'customer_external_id',
        'last_customer_message_at',
        'last_sale_response_at',
        'last_activity_summary',
    ];
    const out: Record<string, unknown> = {};
    for (const k of keys) {
        if (payload[k] !== undefined) out[k] = payload[k];
    }
    return out;
}

function buildLeadProjectionUpdate(payload: Record<string, unknown>, messageId: string) {
    const leadState = normalizeCutiLeadState(String(payload.lead_state || 'SHARED_WAITING_SALE'));
    const stateVersion = Number(payload.state_version);
    const eventId = String(payload.event_id || messageId);
    const ownerId = payload.owner_id;
    const milestone = payload.followup_milestone_index;

    const update: Record<string, unknown> = {
        version: stateVersion,
        sla_state: leadState,
        last_event_id: isUuid(eventId) ? eventId : null,
        external_lead_key: payload.external_lead_key ?? undefined,
        page_id: payload.page_id ?? undefined,
        conversation_id: payload.conversation_id ?? undefined,
        customer_external_id: payload.customer_external_id ?? undefined,
        state_changed_at: payload.state_changed_at ?? payload.occurred_at ?? undefined,
        outcome: payload.outcome ?? undefined,
        outcome_reason: payload.outcome_reason ?? undefined,
        closed_at: payload.closed_at ?? undefined,
        followup_started_at: payload.followup_started_at ?? undefined,
        appointment_scheduled_at:
            payload.appointment_scheduled_at === undefined
                ? undefined
                : payload.appointment_scheduled_at,
        last_activity_summary: payload.last_activity_summary ?? undefined,
        active_sla_id: isUuid(payload.sla_id) ? payload.sla_id : payload.sla_id === null ? null : undefined,
        sla_type: payload.sla_type ?? undefined,
        current_cycle_started_at: payload.sla_started_at ?? undefined,
        current_deadline_at: payload.sla_deadline_at ?? payload.next_followup_at ?? undefined,
        warning_at: payload.sla_warning_at ?? undefined,
        sla_paused_at: payload.sla_paused_at ?? undefined,
        sla_remaining_seconds: payload.sla_remaining_seconds ?? undefined,
        last_customer_message_at: payload.last_customer_message_at ?? undefined,
        last_owner_message_at: payload.last_sale_response_at ?? undefined,
        updated_at: new Date().toISOString(),
    };

    if (typeof payload.customer_name === 'string' && payload.customer_name.trim()) {
        update.name = payload.customer_name.trim();
    }
    if (typeof payload.customer_phone === 'string') {
        update.phone = payload.customer_phone;
    }
    if (typeof payload.owner_name === 'string') {
        update.owner_sale = payload.owner_name;
    }
    if (isUuid(ownerId)) {
        update.assigned_to = ownerId;
    } else if (ownerId === null) {
        update.assigned_to = null;
    }
    if (payload.owner_assigned_at !== undefined) {
        update.assigned_at = payload.owner_assigned_at;
    }
    if (milestone != null && milestone !== '') {
        const m = Number(milestone);
        if (!Number.isNaN(m)) {
            // Runtime stores 0-based; catalog is 1–10
            update.current_milestone_index = m >= 1 ? m - 1 : m;
            update.current_rule_index = m >= 1 ? m - 1 : m;
        }
    }
    if (payload.sla_status === 'PAUSED' && !update.sla_paused_at) {
        update.sla_paused_at = new Date().toISOString();
    }
    if (leadState === 'STOPPED_WON') {
        update.outcome = payload.outcome || 'WON';
        update.pipeline_stage = 'chot_don';
    }
    if (leadState === 'STOPPED_FAILED') {
        update.outcome = payload.outcome || 'FAILED';
        update.pipeline_stage = 'fail';
    }

    // Drop undefined so supabase does not clear columns unintentionally
    for (const key of Object.keys(update)) {
        if (update[key] === undefined) delete update[key];
    }
    return update;
}

export async function receiveLeadProjectionUpsert(body: CutiReceiverEnvelope): Promise<CutiReceiverResult> {
    const checked = validateEnvelope(body, OUTBOX_PROJECTION);
    if (!checked.ok) return checked.result;

    const { envelope } = checked;
    const payload = envelope.payload!;
    const messageId = envelope.message_id!;
    const payloadHash = stableHash({ envelope_payload: payload, outbox_id: envelope.outbox_id ?? null });

    const dup = await dedupLookup(messageId, payloadHash);
    if (dup) return dup;

    const leadId = typeof payload.lead_id === 'string' ? payload.lead_id : '';
    if (!leadId || !isUuid(leadId)) {
        return {
            httpStatus: 400,
            body: {
                status: 'VALIDATION_ERROR',
                code: 'INVALID_PAYLOAD',
                fields: { 'payload.lead_id': 'uuid required' },
                message_id: messageId,
                message_type: OUTBOX_PROJECTION,
                outbox_id: envelope.outbox_id ?? null,
            },
        };
    }

    if (payload.state_version === undefined || payload.state_version === null || Number.isNaN(Number(payload.state_version))) {
        return {
            httpStatus: 400,
            body: {
                status: 'VALIDATION_ERROR',
                code: 'INVALID_PAYLOAD',
                fields: { 'payload.state_version': 'required number' },
                message_id: messageId,
                message_type: OUTBOX_PROJECTION,
                outbox_id: envelope.outbox_id ?? null,
            },
        };
    }

    const incomingVersion = Number(payload.state_version);
    const compareSlice = projectionCompareSlice(payload);

    const { data: lead, error: leadErr } = await supabaseAdmin
        .from('leads')
        .select(
            'id, version, sla_state, assigned_to, owner_sale, external_lead_key, page_id, conversation_id, customer_external_id, outcome, outcome_reason, closed_at, active_sla_id, sla_type, current_cycle_started_at, current_deadline_at, warning_at, sla_paused_at, sla_remaining_seconds, followup_started_at, current_milestone_index, appointment_scheduled_at, name, phone, last_customer_message_at, last_owner_message_at, last_activity_summary, last_event_id',
        )
        .eq('id', leadId)
        .maybeSingle();

    if (leadErr && !String(leadErr.message || '').includes('does not exist')) {
        console.error('[cuti_receiver] lead lookup error:', leadErr.message);
    }
    if (!lead) {
        return {
            httpStatus: 404,
            body: {
                status: 'VALIDATION_ERROR',
                code: 'LEAD_NOT_FOUND',
                fields: { 'payload.lead_id': leadId },
                message_id: messageId,
                message_type: OUTBOX_PROJECTION,
                outbox_id: envelope.outbox_id ?? null,
            },
        };
    }

    const storedVersion = Number(lead.version || 0);

    if (incomingVersion < storedVersion) {
        return {
            httpStatus: 409,
            body: {
                status: 'VERSION_CONFLICT',
                code: 'STALE_STATE_VERSION',
                message_id: messageId,
                message_type: OUTBOX_PROJECTION,
                outbox_id: envelope.outbox_id ?? null,
                lead_id: leadId,
                incoming_state_version: incomingVersion,
                stored_state_version: storedVersion,
            },
        };
    }

    if (incomingVersion === storedVersion) {
        const storedSlice = projectionCompareSlice({
            lead_id: lead.id,
            external_lead_key: lead.external_lead_key,
            lead_state: lead.sla_state,
            state_version: storedVersion,
            owner_id: lead.assigned_to,
            owner_name: lead.owner_sale,
            sla_id: lead.active_sla_id,
            sla_type: lead.sla_type,
            sla_started_at: lead.current_cycle_started_at,
            sla_deadline_at: lead.current_deadline_at,
            sla_warning_at: lead.warning_at,
            sla_paused_at: lead.sla_paused_at,
            sla_remaining_seconds: lead.sla_remaining_seconds,
            followup_started_at: lead.followup_started_at,
            followup_milestone_index:
                lead.current_milestone_index == null ? null : Number(lead.current_milestone_index) + 1,
            outcome: lead.outcome,
            outcome_reason: lead.outcome_reason,
            closed_at: lead.closed_at,
            appointment_scheduled_at: lead.appointment_scheduled_at,
            customer_name: lead.name,
            customer_phone: lead.phone,
            page_id: lead.page_id,
            conversation_id: lead.conversation_id,
            customer_external_id: lead.customer_external_id,
            last_customer_message_at: lead.last_customer_message_at,
            last_sale_response_at: lead.last_owner_message_at,
            last_activity_summary: lead.last_activity_summary,
        });

        // Only compare keys present on incoming payload
        const narrowedStored: Record<string, unknown> = {};
        for (const k of Object.keys(compareSlice)) {
            narrowedStored[k] = storedSlice[k] ?? null;
            if (compareSlice[k] === undefined) continue;
        }
        const incomingHash = stableHash(compareSlice);
        const storedHash = stableHash(
            Object.keys(compareSlice).reduce((acc: Record<string, unknown>, k) => {
                acc[k] = narrowedStored[k] ?? null;
                return acc;
            }, {}),
        );

        if (incomingHash !== storedHash) {
            return {
                httpStatus: 409,
                body: {
                    status: 'VERSION_CONFLICT',
                    code: 'SAME_VERSION_DATA_MISMATCH',
                    message_id: messageId,
                    message_type: OUTBOX_PROJECTION,
                    outbox_id: envelope.outbox_id ?? null,
                    lead_id: leadId,
                    state_version: incomingVersion,
                },
            };
        }

        const noopBody = {
            status: 'DUPLICATE_NOOP',
            message_id: messageId,
            message_type: OUTBOX_PROJECTION,
            outbox_id: envelope.outbox_id ?? null,
            lead_id: leadId,
            state_version: storedVersion,
        };
        await persistDedup({
            messageId,
            messageType: OUTBOX_PROJECTION,
            outboxId: envelope.outbox_id ?? null,
            occurredAt: envelope.occurred_at!,
            leadId,
            envelope: body as Record<string, unknown>,
            payloadHash,
            resultStatus: 'DUPLICATE_NOOP',
            resultStateVersion: storedVersion,
            resultBody: noopBody,
        });
        return { httpStatus: 200, body: noopBody };
    }

    // incomingVersion > storedVersion → apply
    const update = buildLeadProjectionUpdate(payload, messageId);
    const { error: updErr } = await supabaseAdmin.from('leads').update(update).eq('id', leadId);
    if (updErr) {
        console.error('[cuti_receiver] projection update error:', updErr.message);
        return {
            httpStatus: 500,
            body: {
                status: 'ERROR',
                code: 'PROJECTION_APPLY_FAILED',
                message: updErr.message,
                message_id: messageId,
                message_type: OUTBOX_PROJECTION,
                outbox_id: envelope.outbox_id ?? null,
            },
        };
    }

    const accepted = {
        status: 'ACCEPTED',
        message_id: messageId,
        message_type: OUTBOX_PROJECTION,
        outbox_id: envelope.outbox_id ?? null,
        lead_id: leadId,
        state_version: incomingVersion,
        contract_version: envelope.contract_version || CUTI_CONTRACT_VERSION,
    };

    const recorded = await persistDedup({
        messageId,
        messageType: OUTBOX_PROJECTION,
        outboxId: envelope.outbox_id ?? null,
        occurredAt: envelope.occurred_at!,
        leadId,
        envelope: body as Record<string, unknown>,
        payloadHash,
        resultStatus: 'ACCEPTED',
        resultStateVersion: incomingVersion,
        resultBody: accepted,
    });
    if (recorded.duplicate) {
        const again = await dedupLookup(messageId, payloadHash);
        if (again) return again;
    }

    return { httpStatus: 200, body: accepted };
}

export async function receiveLeadActivityAppend(body: CutiReceiverEnvelope): Promise<CutiReceiverResult> {
    const checked = validateEnvelope(body, OUTBOX_ACTIVITY);
    if (!checked.ok) return checked.result;

    const { envelope } = checked;
    const payload = envelope.payload!;
    const messageId = envelope.message_id!;
    const payloadHash = stableHash({ envelope_payload: payload, outbox_id: envelope.outbox_id ?? null });

    const dup = await dedupLookup(messageId, payloadHash);
    if (dup) return dup;

    const leadId = typeof payload.lead_id === 'string' ? payload.lead_id : '';
    const activityType = typeof payload.activity_type === 'string' ? payload.activity_type : '';
    const summary = typeof payload.summary === 'string' ? payload.summary : '';

    const fields: Record<string, string> = {};
    if (!leadId || !isUuid(leadId)) fields['payload.lead_id'] = 'uuid required';
    if (!activityType) fields['payload.activity_type'] = 'required';
    if (!summary) fields['payload.summary'] = 'required';
    if (Object.keys(fields).length) {
        return {
            httpStatus: 400,
            body: {
                status: 'VALIDATION_ERROR',
                code: 'INVALID_PAYLOAD',
                fields,
                message_id: messageId,
                message_type: OUTBOX_ACTIVITY,
                outbox_id: envelope.outbox_id ?? null,
            },
        };
    }

    const eventId = durableEventUuid(messageId, payload.event_id);
    const occurredAt =
        typeof payload.occurred_at === 'string' && payload.occurred_at
            ? payload.occurred_at
            : envelope.occurred_at!;

    const { error: actErr } = await supabaseAdmin.from('cuti_lead_activities').upsert(
        {
            event_id: eventId,
            lead_id: leadId,
            activity_type: activityType,
            summary,
            actor_id: payload.actor_id != null ? String(payload.actor_id) : null,
            state_version: payload.state_version != null ? Number(payload.state_version) : null,
            occurred_at: occurredAt,
            correlation_id: payload.correlation_id != null ? String(payload.correlation_id) : null,
            metadata: payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {},
        },
        { onConflict: 'event_id', ignoreDuplicates: true },
    );

    if (actErr && !String(actErr.message || '').includes('does not exist')) {
        // Lead FK missing
        if (String(actErr.message || '').toLowerCase().includes('foreign key')) {
            return {
                httpStatus: 404,
                body: {
                    status: 'VALIDATION_ERROR',
                    code: 'LEAD_NOT_FOUND',
                    fields: { 'payload.lead_id': leadId },
                    message_id: messageId,
                    message_type: OUTBOX_ACTIVITY,
                    outbox_id: envelope.outbox_id ?? null,
                },
            };
        }
        console.error('[cuti_receiver] activity upsert error:', actErr.message);
        return {
            httpStatus: 500,
            body: {
                status: 'ERROR',
                code: 'ACTIVITY_APPEND_FAILED',
                message: actErr.message,
                message_id: messageId,
                message_type: OUTBOX_ACTIVITY,
                outbox_id: envelope.outbox_id ?? null,
            },
        };
    }

    // Display-only summary — not Core business state
    await supabaseAdmin
        .from('leads')
        .update({ last_activity_summary: summary, updated_at: new Date().toISOString() })
        .eq('id', leadId);

    const accepted = {
        status: 'ACCEPTED',
        message_id: messageId,
        message_type: OUTBOX_ACTIVITY,
        outbox_id: envelope.outbox_id ?? null,
        lead_id: leadId,
        event_id: eventId,
        contract_version: envelope.contract_version || CUTI_CONTRACT_VERSION,
    };

    const recorded = await persistDedup({
        messageId,
        messageType: OUTBOX_ACTIVITY,
        outboxId: envelope.outbox_id ?? null,
        occurredAt: envelope.occurred_at!,
        leadId,
        envelope: body as Record<string, unknown>,
        payloadHash,
        resultStatus: 'ACCEPTED',
        resultStateVersion: payload.state_version != null ? Number(payload.state_version) : null,
        resultBody: accepted,
    });
    if (recorded.duplicate) {
        const again = await dedupLookup(messageId, payloadHash);
        if (again) return again;
    }

    return { httpStatus: 200, body: accepted };
}
