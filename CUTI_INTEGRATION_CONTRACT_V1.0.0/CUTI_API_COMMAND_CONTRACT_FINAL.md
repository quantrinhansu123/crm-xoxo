# CUTI CRM → Backend Command Contract

**CONTRACT_VERSION=1.0.0 — FROZEN**

All requests require authenticated `actor_id`, `actor_role`, `command_id` (UUID idempotency key), `expected_state_version`, `occurred_at` (UTC), and `correlation_id`. Backend authorizes actor permissions and serializes by `lead_id`. Core-owned fields are rejected if supplied as direct mutations.

## Common responses

- **Success 200:** `{ "status":"ACCEPTED", "command_id":"…", "lead_id":"…", "state_version":8, "event_id":"…", "correlation_id":"…" }`
- **Business rejection 422:** `{ "status":"BUSINESS_REJECTED", "code":"TERMINAL_LEAD|INVALID_TRANSITION|NOT_OWNER|INVALID_GUARD", "lead_id":"…", "current_state":"…", "state_version":7, "correlation_id":"…" }`
- **Conflict 409:** `{ "status":"VERSION_CONFLICT", "lead_id":"…", "expected_state_version":6, "actual_state_version":7, "correlation_id":"…" }`
- **Validation 400:** `{ "status":"VALIDATION_ERROR", "code":"…", "fields": {"field":"reason"}, "correlation_id":"…" }`
- **Duplicate 200:** `{ "status":"DUPLICATE_NOOP", "command_id":"…", "original_event_id":"…", "state_version":7, "correlation_id":"…" }`

## Commands

| Endpoint / command | Purpose | Required request fields | Optional request fields | Guards |
|---|---|---|---|---|
| `POST /v1/cuti/leads/{lead_id}/owner-assignment` / `assign_owner` | Explicit authorized assignment | common fields, `target_owner_id` | `reason` | lead non-terminal; actor authorized; target valid |
| `POST /v1/cuti/leads/{lead_id}/reclaim` / `reclaim_lead` | Return owned lead to shared pool | common fields | `reason` | lead owned/non-terminal; actor authorized |
| `POST /v1/cuti/leads/{lead_id}/outcome/won` / `mark_won` | Close successful lead | common fields | `note` | non-terminal; actor authorized |
| `POST /v1/cuti/leads/{lead_id}/outcome/failed` / `mark_failed` | Close unsuccessful lead | common fields, `reason` | `note` | non-terminal; actor authorized |
| `POST /v1/cuti/leads/{lead_id}/notes` / `record_note` | Append CRM display note only | common fields, `note` | — | actor authorized; no Core business field mutation |
| `POST /v1/cuti/leads/{lead_id}/appointment` / `change_appointment` | Set or clear existing appointment intent without UI expansion | common fields, `appointment_scheduled_at` (ISO time or null) | `previous_appointment_scheduled_at` | actor authorized; backend preserves appointment history/timer behavior |

`record_note` and `change_appointment` are integration-boundary inputs only. They must not calculate or mutate lead state, owner, SLA, milestone, outcome, `state_version`, or Core timers in CRM.

No CRM command exists for direct state change, direct SLA reset/pause/resume, direct milestone advancement, direct timer operation, reopening terminal lead, message ingestion, notification, KPI, or raw outbox replay.
