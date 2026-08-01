import { randomUUID } from 'crypto';
import { supabaseAdmin } from '../config/supabase.js';
import {
    addSeconds,
    commitProjectionAndActivity,
    customerResponseTimers,
    findInboxByIdempotency,
    isQuietHours,
    recordInbox,
} from './outbox.js';
import {
    isTerminalState,
    mapLegacySlaType,
    normalizeCutiLeadState,
    type CutiCommandResult,
    type CutiCommonCommand,
} from './types.js';

async function getLead(leadId: string) {
    const { data, error } = await supabaseAdmin.from('leads').select('*').eq('id', leadId).maybeSingle();
    if (error) throw error;
    return data;
}

async function getOwnerName(userId: string | null | undefined): Promise<string | null> {
    if (!userId) return null;
    const { data } = await supabaseAdmin.from('users').select('id, name').eq('id', userId).maybeSingle();
    return data?.name || null;
}

async function updateVersioned(lead: any, patch: Record<string, unknown>) {
    const nextVersion = Number(lead.version || 0) + 1;
    let query = supabaseAdmin
        .from('leads')
        .update({
            ...patch,
            version: nextVersion,
            updated_at: new Date().toISOString(),
        })
        .eq('id', lead.id);
    if (lead.version != null) query = query.eq('version', lead.version);
    const { data, error } = await query.select().maybeSingle();
    if (error) throw error;
    return data;
}

function validationError(
    correlationId: string,
    code: string,
    fields: Record<string, string>,
    httpStatus: 400 | 404 = 400,
): CutiCommandResult {
    if (httpStatus === 404) {
        return {
            httpStatus: 404,
            body: { status: 'VALIDATION_ERROR', code: 'LEAD_NOT_FOUND', fields, correlation_id: correlationId },
        };
    }
    return {
        httpStatus: 400,
        body: { status: 'VALIDATION_ERROR', code, fields, correlation_id: correlationId },
    };
}

function versionConflict(
    leadId: string,
    expected: number,
    actual: number,
    correlationId: string,
): CutiCommandResult {
    return {
        httpStatus: 409,
        body: {
            status: 'VERSION_CONFLICT',
            lead_id: leadId,
            expected_state_version: expected,
            actual_state_version: actual,
            correlation_id: correlationId,
        },
    };
}

function businessRejected(
    code: 'TERMINAL_LEAD' | 'INVALID_TRANSITION' | 'NOT_OWNER' | 'INVALID_GUARD',
    lead: any,
    correlationId: string,
): CutiCommandResult {
    return {
        httpStatus: 422,
        body: {
            status: 'BUSINESS_REJECTED',
            code,
            lead_id: lead.id,
            current_state: normalizeCutiLeadState(lead.sla_state),
            state_version: Number(lead.version || 0),
            correlation_id: correlationId,
        },
    };
}

function accepted(
    commandId: string,
    leadId: string,
    stateVersion: number,
    eventId: string,
    correlationId: string,
): CutiCommandResult {
    return {
        httpStatus: 200,
        body: {
            status: 'ACCEPTED',
            command_id: commandId,
            lead_id: leadId,
            state_version: stateVersion,
            event_id: eventId,
            correlation_id: correlationId,
        },
    };
}

async function duplicateFromInbox(commandId: string, correlationId: string): Promise<CutiCommandResult | null> {
    const existing = await findInboxByIdempotency(commandId);
    if (!existing) return null;
    return {
        httpStatus: 200,
        body: {
            status: 'DUPLICATE_NOOP',
            command_id: commandId,
            original_event_id: existing.result_event_id || existing.id,
            state_version: Number(existing.result_state_version || 0),
            correlation_id: correlationId,
        },
    };
}

function requireCommon(cmd: CutiCommonCommand): Record<string, string> {
    const fields: Record<string, string> = {};
    if (!cmd.command_id) fields.command_id = 'required UUID idempotency key';
    if (cmd.expected_state_version == null || Number.isNaN(Number(cmd.expected_state_version))) {
        fields.expected_state_version = 'required number';
    }
    if (!cmd.occurred_at) fields.occurred_at = 'required UTC timestamp';
    if (!cmd.correlation_id) fields.correlation_id = 'required';
    if (!cmd.actor_id) fields.actor_id = 'required';
    return fields;
}

async function cancelActiveSla(leadId: string, at: string) {
    await supabaseAdmin
        .from('lead_sla_milestones')
        .update({ status: 'CANCELLED', expired_at: at })
        .eq('lead_id', leadId)
        .in('status', ['ACTIVE', 'PAUSED']);
}

function clearSlaPatch(): Record<string, unknown> {
    return {
        sla_type: null,
        active_sla_id: null,
        current_deadline_at: null,
        warning_at: null,
        qualifying_from_at: null,
        current_milestone_index: null,
        current_milestone_duration_seconds: null,
        current_cycle_started_at: null,
        warning_sent_at: null,
        sla_paused_at: null,
        sla_remaining_seconds: null,
        qualifying_message_id: null,
    };
}

async function finishCommand(opts: {
    commandId: string;
    leadId: string;
    eventName: string;
    actorId: string;
    occurredAt: string;
    correlationId: string;
    payload: Record<string, unknown>;
    updatedLead: any;
    activityType: string;
    activitySummary: string;
    metadata?: Record<string, unknown>;
    ownerName?: string | null;
}): Promise<CutiCommandResult> {
    const { eventId } = await commitProjectionAndActivity({
        lead: opts.updatedLead,
        correlationId: opts.correlationId,
        occurredAt: opts.occurredAt,
        activityType: opts.activityType,
        activitySummary: opts.activitySummary,
        actorId: opts.actorId,
        metadata: opts.metadata,
        ownerName: opts.ownerName,
        emitActivity: true,
    });

    const body = {
        status: 'ACCEPTED' as const,
        command_id: opts.commandId,
        lead_id: opts.leadId,
        state_version: Number(opts.updatedLead.version || 0),
        event_id: eventId,
        correlation_id: opts.correlationId,
    };

    const inbox = await recordInbox({
        idempotencyKey: opts.commandId,
        leadId: opts.leadId,
        eventName: opts.eventName,
        commandId: opts.commandId,
        correlationId: opts.correlationId,
        actorId: opts.actorId,
        occurredAt: opts.occurredAt,
        payload: opts.payload,
        resultStatus: 'ACCEPTED',
        resultEventId: eventId,
        resultStateVersion: Number(opts.updatedLead.version || 0),
        resultBody: body,
    });

    if (inbox.duplicate) {
        const dup = await duplicateFromInbox(opts.commandId, opts.correlationId);
        if (dup) return dup;
    }

    return { httpStatus: 200, body };
}

export async function assignOwner(
    leadId: string,
    cmd: CutiCommonCommand & { target_owner_id: string; reason?: string },
): Promise<CutiCommandResult> {
    const fields = requireCommon(cmd);
    if (!cmd.target_owner_id) fields.target_owner_id = 'required';
    if (Object.keys(fields).length) return validationError(cmd.correlation_id, 'MISSING_FIELDS', fields);

    const dup = await duplicateFromInbox(cmd.command_id, cmd.correlation_id);
    if (dup) return dup;

    const lead = await getLead(leadId);
    if (!lead) return validationError(cmd.correlation_id, 'LEAD_NOT_FOUND', { lead_id: 'not found' }, 404);

    const actualVersion = Number(lead.version || 0);
    if (Number(cmd.expected_state_version) !== actualVersion) {
        return versionConflict(leadId, Number(cmd.expected_state_version), actualVersion, cmd.correlation_id);
    }
    if (isTerminalState(lead.sla_state)) return businessRejected('TERMINAL_LEAD', lead, cmd.correlation_id);

    const { data: target } = await supabaseAdmin
        .from('users')
        .select('id, name, role, is_active')
        .eq('id', cmd.target_owner_id)
        .maybeSingle();
    if (!target || target.is_active === false) {
        return businessRejected('INVALID_GUARD', lead, cmd.correlation_id);
    }

    const at = new Date(cmd.occurred_at);
    const outstandingCustomerResponse =
        mapLegacySlaType(lead.sla_type) === 'CUSTOMER_RESPONSE' && !!lead.current_deadline_at;

    let nextState: string;
    let slaPatch: Record<string, unknown> = {};

    if (outstandingCustomerResponse) {
        nextState = 'OWNED_WAITING_SALE';
        // Keep existing Customer Response SLA; Core determines atomically
        slaPatch = {};
    } else if (lead.last_customer_message_at && !lead.last_owner_message_at) {
        nextState = 'OWNED_WAITING_SALE';
        const timers = customerResponseTimers(new Date(lead.last_customer_message_at));
        slaPatch = {
            sla_type: 'CUSTOMER_RESPONSE',
            current_cycle_started_at: timers.started_at,
            warning_at: timers.warning_at,
            qualifying_from_at: timers.started_at,
            current_deadline_at: timers.deadline_at,
            current_milestone_index: null,
            current_milestone_duration_seconds: 180,
            sla_paused_at: null,
            sla_remaining_seconds: null,
            warning_sent_at: null,
        };
    } else {
        nextState = 'OWNED_WAITING_CUSTOMER';
        await cancelActiveSla(leadId, at.toISOString());
        slaPatch = clearSlaPatch();
    }

    const updated = await updateVersioned(lead, {
        assigned_to: cmd.target_owner_id,
        assigned_at: at.toISOString(),
        assign_state: 'assigned',
        owner_sale: target.name,
        sla_state: nextState,
        state_changed_at: at.toISOString(),
        ...slaPatch,
    });
    if (!updated) {
        const fresh = await getLead(leadId);
        return versionConflict(leadId, Number(cmd.expected_state_version), Number(fresh?.version || 0), cmd.correlation_id);
    }

    await supabaseAdmin.from('lead_assignment_history').insert({
        lead_id: leadId,
        old_owner_id: lead.assigned_to,
        new_owner_id: cmd.target_owner_id,
        reason: cmd.reason || 'CUTI_ASSIGN_OWNER',
        event_time: at.toISOString(),
    });

    return finishCommand({
        commandId: cmd.command_id,
        leadId,
        eventName: 'lead.owner.assigned.v1',
        actorId: cmd.actor_id,
        occurredAt: at.toISOString(),
        correlationId: cmd.correlation_id,
        payload: cmd as any,
        updatedLead: updated,
        activityType: 'OWNER_ASSIGNED',
        activitySummary: `Owner assigned to ${target.name}`,
        metadata: { target_owner_id: cmd.target_owner_id, reason: cmd.reason || null },
        ownerName: target.name,
    });
}

export async function reclaimLead(
    leadId: string,
    cmd: CutiCommonCommand & { reason?: string },
): Promise<CutiCommandResult> {
    const fields = requireCommon(cmd);
    if (Object.keys(fields).length) return validationError(cmd.correlation_id, 'MISSING_FIELDS', fields);

    const dup = await duplicateFromInbox(cmd.command_id, cmd.correlation_id);
    if (dup) return dup;

    const lead = await getLead(leadId);
    if (!lead) return validationError(cmd.correlation_id, 'LEAD_NOT_FOUND', { lead_id: 'not found' }, 404);

    const actualVersion = Number(lead.version || 0);
    if (Number(cmd.expected_state_version) !== actualVersion) {
        return versionConflict(leadId, Number(cmd.expected_state_version), actualVersion, cmd.correlation_id);
    }
    if (isTerminalState(lead.sla_state)) return businessRejected('TERMINAL_LEAD', lead, cmd.correlation_id);
    if (!lead.assigned_to) return businessRejected('INVALID_TRANSITION', lead, cmd.correlation_id);

    const at = new Date(cmd.occurred_at);
    const oldOwner = lead.assigned_to;
    await cancelActiveSla(leadId, at.toISOString());

    const updated = await updateVersioned(lead, {
        assigned_to: null,
        assigned_at: null,
        owner_sale: null,
        assign_state: 'unassigned',
        sla_state: 'SHARED_WAITING_SALE',
        state_changed_at: at.toISOString(),
        ...clearSlaPatch(),
    });
    if (!updated) {
        const fresh = await getLead(leadId);
        return versionConflict(leadId, Number(cmd.expected_state_version), Number(fresh?.version || 0), cmd.correlation_id);
    }

    await supabaseAdmin.from('lead_assignment_history').insert({
        lead_id: leadId,
        old_owner_id: oldOwner,
        new_owner_id: null,
        reason: cmd.reason || 'CUTI_RECLAIM',
        event_time: at.toISOString(),
    });

    return finishCommand({
        commandId: cmd.command_id,
        leadId,
        eventName: 'lead.reclaimed.v1',
        actorId: cmd.actor_id,
        occurredAt: at.toISOString(),
        correlationId: cmd.correlation_id,
        payload: cmd as any,
        updatedLead: updated,
        activityType: 'LEAD_RECLAIMED',
        activitySummary: `Lead reclaimed to shared pool`,
        metadata: { reason: cmd.reason || null, old_owner_id: oldOwner },
    });
}

export async function markWon(
    leadId: string,
    cmd: CutiCommonCommand & { note?: string },
): Promise<CutiCommandResult> {
    const fields = requireCommon(cmd);
    if (Object.keys(fields).length) return validationError(cmd.correlation_id, 'MISSING_FIELDS', fields);

    const dup = await duplicateFromInbox(cmd.command_id, cmd.correlation_id);
    if (dup) return dup;

    const lead = await getLead(leadId);
    if (!lead) return validationError(cmd.correlation_id, 'LEAD_NOT_FOUND', { lead_id: 'not found' }, 404);

    const actualVersion = Number(lead.version || 0);
    if (Number(cmd.expected_state_version) !== actualVersion) {
        return versionConflict(leadId, Number(cmd.expected_state_version), actualVersion, cmd.correlation_id);
    }
    if (isTerminalState(lead.sla_state)) return businessRejected('TERMINAL_LEAD', lead, cmd.correlation_id);

    const at = new Date(cmd.occurred_at);
    await cancelActiveSla(leadId, at.toISOString());

    const updated = await updateVersioned(lead, {
        sla_state: 'STOPPED_WON',
        outcome: 'WON',
        outcome_reason: null,
        closed_at: at.toISOString(),
        sla_stopped_at: at.toISOString(),
        state_changed_at: at.toISOString(),
        pipeline_stage: lead.pipeline_stage === 'chot_don' ? lead.pipeline_stage : 'chot_don',
        status: 'chot_don',
        crm_note: cmd.note != null ? cmd.note : lead.crm_note,
        ...clearSlaPatch(),
    });
    if (!updated) {
        const fresh = await getLead(leadId);
        return versionConflict(leadId, Number(cmd.expected_state_version), Number(fresh?.version || 0), cmd.correlation_id);
    }

    return finishCommand({
        commandId: cmd.command_id,
        leadId,
        eventName: 'lead.won.v1',
        actorId: cmd.actor_id,
        occurredAt: at.toISOString(),
        correlationId: cmd.correlation_id,
        payload: cmd as any,
        updatedLead: updated,
        activityType: 'LEAD_WON',
        activitySummary: 'Lead marked WON',
        ownerName: await getOwnerName(updated.assigned_to),
    });
}

export async function markFailed(
    leadId: string,
    cmd: CutiCommonCommand & { reason: string; note?: string },
): Promise<CutiCommandResult> {
    const fields = requireCommon(cmd);
    if (!cmd.reason) fields.reason = 'required';
    if (Object.keys(fields).length) return validationError(cmd.correlation_id, 'MISSING_FIELDS', fields);

    const dup = await duplicateFromInbox(cmd.command_id, cmd.correlation_id);
    if (dup) return dup;

    const lead = await getLead(leadId);
    if (!lead) return validationError(cmd.correlation_id, 'LEAD_NOT_FOUND', { lead_id: 'not found' }, 404);

    const actualVersion = Number(lead.version || 0);
    if (Number(cmd.expected_state_version) !== actualVersion) {
        return versionConflict(leadId, Number(cmd.expected_state_version), actualVersion, cmd.correlation_id);
    }
    if (isTerminalState(lead.sla_state)) return businessRejected('TERMINAL_LEAD', lead, cmd.correlation_id);

    const at = new Date(cmd.occurred_at);
    await cancelActiveSla(leadId, at.toISOString());

    const updated = await updateVersioned(lead, {
        sla_state: 'STOPPED_FAILED',
        outcome: 'FAILED',
        outcome_reason: cmd.reason,
        closed_at: at.toISOString(),
        sla_stopped_at: at.toISOString(),
        state_changed_at: at.toISOString(),
        pipeline_stage: ['huy', 'fail'].includes(lead.pipeline_stage) ? lead.pipeline_stage : 'fail',
        status: 'fail',
        crm_note: cmd.note != null ? cmd.note : lead.crm_note,
        ...clearSlaPatch(),
    });
    if (!updated) {
        const fresh = await getLead(leadId);
        return versionConflict(leadId, Number(cmd.expected_state_version), Number(fresh?.version || 0), cmd.correlation_id);
    }

    return finishCommand({
        commandId: cmd.command_id,
        leadId,
        eventName: 'lead.failed.v1',
        actorId: cmd.actor_id,
        occurredAt: at.toISOString(),
        correlationId: cmd.correlation_id,
        payload: cmd as any,
        updatedLead: updated,
        activityType: 'LEAD_FAILED',
        activitySummary: `Lead marked FAILED: ${cmd.reason}`,
        metadata: { reason: cmd.reason },
        ownerName: await getOwnerName(updated.assigned_to),
    });
}

export async function recordNote(
    leadId: string,
    cmd: CutiCommonCommand & { note: string },
): Promise<CutiCommandResult> {
    const fields = requireCommon(cmd);
    if (!cmd.note || !String(cmd.note).trim()) fields.note = 'required';
    if (Object.keys(fields).length) return validationError(cmd.correlation_id, 'MISSING_FIELDS', fields);

    const dup = await duplicateFromInbox(cmd.command_id, cmd.correlation_id);
    if (dup) return dup;

    const lead = await getLead(leadId);
    if (!lead) return validationError(cmd.correlation_id, 'LEAD_NOT_FOUND', { lead_id: 'not found' }, 404);

    const actualVersion = Number(lead.version || 0);
    if (Number(cmd.expected_state_version) !== actualVersion) {
        return versionConflict(leadId, Number(cmd.expected_state_version), actualVersion, cmd.correlation_id);
    }

    // CRM note only — no Core business field mutation / no state_version bump
    const at = new Date(cmd.occurred_at);
    const { error } = await supabaseAdmin
        .from('leads')
        .update({
            crm_note: cmd.note,
            notes: cmd.note,
            updated_at: at.toISOString(),
        })
        .eq('id', leadId)
        .eq('version', lead.version);

    if (error) {
        return validationError(cmd.correlation_id, 'UPDATE_FAILED', { note: error.message });
    }

    // Activity only (no projection state change) — still emit activity outbox
    const eventId = randomUUID();
    const { enqueueOutbox, buildActivityPayload, applyActivityLocally } = await import('./outbox.js');
    const activity = buildActivityPayload({
        leadId,
        eventId,
        correlationId: cmd.correlation_id,
        occurredAt: at.toISOString(),
        activityType: 'CRM_NOTE',
        summary: cmd.note.slice(0, 500),
        actorId: cmd.actor_id,
        stateVersion: actualVersion,
    });
    await enqueueOutbox([
        {
            eventId,
            eventName: 'lead.activity.append.v1',
            leadId,
            stateVersion: actualVersion,
            idempotencyKey: String(activity.idempotency_key),
            correlationId: cmd.correlation_id,
            payload: activity,
        },
    ]);
    await applyActivityLocally(activity);

    const body = {
        status: 'ACCEPTED' as const,
        command_id: cmd.command_id,
        lead_id: leadId,
        state_version: actualVersion,
        event_id: eventId,
        correlation_id: cmd.correlation_id,
    };

    await recordInbox({
        idempotencyKey: cmd.command_id,
        leadId,
        eventName: 'crm.note.recorded',
        commandId: cmd.command_id,
        correlationId: cmd.correlation_id,
        actorId: cmd.actor_id,
        occurredAt: at.toISOString(),
        payload: cmd as any,
        resultStatus: 'ACCEPTED',
        resultEventId: eventId,
        resultStateVersion: actualVersion,
        resultBody: body,
    });

    return { httpStatus: 200, body };
}

export async function changeAppointment(
    leadId: string,
    cmd: CutiCommonCommand & {
        appointment_scheduled_at: string | null;
        previous_appointment_scheduled_at?: string | null;
    },
): Promise<CutiCommandResult> {
    const fields = requireCommon(cmd);
    if (cmd.appointment_scheduled_at === undefined) {
        fields.appointment_scheduled_at = 'required (ISO time or null)';
    }
    if (Object.keys(fields).length) return validationError(cmd.correlation_id, 'MISSING_FIELDS', fields);

    const dup = await duplicateFromInbox(cmd.command_id, cmd.correlation_id);
    if (dup) return dup;

    const lead = await getLead(leadId);
    if (!lead) return validationError(cmd.correlation_id, 'LEAD_NOT_FOUND', { lead_id: 'not found' }, 404);

    const actualVersion = Number(lead.version || 0);
    if (Number(cmd.expected_state_version) !== actualVersion) {
        return versionConflict(leadId, Number(cmd.expected_state_version), actualVersion, cmd.correlation_id);
    }

    // Set/clear appointment intent only — no Core SLA/state mutation
    const at = new Date(cmd.occurred_at);
    const value = cmd.appointment_scheduled_at;
    await supabaseAdmin
        .from('leads')
        .update({
            appointment_scheduled_at: value,
            appointment_time: value,
            updated_at: at.toISOString(),
        })
        .eq('id', leadId)
        .eq('version', lead.version);

    const eventId = randomUUID();
    const { enqueueOutbox, buildActivityPayload, applyActivityLocally } = await import('./outbox.js');
    const activity = buildActivityPayload({
        leadId,
        eventId,
        correlationId: cmd.correlation_id,
        occurredAt: at.toISOString(),
        activityType: 'APPOINTMENT_CHANGED',
        summary: value ? `Appointment set to ${value}` : 'Appointment cleared',
        actorId: cmd.actor_id,
        stateVersion: actualVersion,
        metadata: {
            appointment_scheduled_at: value,
            previous_appointment_scheduled_at: cmd.previous_appointment_scheduled_at ?? null,
        },
    });
    await enqueueOutbox([
        {
            eventId,
            eventName: 'lead.activity.append.v1',
            leadId,
            stateVersion: actualVersion,
            idempotencyKey: String(activity.idempotency_key),
            correlationId: cmd.correlation_id,
            payload: activity,
        },
    ]);
    await applyActivityLocally(activity);

    const body = {
        status: 'ACCEPTED' as const,
        command_id: cmd.command_id,
        lead_id: leadId,
        state_version: actualVersion,
        event_id: eventId,
        correlation_id: cmd.correlation_id,
    };

    await recordInbox({
        idempotencyKey: cmd.command_id,
        leadId,
        eventName: 'appointment.changed.v1',
        commandId: cmd.command_id,
        correlationId: cmd.correlation_id,
        actorId: cmd.actor_id,
        occurredAt: at.toISOString(),
        payload: cmd as any,
        resultStatus: 'ACCEPTED',
        resultEventId: eventId,
        resultStateVersion: actualVersion,
        resultBody: body,
    });

    return { httpStatus: 200, body };
}

export { isQuietHours, addSeconds, getLead, updateVersioned, clearSlaPatch, cancelActiveSla };
