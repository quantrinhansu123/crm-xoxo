import { useEffect, useState } from 'react';
import { Plus, Loader2, Globe, Facebook, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import type { CreateLeadFormData } from './constants';

interface CreateLeadDialogProps {
    open: boolean;
    onClose: () => void;
    onSubmit: (data: CreateLeadFormData) => Promise<void>;
    employees: { id: string; name: string }[];
}

export function CreateLeadDialog({
    open,
    onClose,
    onSubmit,
    employees
}: CreateLeadDialogProps) {
    const [formData, setFormData] = useState({
        name: '',
        phone: '',
        email: '',
        company: '',
        address: '',
        source: 'website',
        lead_type: 'individual',
        assigned_to: '',
        notes: '',
        fb_thread_id: '',
        link_message: '',
        fb_profile_pic: '',
        fb_link: '',
        dob: '',
        appointment_time: ''
    });
    const [submitting, setSubmitting] = useState(false);
    const draftKey = 'draft:create-lead:v1';
    const isDirty =
        !!formData.name.trim() ||
        !!formData.phone.trim() ||
        !!formData.email.trim() ||
        !!formData.company.trim() ||
        !!formData.address.trim() ||
        !!formData.notes.trim() ||
        !!formData.fb_thread_id.trim() ||
        !!formData.link_message.trim() ||
        !!formData.fb_link.trim() ||
        !!formData.dob.trim() ||
        !!formData.appointment_time.trim() ||
        (formData.source !== 'website') ||
        (formData.lead_type !== 'individual') ||
        !!formData.assigned_to;

    // Restore draft when dialog opens
    useEffect(() => {
        if (!open) return;
        try {
            const raw = localStorage.getItem(draftKey);
            if (!raw) return;
            const draft = JSON.parse(raw) as Partial<typeof formData>;
            setFormData((prev) => ({ ...prev, ...draft }));
        } catch {
            // ignore
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    // Persist draft while editing
    useEffect(() => {
        if (!open) return;
        try {
            localStorage.setItem(draftKey, JSON.stringify(formData));
        } catch {
            // ignore
        }
    }, [open, formData]);

    // Auto-fetch avatar from social link
    const handleSocialLinkChange = (url: string) => {
        setFormData(prev => ({ ...prev, fb_link: url }));

        if (!url) return;

        // Facebook parsing
        if (formData.source === 'facebook') {
            let identifier = '';
            try {
                const urlObj = new URL(url);
                if (urlObj.hostname.includes('facebook.com')) {
                    if (urlObj.pathname === '/profile.php') {
                        identifier = urlObj.searchParams.get('id') || '';
                    } else {
                        // Remove leading slash and any trailing segments
                        identifier = urlObj.pathname.split('/')[1];
                    }
                }
            } catch {
                // Not a valid URL, try simple regex for people who just paste "facebook.com/xxx"
                const match = url.match(/facebook\.com\/([^/?#]+)/);
                if (match) identifier = match[1];
            }

            if (identifier && identifier !== 'profile.php') {
                setFormData(prev => ({
                    ...prev,
                    fb_profile_pic: `https://unavatar.io/facebook/${identifier}`
                }));
            }
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name || !formData.phone) {
            toast.error('Vui lòng nhập tên và số điện thoại');
            return;
        }

        setSubmitting(true);
        try {
            await onSubmit(formData);
            setFormData({
                name: '',
                phone: '',
                email: '',
                company: '',
                address: '',
                source: 'website',
                lead_type: 'individual',
                assigned_to: '',
                notes: '',
                fb_thread_id: '',
                link_message: '',
                fb_profile_pic: '',
                fb_link: '',
                dob: '',
                appointment_time: ''
            });
            try {
                localStorage.removeItem(draftKey);
            } catch {
                // ignore
            }
            onClose();
        } catch {
            // Error handled in parent
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                if (!next && isDirty && !submitting) {
                    const ok = window.confirm('Bạn đang tạo lead dở. Thoát ra sẽ mất dữ liệu (nháp vẫn được lưu). Bạn chắc chắn muốn thoát?');
                    if (!ok) return;
                }
                onClose();
            }}
        >
            <DialogContent
                className="max-w-2xl"
                onInteractOutside={(e) => {
                    if (isDirty && !submitting) e.preventDefault();
                }}
                onEscapeKeyDown={(e) => {
                    if (isDirty && !submitting) e.preventDefault();
                }}
            >
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <div className="p-2 rounded-lg bg-primary/10">
                            <Plus className="h-5 w-5 text-primary" />
                        </div>
                        Thêm Lead mới
                    </DialogTitle>
                    <DialogDescription>Nhập thông tin khách hàng tiềm năng</DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="name">Tên khách hàng <span className="text-red-500">*</span></Label>
                            <Input
                                id="name"
                                value={formData.name}
                                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                placeholder="Nguyễn Văn A"
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="phone">Số điện thoại <span className="text-red-500">*</span></Label>
                            <Input
                                id="phone"
                                value={formData.phone}
                                onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                                placeholder="0912345678"
                                required
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="email">Email</Label>
                            <Input
                                id="email"
                                type="email"
                                value={formData.email}
                                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                                placeholder="email@example.com"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="dob">Ngày sinh</Label>
                            <Input
                                id="dob"
                                type="date"
                                value={formData.dob || ''}
                                onChange={(e) => setFormData(prev => ({ ...prev, dob: e.target.value }))}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="company">Công ty</Label>
                            <Input
                                id="company"
                                value={formData.company}
                                onChange={(e) => setFormData(prev => ({ ...prev, company: e.target.value }))}
                                placeholder="Công ty ABC"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="address">Địa chỉ</Label>
                            <Input
                                id="address"
                                value={formData.address || ''}
                                onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                                placeholder="Số nhà, đường, quận/huyện..."
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="channel">Kênh</Label>
                            <Select value={formData.source} onValueChange={(value) => setFormData(prev => ({ ...prev, source: value }))}>
                                <SelectTrigger id="channel">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="facebook">Facebook</SelectItem>
                                    <SelectItem value="google">Google</SelectItem>
                                    <SelectItem value="zalo">Zalo</SelectItem>
                                    <SelectItem value="website">Website</SelectItem>
                                    <SelectItem value="referral">Giới thiệu</SelectItem>
                                    <SelectItem value="walk-in">Walk-in</SelectItem>
                                    <SelectItem value="other">Khác</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="lead_type">Loại lead</Label>
                            <Select value={formData.lead_type} onValueChange={(value) => setFormData(prev => ({ ...prev, lead_type: value }))}>
                                <SelectTrigger id="lead_type">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="individual">Cá nhân</SelectItem>
                                    <SelectItem value="company">Doanh nghiệp</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="assigned_to">Nhân viên phụ trách</Label>
                            <Select value={formData.assigned_to} onValueChange={(value) => setFormData(prev => ({ ...prev, assigned_to: value }))}>
                                <SelectTrigger id="assigned_to">
                                    <SelectValue placeholder="Chọn nhân viên" />
                                </SelectTrigger>
                                <SelectContent>
                                    {employees.map(emp => (
                                        <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="appointment_time">Thời gian hẹn</Label>
                            <Input
                                id="appointment_time"
                                type="datetime-local"
                                value={formData.appointment_time || ''}
                                onChange={(e) => setFormData(prev => ({ ...prev, appointment_time: e.target.value }))}
                            />
                        </div>
                    </div>

                    {/* Social Media Integration Fields - Show for FB/Zalo */}
                    {(formData.source === 'facebook' || formData.source === 'zalo') && (
                        <div className="space-y-4 p-3 bg-blue-50/50 rounded-lg border border-blue-100">
                            <div className="flex items-center gap-4">
                                <Avatar className="h-16 w-16 border-2 border-white shadow-sm">
                                    {formData.fb_profile_pic && <AvatarImage src={formData.fb_profile_pic} alt="Preview" />}
                                    <AvatarFallback className="bg-blue-100 text-blue-600">
                                        {formData.source === 'facebook' ? <Facebook className="h-8 w-8 text-blue-600" /> : <MessageSquare className="h-8 w-8 text-sky-600" />}
                                    </AvatarFallback>
                                </Avatar>
                                <div className="flex-1 space-y-1">
                                    <h4 className="text-sm font-medium text-blue-900">Tích hợp mạng xã hội</h4>
                                    <p className="text-xs text-blue-600/70">Nhập link trang cá nhân để tự động lấy ảnh đại diện.</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="fb_thread_id" className="text-blue-700">Thread ID (FB/Zalo)</Label>
                                    <Input
                                        id="fb_thread_id"
                                        value={formData.fb_thread_id || ''}
                                        onChange={(e) => setFormData(prev => ({ ...prev, fb_thread_id: e.target.value }))}
                                        placeholder="t_xxx..."
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="link_message" className="text-blue-700">Link hội thoại</Label>
                                    <Input
                                        id="link_message"
                                        value={formData.link_message || ''}
                                        onChange={(e) => setFormData(prev => ({ ...prev, link_message: e.target.value }))}
                                        placeholder="https://..."
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="fb_profile_pic" className="text-blue-700">Link ảnh đại diện (Avatar)</Label>
                                    <Input
                                        id="fb_profile_pic"
                                        value={formData.fb_profile_pic || ''}
                                        onChange={(e) => setFormData(prev => ({ ...prev, fb_profile_pic: e.target.value }))}
                                        placeholder="https://..."
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="fb_link" className="text-blue-700">Link Profile MXH</Label>
                                    <Input
                                        id="fb_link"
                                        value={formData.fb_link || ''}
                                        onChange={(e) => handleSocialLinkChange(e.target.value)}
                                        placeholder="https://..."
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="space-y-2">
                        <Label htmlFor="notes">Ghi chú</Label>
                        <textarea
                            id="notes"
                            value={formData.notes}
                            onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                            placeholder="Thông tin bổ sung về khách hàng..."
                            className="w-full min-h-20 px-3 py-2 text-sm rounded-md border border-input bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                    </div>

                    <div className="flex gap-3 justify-end pt-4">
                        <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
                            Hủy
                        </Button>
                        <Button type="submit" disabled={submitting}>
                            {submitting ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Đang tạo...
                                </>
                            ) : (
                                <>
                                    <Plus className="h-4 w-4 mr-2" />
                                    Tạo Lead
                                </>
                            )}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
