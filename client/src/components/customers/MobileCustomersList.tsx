import { Building2, Eye, Pencil, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { formatCurrency, cn } from '@/lib/utils';
import type { Customer } from '@/hooks/useCustomers';
import { useAuth } from '@/contexts/AuthContext';
import { canViewCustomerPhone } from '@/lib/sensitivePermissions';
import { CustomerPhone } from '@/components/customers/CustomerPhone';

interface MobileCustomersListProps {
    customers: Customer[];
    loading?: boolean;
    onView: (customer: Customer) => void;
    onEdit: (customer: Customer) => void;
}

export function MobileCustomersList({
    customers,
    loading,
    onView,
    onEdit,
}: MobileCustomersListProps) {
    const { user } = useAuth();
    const canCall = canViewCustomerPhone(user);

    if (loading) {
        return (
            <div className="space-y-2">
                <div className="h-4 w-40 animate-pulse rounded bg-muted" />
                {[...Array(4)].map((_, i) => (
                    <Card key={i} className="animate-pulse border shadow-sm">
                        <CardContent className="h-[88px] rounded-lg bg-muted/50 p-3" />
                    </Card>
                ))}
            </div>
        );
    }

    return (
        <div className="space-y-2">
            <h2 className="text-sm font-semibold text-foreground">
                Danh sách khách hàng ({customers.length})
            </h2>

            {customers.length === 0 ? (
                <div className="rounded-xl border border-dashed bg-muted/30 px-4 py-10 text-center">
                    <p className="text-sm text-muted-foreground">Không tìm thấy khách hàng</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {customers.map((customer) => {
                        const isActive = customer.status === 'active';
                        const orders = customer.total_orders ?? 0;
                        const spent = customer.total_spent ?? 0;

                        return (
                            <Card key={customer.id} className="overflow-hidden border shadow-sm">
                                <CardContent className="p-3">
                                    <div className="mb-2.5 flex items-start gap-2.5">
                                        <Avatar className="h-10 w-10 shrink-0">
                                            <AvatarFallback
                                                className={cn(
                                                    'text-sm font-semibold',
                                                    customer.type === 'company'
                                                        ? 'bg-blue-100 text-blue-600'
                                                        : 'bg-primary/10 text-primary',
                                                )}
                                            >
                                                {customer.type === 'company' ? (
                                                    <Building2 className="h-5 w-5" />
                                                ) : (
                                                    customer.name.charAt(0).toUpperCase()
                                                )}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-semibold leading-tight">
                                                {customer.name}
                                            </p>
                                            <p className="mt-0.5 text-xs text-muted-foreground">
                                                <CustomerPhone phone={customer.phone} /> · {orders} đơn
                                            </p>
                                        </div>
                                        <Badge
                                            variant="outline"
                                            className={cn(
                                                'h-5 shrink-0 border-0 px-2 text-[10px] font-medium',
                                                isActive
                                                    ? 'bg-green-100 text-green-700'
                                                    : 'bg-red-100 text-red-700',
                                            )}
                                        >
                                            {isActive ? 'Hoạt động' : 'Ngừng'}
                                        </Badge>
                                    </div>

                                    <div className={cn('grid gap-1.5', canCall && customer.phone ? 'grid-cols-3' : 'grid-cols-2')}>
                                        {canCall && customer.phone ? (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-8 gap-1 px-0 text-xs"
                                                asChild
                                            >
                                                <a href={`tel:${customer.phone}`}>
                                                    <Phone className="h-3.5 w-3.5" />
                                                    Gọi
                                                </a>
                                            </Button>
                                        ) : null}
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-8 gap-1 px-0 text-xs"
                                            onClick={() => onView(customer)}
                                        >
                                            <Eye className="h-3.5 w-3.5" />
                                            Xem
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-8 gap-1 px-0 text-xs"
                                            onClick={() => onEdit(customer)}
                                        >
                                            <Pencil className="h-3.5 w-3.5" />
                                            Sửa
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
