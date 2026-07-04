import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { User, Loader2, Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Customer } from '@/hooks/useCustomers';

const sourceOptions = ['Website', 'Facebook', 'Zalo', 'Giới thiệu', 'Cold Call', 'Event', 'Khác'];

export interface CreateCustomerDialogProps {
    open: boolean;
    onClose: () => void;
    customer?: Customer | null;
    onSubmit: (data: Partial<Customer>) => Promise<Customer | void>;
    employees?: { id: string; name: string }[];
    initialName?: string;
    initialPhone?: string;
}

export function CreateCustomerDialog({
    open,
    onClose,
    customer,
    onSubmit,
    employees = [],
    initialName = '',
    initialPhone = ''
}: CreateCustomerDialogProps) {
    const [name, setName] = useState(customer?.name || '');
    const [email, setEmail] = useState(customer?.email || '');
    const [phone, setPhone] = useState(customer?.phone || '');
    const [address, setAddress] = useState(customer?.address || '');
    const [source, setSource] = useState(customer?.source || '');
    const [assignedTo, setAssignedTo] = useState(customer?.assigned_to || '');
    const [notes, setNotes] = useState(customer?.notes || '');
    const [dob, setDob] = useState(customer?.dob || '');
    const [submitting, setSubmitting] = useState(false);

    // Reset form when customer changes
    useEffect(() => {
        if (customer) {
            setName(customer.name);
            setEmail(customer.email || '');
            setPhone(customer.phone);
            setAddress(customer.address || '');
            setSource(customer.source || '');
            setAssignedTo(customer.assigned_to || '');
            setNotes(customer.notes || '');
            setDob(customer.dob || '');
        } else {
            // Reset form for new customer
            setName(initialName || '');
            setEmail('');
            setPhone(initialPhone || '');
            setAddress('');
            setSource('');
            setAssignedTo('');
            setNotes('');
            setDob('');
        }
    }, [customer, open, initialName, initialPhone]);

    const handleSubmit = async () => {
        if (!name || !phone) {
            toast.error('Vui lòng điền đầy đủ thông tin bắt buộc');
            return;
        }

        setSubmitting(true);
        try {
            await onSubmit({
                name,
                type: 'individual',
                email: email || undefined,
                phone,
                address: address || undefined,
                source: source || undefined,
                assigned_to: assignedTo || undefined,
                notes: notes || undefined,
                dob: dob || undefined,
            });
            onClose();
        } catch {
            // Error handled in parent
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        {customer ? (
                            <User className="h-5 w-5 text-primary" />
                        ) : (
                            <Plus className="h-5 w-5 text-primary" />
                        )}
                        {customer ? 'Sửa thông tin khách hàng' : 'Thêm khách hàng mới'}
                    </DialogTitle>
                    <DialogDescription>Nhập thông tin khách hàng</DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {/* Basic Info */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2 space-y-2">
                            <Label>Họ và tên *</Label>
                            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nhập họ và tên" />
                        </div>
                        <div className="space-y-2">
                            <Label>Số điện thoại *</Label>
                            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0912345678" />
                        </div>
                        <div className="space-y-2">
                            <Label>Email</Label>
                            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" />
                        </div>
                        <div className="space-y-2">
                            <Label>Ngày sinh</Label>
                            <Input type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label>Nguồn khách hàng</Label>
                            <Select value={source} onValueChange={setSource}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Chọn nguồn" />
                                </SelectTrigger>
                                <SelectContent>
                                    {sourceOptions.map(s => (
                                        <SelectItem key={s} value={s}>{s}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Address & Assigned */}
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label>Địa chỉ</Label>
                            <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Nhập địa chỉ" />
                        </div>
                        {employees.length > 0 && (
                            <div className="space-y-2">
                                <Label>Nhân viên phụ trách</Label>
                                <Select value={assignedTo} onValueChange={setAssignedTo}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Chọn nhân viên" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {employees.map(emp => (
                                            <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                    </div>

                    {/* Notes */}
                    <div className="space-y-2">
                        <Label>Ghi chú</Label>
                        <textarea
                            className="w-full min-h-20 px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Ghi chú về khách hàng..."
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={submitting}>Huỷ</Button>
                    <Button onClick={handleSubmit} disabled={submitting}>
                        {submitting ? (
                            <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Đang lưu...
                            </>
                        ) : 'Lưu'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
