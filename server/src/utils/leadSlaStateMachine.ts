import { randomUUID } from 'crypto';
import { supabaseAdmin } from '../config/supabase.js';
import { fireWebhook } from './webhookNotifier.js';
import { autoLogKpiViolation } from './kpiViolationLogger.js';
import {
    addSeconds,
    commitProjectionAndActivity,
    customerResponseTimers,
    isQuietHours,
    publishPendingOutbox,
} from '../cuti/outbox.js';
import {
    FOLLOWUP_OFFSET_SECONDS,
    isTerminalState,
    mapLegacySlaType,
    normalizeCutiLeadState,
} from '../cuti/types.js';

export const SLA_CYCLES = [3, 60, 180, 300, 420, 1440, 2880, 3120, 4020, 5160, 6600];
/** @deprecated use FOLLOWUP_OFFSET_SECONDS from cuti/types — kept for callers */
export const FOLLOWUP_SECONDS = FOLLOWUP_OFFSET_SECONDS as unknown as readonly number[];
export const SLA_END_STAGES = ['chot_don', 'huy', 'fail'] as const;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

export function isSlaEndStage(stage?: string | null): boolean {
    return !!stage && (SLA_END_STAGES as readonly string[]).includes(stage);
}

/** Accepts legacy minute input, calculates with millisecond precision. */
export function calculateDeadline(start: Date, minutes: number, _createdAt?: string | Date): Date {
    // Quiet hours pause is handled by scheduler (remaining seconds); do not pre-extend here.
    return addSeconds(start, minutes * 60);
}

export function getVirtualTimeLeft(now: Date, deadline: Date, _createdAt?: string | Date) {
    return Math.max(0, (deadline.getTime() - now.getTime()) / 60000);
}

async function getLead(id: string) {
    const { data, error } = await supabaseAdmin.from('leads').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data;
}

async function updateVersioned(lead: any, patch: Record<string, unknown>) {
    let query = supabaseAdmin.from('leads').update({
        ...patch,
        version: Number(lead.version || 0) + 1,
        updated_at: new Date().toISOString(),
    }).eq('id', lead.id);
    if (lead.version != null) query = query.eq('version', lead.version);
    const { data, error } = await query.select().maybeSingle();
    if (error) throw error;
    return data;
}

function firstFollowup(start: Date) {
    const followupStartedAt = start;
    const deadline = addSeconds(followupStartedAt, FOLLOWUP_OFFSET_SECONDS[0]);
    const paused = isQuietHours(start);
    return {
        // CUTI: quiet hours pause is SLA status only — lead stays OWNED_WAITING_CUSTOMER
        sla_state: 'OWNED_WAITING_CUSTOMER',
        sla_type: 'FOLLOWUP',
        current_milestone_index: 0, // 0-based runtime; projection maps to 1–10
        current_rule_index: 1,
        current_milestone_duration_seconds: FOLLOWUP_OFFSET_SECONDS[0],
        current_cycle_started_at: start.toISOString(),
        followup_started_at: followupStartedAt.toISOString(),
        warning_at: addSeconds(deadline, -1800).toISOString(),
        qualifying_from_at: addSeconds(deadline, -1800).toISOString(),
        current_deadline_at: deadline.toISOString(),
        warning_sent_at: null,
        qualifying_message_id: null,
        sla_paused_at: paused ? start.toISOString() : null,
        sla_remaining_seconds: paused ? FOLLOWUP_OFFSET_SECONDS[0] : null,
        state_changed_at: start.toISOString(),
    };
}

async function addMilestone(lead: any, patch: any) {
    const { data } = await supabaseAdmin.from('lead_sla_milestones').insert({
        lead_id: lead.id,
        owner_id: lead.assigned_to,
        milestone_index: patch.current_milestone_index,
        duration_seconds: patch.current_milestone_duration_seconds,
        cycle_started_at: patch.current_cycle_started_at,
        warning_at: patch.warning_at,
        qualifying_from_at: patch.qualifying_from_at,
        deadline_at: patch.current_deadline_at,
        status: patch.sla_paused_at ? 'PAUSED' : 'ACTIVE',
    }).select('id').maybeSingle();

    if (data?.id) {
        await supabaseAdmin.from('leads').update({ active_sla_id: data.id }).eq('id', lead.id);
    }
}

async function emitCuti(lead: any, opts: {
    activityType: string;
    summary: string;
    actorId?: string | null;
    correlationId?: string;
    metadata?: Record<string, unknown>;
}) {
    try {
        await commitProjectionAndActivity({
            lead,
            correlationId: opts.correlationId || randomUUID(),
            occurredAt: new Date().toISOString(),
            activityType: opts.activityType,
            activitySummary: opts.summary,
            actorId: opts.actorId,
            metadata: opts.metadata,
            ownerName: lead.owner_sale,
            emitActivity: true,
        });
    } catch (err) {
        console.error('[CUTI] emitCuti error:', err);
    }
}

export async function on_customer_message(lead: any, opts: { inboundAt?: string | Date; messageId?: string | null } = {}) {
    const at = new Date(opts.inboundAt || new Date());
    const row = await getLead(lead.id);
    if (!row || isSlaEndStage(row.pipeline_stage) || isTerminalState(row.sla_state)) return;
    if (row.last_customer_message_at && at < new Date(row.last_customer_message_at)) return; // STALE_NOOP

    const timers = customerResponseTimers(at);
    const nextState = row.assigned_to ? 'OWNED_WAITING_SALE' : 'SHARED_WAITING_SALE';

    const updated = await updateVersioned(row, {
        sla_state: nextState,
        sla_type: 'CUSTOMER_RESPONSE',
        last_customer_message_at: at.toISOString(),
        t_last_inbound: at.toISOString(),
        last_message_time: at.toISOString(),
        last_actor: 'lead',
        trigger_message_id: opts.messageId || null,
        qualifying_message_id: null,
        current_cycle_started_at: timers.started_at,
        warning_at: timers.warning_at,
        qualifying_from_at: timers.started_at,
        current_deadline_at: timers.deadline_at,
        current_milestone_index: null,
        current_milestone_duration_seconds: 180,
        sla_paused_at: null,
        sla_remaining_seconds: null,
        warning_sent_at: null,
        state_changed_at: at.toISOString(),
    });

    await supabaseAdmin.from('lead_sla_milestones').update({ status: 'CANCELLED', expired_at: at.toISOString() })
        .eq('lead_id', row.id).in('status', ['ACTIVE', 'PAUSED']);

    if (updated) {
        await emitCuti(updated, {
            activityType: 'CUSTOMER_MESSAGE',
            summary: 'Customer message received; Customer Response SLA opened',
            metadata: { message_id: opts.messageId || null },
        });
    }
}

export async function on_sale_message(lead: any, saleId: string | null, saleName: string, opts: { outboundAt?: string | Date; messageId?: string | null } = {}) {
    if (!saleId) return;
    const at = new Date(opts.outboundAt || new Date());
    const row = await getLead(lead.id);
    if (!row || isSlaEndStage(row.pipeline_stage) || isTerminalState(row.sla_state)) return;
    if (row.assigned_to && row.assigned_to !== saleId) {
        await trigger_intrusion(row, saleId, saleName);
        await updateVersioned(row, { last_intrusion_at: at.toISOString() });
        return;
    }

    const state = normalizeCutiLeadState(row.sla_state);
    const deadline = row.current_deadline_at ? new Date(row.current_deadline_at) : null;
    const slaType = mapLegacySlaType(row.sla_type);

    // Shared pool first valid sale → assign + Follow-up M1
    if (state === 'SHARED_WAITING_SALE' && !row.assigned_to && slaType === 'CUSTOMER_RESPONSE') {
        if (!deadline || at >= deadline) return;
        const patch = {
            assigned_to: saleId,
            assigned_at: at.toISOString(),
            assign_state: 'assigned',
            owner_sale: saleName || null,
            last_owner_message_at: at.toISOString(),
            t_last_outbound: at.toISOString(),
            last_actor: 'sale',
            ...firstFollowup(at),
            qualifying_message_id: opts.messageId || null,
        };
        const updated = await updateVersioned(row, patch);
        if (!updated) return;
        await supabaseAdmin.from('lead_assignment_history').insert({
            lead_id: row.id, old_owner_id: null, new_owner_id: saleId,
            reason: 'FIRST_VALID_SALE_REPLY', event_time: at.toISOString(), message_id: opts.messageId || null,
        });
        await addMilestone(updated, patch);
        fireWebhook('OWNER_ASSIGNED', { lead_id: row.id, owner_id: saleId, owner_name: saleName });
        await emitCuti(updated, {
            activityType: 'SALE_RESPONDED',
            summary: 'Sale responded; Follow-up M1 started.',
            actorId: saleId,
            metadata: { milestone_index: 1 },
        });
        return;
    }

    // Owned waiting sale → complete Customer Response, open Follow-up M1
    if (state === 'OWNED_WAITING_SALE' && row.assigned_to === saleId && slaType === 'CUSTOMER_RESPONSE') {
        if (!deadline || at >= deadline) return;
        const patch = {
            last_owner_message_at: at.toISOString(),
            t_last_outbound: at.toISOString(),
            last_actor: 'sale',
            ...firstFollowup(at),
            qualifying_message_id: opts.messageId || null,
        };
        const updated = await updateVersioned(row, patch);
        if (updated) {
            await addMilestone(updated, patch);
            await emitCuti(updated, {
                activityType: 'SALE_RESPONDED',
                summary: 'Sale responded; Follow-up M1 started.',
                actorId: saleId,
                metadata: { milestone_index: 1 },
            });
        }
        return;
    }

    // Follow-up qualifying response in [deadline−30m, deadline)
    if (state !== 'OWNED_WAITING_CUSTOMER' || row.assigned_to !== saleId || slaType !== 'FOLLOWUP') return;
    if (row.sla_paused_at) return; // paused — not qualifying
    if (!row.qualifying_from_at || at < new Date(row.qualifying_from_at)) return; // early → no-op
    if (!deadline || at >= deadline) return;

    const index = Number(row.current_milestone_index ?? 0);
    await supabaseAdmin.from('lead_sla_milestones').update({
        status: 'COMPLETED', qualifying_message_id: opts.messageId || null, completed_at: at.toISOString(),
    }).eq('lead_id', row.id).in('status', ['ACTIVE', 'PAUSED']);

    // M10 qualifying response closes sequence → STOPPED_FAILED
    if (index >= FOLLOWUP_OFFSET_SECONDS.length - 1) {
        const updated = await updateVersioned(row, {
            sla_state: 'STOPPED_FAILED',
            outcome: 'FAILED',
            outcome_reason: 'FOLLOWUP_SEQUENCE_EXHAUSTED',
            closed_at: at.toISOString(),
            sla_stopped_at: at.toISOString(),
            qualifying_message_id: opts.messageId || null,
            current_deadline_at: null,
            warning_at: null,
            qualifying_from_at: null,
            warning_sent_at: null,
            sla_type: null,
            sla_paused_at: null,
            sla_remaining_seconds: null,
            state_changed_at: at.toISOString(),
        });
        fireWebhook('SLA_STOPPED', { lead_id: row.id, state: 'STOPPED_FAILED', reason: 'FINAL_MILESTONE_COMPLETED' });
        if (updated) {
            await emitCuti(updated, {
                activityType: 'FOLLOWUP_SEQUENCE_CLOSED',
                summary: 'Follow-up M10 qualifying response; lead STOPPED_FAILED',
                actorId: saleId,
            });
        }
        return;
    }

    const nextIndex = index + 1;
    const followupStartedAt = row.followup_started_at
        ? new Date(row.followup_started_at)
        : new Date(row.current_cycle_started_at || at);
    const nextDeadline = addSeconds(followupStartedAt, FOLLOWUP_OFFSET_SECONDS[nextIndex]);
    const patch = {
        sla_state: 'OWNED_WAITING_CUSTOMER',
        sla_type: 'FOLLOWUP',
        current_milestone_index: nextIndex,
        current_rule_index: nextIndex + 1,
        current_milestone_duration_seconds: FOLLOWUP_OFFSET_SECONDS[nextIndex],
        current_cycle_started_at: at.toISOString(),
        followup_started_at: followupStartedAt.toISOString(),
        warning_at: addSeconds(nextDeadline, -1800).toISOString(),
        qualifying_from_at: addSeconds(nextDeadline, -1800).toISOString(),
        current_deadline_at: nextDeadline.toISOString(),
        qualifying_message_id: null,
        warning_sent_at: null,
        last_owner_message_at: at.toISOString(),
        t_last_outbound: at.toISOString(),
        last_actor: 'sale',
        sla_paused_at: null,
        sla_remaining_seconds: null,
        state_changed_at: at.toISOString(),
    };
    const updated = await updateVersioned(row, patch);
    if (updated) {
        await addMilestone(updated, patch);
        await emitCuti(updated, {
            activityType: 'FOLLOWUP_MILESTONE_ADVANCED',
            summary: `Follow-up M${nextIndex + 1} started`,
            actorId: saleId,
            metadata: { milestone_index: nextIndex + 1 },
        });
    }
}

export async function stop_lead_sla(leadId: string, reason = 'end_stage') {
    const row = await getLead(leadId);
    if (!row) return;
    const won = reason === 'chot_don' || row.pipeline_stage === 'chot_don';
    const state = won ? 'STOPPED_WON' : 'STOPPED_FAILED';
    const at = new Date().toISOString();
    const updated = await updateVersioned(row, {
        sla_state: state,
        outcome: won ? 'WON' : 'FAILED',
        outcome_reason: reason,
        closed_at: at,
        sla_stopped_at: at,
        active_sla_id: null,
        current_deadline_at: null,
        warning_at: null,
        qualifying_from_at: null,
        current_milestone_index: null,
        warning_sent_at: null,
        sla_type: null,
        sla_paused_at: null,
        sla_remaining_seconds: null,
        state_changed_at: at,
    });
    if (updated) {
        fireWebhook('SLA_STOPPED', { lead_id: leadId, state, reason });
        await emitCuti(updated, {
            activityType: won ? 'LEAD_WON' : 'LEAD_FAILED',
            summary: `Lead ${state} (${reason})`,
        });
    }
}

/** Manual assignment — Core determines compatible state; no fabricated Customer Response. */
export async function on_lead_assigned(leadId: string, _saleId: string) {
    const row = await getLead(leadId);
    if (!row || isSlaEndStage(row.pipeline_stage) || isTerminalState(row.sla_state)) return;

    const outstanding =
        mapLegacySlaType(row.sla_type) === 'CUSTOMER_RESPONSE' && !!row.current_deadline_at;

    const updated = await updateVersioned(row, {
        sla_state: outstanding ? 'OWNED_WAITING_SALE' : 'OWNED_WAITING_CUSTOMER',
        state_changed_at: new Date().toISOString(),
        ...(outstanding
            ? {}
            : {
                current_deadline_at: null,
                warning_at: null,
                qualifying_from_at: null,
            }),
    });
    if (updated) {
        await emitCuti(updated, {
            activityType: 'OWNER_ASSIGNED',
            summary: 'Owner assigned',
            actorId: _saleId,
        });
    }
}

export async function trigger_intrusion(lead: any, intruderId: string, intruderName: string) {
    const { data: users } = await supabaseAdmin.from('users').select('id, telegram_chat_id')
        .in('id', [lead.assigned_to, intruderId].filter(Boolean));
    fireWebhook('INTRUSION_DETECTED', {
        lead_id: lead.id, lead_name: lead.name, owner_id: lead.assigned_to,
        owner_name: lead.owner_sale || 'System',
        tele_id_sale: users?.find(u => u.id === lead.assigned_to)?.telegram_chat_id || null,
        intruder_id: intruderId, intruder_name: intruderName,
        tele_id_vi_pham: users?.find(u => u.id === intruderId)?.telegram_chat_id || null,
        link_lead: `${FRONTEND_URL}/leads/${lead.id}`,
    });
}

async function reclaim(row: any, now: Date, reason = 'SLA_RECLAIM') {
    const owner = row.assigned_to;
    const updated = await updateVersioned(row, {
        assigned_to: null, assigned_at: null, owner_sale: null, assign_state: 'unassigned',
        sla_state: 'SHARED_WAITING_SALE',
        sla_type: null,
        current_deadline_at: null,
        warning_at: null, qualifying_from_at: null, current_milestone_index: null,
        current_milestone_duration_seconds: null, qualifying_message_id: null, warning_sent_at: null,
        sla_paused_at: null, sla_remaining_seconds: null, active_sla_id: null,
        state_changed_at: now.toISOString(),
    });
    if (!updated) return;
    await supabaseAdmin.from('lead_sla_milestones').update({ status: 'EXPIRED', expired_at: now.toISOString() })
        .eq('lead_id', row.id).in('status', ['ACTIVE', 'PAUSED']);
    if (owner) {
        await supabaseAdmin.from('lead_assignment_history').insert({
            lead_id: row.id, old_owner_id: owner, new_owner_id: null,
            reason, event_time: now.toISOString(),
        });
        await autoLogKpiViolation({
            employeeId: owner, relatedLeadId: row.id, ruleCode: 'lead_reclaimed',
            ruleName: 'Thu hồi Lead do quá hạn SLA', deductPoint: 0, violationType: 'discipline',
        });
    }
    fireWebhook('SLA_RECLAIM', { lead_id: row.id, old_owner_id: owner, link_lead: `${FRONTEND_URL}/leads/${row.id}` });
    await emitCuti(updated, {
        activityType: 'LEAD_RECLAIMED',
        summary: 'Lead reclaimed to SHARED_WAITING_SALE',
        metadata: { reason, old_owner_id: owner },
    });
}

/** M10 follow-up deadline → STOPPED_FAILED, retain historical owner */
async function failOnM10Deadline(row: any, now: Date) {
    const updated = await updateVersioned(row, {
        sla_state: 'STOPPED_FAILED',
        outcome: 'FAILED',
        outcome_reason: 'FOLLOWUP_M10_DEADLINE',
        closed_at: now.toISOString(),
        sla_stopped_at: now.toISOString(),
        sla_type: null,
        current_deadline_at: null,
        warning_at: null,
        qualifying_from_at: null,
        warning_sent_at: null,
        sla_paused_at: null,
        sla_remaining_seconds: null,
        active_sla_id: null,
        state_changed_at: now.toISOString(),
        // retain assigned_to / owner_sale
    });
    await supabaseAdmin.from('lead_sla_milestones').update({ status: 'EXPIRED', expired_at: now.toISOString() })
        .eq('lead_id', row.id).in('status', ['ACTIVE', 'PAUSED']);
    if (updated) {
        fireWebhook('SLA_STOPPED', { lead_id: row.id, state: 'STOPPED_FAILED', reason: 'FOLLOWUP_M10_DEADLINE' });
        await emitCuti(updated, {
            activityType: 'LEAD_FAILED',
            summary: 'Follow-up M10 deadline expired; STOPPED_FAILED',
        });
    }
}

export async function checkAllSLA() {
    const now = new Date();
    const { data, error } = await supabaseAdmin.from('leads').select('*').in('sla_state', [
        'SHARED_WAITING_SALE',
        'UNASSIGNED_WAITING_SALE', // legacy until migration
        'OWNED_WAITING_SALE',
        'OWNED_WAITING_CUSTOMER',
        'PAUSED_FOLLOWUP', // legacy until migration
    ]);
    if (error) throw error;

    for (const item of data || []) {
        const row = await getLead(item.id);
        if (!row) continue;
        const state = normalizeCutiLeadState(row.sla_state);
        const slaType = mapLegacySlaType(row.sla_type);

        // Quiet hours: pause FOLLOWUP only; lead state stays OWNED_WAITING_CUSTOMER
        if (
            state === 'OWNED_WAITING_CUSTOMER' &&
            slaType === 'FOLLOWUP' &&
            !row.sla_paused_at &&
            isQuietHours(now) &&
            row.current_deadline_at
        ) {
            const remaining = Math.max(0, Math.ceil((new Date(row.current_deadline_at).getTime() - now.getTime()) / 1000));
            const updated = await updateVersioned(row, {
                sla_state: 'OWNED_WAITING_CUSTOMER',
                sla_paused_at: now.toISOString(),
                sla_remaining_seconds: remaining,
            });
            await supabaseAdmin.from('lead_sla_milestones').update({ status: 'PAUSED' })
                .eq('lead_id', row.id).eq('status', 'ACTIVE');
            if (updated) {
                fireWebhook('SLA_PAUSED', { lead_id: row.id, remaining_seconds: remaining });
                await emitCuti(updated, {
                    activityType: 'QUIET_HOURS_STARTED',
                    summary: 'Follow-up paused for quiet hours',
                });
            }
            continue;
        }

        // Resume FOLLOWUP after quiet hours
        if (
            state === 'OWNED_WAITING_CUSTOMER' &&
            slaType === 'FOLLOWUP' &&
            row.sla_paused_at &&
            !isQuietHours(now)
        ) {
            const deadline = addSeconds(now, Number(row.sla_remaining_seconds || 0));
            const updated = await updateVersioned(row, {
                sla_state: 'OWNED_WAITING_CUSTOMER',
                sla_paused_at: null,
                sla_remaining_seconds: null,
                current_deadline_at: deadline.toISOString(),
                warning_at: addSeconds(deadline, -1800).toISOString(),
                qualifying_from_at: addSeconds(deadline, -1800).toISOString(),
            });
            await supabaseAdmin.from('lead_sla_milestones').update({ status: 'ACTIVE' })
                .eq('lead_id', row.id).eq('status', 'PAUSED');
            if (updated) {
                fireWebhook('SLA_RESUMED', { lead_id: row.id, deadline_at: deadline.toISOString() });
                await emitCuti(updated, {
                    activityType: 'QUIET_HOURS_ENDED',
                    summary: 'Follow-up resumed after quiet hours',
                });
            }
            continue;
        }

        // Legacy PAUSED_FOLLOWUP resume
        if (row.sla_state === 'PAUSED_FOLLOWUP' && !isQuietHours(now)) {
            const deadline = addSeconds(now, Number(row.sla_remaining_seconds || 0));
            await updateVersioned(row, {
                sla_state: 'OWNED_WAITING_CUSTOMER',
                sla_paused_at: null,
                sla_remaining_seconds: null,
                current_deadline_at: deadline.toISOString(),
                warning_at: addSeconds(deadline, -1800).toISOString(),
                qualifying_from_at: addSeconds(deadline, -1800).toISOString(),
            });
            continue;
        }

        // Warning notifications (no state_version change per contract)
        if (row.warning_at && !row.warning_sent_at && !row.sla_paused_at && now >= new Date(row.warning_at)) {
            await supabaseAdmin.from('leads').update({ warning_sent_at: now.toISOString() }).eq('id', row.id);
            fireWebhook('SLA_WARNING', {
                lead_id: row.id,
                deadline_at: row.current_deadline_at,
                owner_id: row.assigned_to,
                sla_type: slaType,
            });
            continue;
        }

        if (row.sla_paused_at) continue;
        if (!row.current_deadline_at || now < new Date(row.current_deadline_at)) continue;

        // Customer Response expiry → SHARED_WAITING_SALE, remove owner if present
        if (slaType === 'CUSTOMER_RESPONSE' || state === 'SHARED_WAITING_SALE' || state === 'OWNED_WAITING_SALE') {
            if (state === 'SHARED_WAITING_SALE' && !row.assigned_to) {
                const updated = await updateVersioned(row, {
                    sla_state: 'SHARED_WAITING_SALE',
                    sla_type: null,
                    current_deadline_at: null,
                    warning_at: null,
                    qualifying_from_at: null,
                    warning_sent_at: null,
                    state_changed_at: now.toISOString(),
                });
                if (updated) {
                    await emitCuti(updated, {
                        activityType: 'CUSTOMER_RESPONSE_EXPIRED',
                        summary: 'Customer Response SLA expired; remain SHARED_WAITING_SALE',
                    });
                }
            } else {
                await reclaim(row, now, 'CUSTOMER_RESPONSE_DEADLINE');
            }
            continue;
        }

        // Follow-up deadline
        if (state === 'OWNED_WAITING_CUSTOMER' && slaType === 'FOLLOWUP') {
            const index = Number(row.current_milestone_index ?? 0);
            if (index >= FOLLOWUP_OFFSET_SECONDS.length - 1) {
                await failOnM10Deadline(row, now);
            } else {
                await reclaim(row, now, 'FOLLOWUP_DEADLINE');
            }
        }
    }

    // Flush outbox retries
    try {
        await publishPendingOutbox(30);
    } catch (err) {
        console.error('[CUTI] outbox publish error:', err);
    }
}

export const checkSlaCron = checkAllSLA;
export const is_valid_followup = () => true;
export async function move_to_next_rule(lead: any, saleId?: string | null, _fromCron?: boolean, _markOutbound?: boolean, outboundAt?: string | Date) {
    await on_sale_message(lead, saleId || lead.assigned_to, lead.owner_sale || 'Sale', { outboundAt });
}
