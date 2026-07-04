# 009 Trigger Audit: `update_order_product_status()`

**Purpose:** Determine whether this trigger conflicts with the `current_phase`/`phase_stage` dual-write strategy introduced in migrations 002 and 003.

---

## 1. Trigger Name & Location

| Property | Value |
|---|---|
| **Function name** | `update_order_product_status()` |
| **Source file** | `migrations/archive/20260210_add_product_status_tracking.sql` |
| **Trigger 1** | `trigger_update_order_product_status` on `order_item_steps` |
| **Trigger 2** | `trigger_update_order_product_from_service` on `order_product_services` |
| **Timing** | `AFTER INSERT OR UPDATE OR DELETE` (both triggers) |
| **Scope** | `FOR EACH ROW` |
| **Found in schema.sql** | No — schema.sql is known-stale; trigger lives only in the migration archive |

Both triggers call the same function. The function determines which table fired it via `TG_TABLE_NAME`.

---

## 2. What It Does

When a row changes in `order_item_steps` or `order_product_services`, the function:

1. **Resolves the parent `order_products.id`** by walking up the foreign key chain (`order_item_steps` → `order_product_services` → `order_products`).
2. **Counts workflow steps** across all services linked to that product — total steps and those with `status IN ('completed', 'skipped')`.
3. **Derives `overall_status`** by inspecting the `status` column of all `order_product_services` rows for that product. The logic:
   - All cancelled → `'cancelled'`
   - All completed → `'completed'`
   - Any completed → `'partially_completed'`
   - Any `in_progress` or `assigned` → `'in_progress'`
   - Otherwise → `'pending'`
4. **Writes these columns to `order_products`** via a single `UPDATE`:
   - `completion_percentage`
   - `overall_status`
   - `total_workflow_steps`
   - `completed_workflow_steps`
   - `earliest_started_at`
   - `latest_completed_at`
   - `product_estimated_duration_minutes`
   - `product_total_duration_minutes`
   - `updated_at`

**Columns the trigger reads:** `order_item_steps.status`, `order_item_steps.estimated_duration`, `order_product_services.status`, `order_product_services.started_at`, `order_product_services.completed_at`, `order_product_services.order_product_id`.

**Columns the trigger writes:** only the 8 tracking columns on `order_products` listed above, plus `updated_at`.

---

## 3. Conflict Analysis

### Does the trigger write to `current_phase` or `phase_stage`?

**No.** The `UPDATE order_products SET ...` statement (lines 121–136 of the migration) names exactly 8 columns. Neither `current_phase` nor `phase_stage` appears in that list.

### Does the trigger fire on tables we modify in the dual-write backend routes?

The dual-write strategy writes `current_phase`/`phase_stage` to three tables:

| Table | Trigger fires on this table? | Risk |
|---|---|---|
| `order_items` | No | None |
| `order_products` | No — trigger fires AFTER changes to `order_item_steps` / `order_product_services`, and only UPDATEs `order_products` as a side effect | None |
| `order_product_services` | **Yes** — `trigger_update_order_product_from_service` fires here | See below |

When the backend route writes `current_phase`/`phase_stage` to `order_product_services`, this will fire `trigger_update_order_product_from_service`. The trigger then runs a derived-status rollup and updates `order_products.overall_status` (and related tracking columns). It does **not** touch `order_product_services.current_phase` or `order_product_services.phase_stage` — those columns are not in its `UPDATE` target.

### Can the trigger overwrite values the backend just wrote?

No. The trigger's `UPDATE` targets `order_products` only. The columns the backend writes (`current_phase`, `phase_stage`) live on `order_items`, `order_products`, and `order_product_services`. Even when the trigger fires because `order_product_services` changed, its write goes to the parent `order_products` row, not back to `order_product_services`. There is no circular overwrite.

### Is there a risk of `updated_at` churn?

Minor only. When the backend updates `current_phase`/`phase_stage` on `order_product_services`, the trigger fires and sets `order_products.updated_at = NOW()`. This is expected behavior — the parent record is correctly timestamped when a child changes. Not a conflict.

### Summary

**No conflict.** The trigger reads from `order_item_steps` and `order_product_services`, writes derived metrics to `order_products`, and never touches `current_phase` or `phase_stage` on any table.

---

## 4. Recommendation

**KEEP the trigger as-is.**

Rationale:
- It writes to a disjoint set of columns (`overall_status`, `completion_percentage`, timing columns) that have no overlap with the new phase columns.
- Disabling it would break the real-time product-status rollup that the existing UI depends on.
- Modifying it is unnecessary — there is no conflict to resolve.

The dual-write strategy (backend writes both old fields and new `current_phase`/`phase_stage` simultaneously) is safe alongside this trigger.

---

## 5. SQL to Verify

Run these queries against the live database to confirm the trigger exists, targets the correct tables, and has not been modified to touch phase columns.

### 5a. Confirm triggers exist on the correct tables

```sql
SELECT
  trigger_name,
  event_object_table,
  action_timing,
  event_manipulation,
  action_statement
FROM information_schema.triggers
WHERE trigger_name ILIKE '%order_product%'
ORDER BY event_object_table, trigger_name;
```

Expected rows:
- `trigger_update_order_product_from_service` on `order_product_services` — AFTER INSERT/UPDATE/DELETE
- `trigger_update_order_product_status` on `order_item_steps` — AFTER INSERT/UPDATE/DELETE
- `trigger_update_order_products_updated_at` on `order_products` — BEFORE UPDATE

### 5b. Confirm the function body does NOT write phase columns

```sql
SELECT routine_name, routine_definition
FROM information_schema.routines
WHERE routine_name = 'update_order_product_status'
  AND routine_type = 'FUNCTION';
```

Verify the returned `routine_definition` does not contain the strings `current_phase` or `phase_stage`.

### 5c. Check for any unexpected triggers on the three dual-write tables

```sql
SELECT
  trigger_name,
  event_object_table,
  action_timing,
  event_manipulation
FROM information_schema.triggers
WHERE event_object_table IN ('order_items', 'order_products', 'order_product_services')
ORDER BY event_object_table, trigger_name;
```

This gives a full picture of all triggers on these three tables so nothing is missed.

---

*Audited: 2026-04-25. Based on `migrations/archive/20260210_add_product_status_tracking.sql` (trigger source) and `migrations/002_add_current_phase.sql` (new columns). schema.sql was checked and confirmed stale — trigger not present there.*
