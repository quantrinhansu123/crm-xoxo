import { useCallback } from 'react';
import { toast } from 'sonner';
import { ordersApi, orderItemsApi, orderProductsApi } from '@/lib/api';
import { useOrders } from '@/hooks/useOrders';
import type { Order, OrderItem } from '@/hooks/useOrders';
import { pickOrderLevelAfterSalePatch } from '../constants';

export function useOrderActions(
    id: string | undefined,
    fetchOrders: () => Promise<void>,
    reloadOrder: () => Promise<void>
) {
    const { updateOrderStatus: updateStatusInList } = useOrders();

    const updateOrderStatus = useCallback(async (orderId: string, status: string) => {
        try {
            await ordersApi.updateStatus(orderId, status);
            toast.success('Cập nhật trạng thái đơn hàng thành công');
            await reloadOrder();
        } catch (error) {
            toast.error('Lỗi khi cập nhật trạng thái đơn hàng');
        }
    }, [reloadOrder]);

    const updateOrderAfterSale = useCallback(async (patch: Partial<Order>) => {
        if (!id) return;
        try {
            const safePatch = pickOrderLevelAfterSalePatch(patch as Record<string, unknown>);
            if (Object.keys(safePatch).length === 0) return;
            await ordersApi.patch(id, safePatch);
            await reloadOrder();
        } catch (error) {
            toast.error('Lỗi khi cập nhật thông tin After-sale');
        }
    }, [id, reloadOrder]);

    const updateItemAfterSaleData = useCallback(async (itemId: string, isCustomerItem: boolean, data: any) => {
        try {
            if (isCustomerItem) {
                await orderProductsApi.updateAfterSaleData(itemId, data);
            } else {
                await orderItemsApi.updateAfterSaleData(itemId, data);
            }
            await reloadOrder();
        } catch (error) {
            toast.error('Lỗi khi cập nhật thông tin After-sale sản phẩm');
        }
    }, [reloadOrder]);

    const updateOrderItemStatus = useCallback(async (itemId: string, status: string, reason?: string, photos?: string[], notes?: string) => {
        try {
            await orderItemsApi.updateStatus(itemId, status, reason, undefined, photos, notes);
            await reloadOrder();
        } catch (error) {
            toast.error('Lỗi khi cập nhật trạng thái hạng mục');
        }
    }, [reloadOrder]);

    const handleApproveOrder = useCallback(async (order: Order | null) => {
        if (!order?.items) return;

        const itemsToApprove = order.items.filter(item => {
            const hasCustomerItems = order.items?.some(i => (i as any).is_customer_item);
            if (hasCustomerItems && !(item as any).is_customer_item) return false;
            return item.status === 'step4';
        });

        if (itemsToApprove.length === 0) {
            toast.error('Không có hạng mục nào đang chờ phê duyệt');
            return;
        }

        try {
            await Promise.all(itemsToApprove.map(item => orderItemsApi.updateStatus(item.id, 'step5')));
            await ordersApi.updateStatus(order.id, 'in_progress');
            toast.success('Đã phê duyệt tất cả các hạng mục và xác nhận đơn hàng!');
            await reloadOrder();
            await fetchOrders();
        } catch (error) {
            console.error('Error approving items:', error);
            toast.error('Lỗi khi phê duyệt đơn hàng');
        }
    }, [reloadOrder, fetchOrders]);

    const handlePaymentSuccess = useCallback(async () => {
        toast.success('Thanh toán thành công!');
        await reloadOrder();
        await fetchOrders();
    }, [reloadOrder, fetchOrders]);

    return {
        updateOrderStatus,
        updateOrderAfterSale,
        updateItemAfterSaleData,
        updateOrderItemStatus,
        handleApproveOrder,
        handlePaymentSuccess,
    };
}
