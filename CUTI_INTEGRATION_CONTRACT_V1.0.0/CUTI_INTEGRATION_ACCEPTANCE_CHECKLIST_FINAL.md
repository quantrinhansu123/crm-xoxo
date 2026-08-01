# CUTI Integration Acceptance Checklist — v1.0.0

Pass criterion for every scenario: Backend commits one complete Core decision, sends one deduplicable projection/activity outbox event where applicable, and CRM does not calculate or write Core business fields.

- [ ] Create/import lead: absent canonical identity creates `SHARED_WAITING_SALE`, state version, and projection.
- [ ] Shared lead projection: CRM displays Core state and no owner; direct CRM state edit is unavailable/rejected.
- [ ] Owner assignment: authorized command with current version assigns exactly one owner and applies Core-selected state/SLA atomically.
- [ ] Sale response: recognised sale answers a Customer Response before 180 seconds; owner is assigned/retained, Customer Response completes, Follow-up M1 begins.
- [ ] Customer response: customer message supersedes Follow-up, opens Customer Response, and moves owned lead to `OWNED_WAITING_SALE`.
- [ ] SLA switch: verify no moment/projection contains both active Customer Response and active Follow-up.
- [ ] Follow-up milestone: owner response in `[deadline−30m, deadline)` completes M1–M9 and starts next absolute-offset milestone; early response does not advance.
- [ ] Quiet-hour pause/resume: only Follow-up pauses at 00:00 Asia/Ho_Chi_Minh; resume at 06:30 preserves remaining seconds and recalculates deadline; Customer Response remains running.
- [ ] Reclaim: authorized reclaim removes owner, closes active SLA, yields `SHARED_WAITING_SALE`.
- [ ] Won: authorized command reaches `STOPPED_WON`, cancels SLA, and rejects later business transition.
- [ ] Failed: authorized command reaches `STOPPED_FAILED`, cancels SLA, and rejects later business transition.
- [ ] Duplicate event: resend same `command_id`/source idempotency key; Backend returns original/dedup response and CRM has no duplicate projection/activity.
- [ ] Out-of-order event: a valid obsolete source/timer event yields `STALE_NOOP`; no state/version regression occurs.
- [ ] Stale state version: command with older `expected_state_version` returns `409 VERSION_CONFLICT`; no mutation/outbox occurs.
- [ ] Temporary CRM failure: CRM intentionally returns transient failure once; outbox retries, then CRM applies exactly once by `event_id`; state version remains monotonic.
