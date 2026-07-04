import { useState, useCallback } from 'react';
import { productsApi, servicesApi } from '@/lib/api';

export interface Product {
    id: string;
    code: string;
    name: string;
    category?: string;
    price: number;
    cost?: number;
    unit: string;
    description?: string;
    stock: number;
    image?: string;
    commission_sale?: number;
    commission_tech?: number;
    commission_data?: Record<string, any>;
    status: string;
    created_at: string;
}

export interface Service {
    id: string;
    code: string;
    name: string;
    category?: string;
    price: number;
    duration?: number;
    description?: string;
    image?: string;
    commission_rate: number;
    commission_sale?: number;
    commission_tech?: number;
    commission_data?: Record<string, any>;
    department?: string; // Department ID for technician assignment
    workflow_id?: string; // Linked workflow for this service
    applicable_product_types?: string[];
    status: string;
    created_at: string;
}

export function useProducts() {
    const [products, setProducts] = useState<Product[]>([]);
    const [services, setServices] = useState<Service[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchProducts = useCallback(async (params?: { category?: string; status?: string; search?: string }) => {
        setLoading(true);
        try {
            const response = await productsApi.getAll(params);
            setProducts(response.data.data?.products || []);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Lỗi khi tải sản phẩm');
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchServices = useCallback(async (params?: { category?: string; status?: string; search?: string }) => {
        setLoading(true);
        try {
            const response = await servicesApi.getAll(params);
            setServices(response.data.data?.services || []);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Lỗi khi tải dịch vụ');
        } finally {
            setLoading(false);
        }
    }, []);

    const createProduct = useCallback(async (data: Partial<Product>): Promise<Product> => {
        const response = await productsApi.create(data);
        const newProduct = response.data.data!.product;
        setProducts(prev => [newProduct, ...prev]);
        return newProduct;
    }, []);

    const updateProduct = useCallback(async (id: string, data: Partial<Product>): Promise<Product> => {
        const response = await productsApi.update(id, data);
        const updated = response.data.data!.product;
        setProducts(prev => prev.map(p => p.id === id ? updated : p));
        return updated;
    }, []);

    const deleteProduct = useCallback(async (id: string): Promise<void> => {
        await productsApi.delete(id);
        setProducts(prev => prev.filter(p => p.id !== id));
    }, []);

    const createService = useCallback(async (data: Partial<Service>): Promise<Service> => {
        const response = await servicesApi.create(data);
        const newService = response.data.data!.service;
        setServices(prev => [newService, ...prev]);
        return newService;
    }, []);

    const updateService = useCallback(async (id: string, data: Partial<Service>): Promise<Service> => {
        const response = await servicesApi.update(id, data);
        const updated = response.data.data!.service;
        setServices(prev => prev.map(s => s.id === id ? updated : s));
        return updated;
    }, []);

    const deleteService = useCallback(async (id: string): Promise<void> => {
        await servicesApi.delete(id);
        setServices(prev => prev.filter(s => s.id !== id));
    }, []);

    return {
        products,
        services,
        loading,
        error,
        fetchProducts,
        fetchServices,
        createProduct,
        updateProduct,
        deleteProduct,
        createService,
        updateService,
        deleteService,
    };
}
