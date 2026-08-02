/**
 * Production Pancake Message receiver (CRM display ingest).
 * Does NOT create leads, change business state/SLA, assign owner, or write Core.
 * Durable dedupe by message_id (cuti_inbox + lead_messages unique index).
 */
import { supabaseAdmin } from '../config/supabase.js';
import { CUTI_CONTRACT_VERSION } from './types.js';
import { findInboxByIdempotency, recordInbox } from './outbox.js';
import type { CutiReceiverResult } from './receivers.js';

export const PANCAKE_MESSAGE_TYPE = 'pancake.message.received.v1';

export type PancakeMessageBody = {
    contract_version?: string;
    outbox_id?: string;
    message_id?: string;
    message_type?: string;
    occurred_at?: string;
    payload?: Record<string, unknown>;
    // Flat aliases (also accepted at top-level)
    page_id?: string;
    conversation_id?: string;
    direction?: string;
    sent_at?: string;
    content?: string;
    text?: string;
    attachments?: unknown;
    customer?: Record<string, unknown>;
    sender?: Record<string, unknown>;
    assignee?: Record<string, unknown>;
    staff?: Record<string, unknown>;
};

function inboxKey(messageId: string): string {
    return `cuti-msg:${messageId}`;
}

function asObject(value: unknown): Record<string, unknown> | null {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value as Record<string, unknown>;
    }
    return null;
}

function str(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const t = value.trim();
    return t ? t : null;
}

function normalizeDirection(raw: unknown): 'inbound' | 'outbound' | null {
    const v = str(raw)?.toLowerCase();
    if (!v) return null;
    if (['inbound', 'in', 'customer', 'lead', 'user'].includes(v)) return 'inbound';
    if (['outbound', 'out', 'sale', 'staff', 'page', 'agent'].includes(v)) return 'outbound';
    return null;
}

function flattenMessage(body: PancakeMessageBody): {
    envelopeMessageId: string | null;
    outboxId: string | null;
    messageType: string | null;
    occurredAt: string | null;
    contractVersion: string | null;
    data: Record<string, unknown>;
} {
    const payload = asObject(body.payload) || {};
    const data: Record<string, unknown> = {
        ...payload,
        page_id: body.page_id ?? payload.page_id,
        conversation_id: body.conversation_id ?? payload.conversation_id,
        direction: body.direction ?? payload.direction ?? payload.message_direction,
        sent_at: body.sent_at ?? payload.sent_at ?? payload.message_time ?? payload.occurred_at,
        content: body.content ?? body.text ?? payload.content ?? payload.text ?? payload.last_message_text,
        attachments: body.attachments ?? payload.attachments,
        customer: body.customer ?? payload.customer,
        sender: body.sender ?? payload.sender,
        assignee: body.assignee ?? payload.assignee,
        staff: body.staff ?? payload.staff ?? payload.sender_sale,
        message_id: body.message_id ?? payload.message_id ?? payload.id,
    };
    return {
        envelopeMessageId: str(body.message_id) || str(data.message_id),
        outboxId: str(body.outbox_id),
        messageType: str(body.message_type) || PANCAKE_MESSAGE_TYPE,
        occurredAt: str(body.occurred_at) || str(data.sent_at),
        contractVersion: str(body.contract_version) || CUTI_CONTRACT_VERSION,
        data,
    };
}

async function findLeadId(data: Record<string, unknown>): Promise<string | null> {
    const conversationId = str(data.conversation_id);
    const pageId = str(data.page_id);
    const threadId = str(data.fb_thread_id) || (conversationId?.includes('_') ? conversationId.split('_').pop()! : null);

    if (conversationId) {
        const { data: byConv } = await supabaseAdmin
            .from('leads')
            .select('id')
            .eq('pancake_conversation_id', conversationId)
            .limit(1)
            .maybeSingle();
        if (byConv?.id) return byConv.id;

        const { data: byCutiConv } = await supabaseAdmin
            .from('leads')
            .select('id')
            .eq('conversation_id', conversationId)
            .limit(1)
            .maybeSingle();
        if (byCutiConv?.id) return byCutiConv.id;
    }

    if (threadId) {
        const { data: byThread } = await supabaseAdmin
            .from('leads')
            .select('id')
            .eq('fb_thread_id', threadId)
            .limit(1)
            .maybeSingle();
        if (byThread?.id) return byThread.id;
    }

    if (pageId && conversationId) {
        const { data: byPage } = await supabaseAdmin
            .from('leads')
            .select('id')
            .eq('page_id', pageId)
            .eq('conversation_id', conversationId)
            .limit(1)
            .maybeSingle();
        if (byPage?.id) return byPage.id;
    }

    return null;
}

/**
 * POST /v1/cuti/receivers/messages
 */
export async function receivePancakeMessage(body: PancakeMessageBody): Promise<CutiReceiverResult> {
    const flat = flattenMessage(body || {});
    const messageId = flat.envelopeMessageId;
    const fields: Record<string, string> = {};

    if (!messageId) fields.message_id = 'required';
    if (!str(flat.data.page_id)) fields.page_id = 'required';
    if (!str(flat.data.conversation_id)) fields.conversation_id = 'required';
    const direction = normalizeDirection(flat.data.direction);
    if (!direction) fields.direction = 'required (inbound|outbound)';
    const sentAt = str(flat.data.sent_at) || flat.occurredAt;
    if (!sentAt) fields.sent_at = 'required (ISO-8601)';

    if (Object.keys(fields).length) {
        return {
            httpStatus: 400,
            body: {
                status: 'rejected',
                code: 'INVALID_PAYLOAD',
                fields,
                message_id: messageId,
                outbox_id: flat.outboxId,
            },
        };
    }

    // Durable dedupe by message_id
    const existingInbox = await findInboxByIdempotency(inboxKey(messageId!));
    if (existingInbox) {
        return {
            httpStatus: 200,
            body: {
                status: 'duplicate',
                message_id: messageId,
                message_type: flat.messageType,
                outbox_id: flat.outboxId,
                lead_id: existingInbox.lead_id ?? null,
                original_result: existingInbox.result_status,
            },
        };
    }

    const { data: existingMsg } = await supabaseAdmin
        .from('lead_messages')
        .select('id, lead_id')
        .eq('message_id', messageId!)
        .limit(1)
        .maybeSingle();
    if (existingMsg) {
        await recordInbox({
            idempotencyKey: inboxKey(messageId!),
            leadId: existingMsg.lead_id || null,
            eventName: flat.messageType || PANCAKE_MESSAGE_TYPE,
            occurredAt: sentAt!,
            payload: body as Record<string, unknown>,
            resultStatus: 'duplicate',
            resultBody: { status: 'duplicate', message_id: messageId, lead_id: existingMsg.lead_id },
        });
        return {
            httpStatus: 200,
            body: {
                status: 'duplicate',
                message_id: messageId,
                message_type: flat.messageType,
                outbox_id: flat.outboxId,
                lead_id: existingMsg.lead_id,
            },
        };
    }

    const leadId = await findLeadId(flat.data);
    if (!leadId) {
        return {
            httpStatus: 404,
            body: {
                status: 'rejected',
                code: 'LEAD_NOT_FOUND',
                message:
                    'Không tìm thấy lead theo conversation_id/page_id. CRM không tự tạo lead từ Pancake Message.',
                message_id: messageId,
                page_id: flat.data.page_id,
                conversation_id: flat.data.conversation_id,
                outbox_id: flat.outboxId,
            },
        };
    }

    const customer = asObject(flat.data.customer);
    const sender = asObject(flat.data.sender);
    const assignee = asObject(flat.data.assignee) || asObject(flat.data.staff);
    const content = str(flat.data.content) || '';
    const senderType = direction === 'inbound' ? 'customer' : 'staff';
    const senderName =
        str(sender?.name) ||
        str(customer?.name) ||
        str(assignee?.name) ||
        (direction === 'inbound' ? 'customer' : 'staff');

    const metadata: Record<string, unknown> = {
        source: 'pancake',
        page_id: flat.data.page_id,
        conversation_id: flat.data.conversation_id,
        direction,
        sent_at: sentAt,
        customer: customer || null,
        sender: sender || null,
        // Display-only — NOT applied to leads.assigned_to
        assignee: assignee || null,
        attachments: flat.data.attachments ?? null,
        outbox_id: flat.outboxId,
        contract_version: flat.contractVersion,
    };

    const { error: insertErr } = await supabaseAdmin.from('lead_messages').insert({
        lead_id: leadId,
        content,
        sender_type: senderType,
        sender_name: senderName,
        message_id: messageId,
        message_type: Array.isArray(flat.data.attachments) && (flat.data.attachments as unknown[]).length
            ? 'attachment'
            : 'text',
        metadata,
        created_at: sentAt,
    });

    if (insertErr) {
        // Unique race on message_id
        if (
            insertErr.code === '23505' ||
            String(insertErr.message || '').toLowerCase().includes('duplicate') ||
            String(insertErr.message || '').toLowerCase().includes('unique')
        ) {
            await recordInbox({
                idempotencyKey: inboxKey(messageId!),
                leadId,
                eventName: flat.messageType || PANCAKE_MESSAGE_TYPE,
                occurredAt: sentAt!,
                payload: body as Record<string, unknown>,
                resultStatus: 'duplicate',
                resultBody: { status: 'duplicate', message_id: messageId, lead_id: leadId },
            });
            return {
                httpStatus: 200,
                body: {
                    status: 'duplicate',
                    message_id: messageId,
                    message_type: flat.messageType,
                    outbox_id: flat.outboxId,
                    lead_id: leadId,
                },
            };
        }
        console.error('[cuti_messages] insert error:', insertErr.message);
        return {
            httpStatus: 500,
            body: {
                status: 'rejected',
                code: 'INSERT_FAILED',
                message: insertErr.message,
                message_id: messageId,
            },
        };
    }

    // Display-only summary — no assign / SLA / Core mutation
    if (content) {
        await supabaseAdmin
            .from('leads')
            .update({
                last_activity_summary: content.slice(0, 240),
                updated_at: new Date().toISOString(),
            })
            .eq('id', leadId);
    }

    const accepted = {
        status: 'accepted',
        message_id: messageId,
        message_type: flat.messageType || PANCAKE_MESSAGE_TYPE,
        outbox_id: flat.outboxId,
        lead_id: leadId,
        direction,
        sent_at: sentAt,
        contract_version: flat.contractVersion,
    };

    await recordInbox({
        idempotencyKey: inboxKey(messageId!),
        leadId,
        eventName: flat.messageType || PANCAKE_MESSAGE_TYPE,
        occurredAt: sentAt!,
        payload: body as Record<string, unknown>,
        resultStatus: 'accepted',
        resultBody: accepted,
    });

    return { httpStatus: 200, body: accepted };
}
