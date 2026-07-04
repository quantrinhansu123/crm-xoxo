import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';

interface QuickScheduleConfirmDialogProps {
    open: boolean;
    onClose: () => void;
    onConfirm: () => void;
    employeeName: string;
    shiftName: string;
    date: Date | null;
}

export function QuickScheduleConfirmDialog({
    open,
    onClose,
    onConfirm,
    employeeName,
    shiftName,
    date
}: QuickScheduleConfirmDialogProps) {
    if (!date) return null;

    const formattedDate = format(date, "eeee, dd/MM/yyyy", { locale: vi });

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-[450px] p-0 gap-0 overflow-hidden [&>button]:hidden rounded-2xl">
                {/* Header */}
                <div className="px-6 pt-5 pb-4">
                    <div className="flex items-start justify-between">
                        <div>
                            <h2 className="text-[17px] font-bold text-gray-900 uppercase">{shiftName}</h2>
                            <p className="text-[13px] text-gray-400 mt-0.5 capitalize">{formattedDate}</p>
                        </div>
                        <button onClick={onClose} className="h-8 w-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors -mr-2">
                            <X className="h-4 w-4 text-gray-400" />
                        </button>
                    </div>
                </div>

                {/* Body */}
                <div className="px-6 pb-8">
                    <p className="text-[14px] text-gray-700 leading-relaxed">
                        Bạn có chắc chắn muốn đặt lịch cho nhân viên <span className="font-extrabold uppercase">{employeeName}</span> ở ca này?
                    </p>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50/30">
                    <Button
                        variant="outline"
                        onClick={onClose}
                        className="h-[36px] px-6 text-[13px] font-medium border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50"
                    >
                        Bỏ qua
                    </Button>
                    <Button
                        onClick={onConfirm}
                        className="h-[36px] px-8 text-[13px] font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-sm"
                    >
                        Đồng ý
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
