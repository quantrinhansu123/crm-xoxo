import React, { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { api, salaryApi } from '../../lib/api';
import { Input } from '../ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';

interface CommissionDetail {
    invoice: string;
    time: string;
    customer_name: string;
    type: string;
    product_name: string;
    quantity: number;
    revenue: number;
    rate: string;
    commission_amount: number;
}

interface BusinessCommissionDetailDialogProps {
    open: boolean;
    onClose: () => void;
    record: any;
}

export function BusinessCommissionDetailDialog({ open, onClose, record }: BusinessCommissionDetailDialogProps) {
    const [loading, setLoading] = useState(false);
    const [details, setDetails] = useState<CommissionDetail[]>([]);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        if (open && record) {
            fetchDetails();
        }
    }, [open, record]);

    const fetchDetails = async () => {
        try {
            setLoading(true);
            const res = await salaryApi.getCommissionDetails(record.user_id, record.month, record.year);
            if (res.data.status === 'success' && res.data.data?.commissions) {
                setDetails(res.data.data.commissions);
            }
        } catch (error) {
            console.error('Failed to fetch commission details', error);
        } finally {
            setLoading(false);
        }
    };

    if (!open) return null;

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
    };

    const filteredDetails = details.filter(item => 
        item.invoice.toLowerCase().includes(searchTerm.toLowerCase()) || 
        item.product_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.customer_name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[900px] p-0 overflow-hidden bg-white">
                <DialogHeader className="px-6 py-4 border-b border-gray-100 bg-[#fbfcfd]">
                    <DialogTitle className="text-[16px] font-bold text-gray-900">
                        Chi tiết hoa hồng kinh doanh
                    </DialogTitle>
                    <p className="text-[13px] text-gray-500 mt-1">
                        Nhân viên: <span className="font-semibold text-gray-800">{record.user?.name}</span>
                    </p>
                </DialogHeader>

                <div className="p-4 border-b flex gap-3 bg-white">
                    <div className="relative w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <Input 
                            type="text" 
                            placeholder="Tìm kiếm hóa đơn..." 
                            className="pl-9 h-9"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-auto max-h-[60vh] p-4 bg-white">
                    {loading ? (
                        <div className="flex justify-center items-center py-12">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                        </div>
                    ) : (
                        <table className="w-full text-[13px] text-left">
                            <thead className="bg-[#f2f6ff] sticky top-0 z-10">
                                <tr>
                                    <th className="px-3 py-3 font-bold text-[11px] text-gray-900 border-b border-gray-200">HÓA ĐƠN</th>
                                    <th className="px-3 py-3 font-bold text-[11px] text-gray-900 border-b border-gray-200">THỜI GIAN</th>
                                    <th className="px-3 py-3 font-bold text-[11px] text-gray-900 border-b border-gray-200">KHÁCH HÀNG</th>
                                    <th className="px-3 py-3 font-bold text-[11px] text-gray-900 border-b border-gray-200">LOẠI HÌNH</th>
                                    <th className="px-3 py-3 font-bold text-[11px] text-gray-900 border-b border-gray-200 w-[150px]">HÀNG HÓA</th>
                                    <th className="px-3 py-3 font-bold text-[11px] text-gray-900 border-b border-gray-200 text-right">SL</th>
                                    <th className="px-3 py-3 font-bold text-[11px] text-gray-900 border-b border-gray-200 text-right">DOANH THU</th>
                                    <th className="px-3 py-3 font-bold text-[11px] text-gray-900 border-b border-gray-200 text-right">MỨC</th>
                                    <th className="px-3 py-3 font-bold text-[11px] text-gray-900 border-b border-gray-200 text-right">TIỀN HOA HỒNG</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filteredDetails.length === 0 ? (
                                    <tr>
                                        <td colSpan={9} className="text-center py-8 text-gray-500">
                                            Không có dữ liệu hoa hồng
                                        </td>
                                    </tr>
                                ) : (
                                    filteredDetails.map((item, index) => (
                                        <tr key={index} className="hover:bg-blue-50/30 transition-colors">
                                            <td className="px-3 py-[10px] text-gray-700">{item.invoice}</td>
                                            <td className="px-3 py-[10px] text-gray-500">{item.time}</td>
                                            <td className="px-3 py-[10px] truncate max-w-[150px] text-blue-600 font-medium" title={item.customer_name}>{item.customer_name}</td>
                                            <td className="px-3 py-[10px] text-gray-600">{item.type}</td>
                                            <td className="px-3 py-[10px] truncate max-w-[150px] text-gray-700" title={item.product_name}>{item.product_name}</td>
                                            <td className="px-3 py-[10px] text-right text-gray-600">{item.quantity}</td>
                                            <td className="px-3 py-[10px] text-right font-medium text-gray-800">{formatCurrency(item.revenue)}</td>
                                            <td className="px-3 py-[10px] text-right text-gray-600">{item.rate}</td>
                                            <td className="px-3 py-[10px] text-right font-bold text-blue-600">{formatCurrency(item.commission_amount)}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    )}
                </div>

                <DialogFooter className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 bg-gray-50/50">
                    <Button
                        variant="outline"
                        onClick={onClose}
                        className="h-9 px-6 text-[13px] border-gray-200 text-gray-700"
                    >
                        Bỏ qua
                    </Button>
                    <Button
                        onClick={onClose}
                        className="h-9 px-6 text-[13px] bg-blue-600 hover:bg-blue-700 text-white"
                    >
                        Xong
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
