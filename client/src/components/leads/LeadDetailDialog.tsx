import { useState, useEffect } from 'react';
import { Phone, MessageCircle, Copy, Check, ArrowRightLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { leadsApi } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import type { Lead } from '@/hooks/useLeads';
import { kanbanColumns, sourceLabels, getStatusLabel } from './constants';
import { LeadHenQuaShipDialog } from './LeadHenQuaShipDialog';
import { LeadUpdatePhoneDialog } from './LeadUpdatePhoneDialog';

interface LeadDetailDialogProps {
    lead: Lead | null;
    open: boolean;
    onClose: () => void;
    onUpdate: (id: string, data: Partial<Lead>) => Promise<void>;
    onConvert: (lead: Lead) => Promise<void>;
}

export function LeadDetailDialog({
    lead,
    open,
    onClose,
    onUpdate,
    onConvert
}: LeadDetailDialogProps) {
    const [isEditingNotes, setIsEditingNotes] = useState(false);
    const [notes, setNotes] = useState('');
    const [newNote, setNewNote] = useState('');
    const [selectedStatus, setSelectedStatus] = useState('');
    const [dob, setDob] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [phoneCopied, setPhoneCopied] = useState(false);
    const [emailCopied, setEmailCopied] = useState(false);
    const [activities, setActivities] = useState<any[]>([]);
    const [loadingActivities, setLoadingActivities] = useState(false);
    const [showHenQuaShipDialog, setShowHenQuaShipDialog] = useState(false);
    const [showUpdatePhoneDialog, setShowUpdatePhoneDialog] = useState(false);

    // Fetch activities when dialog opens
    useEffect(() => {
        if (lead && open) {
            setNotes(lead.notes || '');
            setSelectedStatus(lead.pipeline_stage || lead.status);
            setDob(lead.dob || '');
            setIsEditingNotes(false);
            setPhoneCopied(false);
            setEmailCopied(false);
            setNewNote('');

            // Fetch activities
            setLoadingActivities(true);
            leadsApi.getActivities(lead.id)
                .then(res => {
                    setActivities(res.data.data?.activities || []);
                })
                .catch(() => {
                    setActivities([]);
                })
                .finally(() => {
                    setLoadingActivities(false);
                });
        }
    }, [lead, open]);

    if (!lead) return null;

    const column = kanbanColumns.find(c => c.id === (lead.pipeline_stage || lead.status)) || kanbanColumns[0];

    const handleCallPhone = () => {
        window.location.href = `tel:${lead.phone}`;
    };

    const handleCopyPhone = async () => {
        try {
            await navigator.clipboard.writeText(lead.phone);
            setPhoneCopied(true);
            setTimeout(() => setPhoneCopied(false), 2000);
        } catch {
            toast.error('Không thể copy số điện thoại');
        }
    };

    const handleZaloClick = () => {
        // Format phone number for Zalo (remove leading 0, add 84)
        const phone = lead.phone.replace(/^0/, '84');
        window.open(`https://zalo.me/${phone}`, '_blank');
    };

    const handleCopyEmail = async () => {
        if (lead.email) {
            try {
                await navigator.clipboard.writeText(lead.email);
                setEmailCopied(true);
                setTimeout(() => setEmailCopied(false), 2000);
            } catch {
                toast.error('Không thể copy email');
            }
        }
    };
    const handleStatusChange = async (newStatus: string) => {
        // Validation: Must have phone number to move to 'chot_don'
        if (newStatus === 'chot_don' && !lead.phone) {
            setShowUpdatePhoneDialog(true);
            return;
        }

        if (newStatus === 'hen_qua_ship') {
            setShowHenQuaShipDialog(true);
            return;
        }

        setIsSaving(true);
        try {
            await onUpdate(lead.id, { status: newStatus, pipeline_stage: newStatus });
            setSelectedStatus(newStatus);
            toast.success('Đã cập nhật trạng thái');
        } catch {
            toast.error('Lỗi khi cập nhật trạng thái');
        } finally {
            setIsSaving(false);
        }
    };

    const handleSubmitHenQuaShip = async (data: Partial<Lead>) => {
        if (!lead) return;
        setIsSaving(true);
        try {
            await onUpdate(lead.id, data);
            setSelectedStatus('hen_qua_ship');
            setShowHenQuaShipDialog(false);
            toast.success('Đã cập nhật thông tin');
        } catch {
            toast.error('Lỗi khi cập nhật thông tin');
        } finally {
            setIsSaving(false);
        }
    };

    const handleSubmitUpdatePhone = async (data: Partial<Lead>) => {
        if (!lead) return;
        setIsSaving(true);
        try {
            await onUpdate(lead.id, { ...data, pipeline_stage: 'chot_don', status: 'chot_don' });
            setSelectedStatus('chot_don');
            setShowUpdatePhoneDialog(false);
            toast.success('Đã cập nhật số điện thoại');
        } catch {
            toast.error('Lỗi khi cập nhật số điện thoại');
        } finally {
            setIsSaving(false);
        }
    };

    const handleConvert = async () => {
        if (confirm(`Xác nhận chuyển đổi ${lead.name} thành khách hàng?`)) {
            try {
                await onConvert(lead);
                onClose();
            } catch {
                // Error handled in parent
            }
        }
    };

    const handleAddNote = async () => {
        if (!newNote.trim()) return;
        setIsSaving(true);
        try {
            const res = await leadsApi.addActivity(lead.id, {
                activity_type: 'note',
                content: newNote.trim()
            });
            setActivities(prev => [res.data.data?.activity, ...prev]);
            setNewNote('');
            toast.success('Đã thêm ghi chú');
        } catch {
            toast.error('Lỗi khi thêm ghi chú');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-3">
                        <Avatar className="h-12 w-12">
                            {lead.fb_profile_pic && <AvatarImage src={lead.fb_profile_pic} alt={lead.name} />}
                            <AvatarFallback className={`${column.color} text-white font-semibold`}>
                                {lead.name.charAt(0)}
                            </AvatarFallback>
                        </Avatar>
                        <div>
                            <span className="text-lg">{lead.name}</span>
                            <div className={`inline-flex items-center ml-3 px-2.5 py-0.5 rounded-full text-xs font-medium ${column.bgColor} ${column.textColor}`}>
                                {column.label}
                            </div>
                        </div>
                    </DialogTitle>
                    <DialogDescription>Chi tiết thông tin lead</DialogDescription>
                </DialogHeader>

                <div className="grid grid-cols-2 gap-4 py-4 border-b">
                    <div>
                        <p className="text-sm text-muted-foreground">Số điện thoại</p>
                        <div className="flex items-center gap-2">
                            <p className="font-medium">{lead.phone}</p>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={handleCopyPhone}
                            >
                                {phoneCopied ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
                            </Button>
                        </div>
                    </div>
                    <div>
                        <p className="text-sm text-muted-foreground">Email</p>
                        <div className="flex items-center gap-2">
                            <p className="font-medium">{lead.email || '-'}</p>
                            {lead.email && (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={handleCopyEmail}
                                >
                                    {emailCopied ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
                                </Button>
                            )}
                        </div>
                    </div>
                    <div>
                        <p className="text-sm text-muted-foreground">Kênh/Nguồn</p>
                        <p className="font-medium">{sourceLabels[lead.channel || lead.source || '']?.label || lead.channel || lead.source || '-'}</p>
                    </div>
                    <div>
                        <p className="text-sm text-muted-foreground">Nhân viên phụ trách</p>
                        <p className="font-medium">{lead.assigned_user?.name || '-'}</p>
                    </div>
                    <div>
                        <p className="text-sm text-muted-foreground">Công ty</p>
                        <p className="font-medium">{lead.company || '-'}</p>
                    </div>
                    <div>
                        <p className="text-sm text-muted-foreground">Ngày tạo</p>
                        <p className="font-medium">{formatDateTime(lead.created_at)}</p>
                    </div>
                    {lead.pipeline_stage === 'hen_qua_ship' && (
                        <>
                            {lead.delivery_method === 'direct' ? (
                                <div>
                                    <p className="text-sm text-muted-foreground font-semibold text-orange-600">Ngày hẹn qua</p>
                                    <p className="font-bold">{lead.appointment_time ? formatDateTime(lead.appointment_time) : '-'}</p>
                                </div>
                            ) : (
                                <>
                                    <div>
                                        <p className="text-sm text-muted-foreground font-semibold text-blue-600">Mã vận chuyển</p>
                                        <p className="font-bold">{lead.tracking_code || '-'}</p>
                                    </div>
                                    <div>
                                        <p className="text-sm text-muted-foreground font-semibold text-blue-600">Phí ship</p>
                                        <p className="font-bold">{lead.shipping_fee ? lead.shipping_fee.toLocaleString('vi-VN') + ' ₫' : '0 ₫'}</p>
                                    </div>
                                </>
                            )}
                        </>
                    )}
                    <div>
                        <p className="text-sm text-muted-foreground">Ngày sinh</p>
                        <Input
                            type="date"
                            value={dob}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                                const newDob = e.target.value;
                                setDob(newDob);
                                onUpdate(lead.id, { dob: newDob });
                            }}
                            className="h-8 text-sm"
                        />
                    </div>
                </div>

                {/* Status Update */}
                <div className="py-4 border-b">
                    <p className="text-sm text-muted-foreground mb-2">Cập nhật trạng thái</p>
                    <Select value={selectedStatus} onValueChange={handleStatusChange} disabled={isSaving}>
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {kanbanColumns.map(col => (
                                <SelectItem key={col.id} value={col.id}>{col.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {/* Add New Note */}
                <div className="py-4 border-b">
                    <p className="text-sm text-muted-foreground mb-2">Thêm ghi chú mới</p>
                    <div className="flex gap-2">
                        <textarea
                            value={newNote}
                            onChange={(e) => setNewNote(e.target.value)}
                            placeholder="Nhập ghi chú..."
                            className="flex-1 min-h-16 px-3 py-2 text-sm rounded-md border border-input bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                        <Button
                            size="sm"
                            disabled={!newNote.trim() || isSaving}
                            onClick={handleAddNote}
                        >
                            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Gửi'}
                        </Button>
                    </div>
                </div>

                {/* Activities Timeline */}
                <div className="py-4 border-b flex-1 overflow-auto max-h-72">
                    <p className="text-sm font-medium mb-3">Lịch sử hoạt động</p>
                    {loadingActivities ? (
                        <div className="flex items-center justify-center py-4">
                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                    ) : activities.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">Chưa có hoạt động nào</p>
                    ) : (
                        <div className="space-y-2">
                            {activities.map((activity) => (
                                <div key={activity.id} className="p-3 rounded-lg bg-muted/50 border border-border/50">
                                    {/* Time Header */}
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className={`w-2 h-2 rounded-full ${activity.activity_type === 'status_change' ? 'bg-blue-500' : 'bg-green-500'}`} />
                                        <span className="text-xs font-semibold text-primary">{formatDateTime(activity.created_at)}</span>
                                    </div>

                                    {/* Content */}
                                    {activity.activity_type === 'status_change' ? (
                                        <div className="ml-4">
                                            <p className="text-sm">
                                                <span className="font-medium">{activity.created_by_name || 'Hệ thống'}</span>
                                                <span className="text-muted-foreground"> đã chuyển trạng thái</span>
                                            </p>
                                            <div className="flex items-center gap-2 mt-1">
                                                <Badge variant="outline" className="text-xs">{getStatusLabel(activity.old_status)}</Badge>
                                                <span className="text-muted-foreground">→</span>
                                                <Badge className="text-xs">{getStatusLabel(activity.new_status)}</Badge>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="ml-4">
                                            <p className="text-sm font-medium">{activity.created_by_name || 'Ẩn danh'}</p>
                                            <p className="text-sm text-muted-foreground mt-0.5">{activity.content}</p>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="flex gap-2 pt-4 border-t">
                    <Button variant="outline" className="flex-1" onClick={handleCallPhone}>
                        <Phone className="h-4 w-4 mr-2" />
                        Gọi điện
                    </Button>
                    <Button variant="outline" className="flex-1" onClick={handleZaloClick}>
                        <MessageCircle className="h-4 w-4 mr-2" />
                        Zalo
                    </Button>
                    <Button className="flex-1" onClick={handleConvert}>
                        <ArrowRightLeft className="h-4 w-4 mr-2" />
                        Chuyển đổi
                    </Button>
                </div>
            </DialogContent>
            <LeadHenQuaShipDialog
                open={showHenQuaShipDialog}
                onClose={() => setShowHenQuaShipDialog(false)}
                onSubmit={handleSubmitHenQuaShip}
                lead={lead}
            />
            <LeadUpdatePhoneDialog
                open={showUpdatePhoneDialog}
                onClose={() => setShowUpdatePhoneDialog(false)}
                onSubmit={handleSubmitUpdatePhone}
                lead={lead}
            />
        </Dialog>
    );
}
