import { randomUUID } from 'crypto';
import { supabaseAdmin } from '../config/supabase.js';
import {
    CUTI_CONTRACT_VERSION,
    FOLLOWUP_OFFSET_SECONDS,
    OUTBOX_ACTIVITY,
    OUTBOX_PROJECTION,
    QUIET_HOURS_END_SECONDS,
    CUSTOMER_RESPONSE_SECONDS,
    CUSTOMER_RESPONSE_WARNING_SECONDS,
    mapLegacySlaType,
    normalizeCutiLeadState,
    type CutiLeadState,
    type CutiSlaStatus,
    type CutiSlaType,
} from './types.js';

export function vnLocalSeconds(value: Date): number {
    const local = new Date(value.getTime() + 7 * 3600_000);
    return local.getUTCHours() * 3600 + local.getUTCMinutes() * 60 + local.getUTCSeconds();
}

export function isQuietHours(value: Date = new Date()): boolean {
    return vnLocalSeconds(value) < QUIET_HOURS_END_SECONDS;
}

export function addSeconds(value: string | Date, seconds: number): Date {
    return new Date(new Date(value).getTime() + seconds * 1000);
}

/** Absolute follow-up deadline from followup_started_at + milestone offset */
export function followupDeadlineAt(followupStartedAt: Date, milestoneIndex1Based: number): Date {
    const idx = Math.max(1, Math.min(10, milestoneIndex1Based)) - 1;
    return addSeconds(followupStartedAt, FOLLOWUP_OFFSET_SECONDS[idx]);
}

export function customerResponseTimers(start: Date) {
    return {
        started_at: start.toISOString(),
        warning_at: addSeconds(start, CUSTOMER_RESPONSE_WARNING_SECONDS).toISOString(),
        deadline_at: addSeconds(start, CUSTOMER_RESPONSE_SECONDS).toISOString(),
    };
}

export function deriveSlaStatus(lead: any): CutiSlaStatus {
    const state = normalizeCutiLeadState(lead.sla_state);
    if (state === 'STOPPED_WON' || state === 'STOPPED_FAILED') return null;
    if (!lead.current_deadline_at && !lead.sla_type) return null;
    if (lead.sla_paused_at && mapLegacySlaType(lead.sla_type) === 'FOLLOWUP') return 'PAUSED';
    if (lead.current_deadline_at) return 'ACTIVE';
    return null;
}

export function deriveQuietHoursPaused(lead: any): boolean {
    return Boolean(
        lead.sla_paused_at &&
            mapLegacySlaType(lead.sla_type) === 'FOLLOWUP' &&
            normalizeCutiLeadState(lead.sla_state) === 'OWNED_WAITING_CUSTOMER',
    );
}

export function milestoneIndex1Based(lead: any): number | null {
    if (lead.current_milestone_index == null) return null;
    // Runtime stores 0-based; CUTI catalog is 1–10
    const raw = Number(lead.current_milestone_index);
    if (Number.isNaN(raw)) return null;
    return raw >= 0 && raw < 10 ? raw + 1 : raw;
}

export function buildProjectionPayload(opts: {
    lead: any;
    eventId: string;
    correlationId: string;
    occurredAt: string;
    ownerName?: string | null;
}): Record<string, unknown> {
    const lead = opts.lead;
    const leadState = normalizeCutiLeadState(lead.sla_state);
    const slaType = mapLegacySlaType(lead.sla_type);
    const slaStatus = deriveSlaStatus(lead);
    const milestone = milestoneIndex1Based(lead);
    const quietPaused = deriveQuietHoursPaused(lead);

    return {
        event_id: opts.eventId,
        event_name: OUTBOX_PROJECTION,
        event_version: 1,
        occurred_at: opts.occurredAt,
        idempotency_key: `lead-projection:${lead.id}:${lead.version}`,
        correlation_id: opts.correlationId,
        lead_id: lead.id,
        external_lead_key: lead.external_lead_key || null,
        lead_state: leadState,
        state_version: Number(lead.version || 0),
        owner_id: lead.assigned_to || null,
        owner_name: opts.ownerName ?? lead.owner_sale ?? null,
        sla_id: lead.active_sla_id || null,
        sla_type: slaType,
        sla_status: slaStatus,
        sla_started_at: lead.current_cycle_started_at || null,
        sla_deadline_at: lead.current_deadline_at || null,
        sla_warning_at: lead.warning_at || null,
        sla_paused_at: lead.sla_paused_at || null,
        sla_remaining_seconds: quietPaused ? lead.sla_remaining_seconds ?? null : null,
        followup_started_at: lead.followup_started_at || null,
        followup_milestone_index: slaType === 'FOLLOWUP' ? milestone : null,
        next_followup_at:
            slaType === 'FOLLOWUP' && slaStatus === 'ACTIVE' ? lead.current_deadline_at || null : null,
        quiet_hours_paused: quietPaused,
        outcome: lead.outcome || (leadState === 'STOPPED_WON' ? 'WON' : leadState === 'STOPPED_FAILED' ? 'FAILED' : null),
        outcome_reason: lead.outcome_reason || null,
        closed_at: lead.closed_at || null,
        contract_version: CUTI_CONTRACT_VERSION,
    };
}

export function buildActivityPayload(opts: {
    leadId: string;
    eventId: string;
    correlationId: string;
    occurredAt: string;
    activityType: string;
    summary: string;
    actorId?: string | null;
    stateVersion?: number | null;
    metadata?: Record<string, unknown>;
}): Record<string, unknown> {
    return {
        event_id: opts.eventId,
        event_name: OUTBOX_ACTIVITY,
        event_version: 1,
        occurred_at: opts.occurredAt,
        idempotency_key: `activity:${opts.eventId}`,
        correlation_id: opts.correlationId,
        lead_id: opts.leadId,
        state_version: opts.stateVersion ?? null,
        activity_type: opts.activityType,
        actor_id: opts.actorId ?? null,
        summary: opts.summary,
        metadata: opts.metadata || {},
        contract_version: CUTI_CONTRACT_VERSION,
    };
}

export async function enqueueOutbox(rows: Array<{
    eventId: string;
    eventName: string;
    leadId: string;
    stateVersion?: number | null;
    idempotencyKey: string;
    correlationId?: string | null;
    payload: Record<string, unknown>;
}>): Promise<void> {
    if (rows.length === 0) return;
    const inserts = rows.map((r) => ({
        event_id: r.eventId,
        event_name: r.eventName,
        event_version: 1,
        lead_id: r.leadId,
        state_version: r.stateVersion ?? null,
        idempotency_key: r.idempotencyKey,
        correlation_id: r.correlationId ?? null,
        payload: r.payload,
        status: 'pending',
        attempts: 0,
        next_attempt_at: new Date().toISOString(),
    }));
    const { error } = await supabaseAdmin.from('cuti_outbox').upsert(inserts, {
        onConflict: 'event_id',
        ignoreDuplicates: true,
    });
    if (error) {
        // Table may not exist yet in some envs — log and continue
        console.error('[cuti_outbox] enqueue error:', error.message);
    }
}

export async function findInboxByIdempotency(idempotencyKey: string) {
    const { data, error } = await supabaseAdmin
        .from('cuti_inbox')
        .select('*')
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle();
    if (error && !String(error.message || '').includes('does not exist')) {
        console.error('[cuti_inbox] lookup error:', error.message);
    }
    return data;
}

export async function recordInbox(opts: {
    idempotencyKey: string;
    leadId: string | null;
    eventName: string;
    commandId?: string | null;
    correlationId?: string | null;
    actorId?: string | null;
    occurredAt: string;
    payload: Record<string, unknown>;
    resultStatus: string;
    resultEventId?: string | null;
    resultStateVersion?: number | null;
    resultBody: Record<string, unknown>;
}) {
    const { error } = await supabaseAdmin.from('cuti_inbox').insert({
        idempotency_key: opts.idempotencyKey,
        lead_id: opts.leadId,
        event_name: opts.eventName,
        command_id: opts.commandId || null,
        correlation_id: opts.correlationId || null,
        actor_id: opts.actorId || null,
        occurred_at: opts.occurredAt,
        payload: opts.payload,
        result_status: opts.resultStatus,
        result_event_id: opts.resultEventId || null,
        result_state_version: opts.resultStateVersion ?? null,
        result_body: opts.resultBody,
    });
    if (error) {
        // Unique race → caller should re-read
        if (error.code === '23505' || String(error.message || '').toLowerCase().includes('duplicate')) {
            return { duplicate: true as const };
        }
        console.error('[cuti_inbox] insert error:', error.message);
        return { duplicate: false as const, error };
    }
    return { duplicate: false as const };
}

export async function applyActivityLocally(payload: Record<string, unknown>) {
    const eventId = String(payload.event_id || '');
    if (!eventId) return;
    const { error } = await supabaseAdmin.from('cuti_lead_activities').upsert(
        {
            event_id: eventId,
            lead_id: payload.lead_id,
            activity_type: payload.activity_type,
            summary: payload.summary,
            actor_id: payload.actor_id ?? null,
            state_version: payload.state_version ?? null,
            occurred_at: payload.occurred_at,
            correlation_id: payload.correlation_id ?? null,
            metadata: payload.metadata || {},
        },
        { onConflict: 'event_id', ignoreDuplicates: true },
    );
    if (error && !String(error.message || '').includes('does not exist')) {
        console.error('[cuti_lead_activities] upsert error:', error.message);
    }
}

export async function applyProjectionLocally(payload: Record<string, unknown>) {
    // CRM projection is the leads row itself (same DB). Mark last_event_id.
    const leadId = String(payload.lead_id || '');
    const eventId = String(payload.event_id || '');
    const stateVersion = Number(payload.state_version || 0);
    if (!leadId || !eventId) return;

    const { data: current } = await supabaseAdmin
        .from('leads')
        .select('version, last_event_id')
        .eq('id', leadId)
        .maybeSingle();

    if (!current) return;
    const storedVersion = Number(current.version || 0);
    if (stateVersion < storedVersion) return; // stale
    if (stateVersion === storedVersion && current.last_event_id === eventId) return; // dup

    await supabaseAdmin
        .from('leads')
        .update({
            last_event_id: eventId,
            last_activity_summary:
                payload.lead_state != null
                    ? `Projection ${payload.lead_state} v${stateVersion}`
                    : undefined,
        })
        .eq('id', leadId)
        .eq('version', storedVersion);
}

/** Deliver pending outbox rows (CRM ack = local apply + mark delivered). */
export async function publishPendingOutbox(limit = 50): Promise<number> {
    const now = new Date().toISOString();
    const { data: rows, error } = await supabaseAdmin
        .from('cuti_outbox')
        .select('*')
        .eq('status', 'pending')
        .lte('next_attempt_at', now)
        .order('created_at', { ascending: true })
        .limit(limit);

    if (error) {
        if (!String(error.message || '').includes('does not exist')) {
            console.error('[cuti_outbox] fetch pending error:', error.message);
        }
        return 0;
    }

    let delivered = 0;
    for (const row of rows || []) {
        try {
            if (row.event_name === OUTBOX_PROJECTION) {
                await applyProjectionLocally(row.payload || {});
            } else if (row.event_name === OUTBOX_ACTIVITY) {
                await applyActivityLocally(row.payload || {});
            }

            // Also notify n8n if configured (non-authoritative)
            const webhookUrl = process.env.CUTI_CRM_OUTBOX_WEBHOOK_URL || process.env.N8N_WEBHOOK_URL;
            if (webhookUrl) {
                const res = await fetch(webhookUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(row.payload),
                });
                if (!res.ok) {
                    throw new Error(`Webhook HTTP ${res.status}`);
                }
            }

            await supabaseAdmin
                .from('cuti_outbox')
                .update({
                    status: 'delivered',
                    delivered_at: new Date().toISOString(),
                    attempts: Number(row.attempts || 0) + 1,
                    last_error: null,
                })
                .eq('id', row.id);
            delivered += 1;
        } catch (err: any) {
            const attempts = Number(row.attempts || 0) + 1;
            const backoffSec = Math.min(3600, Math.pow(2, Math.min(attempts, 8)) * 5);
            await supabaseAdmin
                .from('cuti_outbox')
                .update({
                    attempts,
                    last_error: err?.message || String(err),
                    next_attempt_at: addSeconds(new Date(), backoffSec).toISOString(),
                    status: attempts >= 20 ? 'failed' : 'pending',
                })
                .eq('id', row.id);
        }
    }
    return delivered;
}

export async function commitProjectionAndActivity(opts: {
    lead: any;
    correlationId: string;
    occurredAt: string;
    activityType?: string;
    activitySummary?: string;
    actorId?: string | null;
    metadata?: Record<string, unknown>;
    ownerName?: string | null;
    emitActivity?: boolean;
}): Promise<{ eventId: string; activityEventId?: string }> {
    const eventId = randomUUID();
    const projection = buildProjectionPayload({
        lead: opts.lead,
        eventId,
        correlationId: opts.correlationId,
        occurredAt: opts.occurredAt,
        ownerName: opts.ownerName,
    });

    const outboxRows: Array<{
        eventId: string;
        eventName: string;
        leadId: string;
        stateVersion?: number | null;
        idempotencyKey: string;
        correlationId?: string | null;
        payload: Record<string, unknown>;
    }> = [
        {
            eventId,
            eventName: OUTBOX_PROJECTION,
            leadId: opts.lead.id,
            stateVersion: Number(opts.lead.version || 0),
            idempotencyKey: String(projection.idempotency_key),
            correlationId: opts.correlationId,
            payload: projection,
        },
    ];

    let activityEventId: string | undefined;
    if (opts.emitActivity !== false && opts.activityType && opts.activitySummary) {
        activityEventId = randomUUID();
        const activity = buildActivityPayload({
            leadId: opts.lead.id,
            eventId: activityEventId,
            correlationId: opts.correlationId,
            occurredAt: opts.occurredAt,
            activityType: opts.activityType,
            summary: opts.activitySummary,
            actorId: opts.actorId,
            stateVersion: Number(opts.lead.version || 0),
            metadata: opts.metadata,
        });
        outboxRows.push({
            eventId: activityEventId,
            eventName: OUTBOX_ACTIVITY,
            leadId: opts.lead.id,
            stateVersion: Number(opts.lead.version || 0),
            idempotencyKey: String(activity.idempotency_key),
            correlationId: opts.correlationId,
            payload: activity,
        });
    }

    await enqueueOutbox(outboxRows);

    // Eager local apply so CRM UI sees updates immediately; outbox still retries webhook
    await applyProjectionLocally(projection);
    if (activityEventId) {
        const activityRow = outboxRows.find((r) => r.eventId === activityEventId);
        if (activityRow) await applyActivityLocally(activityRow.payload);
    }

    await supabaseAdmin
        .from('leads')
        .update({ last_event_id: eventId })
        .eq('id', opts.lead.id);

    return { eventId, activityEventId };
}

export type { CutiLeadState, CutiSlaType, CutiSlaStatus };
