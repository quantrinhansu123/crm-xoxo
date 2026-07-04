import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { salaryApi } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { type SalaryRecord } from '@/hooks/useSalary';

interface UpdateBaseSalaryDialogProps {
    open: boolean;
    onClose: () => void;
    record: SalaryRecord | null;
    onSuccess: () => void;
}

export function UpdateBaseSalaryDialog({
    open,
    onClose,
    record,
    onSuccess,
}: UpdateBaseSalaryDialogProps) {
    const [loading, setLoading] = useState(false);
    
    // Form fields
    const [baseSalary, setBaseSalary] = useState('');
    const [standardWorkDays, setStandardWorkDays] = useState('30');
    const [actualWorkDays, setActualWorkDays] = useState('');
    const [appliedSalary, setAppliedSalary] = useState('');
    const [isManualApplied, setIsManualApplied] = useState(false);

    useEffect(() => {
        if (record && open) {
            const employeeBase = record.base_salary || 0; // Mức lương gốc
            setBaseSalary(employeeBase.toString());
            
            // Ngày công chuẩn default 30
            setStandardWorkDays('30');
            
            // Số ngày chấm công thực tế
            const actualDays = record.total_hours ? record.total_hours / 8 : 0;
            setActualWorkDays(actualDays.toString());

            // Áp dụng cho phiếu lương (the saved base_salary on this record)
            setAppliedSalary((record.base_salary || 0).toString());
            setIsManualApplied(true); // Don't auto-recalculate on mount if it's already set
        }
    }, [record, open]);

    useEffect(() => {
        if (!open || isManualApplied) return;
        const base = Number(baseSalary.replace(/,/g, '')) || 0;
        const stdDays = Number(standardWorkDays) || 30;
        const actualDays = Number(actualWorkDays) || 0;

        let applied = 0;
        if (stdDays > 0) {
            applied = Math.round((base / stdDays) * actualDays);
        }
        
        setAppliedSalary(applied.toString());
    }, [baseSalary, standardWorkDays, actualWorkDays, open, isManualApplied]);

    const handleSave = async () => {
        if (!record) return;
        
        try {
            setLoading(true);
            await salaryApi.updateBase(record.id, {
                base_salary: Number(baseSalary.replace(/,/g, '')),
                standard_work_days: Number(standardWorkDays),
                actual_work_days: Number(actualWorkDays),
                applied_salary: Number(appliedSalary.replace(/,/g, ''))
            });
            toast.success('Cập nhật lương chính thành công');
            onSuccess();
            onClose();
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Có lỗi xảy ra');
        } finally {
            setLoading(false);
        }
    };

    if (!record) return null;

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[800px] p-0 overflow-hidden bg-white">
                <DialogHeader className="px-6 py-4 border-b border-gray-100 bg-[#fbfcfd]">
                    <DialogTitle className="text-[16px] font-bold text-gray-900">
                        Lương chính
                    </DialogTitle>
                    <p className="text-[13px] text-gray-500 mt-1">
                        Nhân viên: <span className="font-semibold text-gray-800">{record.user?.name}</span> | Loại lương: <span className="font-semibold text-gray-800">Cố định</span>
                    </p>
                </DialogHeader>

                <div className="p-6">
                    <table className="w-full border-collapse">
                        <thead>
                            <tr className="border-b border-gray-200">
                                <th className="text-center py-3 text-[12px] font-medium text-gray-600">Mức lương</th>
                                <th className="text-center py-3 text-[12px] font-medium text-gray-600">Ngày công chuẩn</th>
                                <th className="text-center py-3 text-[12px] font-medium text-gray-600">Số ngày chấm công</th>
                                <th className="text-center py-3 text-[12px] font-medium text-blue-600">Áp dụng cho phiếu lương</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td className="py-4 px-2">
                                    <Input
                                        type="text"
                                        value={formatCurrency(Number(baseSalary.replace(/,/g, '')) || 0).replace(' ₫', '')}
                                        onChange={(e) => {
                                            const val = e.target.value.replace(/[^0-9]/g, '');
                                            setBaseSalary(val);
                                            setIsManualApplied(false);
                                        }}
                                        className="h-10 text-right text-[14px]"
                                    />
                                </td>
                                <td className="py-4 px-2">
                                    <Input
                                        type="number"
                                        value={standardWorkDays}
                                        onChange={(e) => {
                                            setStandardWorkDays(e.target.value);
                                            setIsManualApplied(false);
                                        }}
                                        className="h-10 text-right text-[14px]"
                                    />
                                </td>
                                <td className="py-4 px-2">
                                    <Input
                                        type="number"
                                        value={actualWorkDays}
                                        onChange={(e) => {
                                            setActualWorkDays(e.target.value);
                                            setIsManualApplied(false);
                                        }}
                                        className="h-10 text-right text-[14px]"
                                    />
                                </td>
                                <td className="py-4 px-2">
                                    <Input
                                        type="text"
                                        value={formatCurrency(Number(appliedSalary.replace(/,/g, '')) || 0).replace(' ₫', '')}
                                        onChange={(e) => {
                                            const val = e.target.value.replace(/[^0-9]/g, '');
                                            setAppliedSalary(val);
                                            setIsManualApplied(true);
                                        }}
                                        className="h-10 text-right font-bold text-blue-600 text-[14px]"
                                    />
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <DialogFooter className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 bg-gray-50/50">
                    <Button
                        variant="outline"
                        onClick={onClose}
                        className="h-9 px-6 text-[13px] border-gray-200"
                        disabled={loading}
                    >
                        Bỏ qua
                    </Button>
                    <Button
                        onClick={handleSave}
                        className="h-9 px-6 text-[13px] bg-blue-600 hover:bg-blue-700 text-white"
                        disabled={loading}
                    >
                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Xong
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
