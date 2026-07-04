import type { OrderItem } from '@/hooks/useOrders';
import { OrderItemPhotos } from './OrderItemPhotos';

interface MobileProductPhotosProps {
    item: OrderItem;
    canEdit: boolean;
    onUpdated: () => void;
}

export function MobileProductPhotos({ item, canEdit, onUpdated }: MobileProductPhotosProps) {
    return <OrderItemPhotos item={item} canEdit={canEdit} onUpdated={onUpdated} variant="compact" />;
}
