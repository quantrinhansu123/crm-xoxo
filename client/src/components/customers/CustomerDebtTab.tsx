import { useCallback, useEffect, useState } from 'react';
import { Loader2, Wallet, RefreshCw, FileText, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { customersApi } from '@/lib/api';
import { formatCurrency, formatDateTime, formatNumber, cn } from '@/lib/utils';
import { CustomerCollectPaymentDialog, type CustomerDebtOrderRow } from './CustomerCollectPaymentDialog';
import { CustomerOrderPaymentDetailDialog } from './CustomerOrderPaymentDetailDialog';

interface CustomerDebtTabProps {
    customerId: string;
    customerName: string;
    customerPhone?: string;
}

type DebtSummary = {
    total_debt: number;
    total_paid: number;
    total_order_value: number;
    total_deposit: number;
    open_orders_count: number;
};

type LedgerRow = {
    id: string;
    at: string;
    code: string;
    kind: 'sale' | 'payment';
    label: string;
    amount: number;
    balance: number;
};

export function CustomerDebtTab({ customerId, customerName, customerPhone }: CustomerDebtTabProps) {
    const [loading, setLoading] = useState(true);
    const [summary, setSummary] = useState<DebtSummary | null>(null);
    const [orders, setOrders] = useState<CustomerDebtOrderRow[]>([]);
    const [ledger, setLedger] = useState<LedgerRow[]>([]);
    const [showPayDialog, setShowPayDialog] = useState(false);
    const [detailOrder, setDetailOrder] = useState<CustomerDebtOrderRow | null>(null);

    const loadDebt = useCallback(async () => {
        setLoading(true);
        try {
            const res = await customersApi.getDebt(customerId);
            const data = res.data.data;
            setSummary(data?.summary ?? null);
            setOrders(data?.orders ?? []);
            setLedger(data?.ledger ?? []);
        } catch {
            toast.error('Không tải được công nợ khách hàng');
        } finally {
            setLoading(false);
        }
    }, [customerId]);

    useEffect(() => {
        void loadDebt();
    }, [loadDebt]);

    if (loading) {
        return (
            <div className="flex justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Card className="border-red-100 bg-red-50/50">
                    <CardContent className="p-4">
                        <p className="text-xs text-muted-foreground">Tổng nợ hiện tại</p>
                        <p className="text-xl font-bold text-red-600">{formatCurrency(summary?.total_debt || 0)}</p>
                    </CardContent>
                </Card>
                <Card className="border-green-100 bg-green-50/50">
                    <CardContent className="p-4">
                        <p className="text-xs text-muted-foreground">Đã thu (tất cả đơn)</p>
                        <p className="text-xl font-bold text-green-700">{formatCurrency(summary?.total_paid || 0)}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4">
                        <p className="text-xs text-muted-foreground">Tổng giá trị đơn</p>
                        <p className="text-xl font-bold">{formatCurrency(summary?.total_order_value || 0)}</p>
                    </CardContent>
                </Card>
                <Card className="border-amber-100 bg-amber-50/40">
                    <CardContent className="p-4">
                        <p className="text-xs text-muted-foreground">Tổng cọc SP (tất cả đơn)</p>
                        <p className="text-xl font-bold text-amber-800">{formatCurrency(summary?.total_deposit || 0)}</p>
                    </CardContent>
                </Card>
            </div>

            <div className="flex flex-wrap gap-2">
                <Button onClick={() => setShowPayDialog(true)} disabled={orders.length === 0}>
                    <Wallet className="mr-2 h-4 w-4" />
                    Thanh toán
                </Button>
                <Button variant="outline" onClick={() => void loadDebt()}>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Làm mới
                </Button>
            </div>

            <Card>
                <CardContent className="p-0">
                    <div className="border-b px-4 py-3">
                        <h3 className="text-sm font-semibold flex items-center gap-2">
                            <FileText className="h-4 w-4" />
                            Công nợ theo đơn hàng
                        </h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm min-w-[720px]">
                            <thead className="bg-muted/50 text-xs uppercase">
                                <tr>
                                    <th className="p-3 text-left">Mã đơn</th>
                                    <th className="p-3 text-left">Thời gian</th>
                                    <th className="p-3 text-right">Giá trị HĐ</th>
                                    <th className="p-3 text-right">Đã cọc</th>
                                    <th className="p-3 text-right">Đã thu</th>
                                    <th className="p-3 text-right">Còn nợ</th>
                                    <th className="p-3 text-center w-[120px]">Thao tác</th>
                                </tr>
                            </thead>
                            <tbody>
                                {orders.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="p-8 text-center text-muted-foreground">
                                            Chưa có đơn hàng
                                        </td>
                                    </tr>
                                ) : (
                                    [...orders].reverse().map((o) => (
                                        <tr key={o.id} className="border-t hover:bg-muted/20">
                                            <td className="p-3 font-semibold text-primary">{o.order_code}</td>
                                            <td className="p-3 text-muted-foreground">{formatDateTime(o.created_at)}</td>
                                            <td className="p-3 text-right tabular-nums">{formatCurrency(o.total_amount)}</td>
                                            <td className="p-3 text-right tabular-nums text-amber-700">
                                                {(() => {
                                                    const productDeposit = (o.products || []).reduce(
                                                        (s, p) => s + (p.deposit_amount || 0),
                                                        0
                                                    );
                                                    const val = productDeposit > 0 ? productDeposit : o.deposit_amount;
                                                    return val > 0 ? formatCurrency(val) : '—';
                                                })()}
                                            </td>
                                            <td className="p-3 text-right tabular-nums text-green-700">{formatCurrency(o.paid_amount)}</td>
                                            <td className="p-3 text-right">
                                                <span className={cn('font-bold tabular-nums', o.remaining_debt > 0 ? 'text-red-600' : 'text-green-600')}>
                                                    {formatCurrency(o.remaining_debt)}
                                                </span>
                                            </td>
                                            <td className="p-3 text-center">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-8 gap-1.5 text-primary"
                                                    onClick={() => setDetailOrder(o)}
                                                >
                                                    <Eye className="h-3.5 w-3.5" />
                                                    Xem chi tiết
                                                </Button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardContent className="p-0">
                    <div className="border-b px-4 py-3 flex items-center justify-between">
                        <h3 className="text-sm font-semibold">Sổ công nợ (giao dịch)</h3>
                        <Badge variant="outline">{ledger.length} phiếu</Badge>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm min-w-[640px]">
                            <thead className="bg-muted/50 text-xs uppercase">
                                <tr>
                                    <th className="p-3 text-left">Mã phiếu</th>
                                    <th className="p-3 text-left">Thời gian</th>
                                    <th className="p-3 text-left">Loại</th>
                                    <th className="p-3 text-right">Số tiền</th>
                                    <th className="p-3 text-right">Dư nợ KH</th>
                                    <th className="p-3 text-center w-[100px]"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {ledger.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="p-8 text-center text-muted-foreground">
                                            Chưa có giao dịch
                                        </td>
                                    </tr>
                                ) : (
                                    ledger.map((row) => (
                                        <tr key={row.id} className="border-t">
                                            <td className="p-3 font-medium text-primary">{row.code}</td>
                                            <td className="p-3 text-muted-foreground">{formatDateTime(row.at)}</td>
                                            <td className="p-3">
                                                <Badge variant={row.kind === 'payment' ? 'secondary' : 'outline'}>
                                                    {row.label}
                                                </Badge>
                                            </td>
                                            <td
                                                className={cn(
                                                    'p-3 text-right font-semibold tabular-nums',
                                                    row.amount < 0 ? 'text-green-700' : 'text-foreground'
                                                )}
                                            >
                                                {row.amount < 0 ? '−' : '+'}
                                                {formatNumber(Math.abs(row.amount))}
                                            </td>
                                            <td className="p-3 text-right font-bold tabular-nums">{formatNumber(row.balance)}</td>
                                            <td className="p-3 text-center">
                                                {row.kind === 'payment' && (
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-8 gap-1 text-primary"
                                                        onClick={() => {
                                                            const matched = orders.find((o) => o.order_code === row.code);
                                                            if (matched) setDetailOrder(matched);
                                                        }}
                                                    >
                                                        <Eye className="h-3.5 w-3.5" />
                                                        Chi tiết
                                                    </Button>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            <CustomerCollectPaymentDialog
                open={showPayDialog}
                onOpenChange={setShowPayDialog}
                customerId={customerId}
                customerName={customerName}
                customerPhone={customerPhone}
                totalDebt={summary?.total_debt || 0}
                orders={orders}
                onSuccess={() => void loadDebt()}
            />

            <CustomerOrderPaymentDetailDialog
                open={!!detailOrder}
                onOpenChange={(open) => !open && setDetailOrder(null)}
                order={detailOrder}
            />
        </div>
    );
}
