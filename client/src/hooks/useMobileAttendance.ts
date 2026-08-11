import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { fetchWifiPublicIp } from '@/lib/publicIp';
import type { Timesheet } from '@/hooks/useTimesheets';

export interface MobileAttendanceToday {
    schedule_date: string;
    date_label: string;
    shift: { id: string; name: string; start_time: string; end_time: string } | null;
    timesheet: Timesheet | null;
    worked_duration: string;
    worked_minutes: number | null;
    can_check_in: boolean;
    can_check_out: boolean;
    office: {
        name: string;
        wifi_name: string;
        address: string | null;
    } | null;
    network: {
        client_ip: string | null;
        observed_ip?: string | null;
        wifi_ok: boolean | null;
        enforce: boolean;
    } | null;
}

export function useMobileAttendance() {
    const [today, setToday] = useState<MobileAttendanceToday | null>(null);
    const [loading, setLoading] = useState(true);
    const [punching, setPunching] = useState(false);

    const fetchToday = useCallback(async () => {
        setLoading(true);
        try {
            const publicIp = await fetchWifiPublicIp();
            const res = await api.get('/timesheets/mobile/today', {
                params: publicIp ? { public_ip: publicIp } : undefined,
            });
            setToday(res.data?.data ?? null);
        } catch (err) {
            console.error('fetch mobile attendance:', err);
            setToday(null);
        } finally {
            setLoading(false);
        }
    }, []);

    const punch = useCallback(
        async (action: 'check_in' | 'check_out') => {
            setPunching(true);
            try {
                const publicIp = await fetchWifiPublicIp();
                const res = await api.post('/timesheets/mobile/punch', {
                    action,
                    public_ip: publicIp,
                });
                await fetchToday();
                return res.data?.data as {
                    check_in_label?: string;
                    check_out_label?: string;
                    client_ip?: string | null;
                    wifi_ok?: boolean | null;
                };
            } catch (err) {
                throw err;
            } finally {
                setPunching(false);
            }
        },
        [fetchToday],
    );

    useEffect(() => {
        fetchToday();
    }, [fetchToday]);

    return {
        today,
        loading,
        punching,
        fetchToday,
        punch,
    };
}
