import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { X, Trash2 } from 'lucide-react';
import { formatCurrency } from '../../lib/utils';

interface ViolationByDayDialogProps {
    open: boolean;
    onClose: () => void;
    record: any;
    initialData?: any[];
    onConfirm: (data: any[]) => void;
}

export function ViolationByDayDialog({ open, onClose, record, initialData, onConfirm }: ViolationByDayDialogProps) {
    const [rows, setRows] = useState<any[]>(initialData || []);

    const total = rows.reduce((acc, row) => acc + (row.amount || 0) * (row.count || 1), 0);

    const addRow = () => {
        setRows([...rows, { 
            id: Date.now().toString(),
            date: undefined,
            shift: '',
            type: '',
            count: 1,
            amount: 0
        }]);
    };

    const updateRow = (id: string, field: string, value: any) => {
        setRows(rows.map(r => r.id === id ? { ...r, [field]: value } : r));
    };

    const removeRow = (id: string) => {
        setRows(rows.filter(r => r.id !== id));
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[800px] p-0 overflow-hidden bg-white [&>button]:hidden">
                <DialogHeader className="px-6 py-4 border-b border-gray-100 bg-white relative">
                    <DialogTitle className="text-[18px] font-bold text-gray-900">
                        Phạt vi phạm theo ngày
                    </DialogTitle>
                    <p className="text-[13px] text-gray-500 mt-1">
                        Nhân viên: <span className="text-gray-800">{record?.user?.name || '--'}</span>
                    </p>
                    <DialogClose asChild>
                        <button className="absolute right-4 top-4 text-gray-400 hover:text-gray-600 transition-colors">
                            <X className="h-5 w-5" />
                        </button>
                    </DialogClose>
                </DialogHeader>

                <div className="flex-1 p-6 bg-white min-h-[300px]">
                    <table className="w-full text-[13px] text-left">
                        <thead className="bg-[#eef3fb] rounded-t-lg">
                            <tr>
                                <th className="px-3 py-3 font-semibold text-gray-900 first:rounded-tl-lg">Ngày</th>
                                <th className="px-3 py-3 font-semibold text-gray-900">Ca</th>
                                <th className="px-3 py-3 font-semibold text-gray-900">Loại vi phạm</th>
                                <th className="px-3 py-3 font-semibold text-gray-900 text-center w-[80px]">Số lần</th>
                                <th className="px-3 py-3 font-semibold text-gray-900 text-right w-[120px]">Mức áp dụng</th>
                                <th className="px-3 py-3 font-semibold text-gray-900 text-right w-[120px] last:rounded-tr-lg">Thành tiền</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                             <tr className="border-b border-gray-100 !border-t-0">
                                <td colSpan={5}></td>
                                <td className="px-3 py-3 text-right font-bold text-[14px] text-gray-900">
                                    {formatCurrency(total).replace(' ₫', '')}
                                </td>
                            </tr>
                            
                            {rows.map((row) => (
                                <tr key={row.id} className="relative group hover:bg-gray-50/50 transition-colors">
                                    <td className="px-3 py-3 relative">
                                        <div className="absolute -left-5 top-1/2 -translate-y-1/2 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button 
                                                className="text-blue-500 hover:text-red-500 transition-colors"
                                                onClick={() => removeRow(row.id)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </div>
                                        <Input
                                            type="date"
                                            value={row.date ? new Date(row.date).toISOString().split('T')[0] : ''}
                                            onChange={(e) => updateRow(row.id, 'date', e.target.value ? new Date(e.target.value) : undefined)}
                                            className="h-[34px] w-[130px] text-[13px] bg-white border-gray-200"
                                        />
                                    </td>
                                    <td className="px-3 py-3">
                                        <Select value={row.shift} onValueChange={(val) => updateRow(row.id, 'shift', val)}>
                                            <SelectTrigger className="h-[34px] w-[110px] text-[13px] bg-white border-gray-200">
                                                <SelectValue placeholder="Chọn ca" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="morning">Ca Sáng</SelectItem>
                                                <SelectItem value="afternoon">Ca Chiều</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </td>
                                    <td className="px-3 py-3">
                                        <Select value={row.type} onValueChange={(val) => updateRow(row.id, 'type', val)}>
                                            <SelectTrigger className="h-[34px] w-[140px] text-[13px] bg-white border-gray-200">
                                                <SelectValue placeholder="Chọn vi phạm" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="late">Đi muộn</SelectItem>
                                                <SelectItem value="early_leave">Về sớm</SelectItem>
                                                <SelectItem value="no_uniform">Không đồng phục</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </td>
                                    <td className="px-3 py-3">
                                        <Input 
                                            type="number" 
                                            value={row.count}
                                            onChange={(e) => updateRow(row.id, 'count', Number(e.target.value))}
                                            className="h-[34px] text-center text-[13px]"
                                            min={1}
                                        />
                                    </td>
                                    <td className="px-3 py-3">
                                        <Input 
                                            type="text" 
                                            value={row.amount || ''}
                                            onChange={(e) => {
                                                const val = Number(e.target.value.replace(/[^0-9]/g, ''));
                                                updateRow(row.id, 'amount', val);
                                            }}
                                            className="h-[34px] text-right text-[13px]"
                                            placeholder="0"
                                        />
                                    </td>
                                    <td className="px-3 py-3 text-right font-medium text-gray-800">
                                        {formatCurrency((row.amount || 0) * (row.count || 1)).replace(' ₫', '')}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    <div className="mt-4 pl-3">
                        <button
                            onClick={addRow}
                            className="text-[13px] font-medium text-blue-600 hover:text-blue-800 hover:underline transition-colors"
                        >
                            Thêm vi phạm
                        </button>
                    </div>
                </div>

                <DialogFooter className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 bg-white">
                    <Button
                        variant="outline"
                        onClick={onClose}
                        className="h-9 px-6 text-[13px] border-gray-200 text-gray-700 font-medium"
                    >
                        Bỏ qua
                    </Button>
                    <Button
                        onClick={() => onConfirm(rows)}
                        className="h-9 px-6 text-[13px] bg-blue-600 hover:bg-blue-700 text-white font-medium min-w-[80px]"
                    >
                        Xong
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
