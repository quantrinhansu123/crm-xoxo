# CUTI Backend–CRM Integration Contract

**CONTRACT_VERSION:** 1.0.0  
**CONTRACT_STATUS:** FROZEN  
**Scope:** CUTI/XOXO lead handling. PostgreSQL Core is the only business-state writer; Backend is its API/outbox boundary; CRM is projection/UI only; n8n is notification/log/KPI only.

## Non-negotiable rules

- Backend commits the complete decision in one Core transaction: Inbox deduplication, per-lead serialization, CAS (`state_version`), lead/owner/SLA mutation, decision/audit and transactional Outbox.
- CRM never writes lead state, owner, SLA, milestone, outcome, version or timer fields directly. CRM sends only the commands in `CUTI_API_COMMAND_CONTRACT_FINAL.md`.
- Exactly one owner and at most one active SLA exist per lead. `CUSTOMER_RESPONSE` and `FOLLOWUP` never coexist as active SLAs.
- CRM and n8n must use received projection events; neither recreates state-machine logic.
- Source event time is authoritative for business ordering. Backend returns `DUPLICATE_NOOP` for a duplicate idempotency key and `STALE_NOOP` for an obsolete valid input without new business effects.

## A. Final lead state machine

Only these states exist in v1:

| Current state | Event / command | Guard | Atomic Backend action | Next state | Owner effect | SLA effect | Outbox |
|---|---|---|---|---|---|---|---|
| — | `lead.imported` | canonical identity absent | create lead, Inbox decision, state version 1 | `SHARED_WAITING_SALE` | none | if initial customer message exists, open Customer Response SLA | `lead.projection.upsert` |
| `SHARED_WAITING_SALE` | `sale.responded` | recognised sale; before active Customer Response deadline | assign responding sale; complete Customer Response; create Follow-up M1 | `OWNED_WAITING_CUSTOMER` | assign owner | Customer Response completed; Follow-up M1 active | `lead.projection.upsert`, `lead.activity.append` |
| `OWNED_WAITING_SALE` | `sale.responded` | actor is owner; before Customer Response deadline | complete Customer Response; create Follow-up M1 | `OWNED_WAITING_CUSTOMER` | retained | Customer Response completed; Follow-up M1 active | same |
| `OWNED_WAITING_CUSTOMER` | `customer.message.received` | non-terminal | supersede Follow-up; open Customer Response | `OWNED_WAITING_SALE` | retained | Follow-up superseded; Customer Response active | same |
| `OWNED_WAITING_CUSTOMER` | `followup.qualifying.response` | actor is owner; within `[deadline−30m, deadline)` | complete current milestone; create next milestone, except M10 | `OWNED_WAITING_CUSTOMER` | retained | next Follow-up active; M10 qualifying response closes sequence | `lead.projection.upsert`, `lead.activity.append` |
| `OWNED_WAITING_CUSTOMER` | `followup.deadline.due` | active SLA identity/version/deadline match; M1–M9 | expire Follow-up; remove owner; retain lead | `SHARED_WAITING_SALE` | remove owner | expired/closed; no active SLA | `lead.projection.upsert`, `lead.activity.append` |
| `OWNED_WAITING_CUSTOMER` | `followup.deadline.due` | active SLA match; M10 | expire Follow-up; set failure outcome | `STOPPED_FAILED` | retain historical owner only | close SLA | `lead.projection.upsert`, `lead.activity.append` |
| `SHARED_WAITING_SALE` or `OWNED_WAITING_SALE` | `customer_response.deadline.due` | active Customer Response SLA match | expire SLA; remove owner if present | `SHARED_WAITING_SALE` | remove owner if present | expired/closed; no active SLA | `lead.projection.upsert`, `lead.activity.append` |
| `OWNED_WAITING_CUSTOMER` | `quiet_hours.started` | active Follow-up; configured quiet window | pause Follow-up and persist remaining seconds | `OWNED_WAITING_CUSTOMER` | retained | Follow-up `PAUSED` | `lead.projection.upsert` |
| `OWNED_WAITING_CUSTOMER` | `quiet_hours.ended` | paused Follow-up | resume, recalculate due/warning from remaining seconds | `OWNED_WAITING_CUSTOMER` | retained | Follow-up `ACTIVE` | `lead.projection.upsert` |
| active non-terminal | `lead.assign_owner` | authorised actor; target owner valid | replace/no-op owner; cancel incompatible active SLA; open Customer Response only when required by an outstanding customer response | `OWNED_WAITING_SALE` or `OWNED_WAITING_CUSTOMER` only as determined by current outstanding interaction | set owner | Core determines atomically | `lead.projection.upsert`, `lead.activity.append` |
| owned non-terminal | `lead.reclaim` | authorised actor or valid deadline path | remove owner; cancel active SLA | `SHARED_WAITING_SALE` | remove owner | cancel active SLA | `lead.projection.upsert`, `lead.activity.append` |
| non-terminal | `lead.mark_won` | authorised actor | set outcome won; cancel active SLA | `STOPPED_WON` | retain historical owner | cancel active SLA | `lead.projection.upsert`, `lead.activity.append` |
| non-terminal | `lead.mark_failed` | authorised actor; failure reason supplied | set outcome failed; cancel active SLA | `STOPPED_FAILED` | retain historical owner | cancel active SLA | `lead.projection.upsert`, `lead.activity.append` |

`customer_response.warning.due` and `followup.warning.due` emit notification/activity only; they do not change lead state or aggregate `state_version`.

### Explicit rejections

- Terminal leads reject all state-changing commands (`BUSINESS_REJECTED_TERMINAL`). No reopen exists in v1.
- A non-owner sale response on an owned lead, unknown salesperson, early follow-up response, invalid state transition, invalid SLA identity/version, or prohibited CRM field write is rejected/no-op as applicable; it never creates an intermediate state.
- A stale `state_version` returns `VERSION_CONFLICT`; duplicate idempotency returns the original result; an out-of-order source event returns `STALE_NOOP`.

## B. Canonical event minimum

The final catalog has **13 events**. The machine-readable catalog is `CUTI_CANONICAL_EVENT_CATALOG_FINAL.csv`; payload examples are in `CUTI_EVENT_PAYLOAD_EXAMPLES_FINAL.json`.

1. `lead.imported.v1`
2. `customer.message.received.v1`
3. `sale.responded.v1`
4. `customer_response.warning.due.v1`
5. `customer_response.deadline.due.v1`
6. `followup.warning.due.v1`
7. `followup.deadline.due.v1`
8. `quiet_hours.started.v1`
9. `quiet_hours.ended.v1`
10. `lead.owner.assigned.v1`
11. `lead.reclaimed.v1`
12. `lead.won.v1`
13. `lead.failed.v1`

## C. CRM field authority

The authoritative field catalog is `CUTI_CRM_FIELD_CATALOG_FINAL.csv` (**36 fields**).

- **Core-owned read-only:** all state, owner, SLA, milestone, outcome, version, synchronization and audit projection fields.
- **CRM user-input:** `crm_note`, `appointment_scheduled_at` and the command intent fields in the API contract. They are not Core business fields and never mutate the Core aggregate directly.
- **Derived/display-only:** deadline/remaining-time display, warning/quiet flags, owner name, activity summary, CRM sync metadata.
- **Deprecated/not required:** AI recommendation/insight fields, raw message/media bodies, CRM-calculated SLA/status/deadline/milestone, direct owner/state editing columns, appointment lifecycle variants beyond set/clear.

## D/E. Input and output boundary

The complete command contract is `CUTI_API_COMMAND_CONTRACT_FINAL.md`. Backend emits only the durable outbox outputs `lead.projection.upsert.v1` and `lead.activity.append.v1`; their payload schemas/examples are in `CUTI_EVENT_PAYLOAD_EXAMPLES_FINAL.json`. CRM applies events only when incoming `state_version` is greater than its stored version; equal version plus same `event_id` is deduplicated; lower version is ignored as stale.

## F. SLA contract

| Field supplied by Backend | Authority / semantics |
|---|---|
| `sla_type` | `CUSTOMER_RESPONSE`, `FOLLOWUP`, or null; Core-calculated |
| `sla_status` | `ACTIVE`, `PAUSED`, `COMPLETED`, `EXPIRED`, `CANCELLED`, `SUPERSEDED`, or null |
| `sla_started_at` | UTC start time of current/last display SLA |
| `sla_deadline_at` | authoritative UTC deadline; never CRM-calculated |
| `sla_warning_at` | Customer Response start +90 seconds; Follow-up deadline −30 minutes |
| `sla_paused_at` | UTC pause time or null |
| `sla_remaining_seconds` | persisted remaining seconds while paused; otherwise backend display snapshot or null |
| `followup_milestone_index` | 1–10 for active/last Follow-up; null otherwise |
| `next_followup_at` | next active Follow-up deadline; null otherwise |
| `quiet_hours_paused` | true only for a paused Follow-up due to quiet hours |

Customer Response duration is 180 seconds and warning is 90 seconds. Follow-up offsets from `followup_started_at` are 60, 180, 300, 420, 1440, 2880, 3120, 4020, 5160, 6600 minutes. Quiet hours pause Follow-up only (00:00–06:30 Asia/Ho_Chi_Minh); Customer Response never pauses.

## Change control

`CONTRACT_VERSION=1.0.0` and `CONTRACT_STATUS=FROZEN`. Implementation bug fixes do not change this contract. Schema/semantic changes require explicit Owner approval. Future optional work cannot modify v1 fields/events; later versions are additive where possible.
