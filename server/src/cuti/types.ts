/** CUTI Integration Contract v1.0.0 — shared types & constants */

export const CUTI_CONTRACT_VERSION = '1.0.0';

export const CUTI_LEAD_STATES = [
    'SHARED_WAITING_SALE',
    'OWNED_WAITING_SALE',
    'OWNED_WAITING_CUSTOMER',
    'STOPPED_WON',
    'STOPPED_FAILED',
] as const;

export type CutiLeadState = (typeof CUTI_LEAD_STATES)[number];

export const TERMINAL_STATES: CutiLeadState[] = ['STOPPED_WON', 'STOPPED_FAILED'];

export const SLA_TYPES = ['CUSTOMER_RESPONSE', 'FOLLOWUP'] as const;
export type CutiSlaType = (typeof SLA_TYPES)[number] | null;

export const SLA_STATUSES = [
    'ACTIVE',
    'PAUSED',
    'COMPLETED',
    'EXPIRED',
    'CANCELLED',
    'SUPERSEDED',
] as const;
export type CutiSlaStatus = (typeof SLA_STATUSES)[number] | null;

/** Follow-up offsets from followup_started_at (minutes) — contract §F */
export const FOLLOWUP_OFFSET_MINUTES = [60, 180, 300, 420, 1440, 2880, 3120, 4020, 5160, 6600] as const;
export const FOLLOWUP_OFFSET_SECONDS = FOLLOWUP_OFFSET_MINUTES.map((m) => m * 60);

export const CUSTOMER_RESPONSE_SECONDS = 180;
export const CUSTOMER_RESPONSE_WARNING_SECONDS = 90;
export const FOLLOWUP_QUALIFYING_WINDOW_SECONDS = 30 * 60;

/** Quiet hours 00:00–06:30 Asia/Ho_Chi_Minh */
export const QUIET_HOURS_END_SECONDS = 6 * 3600 + 30 * 60; // 23400

export const OUTBOX_PROJECTION = 'lead.projection.upsert.v1';
export const OUTBOX_ACTIVITY = 'lead.activity.append.v1';

export type CutiCommandName =
    | 'assign_owner'
    | 'reclaim_lead'
    | 'mark_won'
    | 'mark_failed'
    | 'record_note'
    | 'change_appointment';

export type CutiCommonCommand = {
    actor_id: string;
    actor_role: string;
    command_id: string;
    expected_state_version: number;
    occurred_at: string;
    correlation_id: string;
};

export type CutiCommandResult =
    | {
          httpStatus: 200;
          body: {
              status: 'ACCEPTED';
              command_id: string;
              lead_id: string;
              state_version: number;
              event_id: string;
              correlation_id: string;
          };
      }
    | {
          httpStatus: 200;
          body: {
              status: 'DUPLICATE_NOOP';
              command_id: string;
              original_event_id: string;
              state_version: number;
              correlation_id: string;
          };
      }
    | {
          httpStatus: 409;
          body: {
              status: 'VERSION_CONFLICT';
              lead_id: string;
              expected_state_version: number;
              actual_state_version: number;
              correlation_id: string;
          };
      }
    | {
          httpStatus: 422;
          body: {
              status: 'BUSINESS_REJECTED';
              code: 'TERMINAL_LEAD' | 'INVALID_TRANSITION' | 'NOT_OWNER' | 'INVALID_GUARD';
              lead_id: string;
              current_state: string;
              state_version: number;
              correlation_id: string;
          };
      }
    | {
          httpStatus: 400;
          body: {
              status: 'VALIDATION_ERROR';
              code: string;
              fields: Record<string, string>;
              correlation_id: string;
          };
      }
    | {
          httpStatus: 404;
          body: {
              status: 'VALIDATION_ERROR';
              code: 'LEAD_NOT_FOUND';
              fields: Record<string, string>;
              correlation_id: string;
          };
      };

/** Map legacy Ban_đặc_tả states → CUTI five-state */
export function normalizeCutiLeadState(raw: string | null | undefined): CutiLeadState {
    switch (raw) {
        case 'UNASSIGNED_IDLE':
        case 'UNASSIGNED_WAITING_SALE':
        case 'SHARED_WAITING_SALE':
            return 'SHARED_WAITING_SALE';
        case 'PAUSED_FOLLOWUP':
        case 'OWNED_WAITING_CUSTOMER':
            return 'OWNED_WAITING_CUSTOMER';
        case 'OWNED_WAITING_SALE':
            return 'OWNED_WAITING_SALE';
        case 'STOPPED_WON':
            return 'STOPPED_WON';
        case 'STOPPED_FAILED':
            return 'STOPPED_FAILED';
        default:
            return raw && (CUTI_LEAD_STATES as readonly string[]).includes(raw)
                ? (raw as CutiLeadState)
                : 'SHARED_WAITING_SALE';
    }
}

export function isTerminalState(state: string | null | undefined): boolean {
    const s = normalizeCutiLeadState(state);
    return TERMINAL_STATES.includes(s);
}

export function mapLegacySlaType(raw: string | null | undefined): CutiSlaType {
    if (!raw) return null;
    if (raw === 'CUSTOMER_RESPONSE' || raw.includes('CUSTOMER_RESPONSE') || raw.includes('180')) {
        return 'CUSTOMER_RESPONSE';
    }
    if (raw === 'FOLLOWUP' || raw.includes('FOLLOWUP')) return 'FOLLOWUP';
    return null;
}
