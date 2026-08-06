import { Router, Response, NextFunction } from 'express';
import { supabaseAdmin as supabase } from '../config/supabase.js';
import { authenticate, AuthenticatedRequest, requireManager } from '../middleware/auth.js';
import {
    getAttendanceWifiSettings,
    invalidateAttendanceSettingsCache,
    parseAllowedIpsInput,
} from '../utils/attendanceWifiIp.js';

const router = Router();

router.use(authenticate);

// GET /api/attendance-settings — mọi user đăng nhập (mobile cần đọc tên WiFi)
router.get('/', async (_req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
        const settings = await getAttendanceWifiSettings();
        res.json({ status: 'success', data: settings });
    } catch (error) {
        next(error);
    }
});

// PUT /api/attendance-settings — admin/manager
router.put('/', requireManager, async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
        const {
            allowed_ips,
            office_name,
            wifi_name,
            office_address,
            enforce_wifi,
        } = req.body as {
            allowed_ips?: unknown;
            office_name?: string;
            wifi_name?: string;
            office_address?: string | null;
            enforce_wifi?: boolean;
        };

        const ips = parseAllowedIpsInput(allowed_ips);
        if (ips.length === 0 && enforce_wifi !== false) {
            res.status(400).json({
                status: 'fail',
                message: 'Cần ít nhất 1 IP/CIDR khi bật kiểm tra WiFi',
            });
            return;
        }

        const row = {
            id: 1,
            allowed_ips: ips,
            office_name: (office_name ?? 'XOXO').trim() || 'XOXO',
            wifi_name: (wifi_name ?? 'XOXO / AURA').trim() || 'XOXO / AURA',
            office_address: office_address?.trim() || null,
            enforce_wifi: enforce_wifi !== false,
            updated_at: new Date().toISOString(),
            updated_by: req.user!.id,
        };

        const { data, error } = await supabase
            .from('attendance_settings')
            .upsert(row, { onConflict: 'id' })
            .select('allowed_ips, office_name, wifi_name, office_address, enforce_wifi, updated_at')
            .single();

        if (error) {
            if (error.message?.includes('attendance_settings') || error.code === '42P01') {
                res.status(500).json({
                    status: 'error',
                    message: 'Chưa tạo bảng attendance_settings. Chạy migration 20260806_attendance_settings.sql',
                });
                return;
            }
            throw error;
        }

        invalidateAttendanceSettingsCache();

        res.json({
            status: 'success',
            data: {
                allowed_ips: data.allowed_ips ?? [],
                office_name: data.office_name,
                wifi_name: data.wifi_name,
                office_address: data.office_address,
                enforce_wifi: data.enforce_wifi !== false,
                updated_at: data.updated_at,
            },
        });
    } catch (error) {
        next(error);
    }
});

export { router as attendanceSettingsRouter };
