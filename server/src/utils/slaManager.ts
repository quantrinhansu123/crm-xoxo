import { supabaseAdmin } from '../config/supabase.js';
import { fireWebhook } from './webhookNotifier.js';
import { autoLogKpiViolation } from './kpiViolationLogger.js';

export const SLA_CYCLES = [3, 60, 180, 300, 420, 1440, 2880, 3120, 4020, 5160, 6600];
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

/**
 * Khách Mới (< 24h): Tính SLA xuyên đêm.
 * Khách Cũ (> 24h): Tạm dừng bộ đếm từ 00:00 - 06:30.
 */
export function isCustomerNew(customerCreatedAt: Date | string): boolean {
    const created = new Date(customerCreatedAt);
    const now = new Date();
    const hoursSinceCreation = (now.getTime() - created.getTime()) / (1000 * 60 * 60);
    return hoursSinceCreation < 24;
}

/**
 * Tính toán mốc Deadline mới dựa trên cơ chế Pause khi xuyên màn đêm 00:00 -> 06:30
 */
export function calculateDeadline(now: Date, ruleMinutes: number, customerCreatedAt: Date | string): Date {
    let current = new Date(now.getTime());
    let remaining = ruleMinutes;
    
    let iters = 0;
    while(remaining > 0 && iters < 20000) {
        current = new Date(current.getTime() + 60000); // Tiến thêm 1 phút
        iters++;
        
        if (!isCustomerNew(customerCreatedAt)) {
            const utcHours = current.getUTCHours();
            const vnHours = (utcHours + 7) % 24; // UTC+7
            const vnMin = current.getUTCMinutes();
            const timeInMin = vnHours * 60 + vnMin;
            
            // Khung 00:00 đến 06:30 (390 phút) -> Pause SLA không giảm remaining
            if (timeInMin >= 0 && timeInMin < 390) {
                continue;
            }
        }
        remaining--;
    }
    return current;
}

/**
 * Tính số phút "hiệu lực" còn lại bằng cách nháp ngược logic Shift, 
 * loại trừ khung giờ nghỉ đêm.
 */
export function getVirtualTimeLeft(now: Date, deadline: Date, customerCreatedAt: Date | string): number {
    if (now.getTime() >= deadline.getTime()) return 0;
    
    let current = new Date(now.getTime());
    let virtualMinutes = 0;
    let iters = 0;
    
    while(current.getTime() < deadline.getTime() && iters < 20000) {
        current = new Date(current.getTime() + 60000);
        iters++;
        
        let isPaused = false;
        if (!isCustomerNew(customerCreatedAt)) {
            const utcHours = current.getUTCHours();
            const vnHours = (utcHours + 7) % 24;
            const vnMin = current.getUTCMinutes();
            const t = vnHours * 60 + vnMin;
            if (t >= 0 && t < 390) {
                isPaused = true;
            }
        }
        if (!isPaused) {
            virtualMinutes++;
        }
    }
    return virtualMinutes;
}

/**
 * Kiểm tra xem cú Follow-up của Sale có hợp lệ không (có nằm trong khung 10p, 30p cuối không)
 */
export function is_valid_followup(ruleIndex: number, timeLeftMinutes: number): boolean {
    const rule = SLA_CYCLES[ruleIndex] || 3;
    if (ruleIndex === 0 || rule === 3) return true;
    if (ruleIndex === 1 || rule === 60) return timeLeftMinutes <= 10;
    return timeLeftMinutes <= 30; // Các mốc >= 180 phút
}

/**
 * Xử lý khi Khách Nhắn (Rule 1)
 */
export async function on_customer_message(lead: any) {
    // Guard: Don't override terminal states
    const terminalStates = ['RECLAIMED', 'STOPPED'];
    if (terminalStates.includes(lead.sla_state)) {
        console.log(`[SLA] Skipping customer message for lead ${lead.id} in state ${lead.sla_state}`);
        // Still update message timestamp for visibility
        if (lead.id) {
            await supabaseAdmin.from('leads').update({
                t_last_inbound: new Date().toISOString(),
                last_message_time: new Date().toISOString(),
                last_actor: 'lead',
            }).eq('id', lead.id);
        }
        return;
    }
    
    // FINISHED: Allow reactivation (customer returning is valid business case)
    // Continue with existing logic for non-terminal states...
    const now = new Date();
    const nextRule = SLA_CYCLES[0];
    const deadline = calculateDeadline(now, nextRule, lead.created_at);
    
    await supabaseAdmin.from('leads').update({
        last_actor: 'lead',
        t_last_inbound: now.toISOString(),
        last_message_time: now.toISOString(),
        current_rule_index: 0,
        current_deadline_at: deadline.toISOString(),
        sla_state: 'ACTIVE',
        appointment_time: null, // Xoá sạch lịch hẹn vì có tương tác mới
        next_followup_time: null, // Xoá hẹn chăm sóc vì có tương tác mới
        updated_at: now.toISOString()
    }).eq('id', lead.id);
}

/**
 * Di chuyển SLA sang mốc tiếp theo
 */
export async function move_to_next_rule(lead: any, saleId: string | null = null, fromCron: boolean = false, markOutbound: boolean = false) {
    const now = new Date();
    const nextIndex = (lead.current_rule_index || 0) + 1;
    console.log('[DEBUG SLA] nextIndex:', nextIndex);
    
    if (nextIndex >= SLA_CYCLES.length) {
        await supabaseAdmin.from('leads').update({
            sla_state: 'FINISHED',
            updated_at: now.toISOString()
        }).eq('id', lead.id);
        return;
    }
    
    const nextRule = SLA_CYCLES[nextIndex];
    const deadline = calculateDeadline(now, nextRule, lead.created_at);
    
    const updates: any = {
        current_rule_index: nextIndex,
        current_deadline_at: deadline.toISOString(),
        updated_at: now.toISOString()
    };
    
    if (saleId || markOutbound) {
        updates.last_actor = 'sale';
        updates.t_last_outbound = now.toISOString();
        updates.last_message_time = now.toISOString();
    }
    
    const { error } = await supabaseAdmin.from('leads').update(updates).eq('id', lead.id);
    if (error) {
        console.error('[SLAManager] move_to_next_rule error:', error.message);
    }
}

/**
 * Xử lý khi Sale Nhắn (Rule 2 + Rule 4)
 */
export async function on_sale_message(lead: any, saleId: string | null, saleName: string) {
    if (lead.id) {
        const { data: freshLead, error } = await supabaseAdmin
            .from('leads')
            .select('id, assigned_to, name, owner_sale, created_at, current_deadline_at, current_rule_index, sla_state')
            .eq('id', lead.id)
            .maybeSingle();

        if (!error && freshLead) {
            lead = { ...lead, ...freshLead };
        }
    }

    // Check Giành khách (Rule 4)
    // Fix: Chỉ trigger giành khách nếu thực sự resolve được saleId và nó KHÁC với assigned_to
    if (lead.assigned_to && saleId && saleId !== lead.assigned_to) {
        await trigger_intrusion(lead, saleId, saleName);
        return;
    }
    
    if (['PAUSED_APPOINTMENT', 'FINISHED', 'RECLAIMED', 'STOPPED'].includes(lead.sla_state || '')) {
        // Chỉ lưu vết tin nhắn, không tác động Rule khi bị Pause/Stop
        const { error } = await supabaseAdmin.from('leads').update({
            last_actor: 'sale',
            t_last_outbound: new Date().toISOString(),
            last_message_time: new Date().toISOString()
        }).eq('id', lead.id);
        if (error) console.error('[SLA] Lỗi update khi paused/stopped:', error);
        return; 
    }
    
    const now = new Date();
    const currDeadline = new Date(lead.current_deadline_at || now);
    console.log('[DEBUG SLA] currDeadline:', currDeadline);
    
    // Bug Fix: Phải dùng Virtual Time vì deadline có thể đã bị dịch sang sáng hôm sau
    const timeLeftMins = getVirtualTimeLeft(now, currDeadline, lead.created_at);
    
    if (is_valid_followup(lead.current_rule_index || 0, timeLeftMins)) {
        await move_to_next_rule(lead, saleId, false, true);
    } else {
        // Sai khung -> Không hợp lệ -> Trôi tiếp chờ cron
        const { error } = await supabaseAdmin.from('leads').update({
            last_actor: 'sale',
            t_last_outbound: now.toISOString(),
            last_message_time: now.toISOString(),
            updated_at: now.toISOString()
        }).eq('id', lead.id);
        if (error) console.error('[SLA] Lỗi update khi sai khung SLA:', error);
    }
}

export async function on_lead_assigned(leadId: string, saleId: string) {
    const now = new Date();
    const deadline = calculateDeadline(now, SLA_CYCLES[0], now.toISOString());
    await supabaseAdmin.from('leads').update({
        current_rule_index: 0,
        current_deadline_at: deadline.toISOString(),
        sla_state: 'ACTIVE',
        updated_at: now.toISOString()
    }).eq('id', leadId);
}

export async function trigger_intrusion(lead: any, intruder_id: string, intruder_name: string) {
    fireWebhook('INTRUSION_DETECTED', {
        lead_id: lead.id,
        lead_name: lead.name,
        owner_id: lead.assigned_to,
        owner_name: lead.owner_sale || 'System',
        tele_id_sale: lead.assigned_to_user?.telegram_chat_id || null,
        intruder_id: intruder_id,
        intruder_name: intruder_name,
        tele_id_vi_pham: null,
        link_lead: `${FRONTEND_URL}/leads/${lead.id}`
    });
}

/**
 * Cronjob thay thế hoàn toàn cho checkAllSLAũ
 */
export async function checkSlaCron() {
    try {
        const now = new Date();

        await supabaseAdmin.from('sla_fired_alerts')
            .delete()
            .lt('created_at', new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString());

        // Fetch leads đang vận hành SLA (không ở trạng thái chốt/hủy)
        const { data: leads, error } = await supabaseAdmin
            .from('leads')
            .select(`
                id, name, assigned_to, appointment_time, next_followup_time, sla_state, current_deadline_at, current_rule_index, appointment_reminded_at, next_followup_reminded_at, pipeline_stage, created_at, last_actor, t_last_inbound, t_last_outbound, assigned_to_user: users!leads_assigned_to_fkey(name, telegram_chat_id)
            `)
            .not('assigned_to', 'is', null)
            .not('pipeline_stage', 'in', '("chot_don", "huy", "fail")');

        if (error || !leads) return;

        for (const lead of leads) {
            const saleUser = Array.isArray(lead.assigned_to_user) ? lead.assigned_to_user[0] : lead.assigned_to_user;
            const saleName = saleUser?.name || 'Ẩn danh';
            const teleIdSale = saleUser?.telegram_chat_id || null;

            // Xử lý Lịch Hẹn (Rule 5) - cả appointment_time và next_followup_time
            if (lead.sla_state === 'PAUSED_APPOINTMENT') {
                const appointTime = lead.appointment_time ? new Date(lead.appointment_time) : null;
                const followupTime = lead.next_followup_time ? new Date(lead.next_followup_time) : null;

                // Ưu tiên appointment_time nếu cả 2 đều có
                const targetTime = appointTime || followupTime;
                const isAppointment = !!appointTime;

                if (targetTime) {
                    const msUntil = targetTime.getTime() - now.getTime();
                    const minUntil = msUntil / 60000;
                    const remindedAt = isAppointment ? lead.appointment_reminded_at : lead.next_followup_reminded_at;

                    // 1. Remind 10 min before
                    if (minUntil > 0 && minUntil <= 10 && !remindedAt) {
                        await fireWebhook('APPOINTMENT_REMIND', {
                            lead_id: lead.id,
                            lead_name: lead.name,
                            sale_name: saleName,
                            tele_id_sale: teleIdSale,
                            appointment_time: isAppointment ? lead.appointment_time : lead.next_followup_time,
                            link_lead: `${FRONTEND_URL}/leads/${lead.id}`
                        });
                        const updateField = isAppointment
                            ? { appointment_reminded_at: now.toISOString() }
                            : { next_followup_reminded_at: now.toISOString() };
                        await supabaseAdmin.from('leads').update(updateField).eq('id', lead.id);
                    }

                    // 2. Đúng giờ hẹn: Reset về mốc 3 phút (ACTIVE)
                    if (minUntil <= 0) {
                        const deadline = calculateDeadline(now, SLA_CYCLES[0], lead.created_at);
                        await supabaseAdmin.from('leads').update({
                            current_rule_index: 0,
                            current_deadline_at: deadline.toISOString(),
                            last_message_time: now.toISOString(),
                            t_last_inbound: now.toISOString(),
                            last_actor: 'lead',
                            sla_state: 'ACTIVE',
                            updated_at: now.toISOString(),
                            appointment_time: null,
                            appointment_reminded_at: null,
                            next_followup_time: null,
                            next_followup_reminded_at: null
                        }).eq('id', lead.id);
                    }
                }
                continue;
            }

            // Theo dõi trạng thái ACTIVE
            if (lead.sla_state === 'ACTIVE' && lead.current_deadline_at) {
                const { data: latestMessage } = await supabaseAdmin
                    .from('lead_messages')
                    .select('sender_type, created_at')
                    .eq('lead_id', lead.id)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                if (latestMessage?.sender_type === 'lead') {
                    const latestInboundAt = new Date(latestMessage.created_at);
                    const knownInboundAt = lead.t_last_inbound ? new Date(lead.t_last_inbound) : null;
                    const shouldRestoreInboundState = lead.last_actor !== 'lead' || !knownInboundAt || latestInboundAt.getTime() > knownInboundAt.getTime();

                    if (shouldRestoreInboundState) {
                        const restoredDeadline = calculateDeadline(latestInboundAt, SLA_CYCLES[0], lead.created_at);
                        lead.last_actor = 'lead';
                        lead.t_last_inbound = latestInboundAt.toISOString();
                        lead.current_rule_index = 0;
                        lead.current_deadline_at = restoredDeadline.toISOString();

                        await supabaseAdmin.from('leads').update({
                            last_actor: 'lead',
                            t_last_inbound: latestInboundAt.toISOString(),
                            last_message_time: latestInboundAt.toISOString(),
                            current_rule_index: 0,
                            current_deadline_at: restoredDeadline.toISOString(),
                            sla_state: 'ACTIVE',
                            updated_at: now.toISOString()
                        }).eq('id', lead.id);
                    }
                }

                const deadline = new Date(lead.current_deadline_at);
                const timeLeft = (deadline.getTime() - now.getTime()) / 60000;
                
                const ruleIndex = lead.current_rule_index || 0;
                const currentMilestone = SLA_CYCLES[ruleIndex] || 3;

                if (ruleIndex > 0 && lead.last_actor !== 'sale') {
                    continue;
                }

                // Cảnh báo sớm
                let warnThreshold = 45; // 45 phút cho tất cả mốc dài
                if (currentMilestone <= 3) warnThreshold = 1.5; // 90 giây cho mốc 3 phút

                if (timeLeft <= warnThreshold && timeLeft > 0) {
                    const { data: existing } = await supabaseAdmin
                        .from('sla_fired_alerts')
                        .select('id')
                        .eq('lead_id', lead.id)
                        .eq('rule_index', ruleIndex)
                        .eq('alert_type', 'WARN')
                        .gte('created_at', new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString())
                        .maybeSingle();

                    if (!existing) {
                        fireWebhook('SLA_WARNING', {
                            lead_id: lead.id,
                            lead_name: lead.name,
                            sale_name: saleName,
                            tele_id_sale: teleIdSale,
                            deadline_at: lead.current_deadline_at,
                            link_lead: `${FRONTEND_URL}/leads/${lead.id}`
                        });
                        await supabaseAdmin.from('sla_fired_alerts').insert({
                            lead_id: lead.id,
                            rule_index: ruleIndex,
                            alert_type: 'WARN'
                        });
                    }
                }

                // Thủng SLA
                if (timeLeft <= 0) {
                    if (ruleIndex === 0) {
                        const lastInboundAt = lead.t_last_inbound ? new Date(lead.t_last_inbound).getTime() : 0;
                        const lastOutboundAt = lead.t_last_outbound ? new Date(lead.t_last_outbound).getTime() : 0;
                        const hasSaleRepliedAfterCustomer = lead.last_actor === 'sale' && lastOutboundAt >= lastInboundAt;

                        if (hasSaleRepliedAfterCustomer) {
                            await move_to_next_rule(lead, null, true, false);
                            continue;
                        }

                        // RECLAIM
                        fireWebhook('SLA_RECLAIM', {
                            lead_id: lead.id,
                            lead_name: lead.name,
                            old_sale_name: saleName,
                            old_tele_id_sale: teleIdSale,
                            link_lead: `${FRONTEND_URL}/leads/${lead.id}`
                        });
                        await supabaseAdmin.from('leads').update({
                            assigned_to: null,
                            assign_state: 'unassigned',
                            sla_state: 'RECLAIMED',
                            updated_at: now.toISOString()
                        }).eq('id', lead.id);
                        
                        const { error: logErr } = await supabaseAdmin.from('lead_activities').insert({
                            lead_id: lead.id,
                            activity_type: 'owner_unassigned',
                            content: 'Lead đã bị Thu Hồi do Sale bỏ lỡ mốc SLA 3 phút (State Machine)',
                            created_by_name: 'Hệ thống'
                        });
                        if (logErr) console.error('[SLAManager] log error', logErr);

                        // AUTO LOG KPI: Thu hồi lead
                        await autoLogKpiViolation({ employeeId: lead.assigned_to, relatedLeadId: lead.id, ruleCode: 'lead_reclaimed', ruleName: 'Thu hồi Lead (quá hạn SLA 3 phút)', deductPoint: 0, violationType: 'discipline' });
                    } else {
                        // Phạt cảnh cáo và cưỡng ép chuyển mốc
                        fireWebhook('SLA_WARNING', {
                            lead_id: lead.id,
                            lead_name: lead.name,
                            sale_name: saleName,
                            tele_id_sale: teleIdSale,
                            deadline_at: lead.current_deadline_at,
                            link_lead: `${FRONTEND_URL}/leads/${lead.id}`
                        });
                        await move_to_next_rule(lead, null, true);
                        
                        // AUTO LOG KPI: Trễ SLA
                        await autoLogKpiViolation({ employeeId: lead.assigned_to, relatedLeadId: lead.id, ruleCode: 'sla_missed', ruleName: `Trễ SLA (mốc ${currentMilestone} phút)`, deductPoint: 0, violationType: 'process' });
                    }
                }
            }
        }
    } catch (err) {
        console.error('[SLAManager] Cron check failed', err);
    }
}

// Export them with original name too for backward compatibility in index.ts if needed
export { checkSlaCron as checkAllSLA };




