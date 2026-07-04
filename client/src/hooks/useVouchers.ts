import { useState, useCallback } from 'react';
import { vouchersApi } from '@/lib/api';
import type { Voucher } from '@/types';

export function useVouchers() {
    const [vouchers, setVouchers] = useState<Voucher[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchVouchers = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const response = await vouchersApi.getAll();
            if (response.data?.data?.vouchers) {
                setVouchers(response.data.data.vouchers);
            }
        } catch (err) {
            const error = err as { response?: { data?: { message?: string } } };
            setError(error.response?.data?.message || 'Lỗi khi tải danh sách voucher');
            console.error('Error fetching vouchers:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    const createVoucher = async (data: Omit<Voucher, 'id' | 'used_count'>) => {
        try {
            const response = await vouchersApi.create(data);
            if (response.data?.data?.voucher) {
                await fetchVouchers();
                return response.data.data.voucher;
            }
        } catch (err) {
            const error = err as { response?: { data?: { message?: string } } };
            throw new Error(error.response?.data?.message || 'Lỗi khi tạo voucher');
        }
    };

    const updateVoucher = async (id: string, data: Partial<Voucher>) => {
        try {
            const response = await vouchersApi.update(id, data);
            if (response.data?.data?.voucher) {
                await fetchVouchers();
                return response.data.data.voucher;
            }
        } catch (err) {
            const error = err as { response?: { data?: { message?: string } } };
            throw new Error(error.response?.data?.message || 'Lỗi khi cập nhật voucher');
        }
    };

    const deleteVoucher = async (id: string) => {
        try {
            await vouchersApi.delete(id);
            await fetchVouchers();
        } catch (err) {
            const error = err as { response?: { data?: { message?: string } } };
            throw new Error(error.response?.data?.message || 'Lỗi khi xóa voucher');
        }
    };

    return {
        vouchers,
        loading,
        error,
        fetchVouchers,
        createVoucher,
        updateVoucher,
        deleteVoucher,
    };
}
