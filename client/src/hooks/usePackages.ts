import { useState, useCallback } from 'react';
import { packagesApi } from '@/lib/api';
import type { Package } from '@/types';

export function usePackages() {
    const [packages, setPackages] = useState<Package[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchPackages = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const response = await packagesApi.getAll();
            if (response.data?.data?.packages) {
                setPackages(response.data.data.packages);
            }
        } catch (err) {
            const error = err as { response?: { data?: { message?: string } } };
            setError(error.response?.data?.message || 'Lỗi khi tải danh sách gói dịch vụ');
            console.error('Error fetching packages:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    const createPackage = async (data: Omit<Package, 'id'>) => {
        try {
            const response = await packagesApi.create(data);
            if (response.data?.data?.package) {
                await fetchPackages();
                return response.data.data.package;
            }
        } catch (err) {
            const error = err as { response?: { data?: { message?: string } } };
            throw new Error(error.response?.data?.message || 'Lỗi khi tạo gói dịch vụ');
        }
    };

    const updatePackage = async (id: string, data: Partial<Package>) => {
        try {
            const response = await packagesApi.update(id, data);
            if (response.data?.data?.package) {
                await fetchPackages();
                return response.data.data.package;
            }
        } catch (err) {
            const error = err as { response?: { data?: { message?: string } } };
            throw new Error(error.response?.data?.message || 'Lỗi khi cập nhật gói dịch vụ');
        }
    };

    const deletePackage = async (id: string) => {
        try {
            await packagesApi.delete(id);
            await fetchPackages();
        } catch (err) {
            const error = err as { response?: { data?: { message?: string } } };
            throw new Error(error.response?.data?.message || 'Lỗi khi xóa gói dịch vụ');
        }
    };

    return {
        packages,
        loading,
        error,
        fetchPackages,
        createPackage,
        updatePackage,
        deletePackage,
    };
}
