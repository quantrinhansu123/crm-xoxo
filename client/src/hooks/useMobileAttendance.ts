import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { getCurrentPosition, GeoLocationError } from '@/lib/geolocation';
import { isWithinClientGeofence } from '@/lib/attendanceConfig';
import { reverseGeocode } from '@/lib/reverseGeocode';
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
        address: string | null;
        lat: number;
        lng: number;
        radius_m: number;
    } | null;
}

export interface LiveLocation {
    latitude: number;
    longitude: number;
    accuracyM: number;
    address: string | null;
    withinGeofence: boolean;
    loading: boolean;
    error: string | null;
}

export function useMobileAttendance() {
    const [today, setToday] = useState<MobileAttendanceToday | null>(null);
    const [loading, setLoading] = useState(true);
    const [punching, setPunching] = useState(false);
    const [location, setLocation] = useState<LiveLocation>({
        latitude: 0,
        longitude: 0,
        accuracyM: 0,
        address: null,
        withinGeofence: false,
        loading: true,
        error: null,
    });

    const fetchToday = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get('/timesheets/mobile/today');
            setToday(res.data?.data ?? null);
        } catch (err) {
            console.error('fetch mobile attendance:', err);
            setToday(null);
        } finally {
            setLoading(false);
        }
    }, []);

    const refreshLocation = useCallback(async () => {
        setLocation((prev) => ({ ...prev, loading: true, error: null }));
        try {
            const pos = await getCurrentPosition();
            const within = isWithinClientGeofence(pos.latitude, pos.longitude);
            const address = await reverseGeocode(pos.latitude, pos.longitude);
            setLocation({
                latitude: pos.latitude,
                longitude: pos.longitude,
                accuracyM: pos.accuracyM,
                address,
                withinGeofence: within,
                loading: false,
                error: null,
            });
        } catch (err) {
            const message = err instanceof GeoLocationError ? err.message : 'Không lấy được vị trí GPS';
            setLocation((prev) => ({
                ...prev,
                loading: false,
                error: message,
            }));
        }
    }, []);

    const punch = useCallback(
        async (action: 'check_in' | 'check_out') => {
            setPunching(true);
            try {
                const pos = await getCurrentPosition();
                const address = await reverseGeocode(pos.latitude, pos.longitude);
                const res = await api.post('/timesheets/mobile/punch', {
                    action,
                    latitude: pos.latitude,
                    longitude: pos.longitude,
                    accuracy_m: pos.accuracyM,
                    address,
                });
                await fetchToday();
                return res.data?.data;
            } finally {
                setPunching(false);
            }
        },
        [fetchToday],
    );

    useEffect(() => {
        fetchToday();
        refreshLocation();
    }, [fetchToday, refreshLocation]);

    return {
        today,
        loading,
        punching,
        location,
        fetchToday,
        refreshLocation,
        punch,
    };
}
