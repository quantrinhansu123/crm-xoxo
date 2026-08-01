# CUTI Handoff to Công — Backend Developer

**CONTRACT_VERSION=1.0.0**  
**CONTRACT_STATUS=FROZEN**

## Build exactly this

1. Implement the five-state Core machine and atomic decisions in `CUTI_BACKEND_CRM_CONTRACT_FINAL.md`.
2. Accept only the six CRM command inputs defined in `CUTI_API_COMMAND_CONTRACT_FINAL.md`.
3. Publish only durable Outbox `lead.projection.upsert.v1` and `lead.activity.append.v1` outputs using `CUTI_EVENT_PAYLOAD_EXAMPLES_FINAL.json`.
4. Map CRM fields exactly from `CUTI_CRM_FIELD_CATALOG_FINAL.csv`; preserve field keys/types/ownership.
5. Pass every check in `CUTI_INTEGRATION_ACCEPTANCE_CHECKLIST_FINAL.md`.

## Authoritative files

- `CUTI_BACKEND_CRM_CONTRACT_FINAL.md` — state machine, invariants, SLA, governance.
- `CUTI_CRM_FIELD_CATALOG_FINAL.csv` — final 36 CRM fields and authority.
- `CUTI_CANONICAL_EVENT_CATALOG_FINAL.csv` — final 13 canonical events.
- `CUTI_API_COMMAND_CONTRACT_FINAL.md` — CRM input API contract.
- `CUTI_EVENT_PAYLOAD_EXAMPLES_FINAL.json` — Backend output schemas/examples.
- `CUTI_INTEGRATION_ACCEPTANCE_CHECKLIST_FINAL.md` — acceptance gate.
- `CUTI_SCOPE_FREEZE_FINAL.md` — excluded/deferred work.

## Ownership boundary

**CRM owns:** UI/display, `crm_note`, existing appointment set/clear intent, authenticated actor context, command idempotency key, expected state version, and rendering received events.

**Core owns:** all lead state, owner, SLA/timers, follow-up milestone, outcome, state version, source ordering, Inbox, business decisions, audit, and Outbox. CRM must not directly write or calculate these values.

## Inputs CRM may send

`assign_owner`, `reclaim_lead`, `mark_won`, `mark_failed`, `record_note`, `change_appointment`. Each must include actor/auth context, `command_id`, `expected_state_version`, `occurred_at`, and `correlation_id` as specified. No direct transition/SLA/timer/reopen/replay command exists.

## Backend outputs

Emit `lead.projection.upsert.v1` for any projection-changing committed decision and `lead.activity.append.v1` for activity history. `state_version` orders projections; `event_id` deduplicates delivery. Event `event_version=1` identifies the frozen v1 payload schema: it changes only for an incompatible payload-schema change, while compatible additive fields retain v1 and consumers continue accepting v1 unchanged. Retry through transactional Outbox until CRM acknowledges durably. CRM ignores lower versions and no-ops repeated `event_id`.

## Explicitly out of scope

Failure Injection harness, new workflows, AI/insight fields, reopen, multi-owner/routing, CRM SLA calculations, direct CRM business writes, raw event replay, test-only contracts, appointment UI expansion, and optional dashboards.

## Acceptance

Backend and CRM jointly run the frozen checklist. A result is accepted only when all listed scenarios pass without CRM reproducing business logic.

## Change control

Bug fixes may not alter this contract. Any field/event/schema/semantic change requires explicit Owner approval; future versions are additive where possible.
