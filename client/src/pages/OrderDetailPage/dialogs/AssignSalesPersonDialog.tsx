import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { UserPlus, Loader2, Trash2, Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { orderItemsApi } from '@/lib/api';
import type { OrderItem } from '@/hooks/useOrders';
import type { User } from '@/types';
import { getItemTypeLabel } from '../utils';

interface AssignSalesPersonDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    selectedItem: OrderItem | null;
    salesPersons: User[];
    onSuccess: () => void;
}

interface Assignment {
    sale_id: string;
    name?: string;
    commission: number;
}

export function AssignSalesPersonDialog({
    open,
    onOpenChange,
    selectedItem,
    salesPersons,
    onSuccess,
}: AssignSalesPersonDialogProps) {
    const [assignments, setAssignments] = useState<Assignment[]>([{ sale_id: '', commission: 0 }]);
    const [loading, setLoading] = useState(false);

    // Initialize with existing sales if available
    useEffect(() => {
        if (open && selectedItem) {
            const itemWithSales = selectedItem as any;
            if (itemWithSales.sales && Array.isArray(itemWithSales.sales) && itemWithSales.sales.length > 0) {
                setAssignments(itemWithSales.sales.map((s: any) => ({
                    sale_id: s.sale_id || s.id,
                    commission: s.commission || 0
                })));
            } else {
                setAssignments([{ sale_id: '', commission: 0 }]);
            }
        }
    }, [open, selectedItem]);

    const handleAssign = async () => {
        if (!selectedItem) return;

        const validAssignments = assignments.filter(a => a.sale_id);
        if (validAssignments.length === 0) {
            toast.error('Vui lòng chọn ít nhất một nhân viên kinh doanh');
            return;
        }

        setLoading(true);
        try {
            await orderItemsApi.assignSale(selectedItem.id, validAssignments);
            toast.success('Đã phân công nhân viên kinh doanh');
            onOpenChange(false);
            onSuccess();
        } catch (error: any) {
            console.error('Error assigning salespersons:', error);
            toast.error(error?.response?.data?.message || 'Lỗi khi phân công nhân viên kinh doanh');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <UserPlus className="h-5 w-5 text-amber-600" />
                        Phân công nhân viên kinh doanh
                    </DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                    {selectedItem && (
                        <div className="p-3 bg-muted rounded-lg">
                            <p className="font-medium">{selectedItem.item_name}</p>
                            <p className="text-sm text-muted-foreground">
                                {getItemTypeLabel(selectedItem.item_type)} • SL: {selectedItem.quantity}
                            </p>
                        </div>
                    )}
                    <div className="space-y-4">
                        <Label>Danh sách sales</Label>
                        {assignments.map((assignment, index) => (
                            <div key={index} className="flex gap-2 items-start">
                                <div className="flex-1">
                                    <Select
                                        value={assignment.sale_id}
                                        onValueChange={(val) => {
                                            const newAssignments = [...assignments];
                                            newAssignments[index].sale_id = val;
                                            setAssignments(newAssignments);
                                        }}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Chọn Sales..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {salesPersons.map(sale => (
                                                <SelectItem key={sale.id} value={sale.id}>
                                                    {sale.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="w-24 relative">
                                    <Input
                                        type="number"
                                        value={assignment.commission}
                                        onChange={(e) => {
                                            const newAssignments = [...assignments];
                                            newAssignments[index].commission = Number(e.target.value);
                                            setAssignments(newAssignments);
                                        }}
                                        placeholder="%"
                                        className="pr-6"
                                    />
                                    <span className="absolute right-2 top-2.5 text-xs text-muted-foreground">%</span>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="shrink-0 text-red-500 hover:text-red-600 hover:bg-red-50"
                                    onClick={() => {
                                        const newAssignments = assignments.filter((_, i) => i !== index);
                                        setAssignments(newAssignments.length > 0 ? newAssignments : [{ sale_id: '', commission: 0 }]);
                                    }}
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        ))}
                        <Button
                            variant="outline"
                            size="sm"
                            className="w-full border-dashed"
                            onClick={() => setAssignments([...assignments, { sale_id: '', commission: 0 }])}
                        >
                            <Plus className="h-4 w-4 mr-2" /> Thêm nhân viên sales
                        </Button>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Hủy
                    </Button>
                    <Button
                        onClick={handleAssign}
                        disabled={assignments.filter(a => a.sale_id).length === 0 || loading}
                        className="bg-amber-600 hover:bg-amber-700 text-white"
                    >
                        {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Phân công
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
