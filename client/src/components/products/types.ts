import type { Product as APIProduct, Service as APIService } from '@/hooks/useProducts';
import type { Package as APIPackage, Voucher as APIVoucher } from '@/types';

export interface DepartmentOption {
    id: string;
    code: string;
    name: string;
}

export interface ServiceDepartment {
    department_id: string;
    commission_sale: number;
    commission_tech: number;
    is_primary: boolean;
}

// Extended types for products
export interface Product extends APIProduct {
    hasInventory?: boolean;
    image?: string;
    commission_sale?: number;
    commission_tech?: number;
}

export interface ConsumableMaterial {
    productId: string;
    productName: string;
    quantity: number;
    unit: string;
}

export interface Service extends APIService {
    slaDefault?: number;
    commission_sale?: number;
    commission_tech?: number;
    consumables?: ConsumableMaterial[];
    department?: string;
    workflow_id?: string;
}

export interface ServicePackage extends APIPackage {
    validityDays?: number;
    commission_sale?: number;
    commission_tech?: number;
    totalPrice?: number;
    discountedPrice?: number;
    items?: any[];
}

export type { APIVoucher };

export const unitOptions = ['cái', 'bộ', 'gói', 'module', 'user/tháng', 'tháng', 'năm', 'lần', 'buổi', 'ngày'];
