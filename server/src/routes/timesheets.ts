import { Router, Request, Response, NextFunction } from 'express';
import { supabaseAdmin as supabase } from '../config/supabase';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.js';
import { getOfficeGeofenceFromEnv, isWithinGeofence } from '../utils/attendanceGeofence.js';
import {
    deriveCheckInStatus,
    formatWorkedDuration,
    shiftStartIso,
    vietnamDateString,
    vietnamDateTimeLabel,
    vietnamTimeLabel,
    workedMinutes,
} from '../utils/vietnamTime.js';

const router = Router();

const timesheetSelect = `
    *,
    shift:shifts(*),
    user:users!timesheets_user_id_fkey(id, name, email, role, avatar, status, employee_code)
`;

type ShiftSummary = { id: string; name: string; start_time: string; end_time: string };

function isShiftSummary(value: unknown): value is ShiftSummary {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Record<string, unknown>;
    return (
        typeof candidate.id === 'string'
        && typeof candidate.name === 'string'
        && typeof candidate.start_time === 'string'
        && typeof candidate.end_time === 'string'
    );
}

async function resolveTodayShift(userId: string, scheduleDate: string): Promise<{ shift_id: string; shift: { id: string; name: string; start_time: string; end_time: string } } | null> {
    const { data: schedules } = await supabase
        .from('work_schedules')
        .select('shift_id, shift:shifts(id, name, start_time, end_time)')
        .eq('user_id', userId)
        .eq('schedule_date', scheduleDate)
        .limit(1);

    const row = schedules?.[0];
    const shiftCandidate = Array.isArray(row?.shift) ? row.shift[0] : row?.shift;
    if (row?.shift_id && isShiftSummary(shiftCandidate)) {
        const shift = shiftCandidate;
        return { shift_id: row.shift_id, shift };
    }

    const { data: shifts } = await supabase
        .from('shifts')
        .select('id, name, start_time, end_time')
        .neq('status', 'inactive')
        .order('name', { ascending: true })
        .limit(1);

    const fallback = shifts?.[0];
    if (!fallback) return null;
    return { shift_id: fallback.id, shift: fallback };
}

// ─── GET /api/timesheets/mobile/today ────────────────────────
router.get('/mobile/today', authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
        const userId = req.user!.id;
        const scheduleDate = vietnamDateString();
        const shiftInfo = await resolveTodayShift(userId, scheduleDate);
        const office = getOfficeGeofenceFromEnv();

        let timesheet = null;
        if (shiftInfo) {
            const { data } = await supabase
                .from('timesheets')
                .select(timesheetSelect)
                .eq('user_id', userId)
                .eq('shift_id', shiftInfo.shift_id)
                .eq('schedule_date', scheduleDate)
                .maybeSingle();
            timesheet = data;
        }

        const minutes = workedMinutes(timesheet?.check_in ?? null, timesheet?.check_out ?? null);

        res.json({
            status: 'success',
            data: {
                schedule_date: scheduleDate,
                date_label: vietnamDateTimeLabel(),
                shift: shiftInfo?.shift ?? null,
                timesheet,
                worked_duration: formatWorkedDuration(minutes),
                worked_minutes: minutes,
                can_check_in: Boolean(shiftInfo && !timesheet?.check_in),
                can_check_out: Boolean(shiftInfo && timesheet?.check_in && !timesheet?.check_out),
                office: office
                    ? {
                        name: office.name ?? 'Văn phòng',
                        address: office.address ?? null,
                        lat: office.lat,
                        lng: office.lng,
                        radius_m: office.radiusM,
                    }
                    : null,
            },
        });
    } catch (error) {
        next(error);
    }
});

// ─── POST /api/timesheets/mobile/punch ───────────────────────
router.post('/mobile/punch', authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
        const userId = req.user!.id;
        const { action, latitude, longitude, accuracy_m, address } = req.body as {
            action?: string;
            latitude?: number;
            longitude?: number;
            accuracy_m?: number;
            address?: string;
        };

        if (action !== 'check_in' && action !== 'check_out') {
            res.status(400).json({ status: 'fail', message: 'action phải là check_in hoặc check_out' });
            return;
        }
        if (typeof latitude !== 'number' || typeof longitude !== 'number' || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            res.status(400).json({ status: 'fail', message: 'latitude và longitude là bắt buộc' });
            return;
        }

        const office = getOfficeGeofenceFromEnv();
        const withinGeofence = office ? isWithinGeofence(latitude, longitude, office) : null;
        if (office && withinGeofence === false) {
            res.status(403).json({
                status: 'fail',
                message: `Bạn đang ngoài phạm vi chấm công (tối đa ${office.radiusM}m từ ${office.name ?? 'văn phòng'})`,
                data: { within_geofence: false, office },
            });
            return;
        }

        const scheduleDate = vietnamDateString();
        const shiftInfo = await resolveTodayShift(userId, scheduleDate);
        if (!shiftInfo) {
            res.status(400).json({ status: 'fail', message: 'Không tìm thấy ca làm việc cho hôm nay. Vui lòng liên hệ quản lý xếp lịch.' });
            return;
        }

        const { data: existing } = await supabase
            .from('timesheets')
            .select('*')
            .eq('user_id', userId)
            .eq('shift_id', shiftInfo.shift_id)
            .eq('schedule_date', scheduleDate)
            .maybeSingle();

        const nowIso = new Date().toISOString();

        if (action === 'check_in') {
            if (existing?.check_in) {
                res.status(400).json({ status: 'fail', message: 'Bạn đã check-in hôm nay' });
                return;
            }
            const checkInDate = new Date(nowIso);
            const status = deriveCheckInStatus(checkInDate, shiftStartIso(scheduleDate, shiftInfo.shift.start_time));

            const row = {
                user_id: userId,
                shift_id: shiftInfo.shift_id,
                schedule_date: scheduleDate,
                check_in: nowIso,
                status,
                check_in_latitude: latitude,
                check_in_longitude: longitude,
                check_in_accuracy_m: accuracy_m ?? null,
                check_in_address: address ?? null,
                check_in_within_geofence: withinGeofence,
                updated_at: nowIso,
            };

            const { data, error } = await supabase
                .from('timesheets')
                .upsert(row, { onConflict: 'user_id,shift_id,schedule_date' })
                .select(timesheetSelect)
                .single();

            if (error) throw error;

            res.status(201).json({
                status: 'success',
                data: {
                    timesheet: data,
                    check_in_label: vietnamTimeLabel(nowIso),
                    within_geofence: withinGeofence,
                },
            });
            return;
        }

        if (!existing?.check_in) {
            res.status(400).json({ status: 'fail', message: 'Bạn chưa check-in. Vui lòng check-in trước.' });
            return;
        }
        if (existing.check_out) {
            res.status(400).json({ status: 'fail', message: 'Bạn đã check-out hôm nay' });
            return;
        }

        const { data, error } = await supabase
            .from('timesheets')
            .update({
                check_out: nowIso,
                status: 'on_time',
                check_out_latitude: latitude,
                check_out_longitude: longitude,
                check_out_accuracy_m: accuracy_m ?? null,
                check_out_address: address ?? null,
                check_out_within_geofence: withinGeofence,
                updated_at: nowIso,
            })
            .eq('id', existing.id)
            .select(timesheetSelect)
            .single();

        if (error) throw error;

        const minutes = workedMinutes(existing.check_in, nowIso);

        res.json({
            status: 'success',
            data: {
                timesheet: data,
                check_out_label: vietnamTimeLabel(nowIso),
                worked_duration: formatWorkedDuration(minutes),
                within_geofence: withinGeofence,
            },
        });
    } catch (error) {
        next(error);
    }
});

// ─── GET /api/timesheets ─────────────────────────────────────
// Query: start_date, end_date, user_id?, shift_id?
router.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { start_date, end_date, user_id, shift_id } = req.query;

        if (!start_date || !end_date) {
            res.status(400).json({ status: 'fail', message: 'start_date and end_date are required' });
            return;
        }

        let query = supabase
            .from('timesheets')
            .select(`
                *,
                shift:shifts(*),
                user:users!timesheets_user_id_fkey!inner(id, name, email, phone, role, avatar, status, employee_code, salary, base_salary, hourly_rate, department_id),
                approver:users!timesheets_approved_by_fkey(id, name)
            `)
            .eq('user.status', 'active')
            .gte('schedule_date', start_date as string)
            .lte('schedule_date', end_date as string)
            .order('schedule_date', { ascending: true });

        if (user_id) query = query.eq('user_id', user_id as string);
        if (shift_id) query = query.eq('shift_id', shift_id as string);

        const { data, error } = await query;
        if (error) throw error;

        res.json({ status: 'success', data: { timesheets: data } });
    } catch (error) {
        next(error);
    }
});

// ─── POST /api/timesheets ────────────────────────────────────
// Create or update a single timesheet entry
router.post('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { user_id, shift_id, schedule_date, check_in, check_out, status, notes } = req.body;

        if (!user_id || !shift_id || !schedule_date) {
            res.status(400).json({ status: 'fail', message: 'user_id, shift_id, and schedule_date are required' });
            return;
        }

        const { data, error } = await supabase
            .from('timesheets')
            .upsert({
                user_id,
                shift_id,
                schedule_date,
                check_in: check_in || null,
                check_out: check_out || null,
                status: status || 'not_checked',
                notes: notes || null,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'user_id,shift_id,schedule_date' })
            .select(`
                *,
                shift:shifts(*),
                user:users!timesheets_user_id_fkey(id, name, email, role, avatar, employee_code)
            `)
            .single();

        if (error) throw error;

        res.status(201).json({ status: 'success', data: { timesheet: data } });
    } catch (error) {
        next(error);
    }
});

// ─── PUT /api/timesheets/:id ─────────────────────────────────
router.put('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { id } = req.params;
        const { check_in, check_out, status, notes } = req.body;

        const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (check_in !== undefined) updateData.check_in = check_in;
        if (check_out !== undefined) updateData.check_out = check_out;
        if (status !== undefined) updateData.status = status;
        if (notes !== undefined) updateData.notes = notes;

        const { data, error } = await supabase
            .from('timesheets')
            .update(updateData)
            .eq('id', id)
            .select(`
                *,
                shift:shifts(*),
                user:users!timesheets_user_id_fkey(id, name, email, role, avatar, employee_code)
            `)
            .single();

        if (error) throw error;
        res.json({ status: 'success', data: { timesheet: data } });
    } catch (error) {
        next(error);
    }
});

// ─── POST /api/timesheets/approve ────────────────────────────
// Bulk approve timesheets
router.post('/approve', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { timesheet_ids, approved_by } = req.body;

        if (!timesheet_ids || !Array.isArray(timesheet_ids) || timesheet_ids.length === 0) {
            res.status(400).json({ status: 'fail', message: 'timesheet_ids array is required' });
            return;
        }

        const { data, error } = await supabase
            .from('timesheets')
            .update({
                status: 'approved',
                approved_by: approved_by || null,
                approved_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
            .in('id', timesheet_ids)
            .select();

        if (error) throw error;

        res.json({ status: 'success', data: { count: data?.length || 0 } });
    } catch (error) {
        next(error);
    }
});

// ─── POST /api/timesheets/generate ───────────────────────────
// Auto-generate timesheet entries from work_schedules for a date range
router.post('/generate', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { start_date, end_date } = req.body;

        if (!start_date || !end_date) {
            res.status(400).json({ status: 'fail', message: 'start_date and end_date are required' });
            return;
        }

        // Fetch work schedules for active employees only. This keeps deleted employees
        // out of attendance while allowing newly scheduled active employees in.
        const { data: schedules, error: schedError } = await supabase
            .from('work_schedules')
            .select('user_id, shift_id, schedule_date, user:users!work_schedules_user_id_fkey!inner(id, status)')
            .eq('user.status', 'active')
            .gte('schedule_date', start_date)
            .lte('schedule_date', end_date);

        if (schedError) throw schedError;

        if (!schedules || schedules.length === 0) {
            res.json({ status: 'success', data: { count: 0, message: 'No work schedules found for this range' } });
            return;
        }

        // Build timesheet rows from work schedules
        const rows = schedules.map(s => ({
            user_id: s.user_id,
            shift_id: s.shift_id,
            schedule_date: s.schedule_date,
            status: 'not_checked',
        }));

        const { data, error } = await supabase
            .from('timesheets')
            .upsert(rows, { onConflict: 'user_id,shift_id,schedule_date', ignoreDuplicates: true })
            .select();

        if (error) throw error;

        res.status(201).json({ status: 'success', data: { count: data?.length || 0 } });
    } catch (error) {
        next(error);
    }
});

// ─── DELETE /api/timesheets/:id ──────────────────────────────
router.delete('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { id } = req.params;
        const { error } = await supabase.from('timesheets').delete().eq('id', id);
        if (error) throw error;
        res.status(204).send();
    } catch (error) {
        next(error);
    }
});

export { router as timesheetsRouter };
export default router;

