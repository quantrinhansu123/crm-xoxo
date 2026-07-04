import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency } from '@/lib/utils';
import { salaryApi } from '@/lib/api';
import { toast } from 'sonner';
import { Loader2, X } from 'lucide-react';

interface SalaryPaymentDialogProps {
    open: boolean;
    onClose: () => void;
    record: any;
    onSuccess?: () => void;
}

export function SalaryPaymentDialog({ open, onClose, record, onSuccess }: SalaryPaymentDialogProps) {
    const [loading, setLoading] = useState(false);
    const [method, setMethod] = useState('cash');
    const [date, setDate] = useState(new Date().toISOString().slice(0, 16));
    const [notes, setNotes] = useState('');
    const [payAmount, setPayAmount] = useState<number>(0);

    useEffect(() => {
        if (record) {
            const net = record.net_salary || 0;
            setPayAmount(net);
            setNotes(`Chi lương cho nhân viên ${record.user?.name || ''} tháng ${record.month}/${record.year}`);
        }
    }, [record]);

    if (!record) return null;

    const handleCreatePC = async () => {
        try {
            setLoading(true);
            const res = await salaryApi.pay(record.id, {
                payment_method: method,
                payment_date: new Date(date).toISOString(),
                amount: payAmount,
                notes: notes
            });

            if (res.data.status === 'success') {
                toast.success('Đã tạo phiếu chi và thanh toán thành công');
                if (onSuccess) onSuccess();
                onClose();
            }
        } catch (error: any) {
            console.error('Payment error:', error);
            toast.error(error.response?.data?.message || 'Lỗi khi thanh toán bảng lương');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-4xl p-0 gap-0 border-0 shadow-2xl">
                <DialogHeader className="p-4 border-b border-gray-100 flex flex-row items-center justify-between">
                    <DialogTitle className="text-[16px] font-bold text-gray-800">
                        Thanh toán bảng lương
                    </DialogTitle>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
                        <X className="h-5 w-5" />
                    </button>
                </DialogHeader>

                <div className="p-6">
                    {/* Summary Row */}
                    <div className="text-[13px] text-gray-500 mb-6 flex gap-4">
                        <span>Bảng lương tháng {record.month}/{record.year}</span>
                        <span>|</span>
                        <span>
                            Kỳ làm việc: 
                            01/{String(record.month).padStart(2, '0')}/{record.year} - 
                            {new Date(record.year, record.month, 0).getDate()}/{String(record.month).padStart(2, '0')}/{record.year}
                        </span>
                        <span>|</span>
                        <span>
                            Trạng thái: 
                            <span className="text-orange-500 ml-1">
                                {record.status === 'approved' ? 'Đã chốt' : 'Tạm tính'}
                            </span>
                        </span>
                    </div>

                    {/* Form Grid */}
                    <div className="grid grid-cols-2 gap-x-12 gap-y-6 mb-8">
                        <div className="space-y-4">
                            <div className="flex items-center">
                                <Label className="w-[140px] text-[13px] text-gray-600">Tiền trả nhân viên</Label>
                                <div className="flex-1 text-[15px] font-bold text-gray-800">
                                    {formatCurrency(payAmount)}
                                </div>
                            </div>
                            <div className="flex items-center gap-4">
                                <Label className="w-[140px] text-[13px] text-gray-600">Phương thức</Label>
                                <Select value={method} onValueChange={setMethod}>
                                    <SelectTrigger className="flex-1 h-9 text-[13px]">
                                        <SelectValue placeholder="Chọn phương thức" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="cash">Tiền mặt</SelectItem>
                                        <SelectItem value="transfer">Chuyển khoản</SelectItem>
                                        <SelectItem value="card">Thẻ</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="flex items-center gap-4">
                                <Label className="w-[100px] text-[13px] text-gray-600">Thời gian</Label>
                                <Input 
                                    type="datetime-local" 
                                    className="flex-1 h-9 text-[13px]" 
                                    value={date}
                                    onChange={(e) => setDate(e.target.value)}
                                />
                            </div>
                            <div className="flex gap-4">
                                <Label className="w-[100px] text-[13px] text-gray-600 mt-1.5">Ghi chú</Label>
                                <Textarea 
                                    placeholder="Nhập ghi chú thanh toán..." 
                                    className="flex-1 text-[13px] min-h-[60px]"
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Items Table */}
                    <div className="border rounded-md overflow-hidden">
                        <Table>
                            <TableHeader className="bg-blue-50">
                                <TableRow>
                                    <TableHead className="text-[12px] font-bold text-blue-700 h-10">Mã phiếu</TableHead>
                                    <TableHead className="text-[12px] font-bold text-blue-700 h-10">Nhân viên</TableHead>
                                    <TableHead className="text-[12px] font-bold text-blue-700 h-10 text-right">Thành tiền</TableHead>
                                    <TableHead className="text-[12px] font-bold text-blue-700 h-10 text-right">Đã trả nhân viên</TableHead>
                                    <TableHead className="text-[12px] font-bold text-blue-700 h-10 text-right">Còn cần trả</TableHead>
                                    <TableHead className="text-[12px] font-bold text-blue-700 h-10 text-right w-[180px]">Tiền trả nhân viên</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                <TableRow className="hover:bg-transparent">
                                    <TableCell className="text-[13px] py-3 text-blue-600 font-medium">PL000{record.id.slice(0, 3)}</TableCell>
                                    <TableCell className="text-[13px] py-3">
                                        <div className="font-semibold text-gray-800">{record.user?.name}</div>
                                        <div className="text-[11px] text-gray-400">{record.user?.employee_code || '--'}</div>
                                    </TableCell>
                                    <TableCell className="text-[13px] py-3 text-right font-medium">{formatCurrency(payAmount)}</TableCell>
                                    <TableCell className="text-[13px] py-3 text-right text-gray-400">0</TableCell>
                                    <TableCell className="text-[13px] py-3 text-right font-medium text-blue-600">{formatCurrency(payAmount)}</TableCell>
                                    <TableCell className="text-[13px] py-3 text-right">
                                        <Input 
                                            value={formatCurrency(payAmount)} 
                                            readOnly 
                                            className="h-8 text-[13px] text-right bg-gray-50 border-gray-200"
                                        />
                                    </TableCell>
                                </TableRow>
                            </TableBody>
                        </Table>
                    </div>
                </div>

                <DialogFooter className="p-4 bg-gray-50 border-t border-gray-100 flex gap-2">
                    <Button variant="outline" onClick={onClose} className="h-9 px-6 text-[13px]">
                        Bỏ qua
                    </Button>
                    <Button 
                        onClick={handleCreatePC} 
                        disabled={loading}
                        className="h-9 px-6 text-[13px] bg-blue-600 hover:bg-blue-700 text-white"
                    >
                        {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Tạo phiếu chi
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
