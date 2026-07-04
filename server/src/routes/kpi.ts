import { Router } from 'express';
import { kpiPoliciesRouter } from './kpi-policies.js';
import { kpiSettingsRouter } from './kpi-settings.js';
import { kpiViolationsRouter } from './kpi-violations.js';
import { kpiMonthlyRouter } from './kpi-monthly.js';

const router = Router();

// ============================================================
// KPI MODULE - Main Router
// Re-exports all KPI sub-routes under /api/kpi
// ============================================================

// Policies & Metrics: /api/kpi/policies, /api/kpi/metrics
router.use('/', kpiPoliciesRouter);

// Settings (rank configs) & Leaderboard: /api/kpi/rank-configs, /api/kpi/leaderboard
router.use('/', kpiSettingsRouter);

// Violations: /api/kpi/violations
router.use('/', kpiViolationsRouter);

// Monthly KPI: /api/kpi/monthly
router.use('/', kpiMonthlyRouter);

export { router as kpiRouter };
