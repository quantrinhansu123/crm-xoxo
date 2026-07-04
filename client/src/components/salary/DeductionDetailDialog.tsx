import React, { useState } from 'react';
import { salaryApi } from '../../lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { formatCurrency } from '../../lib/utils';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { ViolationByDayDialog } from './ViolationByDayDialog';
import { DeductionOtherDialog } from './DeductionOtherDialog';

interface DeductionDetailDialogProps {
    open: boolean;
    onClose: () => void;
    record: any;
}

export function DeductionDetailDialog({ open, onClose, record }: DeductionDetailDialogProps) {
    const [loading, setLoading] = useState(false);
    
    // Dialog states
    const [showByDay, setShowByDay] = useState(false);
    const [showOther, setShowOther] = useState(false);
    
    // Summary from manual details
    const manualDetails = record?.deduction_details || { byDay: [], other: [] };
    const byDaySum = (manualDetails.byDay || []).reduce((s: number, d: any) => s + (d.amount || 0) * (d.count || 1), 0);
    const otherSum = (manualDetails.other || []).reduce((s: number, d: any) => s + (d.amount || 0) * (d.count || 1), 0);
    const totalManual = byDaySum + otherSum;

    const handleUpdateManualDeduction = async (category: 'byDay' | 'other', data: any[]) => {
        try {
            setLoading(true);
            const newDetails = {
                ...manualDetails,
                [category]: data
            };
            
            await salaryApi.updateDeduction(record.id, { deduction_details: newDetails });
            toast.success('Cập nhật khấu trừ thành công');
            
            setShowByDay(false);
            setShowOther(false);
            
            // Refresh parent
            window.location.reload();
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Lỗi khi lưu khấu trừ');
        } finally {
            setLoading(false);
        }
    };

    if (!open) return null;

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[700px] p-0 overflow-hidden bg-white">
                <DialogHeader className="px-6 py-4 border-b border-gray-100 bg-[#fbfcfd]">
                    <DialogTitle className="text-[16px] font-bold text-gray-900">
                        Các khoản giảm trừ
                    </DialogTitle>
                    <p className="text-[13px] text-gray-500 mt-1">
                        Nhân viên: <span className="font-semibold text-gray-800">{record.user?.name}</span>
                    </p>
                </DialogHeader>

                <div className="flex-1 overflow-auto max-h-[60vh] p-4 bg-white">
                    <table className="w-full text-[13px] text-left">
                        <thead className="bg-[#eef3fb] rounded-t-lg">
                            <tr>
                                <th className="px-3 py-3 font-semibold text-gray-900 first:rounded-tl-lg">Loại giảm trừ</th>
                                <th className="px-3 py-3 font-semibold text-gray-900 text-right w-[150px] last:rounded-tr-lg">Tiền giảm trừ</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {/* Summary row */}
                            <tr className="hover:bg-gray-50/50 transition-colors">
                                <td className="px-3 py-4"></td>
                                <td className="px-3 py-4 text-right font-bold text-[14px] text-gray-900">
                                    {loading ? (
                                        <Loader2 className="h-4 w-4 animate-spin ml-auto" />
                                    ) : (
                                        formatCurrency(totalManual).replace(' ₫', '')
                                    )}
                                </td>
                            </tr>
                            
                            {/* Categories */}
                            <tr className="hover:bg-gray-50/50 transition-colors">
                                <td className="px-3 py-4 text-gray-700">Phạt vi phạm theo ngày</td>
                                <td className="px-3 py-4 text-right">
                                    <button 
                                        className="text-blue-500 hover:text-blue-700 text-[18px] font-medium transition-colors"
                                        onClick={() => setShowByDay(true)}
                                    >
                                        +
                                    </button>
                                </td>
                            </tr>
                            <tr className="hover:bg-gray-50/50 transition-colors">
                                <td className="px-3 py-4 text-gray-700">Giảm trừ khác</td>
                                <td className="px-3 py-4 text-right">
                                    <button 
                                        className="text-blue-500 hover:text-blue-700 text-[18px] font-medium transition-colors"
                                        onClick={() => setShowOther(true)}
                                    >
                                        +
                                    </button>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <DialogFooter className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 bg-white">
                    <Button
                        variant="outline"
                        onClick={onClose}
                        className="h-9 px-6 text-[13px] border-gray-200 text-gray-700 font-medium"
                    >
                        Bỏ qua
                    </Button>
                </DialogFooter>
            </DialogContent>
            
            {/* Nested Dialogs */}
            {showByDay && (
                <ViolationByDayDialog 
                    open={showByDay} 
                    onClose={() => setShowByDay(false)} 
                    record={record}
                    initialData={manualDetails.byDay}
                    onConfirm={(data) => handleUpdateManualDeduction('byDay', data)}
                />
            )}
            
            {showOther && (
                <DeductionOtherDialog 
                    open={showOther} 
                    onClose={() => setShowOther(false)} 
                    record={record}
                    initialData={manualDetails.other}
                    onConfirm={(data) => handleUpdateManualDeduction('other', data)}
                />
            )}
        </Dialog>
    );
}
