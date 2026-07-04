import { useAuth } from '@/contexts/AuthContext';
import { canViewCustomerPhone, formatCustomerPhone } from '@/lib/sensitivePermissions';
import { cn } from '@/lib/utils';

interface CustomerPhoneProps {
    phone?: string | null;
    className?: string;
    /** Hiện link gọi khi được xem SĐT */
    linkable?: boolean;
}

export function CustomerPhone({ phone, className, linkable = false }: CustomerPhoneProps) {
    const { user } = useAuth();
    const canView = canViewCustomerPhone(user);
    const display = formatCustomerPhone(phone, canView);

    if (linkable && canView && phone?.trim()) {
        return (
            <a href={`tel:${phone}`} className={cn('text-primary hover:underline', className)}>
                {display}
            </a>
        );
    }

    return <span className={className}>{display}</span>;
}
