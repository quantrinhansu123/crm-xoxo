import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { ApiError } from '../middleware/errorHandler.js';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.js';
import { notifyFinanceEvent } from '../utils/financeNotifications.js';

const router = Router();

// Generate transaction code
async function generateTransactionCode(type: 'income' | 'expense'): Promise<string> {
    const prefix = type === 'income' ? 'PT' : 'PC';

    const { data: transactions } = await supabaseAdmin
        .from('transactions')
        .select('code')
        .like('code', `${prefix}%`)
        .order('created_at', { ascending: false })
        .limit(100);

    let maxNumber = 0;
    if (transactions && transactions.length > 0) {
        for (const trans of transactions) {
            const numStr = trans.code.replace(prefix, '');
            const num = parseInt(numStr, 10);
            if (!isNaN(num) && num > maxNumber) maxNumber = num;
        }
    }

    return `${prefix}${String(maxNumber + 1).padStart(6, '0')}`;
}

// Get all transactions
router.get('/', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { type, status, search, payment_method, category, page = 1, limit = 50, start_date, end_date } = req.query;
        const offset = (Number(page) - 1) * Number(limit);

        let query = supabaseAdmin
            .from('transactions')
            .select(`
                *,
                created_by_user:users!transactions_created_by_fkey(id, name, avatar),
                approved_by_user:users!transactions_approved_by_fkey(id, name)
            `, { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(offset, offset + Number(limit) - 1);

        if (type) query = query.eq('type', type);
        if (status) query = query.eq('status', status);
        if (payment_method && payment_method !== 'all') query = query.eq('payment_method', payment_method);
        if (category && category !== 'all') query = query.eq('category', category);
        if (search) {
            query = query.or(`code.ilike.%${search}%,category.ilike.%${search}%,notes.ilike.%${search}%`);
        }
        if (start_date) query = query.gte('date', start_date);
        if (end_date) query = query.lte('date', end_date);

        const { data: transactions, error, count } = await query;
        
        if (error) {
            console.error('Error fetching transactions:', error);
            throw new ApiError('Lỗi khi lấy danh sách giao dịch', 500);
        }

        // Enrich transactions with order + customer data (batch fetch)
        const enrichedTransactions = transactions || [];
        const orderIds = [...new Set(enrichedTransactions.filter(t => t.order_id).map(t => t.order_id))];
        const productIds = [
            ...new Set(
                enrichedTransactions
                    .map((t) => t.order_product_id as string | undefined)
                    .filter(Boolean) as string[]
            ),
        ];

        if (orderIds.length > 0) {
            const { data: orders, error: ordersError } = await supabaseAdmin
                .from('orders')
                .select(`
                    id, 
                    order_code, 
                    customer_id,
                    customer:customers(id, name, phone)
                `)
                .in('id', orderIds);
            
            if (!ordersError && orders) {
                const orderMap = new Map(orders.map(o => {
                    const orderItem = { ...o };
                    // Handle array format from Supabase join
                    if (Array.isArray(orderItem.customer)) {
                        (orderItem as any).customer = orderItem.customer[0];
                    }
                    return [orderItem.id, orderItem];
                }));
                
                for (const trans of enrichedTransactions) {
                    if (trans.order_id && orderMap.has(trans.order_id)) {
                        (trans as any).order = orderMap.get(trans.order_id);
                    }
                }
            }
        }

        if (productIds.length > 0) {
            const { data: products } = await supabaseAdmin
                .from('order_products')
                .select('id, product_code, name, images')
                .in('id', productIds);

            const productMap = new Map((products || []).map((p) => [p.id, p]));
            for (const trans of enrichedTransactions) {
                const pid = trans.order_product_id as string | undefined;
                if (pid && productMap.has(pid)) {
                    (trans as any).order_product = productMap.get(pid);
                } else if (trans.metadata?.product_code) {
                    (trans as any).order_product = {
                        product_code: trans.metadata.product_code,
                        name: trans.metadata.product_name || null,
                    };
                }
            }
        }

        res.json({
            status: 'success',
            data: {
                transactions: enrichedTransactions,
                pagination: {
                    page: Number(page),
                    limit: Number(limit),
                    total: count || 0,
                    totalPages: Math.ceil((count || 0) / Number(limit)),
                }
            },
        });
    } catch (error) {
        next(error);
    }
});

// Get transaction summary (totals)
router.get('/summary', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { start_date, end_date, payment_method, category, status, search } = req.query;

        // Base queries
        const getBaseQuery = () => supabaseAdmin.from('transactions');

        let incomeQuery = getBaseQuery().select('amount').eq('type', 'income').eq('status', 'approved');
        let expenseQuery = getBaseQuery().select('amount').eq('type', 'expense').eq('status', 'approved');
        let incomeCountQuery = getBaseQuery().select('*', { count: 'exact', head: true }).eq('type', 'income');
        let expenseCountQuery = getBaseQuery().select('*', { count: 'exact', head: true }).eq('type', 'expense');
        let pendingIncomeQuery = getBaseQuery().select('*', { count: 'exact', head: true }).eq('type', 'income').eq('status', 'pending');
        let pendingExpenseQuery = getBaseQuery().select('*', { count: 'exact', head: true }).eq('type', 'expense').eq('status', 'pending');

        // Apply shared filters
        const queries = [
            incomeQuery, expenseQuery, 
            incomeCountQuery, expenseCountQuery,
            pendingIncomeQuery, pendingExpenseQuery
        ];
        
        for (let q of queries) {
            if (start_date) q.gte('date', start_date);
            if (end_date) q.lte('date', end_date);
            if (payment_method && payment_method !== 'all') q.eq('payment_method', payment_method);
            if (category && category !== 'all') q.eq('category', category);
            if (status && status !== 'all') q.eq('status', status);
            if (search) {
                q.or(`code.ilike.%${search}%,category.ilike.%${search}%,notes.ilike.%${search}%`);
            }
        }

        const [incomeRes, expenseRes, incomeCountRes, expenseCountRes, pIncRes, pExpRes] = await Promise.all([
            incomeQuery,
            expenseQuery,
            incomeCountQuery,
            expenseCountQuery,
            pendingIncomeQuery,
            pendingExpenseQuery
        ]);

        // Check for any errors
        const errors = [incomeRes, expenseRes, incomeCountRes, expenseCountRes, pIncRes, pExpRes]
            .filter(r => r.error)
            .map(r => r.error);
        
        if (errors.length > 0) {
            console.error('Error fetching summary data:', errors);
            throw new ApiError('Lỗi khi lấy dữ liệu tổng hợp', 500);
        }

        const totalIncome = (incomeRes.data || []).reduce((sum: number, t: any) => sum + Number(t.amount || 0), 0);
        const totalExpense = (expenseRes.data || []).reduce((sum: number, t: any) => sum + Number(t.amount || 0), 0);

        res.json({
            status: 'success',
            data: {
                totalIncome,
                totalExpense,
                balance: totalIncome - totalExpense,
                incomeCount: incomeCountRes.count || 0,
                expenseCount: expenseCountRes.count || 0,
                pendingIncomeCount: pIncRes.count || 0,
                pendingExpenseCount: pExpRes.count || 0,
            },
        });
    } catch (error) {
        next(error);
    }
});

// Get transaction by ID
router.get('/:id', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;

        const { data: transaction, error } = await supabaseAdmin
            .from('transactions')
            .select(`
                *,
                created_by_user:users!transactions_created_by_fkey(id, name, avatar),
                approved_by_user:users!transactions_approved_by_fkey(id, name)
            `)
            .eq('id', id)
            .single();

        if (error || !transaction) {
            throw new ApiError('Không tìm thấy giao dịch', 404);
        }

        // Enrich with order + customer data
        if (transaction.order_id) {
            const { data: order } = await supabaseAdmin
                .from('orders')
                .select('id, order_code, customer:customers(id, name, phone)')
                .eq('id', transaction.order_id)
                .single();
            
            if (order) {
                (transaction as any).order = order;
            }
        }

        res.json({
            status: 'success',
            data: { transaction },
        });
    } catch (error) {
        next(error);
    }
});

// Create transaction
router.post('/', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const {
            type,
            category,
            amount,
            payment_method,
            notes,
            image_url,
            date,
            order_id,
            order_code,
            order_product_id,
            metadata,
        } = req.body;

        if (!type || !category || !amount) {
            throw new ApiError('Loại, danh mục và số tiền là bắt buộc', 400);
        }

        if (!['income', 'expense'].includes(type)) {
            throw new ApiError('Loại giao dịch không hợp lệ', 400);
        }

        const code = await generateTransactionCode(type);

        let resolvedOrderId = order_id || null;
        let resolvedOrderCode = order_code || null;
        let resolvedProductId = order_product_id || null;
        let productCode: string | null = null;

        if (resolvedProductId) {
            const { data: op } = await supabaseAdmin
                .from('order_products')
                .select('id, product_code, order_id, order:orders(id, order_code)')
                .eq('id', resolvedProductId)
                .single();

            if (!op) {
                throw new ApiError('Không tìm thấy sản phẩm đơn hàng', 400);
            }
            productCode = op.product_code;
            resolvedProductId = op.id;
            resolvedOrderId = op.order_id;
            const orderRow = Array.isArray(op.order) ? op.order[0] : op.order;
            resolvedOrderCode = orderRow?.order_code || resolvedOrderCode;
        }

        const mergedMetadata =
            metadata && typeof metadata === 'object'
                ? { ...metadata, ...(productCode ? { product_code: productCode } : {}) }
                : productCode
                  ? { product_code: productCode }
                  : {};

        const insertPayload: Record<string, unknown> = {
            code,
            type,
            category,
            amount,
            payment_method: payment_method || 'cash',
            notes,
            image_url,
            date: date || new Date().toISOString().split('T')[0],
            order_id: resolvedOrderId,
            order_code: resolvedOrderCode,
            order_product_id: resolvedProductId,
            metadata: mergedMetadata,
            status: req.body.status || 'pending',
            created_by: req.user!.id,
            approved_by: req.body.status === 'approved' ? req.user!.id : null,
            approved_at: req.body.status === 'approved' ? new Date().toISOString() : null,
        };

        let { data: transaction, error } = await supabaseAdmin
            .from('transactions')
            .insert(insertPayload)
            .select(`
                *,
                created_by_user:users!transactions_created_by_fkey(id, name, avatar)
            `)
            .single();

        if (error && String(error.message || '').includes('order_product_id')) {
            const { order_product_id: _op, ...legacyPayload } = insertPayload;
            const retry = await supabaseAdmin
                .from('transactions')
                .insert(legacyPayload)
                .select(`
                    *,
                    created_by_user:users!transactions_created_by_fkey(id, name, avatar)
                `)
                .single();
            transaction = retry.data;
            error = retry.error;
        }

        if (error) {
            console.error('Error creating transaction:', error);
            throw new ApiError('Lỗi khi tạo giao dịch: ' + error.message, 500);
        }

        const transactionLabel = type === 'income' ? 'phiếu thu' : 'phiếu chi';
        notifyFinanceEvent({
            event: type === 'income' ? 'receipt.created' : 'payment_voucher.created',
            title: type === 'income' ? 'Phiếu thu mới' : 'Phiếu chi mới',
            message: `${req.user!.name} đã tạo ${transactionLabel} ${transaction.code}`,
            actor: req.user!,
            recipientUserIds: [transaction.created_by],
            data: {
                transaction_id: transaction.id,
                receipt_id: type === 'income' ? transaction.id : null,
                payment_voucher_id: type === 'expense' ? transaction.id : null,
                code: transaction.code,
                type: transaction.type,
                category: transaction.category,
                amount: transaction.amount,
                payment_method: transaction.payment_method,
                status: transaction.status,
                order_id: transaction.order_id,
                order_code: transaction.order_code,
                notes: transaction.notes,
            },
        });

        res.status(201).json({
            status: 'success',
            data: { transaction },
            message: `Đã tạo phiếu ${type === 'income' ? 'thu' : 'chi'} ${code}`,
        });
    } catch (error) {
        next(error);
    }
});

// Update transaction status (approve/cancel)
router.patch('/:id/status', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!['approved', 'cancelled', 'pending'].includes(status)) {
            throw new ApiError('Trạng thái không hợp lệ', 400);
        }

        if (status === 'approved' || status === 'cancelled') {
            const role = req.user?.role;
            if (role !== 'admin' && role !== 'manager') {
                throw new ApiError('Chỉ quản lý mới được duyệt/hủy phiếu thu chi', 403);
            }
        }

        const updateData: any = {
            status,
            updated_at: new Date().toISOString(),
        };

        if (status === 'approved') {
            updateData.approved_by = req.user!.id;
            updateData.approved_at = new Date().toISOString();
        }

        const { data: transaction, error } = await supabaseAdmin
            .from('transactions')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            throw new ApiError('Lỗi khi cập nhật trạng thái', 500);
        }

        if ((status === 'approved' || status === 'cancelled') && transaction) {
            const transactionLabel = transaction.type === 'income' ? 'phiếu thu' : 'phiếu chi';
            notifyFinanceEvent({
                event: status === 'approved' ? 'transaction.approved' : 'transaction.cancelled',
                title: status === 'approved' ? 'Phiếu thu/chi đã duyệt' : 'Phiếu thu/chi đã hủy',
                message: `${req.user!.name} đã ${status === 'approved' ? 'duyệt' : 'hủy'} ${transactionLabel} ${transaction.code}`,
                actor: req.user!,
                recipientUserIds: [transaction.created_by, transaction.approved_by],
                data: {
                    transaction_id: transaction.id,
                    code: transaction.code,
                    type: transaction.type,
                    category: transaction.category,
                    amount: transaction.amount,
                    payment_method: transaction.payment_method,
                    status: transaction.status,
                    order_id: transaction.order_id,
                    order_code: transaction.order_code,
                    notes: transaction.notes,
                },
            });
        }

        res.json({
            status: 'success',
            data: { transaction },
            message: status === 'approved' ? 'Đã duyệt phiếu' : status === 'cancelled' ? 'Đã hủy phiếu' : 'Đã cập nhật',
        });
    } catch (error) {
        next(error);
    }
});

// Update transaction
router.put('/:id', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;
        const { category, amount, payment_method, notes, image_url, date } = req.body;

        // Only allow updating pending transactions
        const { data: existing } = await supabaseAdmin
            .from('transactions')
            .select('status')
            .eq('id', id)
            .single();

        if (existing?.status !== 'pending') {
            throw new ApiError('Chỉ có thể sửa phiếu đang chờ duyệt', 400);
        }

        const { data: transaction, error } = await supabaseAdmin
            .from('transactions')
            .update({
                category,
                amount,
                payment_method,
                notes,
                image_url,
                date,
                updated_at: new Date().toISOString(),
            })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            throw new ApiError('Lỗi khi cập nhật giao dịch', 500);
        }

        res.json({
            status: 'success',
            data: { transaction },
        });
    } catch (error) {
        next(error);
    }
});

// Delete transaction
router.delete('/:id', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;

        // Only allow deleting pending transactions
        const { data: existing } = await supabaseAdmin
            .from('transactions')
            .select('status')
            .eq('id', id)
            .single();

        if (existing?.status !== 'pending') {
            throw new ApiError('Chỉ có thể xóa phiếu đang chờ duyệt', 400);
        }

        // Instead of deleting, we update the status to cancelled as requested
        const { error } = await supabaseAdmin
            .from('transactions')
            .update({ 
                status: 'cancelled',
                updated_at: new Date().toISOString()
            })
            .eq('id', id);

        if (error) {
            throw new ApiError('Lỗi khi hủy giao dịch', 500);
        }

        res.json({
            status: 'success',
            message: 'Đã hủy phiếu',
        });
    } catch (error) {
        next(error);
    }
});

export { router as transactionsRouter };
