import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { fetchWifiPublicIp, isLoopbackIp, isPublicIpv4 } from '@/lib/publicIp';
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

function mergeWifiIp(
    data: MobileAttendanceToday | null,
    publicIp: string | null,
): MobileAttendanceToday | null {
    if (!data) return null;
    if (!publicIp || !isPublicIpv4(publicIp)) return data;

    const serverIp = data.network?.client_ip ?? null;
    // Server local hay trả 127.0.0.1 → luôn ghi đè bằng IP WiFi public
    if (!serverIp || isLoopbackIp(serverIp) || !isPublicIpv4(serverIp)) {
        return {
            ...data,
            network: {
                client_ip: publicIp,
                observed_ip: data.network?.observed_ip ?? serverIp,
                // chưa biết khớp list trên client → để server quyết khi punch;
                // nếu server đã ok với cùng IP thì giữ
                wifi_ok:
                    data.network?.client_ip === publicIp
                        ? data.network?.wifi_ok ?? null
                        : data.network?.enforce
                          ? null
                          : data.network?.wifi_ok ?? null,
                enforce: Boolean(data.network?.enforce),
            },
        };
    }
    return data;
}

export function useMobileAttendance() {
    const [today, setToday] = useState<MobileAttendanceToday | null>(null);
    const [loading, setLoading] = useState(true);
    const [punching, setPunching] = useState(false);
    const [wifiPublicIp, setWifiPublicIp] = useState<string | null>(null);

    const fetchToday = useCallback(async () => {
        setLoading(true);
        try {
            const publicIp = await fetchWifiPublicIp();
            setWifiPublicIp(publicIp);

            const res = await api.get('/timesheets/mobile/today', {
                params: publicIp ? { public_ip: publicIp } : undefined,
                headers: publicIp ? { 'X-Wifi-Public-IP': publicIp } : undefined,
            });
            const raw = (res.data?.data ?? null) as MobileAttendanceToday | null;
            setToday(mergeWifiIp(raw, publicIp));
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
                const publicIp = (await fetchWifiPublicIp()) ?? wifiPublicIp;
                if (!publicIp) {
                    throw Object.assign(new Error('Không lấy được IP public của WiFi đang dùng'), {
                        response: {
                            data: {
                                message:
                                    'Không lấy được IP public của WiFi đang dùng. Kiểm tra mạng / tắt VPN rồi thử lại.',
                            },
                        },
                    });
                }
                setWifiPublicIp(publicIp);

                const res = await api.post(
                    '/timesheets/mobile/punch',
                    { action, public_ip: publicIp },
                    { headers: { 'X-Wifi-Public-IP': publicIp } },
                );
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
        [fetchToday, wifiPublicIp],
    );

    useEffect(() => {
        fetchToday();
    }, [fetchToday]);

    return {
        today,
        loading,
        punching,
        wifiPublicIp,
        fetchToday,
        punch,
    };
}
