import { Router, Request, Response, NextFunction } from 'express';
import { supabaseAdmin as supabase } from '../config/supabase';
import { authenticate } from '../middleware/auth';

const router = Router();

// ─── GET /api/salary-configs ──────────────────────────────
// Lấy cấu hình lương của tất cả nhân viên (kèm bonus_tiers + deduction_rules)
router.get('/', authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { data, error } = await supabase
            .from('salary_configs')
            .select(`
                *,
                bonus_tiers(*),
                deduction_rules(*)
            `);

        if (error) throw error;

        res.json({
            status: 'success',
            data: {
                configs: data || [],
            },
        });
    } catch (error) {
        next(error);
    }
});

// ─── GET /api/salary-configs/:userId ─────────────────────────
// Lấy cấu hình lương của 1 nhân viên (kèm bonus_tiers + deduction_rules)
router.get('/:userId', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { userId } = req.params;

        const { data, error } = await supabase
            .from('salary_configs')
            .select(`
                *,
                bonus_tiers(*),
                deduction_rules(*)
            `)
            .eq('user_id', userId)
            .single();

        if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows

        res.json({
            status: 'success',
            data: {
                config: data || null,
            },
        });
    } catch (error) {
        next(error);
    }
});

// ─── PUT /api/salary-configs/:userId ─────────────────────────
// Upsert cấu hình lương + thay thế bonus_tiers + deduction_rules
router.put('/:userId', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { userId } = req.params;
        const {
            salary_template,
            salary_type,
            base_amount,
            bonus_type,
            bonus_scope,
            commission_enabled,
            overtime_enabled,
            overtime_rates,
            shift_salaries,
            shift_saturday_rate,
            shift_sunday_rate,
            shift_holiday_rate,
            shift_tet_rate,
            allowance_enabled,
            allowance_amount,
            allowance_rules,
            commission_rules,
            notes,
            bonus_tiers,      // array of { from_amount, bonus_percent, sort_order }
            deduction_rules,   // array of { name, condition, amount, sort_order }
        } = req.body;

        // 1. Upsert salary_configs
        const configPayload = {
            user_id: userId,
            salary_template: salary_template || null,
            salary_type: salary_type || 'standard_day',
            base_amount: base_amount || 0,
            bonus_type: bonus_type || 'none',
            bonus_scope: bonus_scope || 'system',
            commission_enabled: !!commission_enabled,
            overtime_enabled: !!overtime_enabled,
            overtime_rates: overtime_rates || null,
            shift_salaries: shift_salaries || [],
            shift_saturday_rate: shift_saturday_rate ?? null,
            shift_sunday_rate: shift_sunday_rate ?? null,
            shift_holiday_rate: shift_holiday_rate ?? 100,
            shift_tet_rate: shift_tet_rate ?? 100,
            allowance_enabled: !!allowance_enabled,
            allowance_amount: allowance_amount || 0,
            allowance_rules: allowance_rules || [],
            commission_rules: commission_rules || [],
            notes: notes || null,
            updated_at: new Date().toISOString(),
        };

        const { data: config, error: configError } = await supabase
            .from('salary_configs')
            .upsert(configPayload, { onConflict: 'user_id' })
            .select()
            .single();

        if (configError) throw configError;

        const configId = config.id;

        // 2. Replace bonus_tiers: delete old → insert new
        await supabase.from('bonus_tiers').delete().eq('salary_config_id', configId);

        if (bonus_tiers && Array.isArray(bonus_tiers) && bonus_tiers.length > 0) {
            const tierRows = bonus_tiers.map((t: any, i: number) => ({
                salary_config_id: configId,
                from_amount: t.from_amount || 0,
                bonus_percent: t.bonus_percent || 0,
                sort_order: t.sort_order ?? i,
            }));
            const { error: tierError } = await supabase.from('bonus_tiers').insert(tierRows);
            if (tierError) throw tierError;
        }

        // 3. Replace deduction_rules: delete old → insert new
        await supabase.from('deduction_rules').delete().eq('salary_config_id', configId);

        if (deduction_rules && Array.isArray(deduction_rules) && deduction_rules.length > 0) {
            const ruleRows = deduction_rules.map((r: any, i: number) => ({
                salary_config_id: configId,
                name: r.name,
                condition: r.condition || null,
                amount: r.amount || 0,
                sort_order: r.sort_order ?? i,
            }));
            const { error: ruleError } = await supabase.from('deduction_rules').insert(ruleRows);
            if (ruleError) throw ruleError;
        }

        // 4. Return full config
        const { data: result, error: resultError } = await supabase
            .from('salary_configs')
            .select(`*, bonus_tiers(*), deduction_rules(*)`)
            .eq('id', configId)
            .single();

        if (resultError) throw resultError;

        res.json({ status: 'success', data: { config: result } });
    } catch (error) {
        next(error);
    }
});

export { router as salaryConfigsRouter };
export default router;
