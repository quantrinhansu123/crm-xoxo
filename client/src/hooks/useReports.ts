import { useState, useCallback } from 'react';
import { reportsApi } from '@/lib/api';

export function useReports() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchRevenueReport = useCallback(async (params?: { from_date?: string; to_date?: string; group_by?: string }) => {
        setLoading(true);
        try {
            const response = await reportsApi.getRevenue(params);
            return response.data.data;
        } catch (err: any) {
            setError(err.response?.data?.message || 'Lỗi khi tải báo cáo');
            return null;
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchSalesReport = useCallback(async (params?: { from_date?: string; to_date?: string }) => {
        setLoading(true);
        try {
            const response = await reportsApi.getSales(params);
            return response.data.data;
        } catch (err: any) {
            setError(err.response?.data?.message || 'Lỗi khi tải báo cáo');
            return null;
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchCustomersReport = useCallback(async (params?: { from_date?: string; to_date?: string }) => {
        setLoading(true);
        try {
            const response = await reportsApi.getCustomers(params);
            return response.data.data;
        } catch (err: any) {
            setError(err.response?.data?.message || 'Lỗi khi tải báo cáo');
            return null;
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchFinancialReport = useCallback(async (params?: { from_date?: string; to_date?: string }) => {
        setLoading(true);
        try {
            const response = await reportsApi.getFinancial(params);
            return response.data.data;
        } catch (err: any) {
            setError(err.response?.data?.message || 'Lỗi khi tải báo cáo');
            return null;
        } finally {
            setLoading(false);
        }
    }, []);

    return {
        loading,
        error,
        fetchRevenueReport,
        fetchSalesReport,
        fetchCustomersReport,
        fetchFinancialReport,
    };
}
