import { useState, useEffect } from 'react';
import {
    Plus, Search, Phone, Mail, MessageCircle, Calendar,
    Video, FileText, Clock,
    CheckCircle, AlertCircle, ArrowRight, Loader2
} from 'lucide-react';
import { toast, Toaster } from 'sonner';
import { useInteractions } from '@/hooks/useInteractions';
import type { Interaction } from '@/hooks/useInteractions';
import { useCustomers } from '@/hooks/useCustomers';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { formatDate } from '@/lib/utils';

// Interaction types
type InteractionType = 'call' | 'email' | 'meeting' | 'message' | 'note' | 'task';
type InteractionResult = 'successful' | 'no_answer' | 'callback' | 'interested' | 'not_interested' | 'pending' | 
    'voicemail' | 'busy' | 'sent' | 'opened' | 'replied' | 'bounced' | 
    'cancelled' | 'rescheduled' | 'no_show' | 'read' | 'completed' | 'in_progress';

const interactionTypeLabels: Record<InteractionType, { label: string; icon: React.ReactNode; color: string }> = {
    call: { label: 'Cuộc gọi', icon: <Phone className="h-4 w-4" />, color: 'bg-blue-100 text-blue-600' },
    email: { label: 'Email', icon: <Mail className="h-4 w-4" />, color: 'bg-amber-100 text-amber-600' },
    meeting: { label: 'Cuộc họp', icon: <Video className="h-4 w-4" />, color: 'bg-purple-100 text-purple-600' },
    message: { label: 'Tin nhắn', icon: <MessageCircle className="h-4 w-4" />, color: 'bg-emerald-100 text-emerald-600' },
    note: { label: 'Ghi chú', icon: <FileText className="h-4 w-4" />, color: 'bg-gray-100 text-gray-600' },
    task: { label: 'Công việc', icon: <CheckCircle className="h-4 w-4" />, color: 'bg-pink-100 text-pink-600' },
};

const resultLabels: Record<InteractionResult, { label: string; variant: 'success' | 'warning' | 'danger' | 'secondary' | 'info' }> = {
    successful: { label: 'Thành công', variant: 'success' },
    no_answer: { label: 'Không nghe máy', variant: 'secondary' },
    callback: { label: 'Hẹn gọi lại', variant: 'info' },
    voicemail: { label: 'Để lại tin nhắn', variant: 'info' },
    busy: { label: 'Máy bận', variant: 'secondary' },
    interested: { label: 'Quan tâm', variant: 'success' },
    not_interested: { label: 'Không quan tâm', variant: 'danger' },
    pending: { label: 'Đang chờ', variant: 'warning' },
    sent: { label: 'Đã gửi', variant: 'info' },
    opened: { label: 'Đã mở', variant: 'success' },
    replied: { label: 'Đã phản hồi', variant: 'success' },
    bounced: { label: 'Bị trả lại', variant: 'danger' },
    cancelled: { label: 'Đã hủy', variant: 'danger' },
    rescheduled: { label: 'Đã dời lịch', variant: 'warning' },
    no_show: { label: 'Không xuất hiện', variant: 'danger' },
    read: { label: 'Đã đọc', variant: 'success' },
    completed: { label: 'Hoàn thành', variant: 'success' },
    in_progress: { label: 'Đang thực hiện', variant: 'info' },
};

// Result options for each interaction type
const resultOptionsByType: Record<InteractionType, InteractionResult[]> = {
    call: ['successful', 'no_answer', 'callback', 'voicemail', 'busy', 'not_interested'],
    email: ['sent', 'opened', 'replied', 'bounced', 'pending'],
    meeting: ['successful', 'cancelled', 'rescheduled', 'no_show', 'pending'],
    message: ['sent', 'read', 'replied', 'pending'],
    note: ['pending'],
    task: ['completed', 'in_progress', 'pending', 'cancelled'],
};

// Interaction Form Dialog
function InteractionFormDialog({
    open,
    onClose,
    onSubmit,
    customers
}: {
    open: boolean;
    onClose: () => void;
    onSubmit: (data: Partial<Interaction>) => Promise<void>;
    customers: { id: string; name: string }[];
}) {
    const [type, setType] = useState<InteractionType>('call');
    const [customer, setCustomer] = useState('');
    const [subject, setSubject] = useState('');
    const [content, setContent] = useState('');
    const [result, setResult] = useState<InteractionResult>('pending');
    const [duration, setDuration] = useState(0);
    const [nextAction, setNextAction] = useState('');
    const [nextActionDate, setNextActionDate] = useState('');
    const [submitting, setSubmitting] = useState(false);

    // Reset result when type changes if current result is not valid for new type
    useEffect(() => {
        const validResults = resultOptionsByType[type];
        if (!validResults.includes(result)) {
            setResult(validResults[0] || 'pending');
        }
    }, [type, result]);

    const handleSubmit = async () => {
        if (!customer || !subject) {
            toast.error('Vui lòng điền đầy đủ thông tin bắt buộc');
            return;
        }

        setSubmitting(true);
        try {
            await onSubmit({
                customer_id: customer,
                type,
                subject,
                content: content || undefined,
                result: result || undefined,
                duration: (type === 'call' || type === 'meeting') && duration > 0 ? duration : undefined,
                next_action: nextAction || undefined,
                next_action_date: nextActionDate || undefined,
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
                        <MessageCircle className="h-5 w-5 text-primary" />
                        Thêm tương tác mới
                    </DialogTitle>
                    <DialogDescription>Ghi nhận tương tác với khách hàng</DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {/* Type Selection */}
                    <div className="space-y-2">
                        <Label>Loại tương tác *</Label>
                        <div className="grid grid-cols-3 gap-2">
                            {(Object.keys(interactionTypeLabels) as InteractionType[]).map(t => (
                                <button
                                    key={t}
                                    type="button"
                                    onClick={() => setType(t)}
                                    className={`flex items-center gap-2 p-2 rounded-lg border text-sm transition-colors ${type === t ? 'bg-primary text-white border-primary' : 'hover:bg-muted'
                                        }`}
                                >
                                    {interactionTypeLabels[t].icon}
                                    {interactionTypeLabels[t].label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Customer */}
                    <div className="space-y-2">
                        <Label>Khách hàng *</Label>
                        <Select value={customer} onValueChange={setCustomer}>
                            <SelectTrigger>
                                <SelectValue placeholder="Chọn khách hàng" />
                            </SelectTrigger>
                            <SelectContent>
                                {customers.map(c => (
                                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Subject */}
                    <div className="space-y-2">
                        <Label>Tiêu đề *</Label>
                        <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Nhập tiêu đề tương tác" />
                    </div>

                    {/* Content */}
                    <div className="space-y-2">
                        <Label>Nội dung</Label>
                        <textarea
                            className="w-full min-h-25 px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            placeholder="Mô tả chi tiết nội dung tương tác..."
                        />
                    </div>

                    {/* Result & Duration */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Kết quả</Label>
                            <Select value={result} onValueChange={(v) => setResult(v as InteractionResult)}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {resultOptionsByType[type].map(r => (
                                        <SelectItem key={r} value={r}>{resultLabels[r].label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        {(type === 'call' || type === 'meeting') && (
                            <div className="space-y-2">
                                <Label>Thời lượng (phút)</Label>
                                <Input type="number" value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
                            </div>
                        )}
                    </div>

                    {/* Next Action */}
                    <div className="space-y-3 pt-4 border-t">
                        <Label className="text-base font-semibold">Hành động tiếp theo</Label>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Công việc</Label>
                                <Input value={nextAction} onChange={(e) => setNextAction(e.target.value)} placeholder="Mô tả công việc" />
                            </div>
                            <div className="space-y-2">
                                <Label>Ngày thực hiện</Label>
                                <Input type="date" value={nextActionDate} onChange={(e) => setNextActionDate(e.target.value)} />
                            </div>
                        </div>
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

// Timeline Item Component
function TimelineItem({ interaction }: { interaction: Interaction }) {
    const typeInfo = interactionTypeLabels[interaction.type as InteractionType];
    const resultInfo = interaction.result ? resultLabels[interaction.result as InteractionResult] : null;

    const date = new Date(interaction.created_at);
    const timeStr = date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    const dateStr = formatDate(interaction.created_at);

    return (
        <div className="flex gap-4 pb-6 relative">
            {/* Timeline line */}
            <div className="absolute left-5 top-10 bottom-0 w-0.5 bg-muted" />

            {/* Icon */}
            <div className={`z-10 h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${typeInfo.color}`}>
                {typeInfo.icon}
            </div>

            {/* Content */}
            <div className="flex-1 bg-card border rounded-lg p-4">
                <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline">{typeInfo.label}</Badge>
                            {resultInfo && (
                                <Badge variant={resultInfo.variant}>{resultInfo.label}</Badge>
                            )}
                            {interaction.duration && (
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    {interaction.duration} phút
                                </span>
                            )}
                        </div>
                        <h4 className="font-semibold">{interaction.subject}</h4>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                        <p>{dateStr}</p>
                        <p>{timeStr}</p>
                    </div>
                </div>

                {/* Customer */}
                {(interaction.customer || interaction.lead) && (
                    <div className="flex items-center gap-2 mb-2">
                        <Avatar className="h-6 w-6">
                            <AvatarFallback className="text-xs">
                                {(interaction.customer?.name || interaction.lead?.name || '').charAt(0)}
                            </AvatarFallback>
                        </Avatar>
                        <span className="text-sm font-medium">{interaction.customer?.name || interaction.lead?.name}</span>
                    </div>
                )}

                {/* Content */}
                <p className="text-sm text-muted-foreground mb-3">{interaction.content}</p>

                {/* Next Action */}
                {interaction.next_action && (
                    <div className="flex items-center gap-2 p-2 bg-amber-50 rounded-lg text-sm">
                        <ArrowRight className="h-4 w-4 text-amber-600" />
                        <span className="text-amber-800">
                            <strong>Tiếp theo:</strong> {interaction.next_action}
                            {interaction.next_action_date && ` (${formatDate(interaction.next_action_date)})`}
                        </span>
                    </div>
                )}

                {/* Footer */}
                <div className="flex items-center justify-between mt-3 pt-3 border-t">
                    <span className="text-xs text-muted-foreground">
                        Bởi: {interaction.created_user?.name || 'N/A'}
                    </span>
                </div>
            </div>
        </div>
    );
}

export function InteractionsPage() {
    const { interactions, loading, error, fetchInteractions, createInteraction } = useInteractions();
    const { customers, fetchCustomers } = useCustomers();

    const [searchTerm, setSearchTerm] = useState('');
    const [typeFilter, setTypeFilter] = useState('all');
    const [resultFilter, setResultFilter] = useState('all');
    const [showForm, setShowForm] = useState(false);

    // Fetch data on mount
    useEffect(() => {
        fetchInteractions();
        fetchCustomers();
    }, [fetchInteractions, fetchCustomers]);

    const filteredInteractions = interactions.filter(i => {
        const customerName = i.customer?.name || i.lead?.name || '';
        const matchesSearch = customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            i.subject.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (i.content && i.content.toLowerCase().includes(searchTerm.toLowerCase()));
        const matchesType = typeFilter === 'all' || i.type === typeFilter;
        const matchesResult = resultFilter === 'all' || i.result === resultFilter;
        return matchesSearch && matchesType && matchesResult;
    });

    // CRUD handler
    const handleCreateInteraction = async (data: Partial<Interaction>) => {
        try {
            await createInteraction(data);
            toast.success('Đã tạo tương tác mới!');
            await fetchInteractions();
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Lỗi khi tạo tương tác';
            toast.error(message);
            throw error;
        }
    };

    // Stats
    const todayCount = interactions.filter(i => {
        const today = new Date().toDateString();
        return new Date(i.created_at).toDateString() === today;
    }).length;
    const callCount = interactions.filter(i => i.type === 'call').length;
    const pendingFollowups = interactions.filter(i => i.next_action && i.next_action_date).length;
    const successRate = interactions.length > 0 ? (interactions.filter(i => i.result === 'successful').length / interactions.length * 100).toFixed(0) : '0';

    if (loading && interactions.length === 0) {
        return (
            <div className="flex items-center justify-center min-h-100">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <>
            <Toaster position="top-right" richColors />
            <div className="space-y-6 animate-fade-in">
                {/* Page Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Lịch sử tương tác</h1>
                    <p className="text-muted-foreground">Quản lý tương tác với khách hàng</p>
                </div>
                <Button onClick={() => setShowForm(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Thêm tương tác
                </Button>
                </div>

                {/* Error Message */}
                {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-600">
                    {error}
                </div>
                )}

                {/* Stats Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Card className="bg-linear-to-br from-blue-50 to-blue-100 border-0">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-muted-foreground">Hôm nay</p>
                                <p className="text-2xl font-bold text-blue-600">{todayCount}</p>
                            </div>
                            <Calendar className="h-8 w-8 text-blue-500/50" />
                        </div>
                    </CardContent>
                </Card>

                    <Card className="bg-linear-to-br from-emerald-50 to-emerald-100 border-0">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-muted-foreground">Cuộc gọi</p>
                                <p className="text-2xl font-bold text-emerald-600">{callCount}</p>
                            </div>
                            <Phone className="h-8 w-8 text-emerald-500/50" />
                        </div>
                    </CardContent>
                </Card>

                    <Card className="bg-linear-to-br from-amber-50 to-amber-100 border-0">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-muted-foreground">Cần follow-up</p>
                                <p className="text-2xl font-bold text-amber-600">{pendingFollowups}</p>
                            </div>
                            <AlertCircle className="h-8 w-8 text-amber-500/50" />
                        </div>
                    </CardContent>
                </Card>

                    <Card className="bg-linear-to-br from-purple-50 to-purple-100 border-0">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-muted-foreground">Tỷ lệ thành công</p>
                                <p className="text-2xl font-bold text-purple-600">{successRate}%</p>
                            </div>
                            <CheckCircle className="h-8 w-8 text-purple-500/50" />
                        </div>
                    </CardContent>
                </Card>
                </div>

                {/* Filters */}
                <Card>
                <CardContent className="p-4">
                    <div className="flex flex-col sm:flex-row gap-3">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                placeholder="Tìm theo khách hàng, nội dung..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-9"
                            />
                        </div>
                        <Select value={typeFilter} onValueChange={setTypeFilter}>
                            <SelectTrigger className="w-full sm:w-40">
                                <SelectValue placeholder="Loại" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Tất cả loại</SelectItem>
                                {(Object.keys(interactionTypeLabels) as InteractionType[]).map(t => (
                                    <SelectItem key={t} value={t}>{interactionTypeLabels[t].label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select value={resultFilter} onValueChange={setResultFilter}>
                            <SelectTrigger className="w-full sm:w-40">
                                <SelectValue placeholder="Kết quả" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Tất cả</SelectItem>
                                {(Object.keys(resultLabels) as InteractionResult[]).map(r => (
                                    <SelectItem key={r} value={r}>{resultLabels[r].label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </CardContent>
                </Card>

                {/* Timeline */}
                <Card>
                <CardHeader>
                    <CardTitle>Timeline ({filteredInteractions.length} tương tác)</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="relative">
                        {filteredInteractions.map((interaction) => (
                            <TimelineItem key={interaction.id} interaction={interaction} />
                        ))}

                        {filteredInteractions.length === 0 && (
                            <div className="p-8 text-center text-muted-foreground">
                                Không tìm thấy tương tác nào
                            </div>
                        )}
                    </div>
                </CardContent>
                </Card>

                {/* Dialog */}
                <InteractionFormDialog 
                open={showForm} 
                onClose={() => setShowForm(false)}
                onSubmit={handleCreateInteraction}
                customers={customers}
            />
            </div>
        </>
    );
}
