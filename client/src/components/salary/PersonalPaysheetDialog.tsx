import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/utils';
import { Download, Printer, DollarSign, X, FileDown, FileText, FileSpreadsheet, Loader2 } from 'lucide-react';
import { useDepartments } from '@/hooks/useDepartments';
import { salaryApi } from '@/lib/api';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';

import { UpdateBaseSalaryDialog } from './UpdateBaseSalaryDialog';
import { BusinessCommissionDetailDialog } from './BusinessCommissionDetailDialog';
import { BonusDetailDialog } from './BonusDetailDialog';
import { DeductionDetailDialog } from './DeductionDetailDialog';
import { SalaryPaymentDialog } from './SalaryPaymentDialog';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertTriangle, Info } from 'lucide-react';

interface PersonalPaysheetDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    record: any;
    plCode: string;
    onReload?: () => void;
}

export function PersonalPaysheetDialog({ open, onOpenChange, record, plCode, onReload }: PersonalPaysheetDialogProps) {
    const { departments, fetchDepartments } = useDepartments();
    const [activeTab, setActiveTab] = useState<'payment' | 'attendance'>('payment');
    const [payAmount, setPayAmount] = useState<string>('');
    const [showUpdateBase, setShowUpdateBase] = useState(false);
    const [showCommissionDetail, setShowCommissionDetail] = useState(false);
    const [showBonusDetail, setShowBonusDetail] = useState(false);
    const [showDeductionDetail, setShowDeductionDetail] = useState(false);
    const [exportLoading, setExportLoading] = useState(false);
    const [showPaymentConfirm, setShowPaymentConfirm] = useState(false);
    const [showSalaryPayment, setShowSalaryPayment] = useState(false);
    const [paymentLoading, setPaymentLoading] = useState(false);
    const [dontAskAgain, setDontAskAgain] = useState(() => {
        return localStorage.getItem('salary_payment_confirm_skip') === 'true';
    });

    useEffect(() => {
        if (open) {
            fetchDepartments();
        }
    }, [open, fetchDepartments]);

    if (!record) return null;

    // Resolve department
    const deptName = departments.find(d => d.id === record.user?.department)?.name || record.user?.department || '--';

    const gross = record.net_salary || 0;
    const paid = record.status === 'paid' ? record.net_salary : 0;
    const remaining = gross - paid;
    const salaryTypeLabel = 'Theo ngày công chuẩn';
    const hasKpiDetails = Boolean(
        Number(record.kpi_primary_bonus || 0) > 0
        || Number(record.teamlead_bonus || 0) > 0
        || Number(record.management_bonus || 0) > 0
        || (record.kpi_secondary_details?.length || 0) > 0
    );
    const employeeCode = record.user?.employee_code || record.employee_code || '--';
    const standardWorkDays = record.standard_work_days || record.salary_config?.standard_work_days || record.company_policy?.standard_work_days || 26;

    // Default to pay full remaining if opened
    useEffect(() => {
        if (open) {
            setPayAmount(formatCurrency(remaining).replace(/,/g, ''));
        }
    }, [open, remaining]);

    const handlePayAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value.replace(/[^0-9]/g, '');
        setPayAmount(val);
    };

    // ========== EXPORT LOGIC ==========
    const downloadCSV = (filename: string, data: string[][]) => {
        const csvContent = "\uFEFF" + data.map(row => 
            row.map(cell => {
                const str = String(cell).replace(/"/g, '""');
                return `"${str}"`;
            }).join(',')
        ).join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleExportCommissionByInvoice = async () => {
        try {
            setExportLoading(true);
            const res = await salaryApi.getCommissionDetails(record.user_id, record.month, record.year);
            const commissions = res.data.data?.commissions || [];
            
            if (commissions.length === 0) {
                toast.info('Không có dữ liệu hoa hồng để xuất');
                return;
            }

            const headers = ['Mã hóa đơn', 'Thời gian', 'Khách hàng', 'Loại hình', 'Doanh thu', 'Mức %', 'Tiền hoa hồng'];
            const rows = commissions.map((c: any) => [
                c.invoice,
                c.time,
                c.customer_name,
                c.type,
                c.revenue,
                c.rate,
                c.commission_amount
            ]);

            downloadCSV(`Hoa_hong_theo_hoa_don_${record.user?.name}_T${record.month}_${record.year}.csv`, [headers, ...rows]);
            toast.success('Đã xuất file hoa hồng theo hóa đơn');
        } catch (error) {
            console.error('Export error:', error);
            toast.error('Lỗi khi xuất file');
        } finally {
            setExportLoading(false);
        }
    };

    const handleExportCommissionByProduct = async () => {
        try {
            setExportLoading(true);
            const res = await salaryApi.getCommissionDetails(record.user_id, record.month, record.year);
            const commissions = res.data.data?.commissions || [];
            
            if (commissions.length === 0) {
                toast.info('Không có dữ liệu hoa hồng để xuất');
                return;
            }

            const headers = ['Sản phẩm/Dịch vụ', 'Mã hóa đơn', 'Thời gian', 'Số lượng', 'Doanh thu', 'Tiền hoa hồng'];
            const rows = commissions.map((c: any) => [
                c.product_name,
                c.invoice,
                c.time,
                c.quantity,
                c.revenue,
                c.commission_amount
            ]);

            downloadCSV(`Hoa_hong_theo_san_pham_${record.user?.name}_T${record.month}_${record.year}.csv`, [headers, ...rows]);
            toast.success('Đã xuất file hoa hồng theo sản phẩm');
        } catch (error) {
            console.error('Export error:', error);
            toast.error('Lỗi khi xuất file');
        } finally {
            setExportLoading(false);
        }
    };

    const handleExportPayslip = () => {
        const headers = ['Khoản mục', 'Giá trị (VND)'];
        const rows = [
            ['Nhân viên', record.user?.name || '--'],
            ['Mã nhân viên', employeeCode],
            ['Tháng/Năm', `${record.month}/${record.year}`],
            ['Lương chính', record.base_salary || 0],
            ['Hoa hồng', record.commission || 0],
            ['Thưởng', record.bonus || 0],
            ['Tổng thu nhập', gross],
            ['Giảm trừ', record.deduction || 0],
            ['Tổng lương thực nhận', gross - (record.deduction || 0)],
            ['Đã trả', paid],
            ['Còn lại', remaining]
        ];

        downloadCSV(`Phieu_luong_${record.user?.name}_T${record.month}_${record.year}.csv`, [headers, ...rows]);
        toast.success('Đã xuất file phiếu lương');
    };

    // ========== PRINT LOGIC ==========
    const getPrintBaseStyles = () => `
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: 'Inter', system-ui, sans-serif; padding: 40px; color: #1a1a1a; line-height: 1.5; font-size: 13px; }
            .header { text-align: center; margin-bottom: 30px; }
            .header h1 { font-size: 22px; font-weight: 700; text-transform: uppercase; color: #000; letter-spacing: 0.5px; }
            .header p { color: #666; margin-top: 4px; font-size: 14px; }
            
            .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 30px; padding: 20px; background: #fafafa; border-radius: 8px; border: 1px solid #eee; }
            .info-item { display: flex; gap: 8px; }
            .info-label { color: #666; width: 120px; flex-shrink: 0; }
            .info-value { font-weight: 600; color: #000; }

            .section-title { font-size: 16px; font-weight: 700; margin: 24px 0 12px 0; padding-bottom: 8px; border-bottom: 2px solid #e2e8f0; color: #2d3748; display: flex; align-items: center; gap: 8px; }
            
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            th { text-align: left; padding: 12px; border-bottom: 1px solid #e2e8f0; color: #4a5568; font-weight: 600; background: #f8fafc; text-transform: uppercase; font-size: 11px; }
            td { padding: 12px; border-bottom: 1px solid #edf2f7; vertical-align: middle; }
            .text-right { text-align: right; }
            .font-bold { font-weight: 700; }
            .text-primary { color: #2563eb; }
            .text-success { color: #059669; }
            .text-danger { color: #dc2626; }

            .summary-table td { font-size: 14px; }
            .summary-row-main { background: #f1f5f9; }
            .summary-row-total { background: #eff6ff; }
            
            .footer { margin-top: 50px; display: grid; grid-template-columns: 1fr 1fr; text-align: center; }
            .footer-sign { height: 100px; }
            
            @media print {
                body { padding: 0; }
                .no-print { display: none; }
                @page { margin: 20mm; }
            }
        </style>
    `;

    const openPrintWindow = (content: string) => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Phiếu lương - ${record.user?.name}</title>
                ${getPrintBaseStyles()}
            </head>
            <body>
                ${content}
                <script>
                    setTimeout(() => {
                        window.print();
                        window.close();
                    }, 500);
                </script>
            </body>
            </html>
        `);
        printWindow.document.close();
    };

    const generateSalarySummaryHTML = () => `
        <div class="header">
            <h1>Phiếu Lương Nhân Viên</h1>
            <p>Tháng ${record.month} Năm ${record.year}</p>
        </div>

        <div class="info-grid">
            <div class="info-item"><span class="info-label">Nhân viên:</span><span class="info-value">${record.user?.name || '--'}</span></div>
            <div class="info-item"><span class="info-label">Mã NV:</span><span class="info-value">${employeeCode}</span></div>
            <div class="info-item"><span class="info-label">Phòng ban:</span><span class="info-value">${record.department?.name || '--'}</span></div>
            <div class="info-item"><span class="info-label">Ngày in:</span><span class="info-value">${new Date().toLocaleDateString('vi-VN')}</span></div>
        </div>

        <h2 class="section-title">Chi tiết lương</h2>
        <table class="summary-table">
            <thead>
                <tr>
                    <th>Khoản mục</th>
                    <th class="text-right">Giá trị (VND)</th>
                </tr>
            </thead>
            <tbody>
                <tr><td>Lương chính</td><td class="text-right font-bold">${formatCurrency(record.base_salary)}</td></tr>
                <tr><td>Phụ cấp/Hoa hồng</td><td class="text-right font-bold text-success">${formatCurrency(record.commission)}</td></tr>
                <tr><td>Thưởng</td><td class="text-right font-bold text-success">${formatCurrency(record.bonus)}</td></tr>
                <tr class="summary-row-main">
                    <td class="font-bold">TỔNG THU NHẬP (A)</td>
                    <td class="text-right font-bold text-primary">${formatCurrency(gross)}</td>
                </tr>
                <tr><td>Các khoản giảm trừ (B)</td><td class="text-right font-bold text-danger">-${formatCurrency(record.deduction || 0)}</td></tr>
                <tr class="summary-row-total">
                    <td class="font-bold text-primary" style="font-size: 16px;">THỰC LĨNH = (A) - (B)</td>
                    <td class="text-right font-bold text-primary" style="font-size: 18px;">${formatCurrency(gross - (record.deduction || 0))}</td>
                </tr>
                <tr><td>Đã thanh toán</td><td class="text-right font-bold text-success">${formatCurrency(paid)}</td></tr>
                <tr><td>Còn lại</td><td class="text-right font-bold text-danger">${formatCurrency(remaining)}</td></tr>
            </tbody>
        </table>

        <div class="footer">
            <div>
                <p><strong>Người nhận lương</strong></p>
                <p>(Ký và ghi rõ họ tên)</p>
                <div class="footer-sign"></div>
            </div>
            <div>
                <p><strong>Người lập biểu</strong></p>
                <p>(Ký và ghi rõ họ tên)</p>
                <div class="footer-sign"></div>
            </div>
        </div>
    `;

    const handlePrintGeneral = () => {
        openPrintWindow(generateSalarySummaryHTML());
    };

    const handlePrintWithCommissionByInvoice = async () => {
        try {
            setExportLoading(true);
            const res = await salaryApi.getCommissionDetails(record.user_id, record.month, record.year);
            const commissions = res.data.data?.commissions || [];
            
            let commissionHTML = '';
            if (commissions.length > 0) {
                commissionHTML = `
                    <div style="page-break-before: always;"></div>
                    <h2 class="section-title">Bảng kê chi tiết hoa hồng theo hóa đơn</h2>
                    <table>
                        <thead>
                            <tr>
                                <th>Mã hóa đơn</th>
                                <th>Thời gian</th>
                                <th>Khách hàng</th>
                                <th>Loại hình</th>
                                <th class="text-right">Hoa hồng</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${commissions.map((c: any) => `
                                <tr>
                                    <td>${c.invoice}</td>
                                    <td>${c.time}</td>
                                    <td>${c.customer_name}</td>
                                    <td>${c.type}</td>
                                    <td class="text-right">${formatCurrency(c.commission_amount)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                        <tfoot>
                            <tr class="summary-row-main">
                                <td colspan="4" class="font-bold">TỔNG CỘNG</td>
                                <td class="text-right font-bold">${formatCurrency(record.commission)}</td>
                            </tr>
                        </tfoot>
                    </table>
                `;
            }

            openPrintWindow(generateSalarySummaryHTML() + commissionHTML);
        } catch (error) {
            console.error('Print error:', error);
            toast.error('Lỗi khi tải dữ liệu in');
        } finally {
            setExportLoading(false);
        }
    };

    const handlePrintWithCommissionByProduct = async () => {
        try {
            setExportLoading(true);
            const res = await salaryApi.getCommissionDetails(record.user_id, record.month, record.year);
            const commissions = res.data.data?.commissions || [];
            
            let commissionHTML = '';
            if (commissions.length > 0) {
                commissionHTML = `
                    <div style="page-break-before: always;"></div>
                    <h2 class="section-title">Bảng kê chi tiết hoa hồng theo sản phẩm</h2>
                    <table>
                        <thead>
                            <tr>
                                <th>Sản phẩm/Dịch vụ</th>
                                <th>Mã HĐ</th>
                                <th>Số lượng</th>
                                <th class="text-right">Doanh thu</th>
                                <th class="text-right">Hoa hồng</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${commissions.map((c: any) => `
                                <tr>
                                    <td>${c.product_name}</td>
                                    <td>${c.invoice}</td>
                                    <td>${c.quantity}</td>
                                    <td class="text-right">${formatCurrency(c.revenue)}</td>
                                    <td class="text-right">${formatCurrency(c.commission_amount)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                        <tfoot>
                            <tr class="summary-row-main">
                                <td colspan="4" class="font-bold">TỔNG CỘNG</td>
                                <td class="text-right font-bold">${formatCurrency(record.commission)}</td>
                            </tr>
                        </tfoot>
                    </table>
                `;
            }

            openPrintWindow(generateSalarySummaryHTML() + commissionHTML);
        } catch (error) {
            console.error('Print error:', error);
            toast.error('Lỗi khi tải dữ liệu in');
        } finally {
            setExportLoading(false);
        }
    };

    const handlePaymentClick = () => {
        if (record.status === 'paid') {
            toast.info('Phiếu lương này đã được thanh toán');
            return;
        }

        if (dontAskAgain) {
            handleExecutePayment();
        } else {
            setShowPaymentConfirm(true);
        }
    };

    const handleExecutePayment = async () => {
        setShowPaymentConfirm(false);
        setShowSalaryPayment(true);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[800px] p-0 gap-0 border-0 shadow-lg [&>button]:hidden">
                {/* Header */}
                <DialogHeader className="p-4 border-b border-gray-200 flex flex-row items-center justify-between">
                    <DialogTitle className="text-[16px] font-semibold text-gray-800">
                        Phiếu lương cá nhân {plCode}
                    </DialogTitle>
                    <DialogClose asChild>
                        <button className="text-gray-400 hover:text-gray-600 transition-colors">
                            <X className="h-5 w-5" />
                        </button>
                    </DialogClose>
                </DialogHeader>

                {/* Tabs */}
                <div className="flex border-b border-gray-200 px-4 mt-2">
                    <button
                        onClick={() => setActiveTab('payment')}
                        className={`text-[13px] font-medium px-4 py-2 border-b-2 -mb-px transition-colors ${
                            activeTab === 'payment' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        Thanh toán
                    </button>
                    <button
                        onClick={() => setActiveTab('attendance')}
                        className={`text-[13px] font-medium px-4 py-2 border-b-2 -mb-px transition-colors ${
                            activeTab === 'attendance' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        Chấm công chi tiết
                    </button>
                </div>

                {/* Content */}
                <div className="p-6">
                    {activeTab === 'payment' && (
                        <div className="flex gap-10">
                            {/* Left Column - Readonly */}
                            <div className="flex-1 space-y-4">
                                <div className="flex">
                                    <div className="w-[120px] text-[13px] text-gray-600 font-medium">{employeeCode}:</div>
                                    <div className="flex-1 text-[13px] font-semibold text-gray-800 uppercase">{record.user?.name || '--'}</div>
                                </div>
                                <div className="flex">
                                    <div className="w-[120px] text-[13px] text-gray-600">Phòng ban:</div>
                                    <div className="flex-1 text-[13px] text-gray-800">{deptName}</div>
                                </div>
                                <div className="flex">
                                    <div className="w-[120px] text-[13px] text-gray-600">Chức danh:</div>
                                    <div className="flex-1 text-[13px] text-gray-800">{record.user?.role || '--'}</div>
                                </div>
                                <div className="flex items-center">
                                    <div className="w-[120px] text-[13px] text-gray-600">Loại lương chính:</div>
                                    <div className="flex-1 text-[13px] text-gray-800">{salaryTypeLabel}</div>
                                </div>
                                <div className="flex">
                                    <div className="w-[120px] text-[13px] text-gray-600">Trạng thái:</div>
                                    <div className="flex-1 text-[13px] text-gray-800">
                                        {record.status === 'paid' ? 'Đã thanh toán' : record.status === 'approved' ? 'Đã chốt' : 'Tạm tính'}
                                    </div>
                                </div>
                                <div className="flex">
                                    <div className="w-[120px] text-[13px] text-gray-600">Bảng lương:</div>
                                    <div className="flex-1 text-[13px] text-gray-800">Bảng lương tháng {record.month}/{record.year}</div>
                                </div>
                                <div className="flex">
                                    <div className="w-[120px] text-[13px] text-gray-600">Kỳ làm việc:</div>
                                    <div className="flex-1 text-[13px] text-gray-800">
                                        01/{String(record.month).padStart(2, '0')}/{record.year} - 
                                        {new Date(record.year, record.month, 0).getDate()}/{String(record.month).padStart(2, '0')}/{record.year}
                                    </div>
                                </div>
                                <div className="flex items-center">
                                    <div className="w-[120px] text-[13px] text-gray-600">Ngày công chuẩn:</div>
                                    <div className="flex-1 text-[13px] text-gray-800">{standardWorkDays}</div>
                                </div>
                                <div className="flex mt-2">
                                    <div className="w-[120px] text-[13px] text-gray-400 italic">Ghi chú</div>
                                </div>
                            </div>

                            {/* Right Column - Inputs & Computed */}
                            <div className="flex-[1.2] space-y-4">
                                <div className="flex items-center">
                                    <div className="w-[120px] text-[13px] text-gray-600">Lương chính:</div>
                                    <div className="flex-1 cursor-pointer" onClick={() => setShowUpdateBase(true)}>
                                        <input
                                            type="text"
                                            readOnly
                                            className="w-full h-8 px-3 text-right text-[13px] border border-blue-200 rounded text-blue-700 bg-blue-50 focus:outline-none cursor-pointer hover:bg-blue-100 transition-colors pointer-events-none"
                                            value={formatCurrency(record.base_salary || 0)}
                                        />
                                    </div>
                                </div>
                                <div className="flex items-center">
                                    <div className="w-[120px] text-[13px] text-gray-600">Hoa hồng:</div>
                                    <div className="flex-1 cursor-pointer" onClick={() => setShowCommissionDetail(true)}>
                                        <input
                                            type="text"
                                            readOnly
                                            className="w-full h-8 px-3 text-right text-[13px] border border-blue-200 rounded text-blue-700 bg-blue-50 focus:outline-none cursor-pointer hover:bg-blue-100 transition-colors pointer-events-none"
                                            value={formatCurrency(record.commission || 0)}
                                        />
                                    </div>
                                </div>
                                <div className="flex items-center">
                                    <div className="w-[120px] text-[13px] text-gray-600">Thưởng:</div>
                                    <div className="flex-1 cursor-pointer" onClick={() => setShowBonusDetail(true)}>
                                        <input
                                            type="text"
                                            readOnly
                                            className="w-full h-8 px-3 text-right text-[13px] border border-blue-200 rounded text-blue-700 bg-blue-50 focus:outline-none cursor-pointer hover:bg-blue-100 transition-colors pointer-events-none"
                                            value={formatCurrency(record.bonus || 0)}
                                        />
                                    </div>
                                </div>
                                {hasKpiDetails && (
                                    <div className="mt-3 pt-3 border-t border-gray-100">
                                        <div className="text-[11px] font-semibold text-gray-500 mb-2 uppercase">Chi tiết KPI</div>
                                        {record.kpi_primary_score && (
                                            <div className="flex items-center mb-1">
                                                <div className="w-[120px] text-[12px] text-gray-600">KPI Chính:</div>
                                                <div className="flex-1 flex items-center justify-end gap-2">
                                                    <span className="text-[12px] text-gray-500">{record.kpi_primary_score}đ - {record.kpi_primary_rank}</span>
                                                    <span className="text-[12px] text-green-600 font-medium">+{formatCurrency(record.kpi_primary_bonus || 0)}</span>
                                                </div>
                                            </div>
                                        )}
                                        {record.kpi_secondary_details && record.kpi_secondary_details.length > 0 && (
                                            <div className="flex items-center mb-1">
                                                <div className="w-[120px] text-[12px] text-gray-600">KPI Phụ:</div>
                                                <div className="flex-1 flex flex-col items-end gap-1">
                                                    {record.kpi_secondary_details.map((kpi: any, idx: number) => (
                                                        <div key={idx} className="flex items-center gap-2 text-right">
                                                            <Badge variant="secondary" className="text-[10px] h-4 px-1">{kpi.policy_code}</Badge>
                                                            <span className="text-[12px] text-gray-500">{kpi.score}đ - {kpi.rank}</span>
                                                            <span className="text-[12px] text-green-600 font-medium">+{formatCurrency(kpi.bonus || 0)}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {record.teamlead_bonus > 0 && (
                                            <div className="flex items-center mb-1">
                                                <div className="w-[120px] text-[12px] text-gray-600">Thưởng Team Lead:</div>
                                                <div className="flex-1 text-right">
                                                    <span className="text-[12px] text-green-600 font-medium">+{formatCurrency(record.teamlead_bonus)}</span>
                                                </div>
                                            </div>
                                        )}
                                        {record.management_bonus > 0 && (
                                            <div className="flex items-center mb-1">
                                                <div className="w-[120px] text-[12px] text-gray-600">Thưởng Quản lý:</div>
                                                <div className="flex-1 text-right">
                                                    <span className="text-[12px] text-green-600 font-medium">+{formatCurrency(record.management_bonus)}</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                                <div className="flex items-center pt-2">
                                    <div className="w-[120px] text-[13px] font-semibold text-gray-800">Tổng thu nhập:</div>
                                    <div className="flex-1 text-right text-[13px] font-semibold text-gray-800 pr-3">
                                        {formatCurrency(gross)}
                                    </div>
                                </div>
                                <div className="flex items-center">
                                    <div className="w-[120px] text-[13px] text-gray-600">Giảm trừ:</div>
                                    <div className="flex-1 cursor-pointer" onClick={() => setShowDeductionDetail(true)}>
                                        <input
                                            type="text"
                                            readOnly
                                            className="w-full h-8 px-3 text-right text-[13px] border border-blue-200 rounded text-blue-700 bg-blue-50 focus:outline-none cursor-pointer hover:bg-blue-100 transition-colors pointer-events-none"
                                            value={formatCurrency(record.deduction || 0)}
                                        />
                                    </div>
                                </div>
                                <div className="flex items-center pt-2 border-t border-gray-100">
                                    <div className="w-[120px] text-[13px] font-semibold text-gray-800">Tổng lương:</div>
                                    <div className="flex-1 text-right text-[13px] font-bold text-gray-900 pr-3">
                                        {formatCurrency(gross - (record.deduction || 0))}
                                    </div>
                                </div>
                                <div className="flex items-center">
                                    <div className="w-[120px] text-[13px] text-gray-600">Còn cần trả:</div>
                                    <div className="flex-1 text-right text-[13px] font-bold text-gray-900 pr-3">
                                        {formatCurrency(remaining)}
                                    </div>
                                </div>
                                <div className="flex items-center pt-2">
                                    <div className="w-[120px] text-[13px] text-gray-600">Tiền trả nhân viên:</div>
                                    <div className="flex-1">
                                        <input
                                            type="text"
                                            className="w-full h-8 px-3 text-right text-[13px] border border-blue-400 rounded text-gray-900 font-medium focus:outline-none focus:ring-1 focus:ring-blue-500"
                                            value={payAmount ? formatCurrency(parseFloat(payAmount)) : ''}
                                            onChange={handlePayAmountChange}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                    {activeTab === 'attendance' && (
                        <div className="h-[300px] flex items-center justify-center text-gray-400 text-[13px]">
                            Chưa có dữ liệu chấm công chi tiết
                        </div>
                    )}
                </div>

                {/* Footer Buttons */}
                <DialogFooter className="p-4 border-t border-gray-200 bg-gray-50 flex items-center sm:justify-between gap-2">
                    <div className="flex-1"></div>
                    <div className="flex items-center gap-2">
                        <DialogClose asChild>
                            <Button variant="outline" className="h-8 px-4 text-[13px] font-medium border-gray-300 text-gray-700 bg-white hover:bg-gray-50 min-w-[80px]">
                                Bỏ qua
                            </Button>
                        </DialogClose>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button 
                                    variant="outline" 
                                    disabled={exportLoading}
                                    className="h-8 px-4 text-[13px] font-medium border-gray-300 text-gray-700 bg-white hover:bg-gray-50 gap-1.5 min-w-[80px]"
                                >
                                    {exportLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                                    Xuất file
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-[240px]">
                                <DropdownMenuItem className="text-[13px] py-2 cursor-pointer gap-2" onClick={handleExportCommissionByInvoice}>
                                    <FileText className="h-4 w-4 text-orange-500" />
                                    Xuất file hoa hồng theo hóa đơn
                                </DropdownMenuItem>
                                <DropdownMenuItem className="text-[13px] py-2 cursor-pointer gap-2" onClick={handleExportCommissionByProduct}>
                                    <FileSpreadsheet className="h-4 w-4 text-blue-500" />
                                    Xuất file hoa hồng theo sản phẩm
                                </DropdownMenuItem>
                                <DropdownMenuItem className="text-[13px] py-2 cursor-pointer gap-2" onClick={handleExportPayslip}>
                                    <FileDown className="h-4 w-4 text-green-600" />
                                    Xuất file phiếu lương
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button 
                                    variant="outline" 
                                    disabled={exportLoading}
                                    className="h-8 px-4 text-[13px] font-medium border-gray-300 text-gray-700 bg-white hover:bg-gray-50 gap-1.5 min-w-[80px]"
                                >
                                    {exportLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
                                    In
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-[280px]">
                                <DropdownMenuItem className="text-[13px] py-2 cursor-pointer gap-2" onClick={handlePrintGeneral}>
                                    <FileText className="h-4 w-4 text-blue-500" />
                                    In thông tin chung
                                </DropdownMenuItem>
                                <DropdownMenuItem className="text-[13px] py-2 cursor-pointer gap-2" onClick={handlePrintWithCommissionByInvoice}>
                                    <FileSpreadsheet className="h-4 w-4 text-orange-500" />
                                    In kèm bảng kê hoa hồng theo hóa đơn
                                </DropdownMenuItem>
                                <DropdownMenuItem className="text-[13px] py-2 cursor-pointer gap-2" onClick={handlePrintWithCommissionByProduct}>
                                    <FileSpreadsheet className="h-4 w-4 text-green-600" />
                                    In kèm bảng kê hoa hồng theo sản phẩm
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <Button 
                            variant="outline" 
                            disabled={paymentLoading}
                            onClick={handlePaymentClick}
                            className="h-8 px-4 text-[13px] font-medium border-gray-300 text-gray-700 bg-white hover:bg-gray-50 gap-1.5 min-w-[100px]"
                        >
                            {paymentLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <DollarSign className="h-3.5 w-3.5" />}
                            Thanh toán
                        </Button>
                        <Button 
                            className="h-8 px-5 text-[13px] font-medium bg-blue-600 hover:bg-blue-700 text-white min-w-[80px]"
                            onClick={() => onOpenChange(false)}
                        >
                            Xong
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>

            {/* Payment Confirmation Dialog */}
            <Dialog open={showPaymentConfirm} onOpenChange={setShowPaymentConfirm}>
                <DialogContent className="sm:max-w-[450px] p-6">
                    <DialogHeader>
                        <DialogTitle className="text-[16px] font-bold flex items-center gap-2">
                            Xác nhận
                        </DialogTitle>
                        <DialogClose asChild>
                            <button className="absolute right-4 top-4 opacity-70 transition-opacity hover:opacity-100 outline-none">
                                <X className="h-4 w-4" />
                            </button>
                        </DialogClose>
                    </DialogHeader>
                    
                    <div className="py-4 space-y-4">
                        <p className="text-[14px] text-gray-700 leading-relaxed">
                            Hệ thống sẽ lưu tạm bảng lương và tạo phiếu chi lương tương ứng. 
                            Bạn có chắc chắn muốn thanh toán phiếu lương này?
                        </p>
                        
                        <div className="flex items-center gap-2 pt-2">
                            <Checkbox 
                                id="dontAskAgain" 
                                checked={dontAskAgain}
                                onCheckedChange={(checked) => setDontAskAgain(checked === true)}
                            />
                            <label 
                                htmlFor="dontAskAgain"
                                className="text-[13px] text-gray-600 cursor-pointer select-none"
                            >
                                Không hỏi lại lần sau
                            </label>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 mt-4">
                        <Button 
                            variant="outline" 
                            className="h-9 px-6 text-[13px]" 
                            onClick={() => setShowPaymentConfirm(false)}
                        >
                            Bỏ qua
                        </Button>
                        <Button 
                            disabled={paymentLoading}
                            className="h-9 px-6 text-[13px] bg-blue-600 hover:bg-blue-700" 
                            onClick={handleExecutePayment}
                        >
                            {paymentLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            Đồng ý
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Nested Dialogs */}
            <UpdateBaseSalaryDialog
                open={showUpdateBase}
                onClose={() => setShowUpdateBase(false)}
                record={record}
                onSuccess={() => {
                    if (onReload) {
                        onReload();
                    }
                }}
            />
            <BusinessCommissionDetailDialog
                open={showCommissionDetail}
                onClose={() => setShowCommissionDetail(false)}
                record={record}
            />
            <BonusDetailDialog
                open={showBonusDetail}
                onClose={() => setShowBonusDetail(false)}
                record={record}
            />
            <DeductionDetailDialog
                open={showDeductionDetail}
                onClose={() => setShowDeductionDetail(false)}
                record={record}
            />
            <SalaryPaymentDialog 
                open={showSalaryPayment}
                onClose={() => setShowSalaryPayment(false)}
                record={record}
                onSuccess={() => {
                    if (onReload) onReload();
                    // Lưu preference nếu người dùng đã tích vào bước confirm trước đó
                    if (dontAskAgain) {
                        localStorage.setItem('salary_payment_confirm_skip', 'true');
                    }
                }}
            />
        </Dialog>
    );
}

