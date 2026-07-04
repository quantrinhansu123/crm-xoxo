import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { ApiError } from '../middleware/errorHandler.js';
import { authenticate, AuthenticatedRequest, requireManager } from '../middleware/auth.js';

const router = Router();

const WEEKDAY_LABELS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

function localDateStr(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function startOfDay(d: Date): Date {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
}

function endOfDay(d: Date): Date {
    const x = new Date(d);
    x.setHours(23, 59, 59, 999);
    return x;
}

function resolveChartRange(
    range: string,
    from_date?: string,
    to_date?: string
): { from: Date; to: Date; label: string } {
    if (from_date && to_date) {
        const from = startOfDay(new Date(from_date));
        const to = endOfDay(new Date(to_date));
        if (!Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime()) && from <= to) {
            const fmt = (s: string) => {
                const [y, m, d] = s.split('-');
                return `${d}/${m}/${y}`;
            };
            const label =
                from_date === to_date ? fmt(from_date) : `${fmt(from_date)} – ${fmt(to_date)}`;
            return { from, to, label };
        }
    }

    const now = new Date();
    const today = startOfDay(now);

    switch (range) {
        case 'today':
            return { from: today, to: endOfDay(now), label: 'Hôm nay' };
        case 'yesterday': {
            const y = new Date(today);
            y.setDate(y.getDate() - 1);
            return { from: y, to: endOfDay(y), label: 'Hôm qua' };
        }
        case 'last_week': {
            const from = new Date(today);
            from.setDate(from.getDate() - 6);
            return { from, to: endOfDay(now), label: '7 ngày qua' };
        }
        case 'this_month':
            return {
                from: new Date(now.getFullYear(), now.getMonth(), 1),
                to: endOfDay(now),
                label: 'Tháng này',
            };
        case 'custom':
            if (from_date && to_date) {
                return {
                    from: startOfDay(new Date(from_date)),
                    to: endOfDay(new Date(to_date)),
                    label: `${from_date} – ${to_date}`,
                };
            }
            break;
        case 'last_month':
        default: {
            const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const to = endOfDay(new Date(now.getFullYear(), now.getMonth(), 0));
            return { from, to, label: 'Tháng trước' };
        }
    }

    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const to = endOfDay(new Date(now.getFullYear(), now.getMonth(), 0));
    return { from, to, label: 'Tháng trước' };
}

function buildBucketLabels(
    groupBy: 'hour' | 'day' | 'weekday',
    from: Date,
    to: Date
): string[] {
    if (groupBy === 'hour') {
        return Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`);
    }
    if (groupBy === 'weekday') {
        return ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
    }
    const labels: string[] = [];
    const cursor = startOfDay(from);
    const end = startOfDay(to);
    while (cursor <= end) {
        labels.push(
            `${String(cursor.getDate()).padStart(2, '0')}/${String(cursor.getMonth() + 1).padStart(2, '0')}`
        );
        cursor.setDate(cursor.getDate() + 1);
    }
    return labels;
}

function getBucketKey(date: Date, groupBy: 'hour' | 'day' | 'weekday'): string {
    if (groupBy === 'hour') {
        return `${String(date.getHours()).padStart(2, '0')}:00`;
    }
    if (groupBy === 'weekday') {
        return WEEKDAY_LABELS[date.getDay()];
    }
    return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function fillSeries(
    labels: string[],
    buckets: Record<string, number>
): { label: string; value: number }[] {
    return labels.map((label) => ({ label, value: buckets[label] || 0 }));
}

// Dashboard widgets (today stats + charts)
router.get('/dashboard', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const {
            chart_range = 'last_month',
            from_date,
            to_date,
            group_by = 'day',
        } = req.query;

        const groupBy = (['hour', 'day', 'weekday'].includes(group_by as string)
            ? group_by
            : 'day') as 'hour' | 'day' | 'weekday';

        const now = new Date();
        const todayStart = startOfDay(now);
        const todayEnd = endOfDay(now);
        const todayDateStr = localDateStr(now);

        // —— Today: customers (from orders) ——
        const { data: todayOrders } = await supabaseAdmin
            .from('orders')
            .select('id, customer_id, created_at, customer:customers(id, type, created_at)')
            .gte('created_at', todayStart.toISOString())
            .lte('created_at', todayEnd.toISOString())
            .not('customer_id', 'is', null);

        const todayCustomerIds = [
            ...new Set((todayOrders || []).map((o) => o.customer_id).filter(Boolean)),
        ] as string[];

        let newCount = 0;
        let returningCount = 0;
        let retailCount = 0;

        if (todayCustomerIds.length > 0) {
            const { data: priorOrders } = await supabaseAdmin
                .from('orders')
                .select('customer_id')
                .in('customer_id', todayCustomerIds)
                .lt('created_at', todayStart.toISOString());

            const hadPrior = new Set((priorOrders || []).map((o) => o.customer_id));

            const customerMeta = new Map<string, { type?: string; created_at?: string }>();
            (todayOrders || []).forEach((o) => {
                const c = o.customer as { id?: string; type?: string; created_at?: string } | null;
                if (c?.id && !customerMeta.has(c.id)) {
                    customerMeta.set(o.customer_id, { type: c.type, created_at: c.created_at });
                }
            });

            todayCustomerIds.forEach((cid) => {
                const meta = customerMeta.get(cid);
                if (hadPrior.has(cid)) {
                    returningCount += 1;
                } else {
                    newCount += 1;
                }
                if (meta?.type === 'individual') {
                    retailCount += 1;
                }
            });
        }

        // —— Today: finance (transactions) ——
        const { data: todayTx } = await supabaseAdmin
            .from('transactions')
            .select('amount, type')
            .eq('status', 'approved')
            .gte('date', todayDateStr)
            .lte('date', todayDateStr);

        let totalIncome = 0;
        let totalExpense = 0;
        (todayTx || []).forEach((t) => {
            if (t.type === 'income') totalIncome += t.amount;
            else if (t.type === 'expense') totalExpense += t.amount;
        });

        // Mini bars: last 7 days income vs expense
        const miniFrom = new Date(todayStart);
        miniFrom.setDate(miniFrom.getDate() - 6);
        const { data: weekTx } = await supabaseAdmin
            .from('transactions')
            .select('amount, type, date')
            .eq('status', 'approved')
            .gte('date', localDateStr(miniFrom))
            .lte('date', todayDateStr);

        const miniBars: { date: string; income: number; expense: number }[] = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(miniFrom);
            d.setDate(d.getDate() + i);
            const ds = localDateStr(d);
            miniBars.push({ date: ds, income: 0, expense: 0 });
        }
        const miniMap = new Map(miniBars.map((b) => [b.date, b]));
        (weekTx || []).forEach((t) => {
            const row = miniMap.get(t.date);
            if (!row) return;
            if (t.type === 'income') row.income += t.amount;
            else if (t.type === 'expense') row.expense += t.amount;
        });

        // —— Charts ——
        const { from, to, label: rangeLabel } = resolveChartRange(
            chart_range as string,
            from_date as string | undefined,
            to_date as string | undefined
        );
        const bucketLabels = buildBucketLabels(groupBy, from, to);

        const { data: rangeOrders } = await supabaseAdmin
            .from('orders')
            .select('customer_id, created_at')
            .gte('created_at', from.toISOString())
            .lte('created_at', to.toISOString())
            .not('customer_id', 'is', null);

        const customerBuckets: Record<string, number> = {};
        const seenPerBucket: Record<string, Set<string>> = {};
        (rangeOrders || []).forEach((o) => {
            const key = getBucketKey(new Date(o.created_at), groupBy);
            if (!seenPerBucket[key]) seenPerBucket[key] = new Set();
            if (!seenPerBucket[key].has(o.customer_id)) {
                seenPerBucket[key].add(o.customer_id);
                customerBuckets[key] = (customerBuckets[key] || 0) + 1;
            }
        });
        const customerSeries = fillSeries(bucketLabels, customerBuckets);
        const customerVolumeTotal = customerSeries.reduce((s, p) => s + p.value, 0);

        const { data: rangeInvoices } = await supabaseAdmin
            .from('invoices')
            .select('total_amount, paid_at, created_at, status')
            .eq('status', 'paid')
            .gte('paid_at', from.toISOString())
            .lte('paid_at', to.toISOString());

        const { count: returnCount } = await supabaseAdmin
            .from('invoices')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'cancelled')
            .gte('created_at', from.toISOString())
            .lte('created_at', to.toISOString());

        const paidInvoices = rangeInvoices || [];
        const revenueBuckets: Record<string, number> = {};
        paidInvoices.forEach((inv) => {
            const key = getBucketKey(new Date(inv.paid_at || inv.created_at), groupBy);
            revenueBuckets[key] = (revenueBuckets[key] || 0) + inv.total_amount;
        });
        const revenueSeries = fillSeries(bucketLabels, revenueBuckets);
        const netRevenueTotal = paidInvoices.reduce((s, i) => s + i.total_amount, 0);

        res.json({
            status: 'success',
            data: {
                today: {
                    customers: {
                        total: todayCustomerIds.length,
                        newCount,
                        returningCount,
                        retailCount,
                    },
                    finance: {
                        net: totalIncome - totalExpense,
                        totalIncome,
                        totalExpense,
                        miniBars: miniBars.map((b) => ({
                            label: `${b.date.slice(8, 10)}/${b.date.slice(5, 7)}`,
                            income: b.income,
                            expense: b.expense,
                        })),
                    },
                },
                charts: {
                    rangeLabel,
                    fromDate: localDateStr(from),
                    toDate: localDateStr(to),
                    customerVolume: {
                        total: customerVolumeTotal,
                        series: customerSeries,
                    },
                    netRevenue: {
                        total: netRevenueTotal,
                        invoiceCount: paidInvoices.length,
                        returnCount: returnCount ?? 0,
                        series: revenueSeries,
                    },
                },
            },
        });
    } catch (error) {
        next(error);
    }
});

const COMPLETED_ORDER_STATUSES = ['done', 'completed', 'after_sale'];

// Dashboard 2: top staff, top products, appointments, activity
router.get('/dashboard-2', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const {
            staff_range = 'today',
            staff_from,
            staff_to,
            staff_metric = 'revenue',
            products_range = 'last_month',
            products_from,
            products_to,
            product_category = 'service',
        } = req.query;

        const staffPeriod = resolveChartRange(
            staff_range as string,
            staff_from as string | undefined,
            staff_to as string | undefined
        );
        const productsPeriod = resolveChartRange(
            products_range as string,
            products_from as string | undefined,
            products_to as string | undefined
        );

        const { data: staffOrders } = await supabaseAdmin
            .from('orders')
            .select('id, sales_id, created_at')
            .in('status', COMPLETED_ORDER_STATUSES)
            .gte('created_at', staffPeriod.from.toISOString())
            .lte('created_at', staffPeriod.to.toISOString());

        const staffOrderIds = (staffOrders || []).map((o) => o.id);
        const salesByOrder = new Map((staffOrders || []).map((o) => [o.id, o.sales_id]));

        type StaffRow = {
            id: string;
            name: string;
            serviceValue: number;
            salesValue: number;
            quantity: number;
            commission: number;
        };
        const staffMap = new Map<string, StaffRow>();

        const ensureStaff = (id: string, name: string) => {
            if (!staffMap.has(id)) {
                staffMap.set(id, {
                    id,
                    name,
                    serviceValue: 0,
                    salesValue: 0,
                    quantity: 0,
                    commission: 0,
                });
            }
            return staffMap.get(id)!;
        };

        if (staffOrderIds.length > 0) {
            const { data: orderItems } = await supabaseAdmin
                .from('order_items')
                .select(`
                    id, order_id, item_type, total_price, quantity, technician_id,
                    technician:users!order_items_technician_id_fkey(id, name)
                `)
                .in('order_id', staffOrderIds);

            (orderItems || []).forEach((item) => {
                const price = item.total_price || 0;
                const qty = item.quantity || 1;
                const isService = item.item_type === 'service' || item.item_type === 'package';
                const tech = item.technician as { id?: string; name?: string } | null;

                if (isService && item.technician_id && tech?.id) {
                    const row = ensureStaff(tech.id, tech.name || 'N/A');
                    row.serviceValue += price;
                    row.quantity += qty;
                }

                const salesId = salesByOrder.get(item.order_id);
                if (salesId && (item.item_type === 'product' || !isService)) {
                    const row = ensureStaff(salesId, 'N/A');
                    row.salesValue += price;
                    row.quantity += qty;
                }
            });

            const staffIds = [...staffMap.keys()];
            if (staffIds.length > 0) {
                const { data: users } = await supabaseAdmin
                    .from('users')
                    .select('id, name, commission')
                    .in('id', staffIds);

                (users || []).forEach((u) => {
                    const row = staffMap.get(u.id);
                    if (!row) return;
                    if (u.name) row.name = u.name;
                    const rate = u.commission ?? 5;
                    row.commission = ((row.serviceValue + row.salesValue) * rate) / 100;
                });
            }

        }

        const metric = staff_metric as string;
        const topStaff = [...staffMap.values()]
            .map((row) => ({
                ...row,
                total: row.serviceValue + row.salesValue,
            }))
            .sort((a, b) => {
                if (metric === 'quantity') return b.quantity - a.quantity;
                if (metric === 'commission') return b.commission - a.commission;
                return b.total - a.total;
            })
            .slice(0, 10);

        const { data: productOrders } = await supabaseAdmin
            .from('orders')
            .select('id')
            .in('status', COMPLETED_ORDER_STATUSES)
            .gte('created_at', productsPeriod.from.toISOString())
            .lte('created_at', productsPeriod.to.toISOString());

        const productOrderIds = (productOrders || []).map((o) => o.id);
        const categoryTypes: Record<string, string[]> = {
            service: ['service'],
            package: ['package'],
            product: ['product'],
            account_card: ['voucher'],
        };
        const allowedTypes = categoryTypes[product_category as string] || categoryTypes.service;

        const productAgg = new Map<string, { code: string; name: string; revenue: number }>();

        if (productOrderIds.length > 0) {
            const { data: productItems } = await supabaseAdmin
                .from('order_items')
                .select('item_code, item_name, item_type, total_price')
                .in('order_id', productOrderIds)
                .in('item_type', allowedTypes);

            (productItems || []).forEach((item) => {
                const code = item.item_code || '—';
                const key = `${code}::${item.item_name}`;
                const existing = productAgg.get(key);
                if (existing) {
                    existing.revenue += item.total_price || 0;
                } else {
                    productAgg.set(key, {
                        code,
                        name: item.item_name || '—',
                        revenue: item.total_price || 0,
                    });
                }
            });
        }

        const topProducts = [...productAgg.values()]
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 5);

        const nowIso = new Date().toISOString();
        const { data: upcomingLeads } = await supabaseAdmin
            .from('leads')
            .select(`
                id, name, phone, appointment_time,
                assigned_user:users!leads_assigned_to_fkey(id, name)
            `)
            .not('appointment_time', 'is', null)
            .gte('appointment_time', nowIso)
            .order('appointment_time', { ascending: true })
            .limit(8);

        const { data: recentOrders } = await supabaseAdmin
            .from('orders')
            .select(`
                id, order_code, total_amount, created_at,
                sales_user:users!orders_sales_id_fkey(id, name)
            `)
            .order('created_at', { ascending: false })
            .limit(12);

        res.json({
            status: 'success',
            data: {
                topStaff: {
                    rangeLabel: staffPeriod.label,
                    metric,
                    employees: topStaff,
                },
                topProducts: {
                    rangeLabel: productsPeriod.label,
                    category: product_category,
                    items: topProducts,
                },
                upcomingAppointments: (upcomingLeads || []).map((lead) => {
                    const user = lead.assigned_user as { name?: string } | null;
                    return {
                        id: lead.id,
                        customerName: lead.name,
                        phone: lead.phone,
                        appointmentTime: lead.appointment_time,
                        assignedName: user?.name,
                    };
                }),
                recentActivity: (recentOrders || []).map((order) => {
                    const sales = order.sales_user as { name?: string } | null;
                    return {
                        id: order.id,
                        orderCode: order.order_code,
                        amount: order.total_amount,
                        userName: sales?.name || 'Hệ thống',
                        createdAt: order.created_at,
                    };
                }),
            },
        });
    } catch (error) {
        next(error);
    }
});

function getCalendarMonth(year: number, month: number): { from: Date; to: Date; label: string } {
    const from = new Date(year, month - 1, 1);
    const to = endOfDay(new Date(year, month, 0));
    const label = `${String(month).padStart(2, '0')}/${year}`;
    return { from, to, label };
}

function dayLabel(date: Date): string {
    return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function buildMonthDayLabels(year: number, month: number): string[] {
    const daysInMonth = new Date(year, month, 0).getDate();
    return Array.from({ length: daysInMonth }, (_, i) => {
        const d = i + 1;
        return `${String(d).padStart(2, '0')}/${String(month).padStart(2, '0')}`;
    });
}

function percentChange(current: number, previous: number): number {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Number((((current - previous) / previous) * 100).toFixed(2));
}

interface PeriodCustomerMetrics {
    transactingTotal: number;
    newCount: number;
    returningCount: number;
    retailCount: number;
    netRevenue: number;
    avgOrderValue: number;
    volumeSeries: { label: string; new: number; returning: number; retail: number }[];
    revenueSeries: { label: string; new: number; returning: number; retail: number }[];
    revenueNew: number;
    revenueReturning: number;
    revenueRetail: number;
}

async function computeCustomerPeriodMetrics(from: Date, to: Date): Promise<PeriodCustomerMetrics> {
    const year = from.getFullYear();
    const month = from.getMonth() + 1;
    const dayLabels = buildMonthDayLabels(year, month);
    const labelIndex = new Map(dayLabels.map((l, i) => [l, i]));

    const volumeSeries = dayLabels.map((label) => ({ label, new: 0, returning: 0, retail: 0 }));
    const revenueSeries = dayLabels.map((label) => ({ label, new: 0, returning: 0, retail: 0 }));

    const { data: orders } = await supabaseAdmin
        .from('orders')
        .select('id, customer_id, total_amount, created_at, customer:customers(id, type, dob)')
        .in('status', COMPLETED_ORDER_STATUSES)
        .gte('created_at', from.toISOString())
        .lte('created_at', to.toISOString())
        .not('customer_id', 'is', null);

    const customerIds = [...new Set((orders || []).map((o) => o.customer_id).filter(Boolean))] as string[];

    const hadPrior = new Set<string>();
    if (customerIds.length > 0) {
        const { data: priorOrders } = await supabaseAdmin
            .from('orders')
            .select('customer_id')
            .in('customer_id', customerIds)
            .lt('created_at', from.toISOString());
        (priorOrders || []).forEach((o) => {
            if (o.customer_id) hadPrior.add(o.customer_id);
        });
    }

    const newCustomers = new Set<string>();
    const returningCustomers = new Set<string>();
    const retailCustomers = new Set<string>();
    const daySets = new Map<
        string,
        { new: Set<string>; returning: Set<string>; retail: Set<string> }
    >();

    let netRevenue = 0;
    let revenueNew = 0;
    let revenueReturning = 0;
    let revenueRetail = 0;

    (orders || []).forEach((order) => {
        const cid = order.customer_id as string;
        const amount = order.total_amount || 0;
        const created = new Date(order.created_at);
        const key = dayLabel(created);
        const idx = labelIndex.get(key);
        if (idx === undefined) return;

        netRevenue += amount;
        const customer = order.customer as { type?: string } | null;
        const isReturning = hadPrior.has(cid);
        const isRetail = customer?.type === 'individual';

        if (isReturning) {
            returningCustomers.add(cid);
            revenueReturning += amount;
            revenueSeries[idx].returning += amount;
        } else {
            newCustomers.add(cid);
            revenueNew += amount;
            revenueSeries[idx].new += amount;
        }
        if (isRetail) {
            retailCustomers.add(cid);
            revenueRetail += amount;
            revenueSeries[idx].retail += amount;
        }

        if (!daySets.has(key)) {
            daySets.set(key, { new: new Set(), returning: new Set(), retail: new Set() });
        }
        const day = daySets.get(key)!;
        if (isReturning) day.returning.add(cid);
        else day.new.add(cid);
        if (isRetail) day.retail.add(cid);
    });

    daySets.forEach((sets, key) => {
        const idx = labelIndex.get(key);
        if (idx === undefined) return;
        volumeSeries[idx].new = sets.new.size;
        volumeSeries[idx].returning = sets.returning.size;
        volumeSeries[idx].retail = sets.retail.size;
    });

    const transactingTotal = new Set([
        ...newCustomers,
        ...returningCustomers,
    ]).size;

    return {
        transactingTotal,
        newCount: newCustomers.size,
        returningCount: returningCustomers.size,
        retailCount: retailCustomers.size,
        netRevenue,
        avgOrderValue: (orders?.length ?? 0) > 0 ? Math.round(netRevenue / orders!.length) : 0,
        volumeSeries,
        revenueSeries,
        revenueNew,
        revenueReturning,
        revenueRetail,
    };
}

function breakdownRow(
    key: string,
    label: string,
    count: number,
    revenue: number,
    totalCount: number,
    totalRevenue: number,
    prevCount: number,
    prevRevenue: number
) {
    return {
        key,
        label,
        count,
        revenue,
        percent: totalCount > 0 ? Number(((count / totalCount) * 100).toFixed(2)) : 0,
        revenuePercent: totalRevenue > 0 ? Number(((revenue / totalRevenue) * 100).toFixed(2)) : 0,
        countChange: percentChange(count, prevCount),
        revenueChange: percentChange(revenue, prevRevenue),
    };
}

// Customer trend analysis (Phân tích khách hàng)
router.get('/customer-analysis', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const now = new Date();
        const year = Number(req.query.year) || now.getFullYear();
        const month = Number(req.query.month) || now.getMonth() + 1;
        const tab = (req.query.tab as string) || 'new_old';

        const current = getCalendarMonth(year, month);
        const prevMonth = month === 1 ? 12 : month - 1;
        const prevYear = month === 1 ? year - 1 : year;
        const previous = getCalendarMonth(prevYear, prevMonth);

        const [currentMetrics, prevMetrics] = await Promise.all([
            computeCustomerPeriodMetrics(current.from, current.to),
            computeCustomerPeriodMetrics(previous.from, previous.to),
        ]);

        const volumeBreakdown = [
            breakdownRow(
                'new',
                'Khách mới',
                currentMetrics.newCount,
                0,
                currentMetrics.transactingTotal,
                0,
                prevMetrics.newCount,
                0
            ),
            breakdownRow(
                'returning',
                'Khách cũ quay lại',
                currentMetrics.returningCount,
                0,
                currentMetrics.transactingTotal,
                0,
                prevMetrics.returningCount,
                0
            ),
            breakdownRow(
                'retail',
                'Khách lẻ',
                currentMetrics.retailCount,
                0,
                currentMetrics.transactingTotal,
                0,
                prevMetrics.retailCount,
                0
            ),
        ];

        const revenueBreakdown = [
            breakdownRow(
                'new',
                'Khách mới',
                currentMetrics.newCount,
                currentMetrics.revenueNew,
                currentMetrics.transactingTotal,
                currentMetrics.netRevenue,
                prevMetrics.newCount,
                prevMetrics.revenueNew
            ),
            breakdownRow(
                'returning',
                'Khách cũ quay lại',
                currentMetrics.returningCount,
                currentMetrics.revenueReturning,
                currentMetrics.transactingTotal,
                currentMetrics.netRevenue,
                prevMetrics.returningCount,
                prevMetrics.revenueReturning
            ),
            breakdownRow(
                'retail',
                'Khách lẻ',
                currentMetrics.retailCount,
                currentMetrics.revenueRetail,
                currentMetrics.transactingTotal,
                currentMetrics.netRevenue,
                prevMetrics.retailCount,
                prevMetrics.revenueRetail
            ),
        ];

        let segmentBreakdown: {
            key: string;
            label: string;
            count: number;
            revenue: number;
        }[] = [];

        if (tab === 'gender' || tab === 'age') {
            const { data: orders } = await supabaseAdmin
                .from('orders')
                .select('customer_id, total_amount, customer:customers(id, type, dob, gender)')
                .in('status', COMPLETED_ORDER_STATUSES)
                .gte('created_at', current.from.toISOString())
                .lte('created_at', current.to.toISOString())
                .not('customer_id', 'is', null);

            const bySegment = new Map<string, { customers: Set<string>; revenue: number }>();

            const ageBracket = (dob?: string | null): string => {
                if (!dob) return 'Chưa xác định';
                const birth = new Date(dob);
                if (Number.isNaN(birth.getTime())) return 'Chưa xác định';
                const age = now.getFullYear() - birth.getFullYear();
                if (age < 18) return 'Dưới 18';
                if (age <= 25) return '18–25';
                if (age <= 35) return '26–35';
                if (age <= 45) return '36–45';
                if (age <= 55) return '46–55';
                return 'Trên 55';
            };

            (orders || []).forEach((order) => {
                const customer = order.customer as {
                    gender?: string;
                    dob?: string;
                } | null;
                let label = 'Chưa xác định';
                if (tab === 'gender') {
                    const g = customer?.gender?.toLowerCase();
                    if (g === 'male' || g === 'nam') label = 'Nam';
                    else if (g === 'female' || g === 'nữ' || g === 'nu') label = 'Nữ';
                    else if (customer?.gender) label = customer.gender;
                } else {
                    label = ageBracket(customer?.dob);
                }
                if (!bySegment.has(label)) {
                    bySegment.set(label, { customers: new Set(), revenue: 0 });
                }
                const row = bySegment.get(label)!;
                row.customers.add(order.customer_id);
                row.revenue += order.total_amount || 0;
            });

            segmentBreakdown = [...bySegment.entries()]
                .map(([label, data]) => ({
                    key: label,
                    label,
                    count: data.customers.size,
                    revenue: data.revenue,
                }))
                .sort((a, b) => b.revenue - a.revenue);
        }

        const sparklineCustomers = currentMetrics.volumeSeries.map(
            (d) => d.new + d.returning
        );
        const sparklineRevenue = currentMetrics.revenueSeries.map(
            (d) => d.new + d.returning + d.retail
        );

        res.json({
            status: 'success',
            data: {
                period: {
                    year,
                    month,
                    label: current.label,
                    previousLabel: previous.label,
                },
                summary: {
                    transactingCustomers: {
                        total: currentMetrics.transactingTotal,
                        newCount: currentMetrics.newCount,
                        returningCount: currentMetrics.returningCount,
                        changePercent: percentChange(
                            currentMetrics.transactingTotal,
                            prevMetrics.transactingTotal
                        ),
                    },
                    netRevenue: {
                        total: currentMetrics.netRevenue,
                        avgValue: currentMetrics.avgOrderValue,
                        changePercent: percentChange(
                            currentMetrics.netRevenue,
                            prevMetrics.netRevenue
                        ),
                    },
                    sparklineCustomers,
                    sparklineRevenue,
                },
                customerVolume: {
                    total: currentMetrics.transactingTotal,
                    changePercent: percentChange(
                        currentMetrics.transactingTotal,
                        prevMetrics.transactingTotal
                    ),
                    series: currentMetrics.volumeSeries,
                    breakdown: volumeBreakdown,
                },
                revenue: {
                    total: currentMetrics.netRevenue,
                    changePercent: percentChange(
                        currentMetrics.netRevenue,
                        prevMetrics.netRevenue
                    ),
                    series: currentMetrics.revenueSeries,
                    breakdown: revenueBreakdown,
                },
                segmentBreakdown,
                tab,
            },
        });
    } catch (error) {
        next(error);
    }
});

// Get revenue report
router.get('/revenue', authenticate, requireManager, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { from_date, to_date, group_by = 'month' } = req.query;

        // Lấy doanh thu từ invoices đã thanh toán
        let query = supabaseAdmin
            .from('invoices')
            .select('total_amount, paid_at, created_at')
            .eq('status', 'paid');

        if (from_date) query = query.gte('paid_at', from_date);
        if (to_date) query = query.lte('paid_at', to_date);

        const { data: invoices, error } = await query;

        if (error) {
            throw new ApiError('Lỗi khi lấy báo cáo doanh thu', 500);
        }

        const totalRevenue = invoices?.reduce((sum, i) => sum + i.total_amount, 0) || 0;

        // Group by period
        const revenueByPeriod: Record<string, number> = {};
        invoices?.forEach(invoice => {
            const date = new Date(invoice.paid_at || invoice.created_at);
            let key: string;

            if (group_by === 'day') {
                key = date.toISOString().split('T')[0];
            } else if (group_by === 'week') {
                const week = Math.ceil(date.getDate() / 7);
                key = `${date.getFullYear()}-W${week}`;
            } else {
                key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            }

            revenueByPeriod[key] = (revenueByPeriod[key] || 0) + invoice.total_amount;
        });

        res.json({
            status: 'success',
            data: {
                totalRevenue,
                count: invoices?.length || 0,
                byPeriod: Object.entries(revenueByPeriod).map(([period, amount]) => ({ period, amount })),
            },
        });
    } catch (error) {
        next(error);
    }
});

// Get sales report
router.get('/sales', authenticate, requireManager, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { from_date, to_date } = req.query;

        // Lấy đơn hàng
        let query = supabaseAdmin
            .from('orders')
            .select(`
        id, total_amount, status, created_at,
        sales_user:users!orders_sales_id_fkey(id, name)
      `);

        if (from_date) query = query.gte('created_at', from_date);
        if (to_date) query = query.lte('created_at', to_date);

        const { data: orders, error } = await query;

        if (error) {
            throw new ApiError('Lỗi khi lấy báo cáo bán hàng', 500);
        }

        // Thống kê theo nhân viên
        const bySalesperson: Record<string, { name: string; orders: number; revenue: number }> = {};
        orders?.forEach(order => {
            const salesId = (order.sales_user as any)?.id;
            const salesName = (order.sales_user as any)?.name || 'Unknown';

            if (salesId) {
                if (!bySalesperson[salesId]) {
                    bySalesperson[salesId] = { name: salesName, orders: 0, revenue: 0 };
                }
                bySalesperson[salesId].orders += 1;
                if (order.status === 'done' || order.status === 'completed' || order.status === 'after_sale') {
                    bySalesperson[salesId].revenue += order.total_amount;
                }
            }
        });

        // Thống kê theo trạng thái
        const byStatus: Record<string, number> = {};
        orders?.forEach(order => {
            byStatus[order.status] = (byStatus[order.status] || 0) + 1;
        });

        res.json({
            status: 'success',
            data: {
                totalOrders: orders?.length || 0,
                totalRevenue: orders?.filter(o => o.status === 'done' || o.status === 'completed' || o.status === 'after_sale').reduce((sum, o) => sum + o.total_amount, 0) || 0,
                bySalesperson: Object.entries(bySalesperson).map(([id, data]) => ({ id, ...data })),
                byStatus,
            },
        });
    } catch (error) {
        next(error);
    }
});

// Get customer report
router.get('/customers', authenticate, requireManager, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { from_date, to_date } = req.query;

        // Tổng khách hàng
        const { count: totalCustomers } = await supabaseAdmin
            .from('customers')
            .select('*', { count: 'exact', head: true });

        // Khách hàng mới trong kỳ
        let newQuery = supabaseAdmin
            .from('customers')
            .select('*', { count: 'exact', head: true });

        if (from_date) newQuery = newQuery.gte('created_at', from_date);
        if (to_date) newQuery = newQuery.lte('created_at', to_date);

        const { count: newCustomers } = await newQuery;

        // Top khách hàng
        const { data: orders } = await supabaseAdmin
            .from('orders')
            .select('customer_id, total_amount, customer:customers(id, name, email)')
            .in('status', ['done', 'completed', 'after_sale']);

        const customerSpending: Record<string, { name: string; email: string; total: number; orders: number }> = {};
        orders?.forEach(order => {
            const customerId = order.customer_id;
            const customer = order.customer as any;

            if (customerId && customer) {
                if (!customerSpending[customerId]) {
                    customerSpending[customerId] = {
                        name: customer.name,
                        email: customer.email,
                        total: 0,
                        orders: 0
                    };
                }
                customerSpending[customerId].total += order.total_amount;
                customerSpending[customerId].orders += 1;
            }
        });

        const topCustomers = Object.entries(customerSpending)
            .map(([id, data]) => ({ id, ...data }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 10);

        res.json({
            status: 'success',
            data: {
                totalCustomers: totalCustomers || 0,
                newCustomers: newCustomers || 0,
                topCustomers,
            },
        });
    } catch (error) {
        next(error);
    }
});

// Get financial report
router.get('/financial', authenticate, requireManager, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { from_date, to_date } = req.query;

        // Thu
        let incomeQuery = supabaseAdmin
            .from('finance_transactions')
            .select('amount, category')
            .eq('type', 'income')
            .eq('status', 'approved');

        if (from_date) incomeQuery = incomeQuery.gte('created_at', from_date);
        if (to_date) incomeQuery = incomeQuery.lte('created_at', to_date);

        const { data: incomeData } = await incomeQuery;

        // Chi
        let expenseQuery = supabaseAdmin
            .from('finance_transactions')
            .select('amount, category')
            .eq('type', 'expense')
            .eq('status', 'approved');

        if (from_date) expenseQuery = expenseQuery.gte('created_at', from_date);
        if (to_date) expenseQuery = expenseQuery.lte('created_at', to_date);

        const { data: expenseData } = await expenseQuery;

        const totalIncome = incomeData?.reduce((sum, t) => sum + t.amount, 0) || 0;
        const totalExpense = expenseData?.reduce((sum, t) => sum + t.amount, 0) || 0;
        const profit = totalIncome - totalExpense;

        // Group by category
        const incomeByCategory: Record<string, number> = {};
        incomeData?.forEach(t => {
            incomeByCategory[t.category] = (incomeByCategory[t.category] || 0) + t.amount;
        });

        const expenseByCategory: Record<string, number> = {};
        expenseData?.forEach(t => {
            expenseByCategory[t.category] = (expenseByCategory[t.category] || 0) + t.amount;
        });

        res.json({
            status: 'success',
            data: {
                totalIncome,
                totalExpense,
                profit,
                profitMargin: totalIncome > 0 ? ((profit / totalIncome) * 100).toFixed(2) : 0,
                incomeByCategory,
                expenseByCategory,
            },
        });
    } catch (error) {
        next(error);
    }
});

// Get HR report
router.get('/hr', authenticate, requireManager, async (req: AuthenticatedRequest, res, next) => {
    try {
        // Get all employees
        const { data: users, error: usersError } = await supabaseAdmin
            .from('users')
            .select('id, name, role, salary, commission, department, status')
            .neq('role', 'customer');

        if (usersError) {
            throw new ApiError('Lỗi khi lấy dữ liệu nhân viên', 500);
        }

        // Get departments
        const { data: departments } = await supabaseAdmin
            .from('departments')
            .select('id, name');

        const deptMap = new Map(departments?.map(d => [d.id, d.name]) || []);

        // Calculate stats
        const activeEmployees = users?.filter(u => u.status === 'active') || [];
        const totalEmployees = activeEmployees.length;
        const totalSalary = activeEmployees.reduce((sum, u) => sum + (u.salary || 0), 0);

        // Get commission from completed orders
        const { data: completedOrders } = await supabaseAdmin
            .from('orders')
            .select('total_amount, sales_id')
            .in('status', ['done', 'completed', 'after_sale']);

        // Calculate total commission (assume 5% default)
        const commissionBySales: Record<string, number> = {};
        completedOrders?.forEach(order => {
            const salesId = order.sales_id;
            if (salesId) {
                const user = activeEmployees.find(u => u.id === salesId);
                const rate = user?.commission || 5;
                const commission = (order.total_amount * rate) / 100;
                commissionBySales[salesId] = (commissionBySales[salesId] || 0) + commission;
            }
        });
        const totalCommission = Object.values(commissionBySales).reduce((sum, c) => sum + c, 0);

        // Group by department
        const byDepartment: Record<string, { name: string; count: number; salary: number }> = {};
        activeEmployees.forEach(user => {
            const deptId = user.department || 'unknown';
            const deptName = deptMap.get(deptId) || 'Chưa phân bổ';
            if (!byDepartment[deptId]) {
                byDepartment[deptId] = { name: deptName, count: 0, salary: 0 };
            }
            byDepartment[deptId].count += 1;
            byDepartment[deptId].salary += user.salary || 0;
        });

        // Group by role
        const byRole: Record<string, number> = {};
        activeEmployees.forEach(user => {
            byRole[user.role] = (byRole[user.role] || 0) + 1;
        });

        res.json({
            status: 'success',
            data: {
                totalEmployees,
                totalSalary,
                totalCommission,
                avgKPI: 85, // Placeholder - would need KPI tracking
                byDepartment: Object.entries(byDepartment).map(([id, data]) => ({ id, ...data })),
                byRole,
            },
        });
    } catch (error) {
        next(error);
    }
});

// Get summary report (all-in-one for dashboard)
router.get('/summary', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { period = 'month', from_date, to_date } = req.query;

        // Calculate date range based on period
        const now = new Date();
        let fromDate: Date;
        let previousFromDate: Date;
        let previousToDate: Date;

        // Handle custom date range
        if (period === 'custom' && from_date && to_date) {
            fromDate = new Date(from_date as string);
            const toDateObj = new Date(to_date as string);
            // Calculate duration for previous period comparison
            const duration = toDateObj.getTime() - fromDate.getTime();
            previousFromDate = new Date(fromDate.getTime() - duration);
            previousToDate = new Date(fromDate.getTime());
        } else {
            switch (period) {
                case 'week':
                    fromDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                    previousFromDate = new Date(fromDate.getTime() - 7 * 24 * 60 * 60 * 1000);
                    previousToDate = fromDate;
                    break;
                case 'quarter':
                    fromDate = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
                    previousFromDate = new Date(fromDate.getFullYear(), fromDate.getMonth() - 3, 1);
                    previousToDate = fromDate;
                    break;
                case 'year':
                    fromDate = new Date(now.getFullYear(), 0, 1);
                    previousFromDate = new Date(now.getFullYear() - 1, 0, 1);
                    previousToDate = fromDate;
                    break;
                default: // month
                    fromDate = new Date(now.getFullYear(), now.getMonth(), 1);
                    previousFromDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                    previousToDate = fromDate;
            }
        }

        // Get orders for current period
        const { data: currentOrders } = await supabaseAdmin
            .from('orders')
            .select(`
                id, total_amount, status, created_at, customer_id,
                sales_user:users!orders_sales_id_fkey(id, name),
                items:order_items(item_type, item_name, total_price)
            `)
            .gte('created_at', fromDate.toISOString());

        // Get orders for previous period
        const { data: previousOrders } = await supabaseAdmin
            .from('orders')
            .select('id, total_amount, status')
            .gte('created_at', previousFromDate.toISOString())
            .lt('created_at', previousToDate.toISOString());

        // Calculate revenue stats
        const currentRevenue = currentOrders?.filter(o => o.status === 'done' || o.status === 'completed' || o.status === 'after_sale')
            .reduce((sum, o) => sum + o.total_amount, 0) || 0;
        const previousRevenue = previousOrders?.filter(o => o.status === 'done' || o.status === 'completed' || o.status === 'after_sale')
            .reduce((sum, o) => sum + o.total_amount, 0) || 0;
        const growth = previousRevenue > 0 ? ((currentRevenue - previousRevenue) / previousRevenue) * 100 : 0;

        // Revenue by source (item type)
        const bySource: Record<string, number> = {};
        currentOrders?.forEach(order => {
            (order.items as any[])?.forEach((item: any) => {
                const source = item.item_type === 'product' ? 'Sản phẩm' :
                    item.item_type === 'service' ? 'Dịch vụ' :
                        item.item_type === 'package' ? 'Gói combo' : 'Khác';
                bySource[source] = (bySource[source] || 0) + (item.total_price || 0);
            });
        });

        // Revenue by month (for year view)
        const byMonth: Record<string, number> = {};
        currentOrders?.filter(o => o.status === 'done' || o.status === 'completed' || o.status === 'after_sale').forEach(order => {
            const date = new Date(order.created_at);
            const monthKey = `T${date.getMonth() + 1}`;
            byMonth[monthKey] = (byMonth[monthKey] || 0) + order.total_amount;
        });

        // Unique customers
        const uniqueCustomers = new Set(currentOrders?.map(o => o.customer_id)).size;

        // Sales by person
        const bySalesperson: Record<string, { name: string; orders: number; revenue: number }> = {};
        currentOrders?.forEach(order => {
            const sales = order.sales_user as any;
            if (sales?.id) {
                if (!bySalesperson[sales.id]) {
                    bySalesperson[sales.id] = { name: sales.name, orders: 0, revenue: 0 };
                }
                bySalesperson[sales.id].orders += 1;
                if (order.status === 'done' || order.status === 'completed' || order.status === 'after_sale') {
                    bySalesperson[sales.id].revenue += order.total_amount;
                }
            }
        });

        // Top products/services
        const productRevenue: Record<string, { name: string; quantity: number; revenue: number }> = {};
        currentOrders?.forEach(order => {
            (order.items as any[])?.forEach((item: any) => {
                if (!productRevenue[item.item_name]) {
                    productRevenue[item.item_name] = { name: item.item_name, quantity: 0, revenue: 0 };
                }
                productRevenue[item.item_name].quantity += 1;
                productRevenue[item.item_name].revenue += item.total_price || 0;
            });
        });

        const topProducts = Object.values(productRevenue)
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 5);

        // Get HR data
        const { data: users } = await supabaseAdmin
            .from('users')
            .select('id, name, role, salary, status, department')
            .eq('status', 'active')
            .neq('role', 'customer');

        const { data: departments } = await supabaseAdmin
            .from('departments')
            .select('id, name');

        const deptMap = new Map(departments?.map(d => [d.id, d.name]) || []);

        const hrByDepartment: Record<string, { name: string; count: number; salary: number }> = {};
        users?.forEach(user => {
            const deptId = user.department || 'unknown';
            const deptName = deptMap.get(deptId) || 'Chưa phân bổ';
            if (!hrByDepartment[deptId]) {
                hrByDepartment[deptId] = { name: deptName, count: 0, salary: 0 };
            }
            hrByDepartment[deptId].count += 1;
            hrByDepartment[deptId].salary += user.salary || 0;
        });

        res.json({
            status: 'success',
            data: {
                revenue: {
                    total: currentRevenue,
                    previousPeriod: previousRevenue,
                    growth: Number(growth.toFixed(1)),
                    byMonth: Object.entries(byMonth).map(([month, value]) => ({ month, value })),
                    bySource: Object.entries(bySource).map(([source, value]) => {
                        const total = Object.values(bySource).reduce((s, v) => s + v, 0);
                        return { source, value, percent: total > 0 ? Math.round((value / total) * 100) : 0 };
                    }),
                },
                sales: {
                    totalOrders: currentOrders?.filter(o => o.status !== 'cancelled').length || 0,
                    totalCustomers: uniqueCustomers,
                    avgOrderValue: currentOrders?.length ? Math.round(currentRevenue / currentOrders.length) : 0,
                    topProducts,
                    bySalesperson: Object.entries(bySalesperson)
                        .map(([id, data]) => ({ id, ...data, commission: Math.round(data.revenue * 0.05) }))
                        .sort((a, b) => b.revenue - a.revenue),
                },
                hr: {
                    totalEmployees: users?.length || 0,
                    totalSalary: users?.reduce((sum, u) => sum + (u.salary || 0), 0) || 0,
                    byDepartment: Object.entries(hrByDepartment).map(([id, data]) => ({ id, dept: data.name, count: data.count, salary: data.salary })),
                },
            },
        });
    } catch (error) {
        next(error);
    }
});

export { router as reportsRouter };
