import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { ApiError } from '../middleware/errorHandler.js';
import { authenticate, AuthenticatedRequest, requireAccountant, requireManager } from '../middleware/auth.js';
import { notifyFinanceEvent } from '../utils/financeNotifications.js';

const router = Router();

// Get all finance transactions (income/expense)
router.get('/transactions', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { type, status, category, from_date, to_date, page = 1, limit = 20 } = req.query;
        const offset = (Number(page) - 1) * Number(limit);

        let query = supabaseAdmin
            .from('finance_transactions')
            .select(`
        *,
        created_user:users!finance_transactions_created_by_fkey(id, name),
        approved_user:users!finance_transactions_approved_by_fkey(id, name)
      `, { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(offset, offset + Number(limit) - 1);

        if (type) query = query.eq('type', type);
        if (status) query = query.eq('status', status);
        if (category) query = query.eq('category', category);
        if (from_date) query = query.gte('created_at', from_date);
        if (to_date) query = query.lte('created_at', to_date);

        const { data: transactions, error, count } = await query;

        if (error) {
            throw new ApiError('Lỗi khi lấy danh sách giao dịch', 500);
        }

        res.json({
            status: 'success',
            data: {
                transactions,
                pagination: {
                    page: Number(page),
                    limit: Number(limit),
                    total: count || 0,
                }
            },
        });
    } catch (error) {
        next(error);
    }
});

// Create income transaction (phiếu thu)
router.post('/income', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { amount, category, description, customer_id, invoice_id, payment_method } = req.body;

        if (!amount || !category) {
            throw new ApiError('Số tiền và danh mục là bắt buộc', 400);
        }

        const transactionCode = `PT${Date.now().toString().slice(-8)}`;

        const { data: transaction, error } = await supabaseAdmin
            .from('finance_transactions')
            .insert({
                code: transactionCode,
                type: 'income',
                amount,
                category,
                description,
                customer_id,
                invoice_id,
                payment_method: payment_method || 'cash',
                status: 'pending',
                created_by: req.user!.id,
            })
            .select()
            .single();

        if (error) {
            throw new ApiError('Lỗi khi tạo phiếu thu: ' + error.message, 500);
        }

        notifyFinanceEvent({
            event: 'receipt.created',
            title: 'Phiếu thu mới',
            message: `${req.user!.name} đã tạo phiếu thu ${transaction.code}`,
            actor: req.user!,
            recipientUserIds: [transaction.created_by],
            data: {
                transaction_id: transaction.id,
                code: transaction.code,
                type: transaction.type,
                category: transaction.category,
                amount: transaction.amount,
                payment_method: transaction.payment_method,
                status: transaction.status,
                customer_id: transaction.customer_id,
                invoice_id: transaction.invoice_id,
                description: transaction.description,
            },
        });

        res.status(201).json({
            status: 'success',
            data: { transaction },
        });
    } catch (error) {
        next(error);
    }
});

// Create expense transaction (phiếu chi)
router.post('/expense', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { amount, category, description, supplier, payment_method } = req.body;

        if (!amount || !category) {
            throw new ApiError('Số tiền và danh mục là bắt buộc', 400);
        }

        const transactionCode = `PC${Date.now().toString().slice(-8)}`;

        const { data: transaction, error } = await supabaseAdmin
            .from('finance_transactions')
            .insert({
                code: transactionCode,
                type: 'expense',
                amount,
                category,
                description,
                supplier,
                payment_method: payment_method || 'cash',
                status: 'pending',
                created_by: req.user!.id,
            })
            .select()
            .single();

        if (error) {
            throw new ApiError('Lỗi khi tạo phiếu chi: ' + error.message, 500);
        }

        notifyFinanceEvent({
            event: 'payment_voucher.created',
            title: 'Phiếu chi mới',
            message: `${req.user!.name} đã tạo phiếu chi ${transaction.code}`,
            actor: req.user!,
            recipientUserIds: [transaction.created_by],
            data: {
                transaction_id: transaction.id,
                code: transaction.code,
                type: transaction.type,
                category: transaction.category,
                amount: transaction.amount,
                payment_method: transaction.payment_method,
                status: transaction.status,
                supplier: transaction.supplier,
                description: transaction.description,
            },
        });

        res.status(201).json({
            status: 'success',
            data: { transaction },
        });
    } catch (error) {
        next(error);
    }
});

// Approve transaction
router.patch('/transactions/:id/approve', authenticate, requireAccountant, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;

        const { data: transaction, error } = await supabaseAdmin
            .from('finance_transactions')
            .update({
                status: 'approved',
                approved_by: req.user!.id,
                approved_at: new Date().toISOString(),
            })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            throw new ApiError('Lỗi khi duyệt giao dịch', 500);
        }

        notifyFinanceEvent({
            event: 'finance.transaction.approved',
            title: 'Phiếu thu/chi đã duyệt',
            message: `${req.user!.name} đã duyệt ${transaction.type === 'income' ? 'phiếu thu' : 'phiếu chi'} ${transaction.code}`,
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
            },
        });

        res.json({
            status: 'success',
            data: { transaction },
        });
    } catch (error) {
        next(error);
    }
});

// Reject transaction
router.patch('/transactions/:id/reject', authenticate, requireAccountant, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;

        const { data: transaction, error } = await supabaseAdmin
            .from('finance_transactions')
            .update({
                status: 'rejected',
                approved_by: req.user!.id,
                approved_at: new Date().toISOString(),
                notes: reason,
            })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            throw new ApiError('Lỗi khi từ chối giao dịch', 500);
        }

        notifyFinanceEvent({
            event: 'finance.transaction.rejected',
            title: 'Phiếu thu/chi bị từ chối',
            message: `${req.user!.name} đã từ chối ${transaction.type === 'income' ? 'phiếu thu' : 'phiếu chi'} ${transaction.code}`,
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
                reason,
            },
        });

        res.json({
            status: 'success',
            data: { transaction },
        });
    } catch (error) {
        next(error);
    }
});

// Get finance summary
router.get('/summary', authenticate, requireAccountant, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { from_date, to_date } = req.query;

        let incomeQuery = supabaseAdmin
            .from('finance_transactions')
            .select('amount')
            .eq('type', 'income')
            .eq('status', 'approved');

        let expenseQuery = supabaseAdmin
            .from('finance_transactions')
            .select('amount')
            .eq('type', 'expense')
            .eq('status', 'approved');

        if (from_date) {
            incomeQuery = incomeQuery.gte('created_at', from_date);
            expenseQuery = expenseQuery.gte('created_at', from_date);
        }
        if (to_date) {
            incomeQuery = incomeQuery.lte('created_at', to_date);
            expenseQuery = expenseQuery.lte('created_at', to_date);
        }

        const [incomeResult, expenseResult] = await Promise.all([
            incomeQuery,
            expenseQuery,
        ]);

        const totalIncome = incomeResult.data?.reduce((sum, t) => sum + t.amount, 0) || 0;
        const totalExpense = expenseResult.data?.reduce((sum, t) => sum + t.amount, 0) || 0;
        const profit = totalIncome - totalExpense;

        res.json({
            status: 'success',
            data: {
                totalIncome,
                totalExpense,
                profit,
                profitMargin: totalIncome > 0 ? ((profit / totalIncome) * 100).toFixed(2) : 0,
            },
        });
    } catch (error) {
        next(error);
    }
});

export { router as financeRouter };
