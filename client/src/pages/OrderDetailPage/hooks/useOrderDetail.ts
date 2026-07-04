import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ordersApi, orderItemsApi } from '@/lib/api';
import type { Order } from '@/hooks/useOrders';

export function useOrderDetail(id: string | undefined) {
    const navigate = useNavigate();
    const [order, setOrder] = useState<Order | null>(null);
    const [loading, setLoading] = useState(true);
    const [allWorkflowSteps, setAllWorkflowSteps] = useState<any[]>([]);
    const [stepsLoading, setStepsLoading] = useState(false);
    const [productStatusSummary, setProductStatusSummary] = useState<any>(null);
    const [statusSummaryLoading, setStatusSummaryLoading] = useState(false);

    // Kanban logs (lịch sử chuyển trạng thái từng tab)
    const [salesLogs, setSalesLogs] = useState<any[]>([]);
    const [workflowLogs, setWorkflowLogs] = useState<any[]>([]);
    const [aftersaleLogs, setAftersaleLogs] = useState<any[]>([]);
    const [careLogs, setCareLogs] = useState<any[]>([]);

    const fetchKanbanLogs = useCallback(async (orderId: string) => {
        try {
            const [salesRes, workflowRes, aftersaleRes, careRes] = await Promise.all([
                ordersApi.getKanbanLogs(orderId, 'sales'),
                ordersApi.getKanbanLogs(orderId, 'workflow'),
                ordersApi.getKanbanLogs(orderId, 'aftersale'),
                ordersApi.getKanbanLogs(orderId, 'care'),
            ]);
            setSalesLogs(salesRes.data?.data?.logs ?? []);
            setWorkflowLogs(workflowRes.data?.data?.logs ?? []);
            setAftersaleLogs(aftersaleRes.data?.data?.logs ?? []);
            setCareLogs(careRes.data?.data?.logs ?? []);
        } catch {
            // ignore
        }
    }, []);

    // Fetch all workflow steps for given items
    const fetchWorkflowSteps = useCallback(async (items: any[]) => {
        if (!items || items.length === 0) return;

        setStepsLoading(true);
        try {
            const allSteps: any[] = [];
            for (const item of items) {
                if (item.item_type === 'service' || item.item_type === 'package') {
                    try {
                        const response = await orderItemsApi.getSteps(item.id);
                        if (response.data?.data) {
                            const stepsWithItem = (response.data.data as any[]).map(step => ({
                                ...step,
                                item_name: item.item_name,
                                item_id: item.id
                            }));
                            allSteps.push(...stepsWithItem);
                        }
                    } catch (e) {
                        console.error('Error fetching steps for item:', item.id, e);
                    }
                }
            }
            setAllWorkflowSteps(allSteps);
        } catch (error) {
            console.error('Error fetching workflow steps:', error);
        } finally {
            setStepsLoading(false);
        }
    }, []);

    // Reload order data
    const reloadOrder = useCallback(async () => {
        if (!id) return null;
        try {
            const response = await ordersApi.getById(id);
            const orderData = response.data?.data?.order;
            if (orderData && orderData.id) {
                setOrder(orderData);
                // Also fetch steps immediately
                if (orderData.items) {
                    fetchWorkflowSteps(orderData.items);
                }
                await fetchKanbanLogs(orderData.id);
                return orderData;
            }
            return null;
        } catch {
            console.error('Error reloading order');
            return null;
        }
    }, [id, fetchWorkflowSteps, fetchKanbanLogs]);

    // Initial fetch
    useEffect(() => {
        if (!id) {
            navigate('/orders');
            return;
        }

        const fetchOrder = async () => {
            setLoading(true);
            try {
                const response = await ordersApi.getById(id);
                const orderData = response.data?.data?.order;
                if (orderData && orderData.id) {
                    setOrder(orderData);
                } else {
                    toast.error('Không tìm thấy đơn hàng');
                    navigate('/orders');
                }
            } catch {
                toast.error('Lỗi khi tải thông tin đơn hàng');
                navigate('/orders');
            } finally {
                setLoading(false);
            }
        };

        fetchOrder();
    }, [id, navigate]);

    // Fetch all workflow steps for this order's items (service + package)
    useEffect(() => {
        if (order?.items) {
            fetchWorkflowSteps(order.items);
        }
    }, [order?.items, fetchWorkflowSteps]);

    // Fetch kanban logs
    useEffect(() => {
        if (order?.id) fetchKanbanLogs(order.id);
    }, [order?.id, fetchKanbanLogs]);

    // Auto-refresh when window regains focus (e.g., after completing task in another tab)
    useEffect(() => {
        const handleFocus = () => {
            reloadOrder();
        };

        window.addEventListener('focus', handleFocus);
        return () => window.removeEventListener('focus', handleFocus);
    }, [reloadOrder]);

    return {
        order,
        setOrder,
        loading,
        allWorkflowSteps,
        stepsLoading,
        productStatusSummary,
        setProductStatusSummary,
        statusSummaryLoading,
        setStatusSummaryLoading,
        salesLogs,
        workflowLogs,
        aftersaleLogs,
        careLogs,
        reloadOrder,
        fetchKanbanLogs,
    };
}
