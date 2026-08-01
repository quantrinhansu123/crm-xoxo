# CUTI Scope Freeze — v1.0.0

## REQUIRED NOW

1. Five-state Core lead machine and complete atomic transitions.
2. Durable Inbox, per-lead serialization, CAS/state version, transactional Outbox.
3. Thirteen canonical events in `CUTI_CANONICAL_EVENT_CATALOG_FINAL.csv`.
4. Six CRM→Backend commands in `CUTI_API_COMMAND_CONTRACT_FINAL.md`.
5. Two Backend→CRM outbox outputs: projection upsert and activity append.
6. Frozen 36-field CRM projection catalog.
7. Customer Response 180s/90s, ten Follow-up offsets, and Follow-up-only quiet-hour pause/resume.
8. Version/idempotency/out-of-order/retry behavior and the integration acceptance checklist.

## DEFERRED

1. Lead reopen / terminal reversal.
2. AI suggestion, customer insight, auto-summary, service-interest and next-action fields.
3. Appointment UX redesign or additional appointment states/actions; v1 keeps only existing set/clear integration intent.
4. Advanced KPI dashboards, analytics dimensions, notification content/channel expansion, and n8n workflow additions.
5. Multi-owner/collaborator models, sales-routing algorithms, queue balancing, and assignment recommendation.
6. New message/media archival/search features and raw payload display.

## REMOVE

1. CRM direct editing of state, owner, SLA, deadline, milestone, outcome, timer, or state version.
2. CRM/n8n calculation of SLA, deadline, reclaim, quiet-hour effects, or any Core business decision.
3. Separate workflows for partial steps of a single business decision.
4. `FOLLOWUP_PAUSED_QUIET_HOURS` as a lead state; pause is SLA status/flag only.
5. Legacy speculative events: message correction/replay control, unknown-salesperson mapping workflow, raw event replay endpoints, and any test-only/FI event or field.
6. Duplicate CRM projection event variants, generic webhook tables/contracts unrelated to CUTI lead scope, and optional AI context fields.

## Change control

`CONTRACT_VERSION=1.0.0`; `CONTRACT_STATUS=FROZEN`. Contract/schema changes need explicit Owner approval. Later contracts must be additive where possible and must not mutate v1 semantics.
