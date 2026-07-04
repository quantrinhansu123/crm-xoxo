import { useState, useEffect } from 'react';
import { Plus, Search, Calendar, Clock, AlertCircle, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';
import { MobileLeaveRequestsList } from '@/components/salary';

interface LeaveRequest {
    id: string;
    user_id: string;
    type: 'leave' | 'late';
    sub_type: string;
    start_time: string;
    end_time: string | null;
    reason: string;
    status: 'pending' | 'approved' | 'rejected';
    approved_by: string | null;
    created_at: string;
    users?: { name: string; email: string; avatar?: string };
    approver?: { name: string; email: string };
}

const statusLabels: Record<string, { label: string; variant: 'default' | 'secondary' | 'success' | 'destructive' | 'warning' }> = {
    pending: { label: 'Chờ duyệt', variant: 'warning' },
    approved: { label: 'Đã duyệt', variant: 'success' },
    rejected: { label: 'Từ chối', variant: 'destructive' },
};

const subTypeLabels: Record<string, string> = {
    annual: 'Xin nghỉ phép (Trước 30 ngày)',
    unexpected_leave: 'Xin nghỉ đột xuất (Trước 3 ngày)',
    unexpected_late: 'Đột xuất (Trước 24 tiếng)',
    planned_late: 'Xin trước (Trước 64 tiếng)',
};

export function LeaveRequestsPage() {
    const { user } = useAuth();
    const [requests, setRequests] = useState<LeaveRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'leave' | 'late'>('leave');
    const [searchTerm, setSearchTerm] = useState('');
    const [showForm, setShowForm] = useState(false);

    // Form state
    const [formType, setFormType] = useState<'leave' | 'late'>('leave');
    const [formSubType, setFormSubType] = useState<string>('annual');
    const [startDate, setStartDate] = useState('');
    const [startTime, setStartTime] = useState('');
    const [endDate, setEndDate] = useState('');
    const [endTime, setEndTime] = useState('');
    const [reason, setReason] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [leaveDays, setLeaveDays] = useState<number>(1);

    useEffect(() => {
        if (formType === 'leave') setFormSubType('annual');
        else setFormSubType('planned_late');
    }, [formType]);

    // Auto-calculate end date based on start date and leave days
    useEffect(() => {
        if (formType === 'leave' && startDate && leaveDays > 0) {
            const start = new Date(startDate);
            const daysToAdd = Math.max(0, Math.ceil(leaveDays) - 1);
            const end = new Date(start);
            end.setDate(start.getDate() + daysToAdd);

            const year = end.getFullYear();
            const month = String(end.getMonth() + 1).padStart(2, '0');
            const day = String(end.getDate()).padStart(2, '0');

            setEndDate(`${year}-${month}-${day}`);
        }
    }, [startDate, leaveDays, formType]);

    const fetchRequests = async () => {
        setLoading(true);
        try {
            const role = user?.role || 'sale';
            const { data } = await api.get(`/leave-requests?user_id=${user?.id}&role=${role}`);
            setRequests(data);
        } catch (error) {
            console.error('Error fetching leave requests:', error);
            toast.error('Lỗi khi tải danh sách yêu cầu');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (user) {
            fetchRequests();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user]);

    const handleCreateRequest = async () => {
        if (!startDate || !reason || (formType === 'leave' && !endDate)) {
            toast.error('Vui lòng điền đầy đủ thông tin bắt buộc');
            return;
        }

        const start = new Date(`${startDate}T${startTime || '00:00'}:00`);
        const now = new Date();
        const diffHours = (start.getTime() - now.getTime()) / (1000 * 60 * 60);

        if (formType === 'leave') {
            const diffDays = Math.ceil(diffHours / 24);
            if (formSubType === 'annual' && diffDays < 30) {
                toast.error('Xin nghỉ phép phải báo trước ít nhất 30 ngày');
                return;
            }
            if (formSubType === 'unexpected_leave' && diffDays < 3) {
                toast.error('Xin nghỉ đột xuất phải báo trước ít nhất 3 ngày');
                return;
            }
        } else if (formType === 'late') {
            if (formSubType === 'planned_late' && diffHours < 64) {
                toast.error('Xin đi muộn (trước 64 tiếng) phải báo trước ít nhất 64 tiếng');
                return;
            }
            if (formSubType === 'unexpected_late' && diffHours < 24) {
                toast.error('Xin đi muộn đột xuất phải báo trước ít nhất 24 tiếng');
                return;
            }
        }

        const start_time = new Date(`${startDate}T${startTime || '00:00'}:00`).toISOString();
        const end_time = formType === 'leave' && endDate ? new Date(`${endDate}T${endTime || '23:59'}:00`).toISOString() : null;

        setSubmitting(true);
        try {
            await api.post('/leave-requests', {
                user_id: user?.id,
                type: formType,
                sub_type: formSubType,
                start_time,
                end_time,
                reason,
            });
            toast.success('Gửi yêu cầu thành công');
            setShowForm(false);
            resetForm();
            fetchRequests();
        } catch (error) {
            console.error('Error creating request:', error);
            toast.error('Lỗi khi gửi yêu cầu');
        } finally {
            setSubmitting(false);
        }
    };

    const handleUpdateStatus = async (id: string, status: 'approved' | 'rejected') => {
        try {
            await api.patch(`/leave-requests/${id}/status`, {
                status,
                approved_by: user?.id
            });
            toast.success(`Đã ${status === 'approved' ? 'duyệt' : 'từ chối'} yêu cầu`);
            fetchRequests();
        } catch (error) {
            console.error('Error updating status:', error);
            toast.error('Lỗi khi cập nhật trạng thái');
        }
    };

    const resetForm = () => {
        setStartDate('');
        setStartTime('');
        setEndDate('');
        setEndTime('');
        setReason('');
        setLeaveDays(1);
        setFormSubType(formType === 'leave' ? 'annual' : 'planned_late');
    };

    const filteredRequests = requests.filter(req => {
        const matchesTab = req.type === activeTab;
        const searchTarget = req.users?.name?.toLowerCase() || '';
        const matchesSearch = searchTarget.includes(searchTerm.toLowerCase()) || req.reason.toLowerCase().includes(searchTerm.toLowerCase());
        return matchesTab && matchesSearch;
    });
    const mobileRequests = filteredRequests.map(req => ({
        ...req,
        end_time: req.end_time ?? undefined,
        approved_by: req.approved_by ?? undefined,
    }));

    const canApprove = user?.role === 'admin' || user?.role === 'manager';

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Xin nghỉ / đi muộn</h1>
                    <p className="text-muted-foreground">Quản lý và tạo yêu cầu xin nghỉ hoặc đi muộn</p>
                </div>
                <Button onClick={() => {
                    setFormType(activeTab);
                    setShowForm(true);
                }}>
                    <Plus className="h-4 w-4 mr-2" />
                    Tạo yêu cầu
                </Button>
            </div>

            {/* Filter and Content */}
            <Card>
                <CardHeader className="p-4 border-b">
                    <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'leave' | 'late')} className="w-full sm:w-auto">
                            <TabsList>
                                <TabsTrigger value="leave" className="gap-2"><Calendar className="h-4 w-4" /> Xin nghỉ</TabsTrigger>
                                <TabsTrigger value="late" className="gap-2"><Clock className="h-4 w-4" /> Xin đi muộn</TabsTrigger>
                            </TabsList>
                        </Tabs>

                        <div className="relative w-full sm:w-64">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                placeholder="Tìm kiếm nhân viên, lý do..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-9"
                            />
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="p-3 sm:hidden">
                        <MobileLeaveRequestsList
                            requests={mobileRequests}
                            loading={loading}
                            onApprove={canApprove ? (requestId) => handleUpdateStatus(requestId, 'approved') : undefined}
                            onReject={canApprove ? (requestId) => handleUpdateStatus(requestId, 'rejected') : undefined}
                        />
                    </div>
                    <div className="hidden sm:block overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-muted/50 border-y">
                                <tr>
                                    <th className="p-3 text-left font-medium text-muted-foreground">Nhân viên</th>
                                    <th className="p-3 text-left font-medium text-muted-foreground">Loại yêu cầu</th>
                                    <th className="p-3 text-left font-medium text-muted-foreground">Thời gian</th>
                                    <th className="p-3 text-left font-medium text-muted-foreground">Lý do</th>
                                    <th className="p-3 text-center font-medium text-muted-foreground">Trạng thái</th>
                                    <th className="p-3 text-right font-medium text-muted-foreground">Thao tác</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading && requests.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="text-center p-8">
                                            <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                                        </td>
                                    </tr>
                                ) : filteredRequests.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="text-center p-8 text-muted-foreground">
                                            Không có dữ liệu yêu cầu
                                        </td>
                                    </tr>
                                ) : (
                                    filteredRequests.map(req => (
                                        <tr key={req.id} className="border-b hover:bg-muted/30 transition-colors">
                                            <td className="p-3 font-medium">{req.users?.name || 'Unknown'}</td>
                                            <td className="p-3">{subTypeLabels[req.sub_type] || req.sub_type}</td>
                                            <td className="p-3">
                                                <div className="text-xs">
                                                    <div>Từ: {new Date(req.start_time).toLocaleString('vi-VN')}</div>
                                                    {req.end_time && <div>Đến: {new Date(req.end_time).toLocaleString('vi-VN')}</div>}
                                                </div>
                                            </td>
                                            <td className="p-3 max-w-[200px] truncate" title={req.reason}>{req.reason}</td>
                                            <td className="p-3 text-center">
                                                <Badge variant={statusLabels[req.status]?.variant || 'secondary'}>
                                                    {statusLabels[req.status]?.label || req.status}
                                                </Badge>
                                                {req.approver && <div className="text-[10px] text-muted-foreground mt-1">bởi {req.approver.name}</div>}
                                            </td>
                                            <td className="p-3 text-right">
                                                {req.status === 'pending' && canApprove ? (
                                                    <div className="flex justify-end gap-2">
                                                        <Button
                                                            size="sm"
                                                            className="h-7 px-2"
                                                            onClick={() => handleUpdateStatus(req.id, 'approved')}
                                                        >
                                                            Duyệt
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="destructive"
                                                            className="h-7 px-2"
                                                            onClick={() => handleUpdateStatus(req.id, 'rejected')}
                                                        >
                                                            Từ chối
                                                        </Button>
                                                    </div>
                                                ) : (
                                                    <span className="text-xs text-muted-foreground">-</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            {/* Create Dialog */}
            <Dialog open={showForm} onOpenChange={(open) => { setShowForm(open); if (!open) resetForm(); }}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Tạo yêu cầu</DialogTitle>
                        <DialogDescription>Gửi yêu cầu xin nghỉ hoặc xin đi muộn đến quản lý để duyệt.</DialogDescription>
                    </DialogHeader>

                    <div className="bg-amber-50 p-3 rounded-md border border-amber-200 text-sm text-amber-800 flex gap-2">
                        <AlertCircle className="h-5 w-5 shrink-0" />
                        <div>
                            <strong>Lưu ý:</strong> Các trường hợp nghỉ/muộn không xin phép sẽ tính vào phạt và bị ghi nhận điểm KPI. Vui lòng tạo yêu cầu trước theo quy định. Cơ sở tính toán là máy chấm công.
                        </div>
                    </div>

                    <div className="space-y-4 py-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Loại yêu cầu</Label>
                                <Select value={formType} onValueChange={(v) => setFormType(v as 'leave' | 'late')}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="leave">Xin nghỉ</SelectItem>
                                        <SelectItem value="late">Xin đi muộn</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Chi tiết</Label>
                                <Select value={formSubType} onValueChange={setFormSubType}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {formType === 'leave' ? (
                                            <>
                                                <SelectItem value="annual">Nghỉ phép (Trước 30 ngày)</SelectItem>
                                                <SelectItem value="unexpected_leave">Nghỉ đột xuất (Trước 3 ngày)</SelectItem>
                                            </>
                                        ) : (
                                            <>
                                                <SelectItem value="planned_late">Xin trước (64 tiếng)</SelectItem>
                                                <SelectItem value="unexpected_late">Đột xuất (24 tiếng)</SelectItem>
                                            </>
                                        )}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {formType === 'leave' && (
                            <div className="space-y-2">
                                <Label>Số ngày nghỉ *</Label>
                                <Input
                                    type="number"
                                    min="0.5"
                                    step="0.5"
                                    value={leaveDays}
                                    onChange={e => setLeaveDays(Number(e.target.value) || 0)}
                                />
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-4">
                            <div className={`space-y-2 ${formType === 'late' ? 'col-span-2' : ''}`}>
                                <Label>Ngày bắt đầu *</Label>
                                <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                            </div>
                            {formType !== 'late' && (
                                <div className="space-y-2">
                                    <Label>Giờ bắt đầu</Label>
                                    <div className="flex gap-2">
                                        <Select value={startTime.split(':')[0] || '08'} onValueChange={(h) => setStartTime(`${h}:${startTime.split(':')[1] || '00'}`)}>
                                            <SelectTrigger className="w-full">
                                                <SelectValue placeholder="Giờ" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0')).map(h => (
                                                    <SelectItem key={h} value={h}>{h}h</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <Select value={startTime.split(':')[1] || '00'} onValueChange={(m) => setStartTime(`${startTime.split(':')[0] || '08'}:${m}`)}>
                                            <SelectTrigger className="w-full">
                                                <SelectValue placeholder="Phút" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0')).map(m => (
                                                    <SelectItem key={m} value={m}>{m}p</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            )}
                        </div>

                        {formType === 'leave' && (
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Ngày kết thúc *</Label>
                                    <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Giờ kết thúc</Label>
                                    <div className="flex gap-2">
                                        <Select value={endTime.split(':')[0] || '17'} onValueChange={(h) => setEndTime(`${h}:${endTime.split(':')[1] || '00'}`)}>
                                            <SelectTrigger className="w-full">
                                                <SelectValue placeholder="Giờ" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0')).map(h => (
                                                    <SelectItem key={h} value={h}>{h}h</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <Select value={endTime.split(':')[1] || '00'} onValueChange={(m) => setEndTime(`${endTime.split(':')[0] || '17'}:${m}`)}>
                                            <SelectTrigger className="w-full">
                                                <SelectValue placeholder="Phút" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0')).map(m => (
                                                    <SelectItem key={m} value={m}>{m}p</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="space-y-2">
                            <Label>Lý do *</Label>
                            <Textarea
                                placeholder="Nhập lý do chi tiết..."
                                rows={3}
                                value={reason}
                                onChange={e => setReason(e.target.value)}
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <DialogClose asChild>
                            <Button variant="outline">Huỷ</Button>
                        </DialogClose>
                        <Button onClick={handleCreateRequest} disabled={submitting}>
                            {submitting ? 'Đang gửi...' : 'Gửi yêu cầu'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
