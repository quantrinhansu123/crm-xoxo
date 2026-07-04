import { useState, useCallback } from 'react';
import { productTypesApi } from '@/lib/api';
import { toast } from 'sonner';

export interface ProductType {
    id: string;
    name: string;
    code: string;
    description?: string;
    created_at: string;
}

export function useProductTypes() {
    const [productTypes, setProductTypes] = useState<ProductType[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchProductTypes = useCallback(async () => {
        setLoading(true);
        try {
            const response = await productTypesApi.getAll();
            setProductTypes(response.data.data || []);
            setError(null);
        } catch (err: any) {
            const message = err.response?.data?.error || 'Lỗi khi tải loại sản phẩm';
            setError(message);
            toast.error(message);
        } finally {
            setLoading(false);
        }
    }, []);

    const createProductType = useCallback(async (data: Partial<ProductType>) => {
        try {
            const response = await productTypesApi.create(data);
            const newType = response.data.data;
            setProductTypes(prev => [...prev, newType]);
            toast.success('Đã tạo loại sản phẩm thành công');
            return newType;
        } catch (err: any) {
            const message = err.response?.data?.error || 'Lỗi khi tạo loại sản phẩm';
            toast.error(message);
            throw err;
        }
    }, []);

    const updateProductType = useCallback(async (id: string, data: Partial<ProductType>) => {
        try {
            const response = await productTypesApi.update(id, data);
            const updatedType = response.data.data;
            setProductTypes(prev => prev.map(t => t.id === id ? updatedType : t));
            toast.success('Đã cập nhật loại sản phẩm thành công');
            return updatedType;
        } catch (err: any) {
            const message = err.response?.data?.error || 'Lỗi khi cập nhật loại sản phẩm';
            toast.error(message);
            throw err;
        }
    }, []);

    const deleteProductType = useCallback(async (id: string) => {
        try {
            await productTypesApi.delete(id);
            setProductTypes(prev => prev.filter(t => t.id !== id));
            toast.success('Đã xóa loại sản phẩm thành công');
        } catch (err: any) {
            const message = err.response?.data?.error || 'Lỗi khi xóa loại sản phẩm';
            toast.error(message);
            throw err;
        }
    }, []);

    return {
        productTypes,
        loading,
        error,
        fetchProductTypes,
        createProductType,
        updateProductType,
        deleteProductType
    };
}
