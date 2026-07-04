import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Phone, User, Tag, FileText, ExternalLink } from 'lucide-react';
import type { Lead } from '@/hooks/useLeads';
import { sourceLabels } from './constants';

interface LeadUpdatePhoneDialogProps {
    open: boolean;
    onClose: () => void;
    onSubmit: (data: Partial<Lead>) => Promise<void>;
    lead: Lead | null;
}

export function LeadUpdatePhoneDialog({ open, onClose, onSubmit, lead }: LeadUpdatePhoneDialogProps) {
    const [phone, setPhone] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (lead && open) {
            setPhone(lead.phone || '');
        }
    }, [lead, open]);

    const handleSubmit = async () => {
        if (!lead) return;

        if (!phone) {
            alert('Vui lòng nhập số điện thoại');
            return;
        }

        setIsSubmitting(true);
        try {
            await onSubmit({ phone });
            onClose();
        } catch (err) {
            console.error(err);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!lead) return null;

    const channelKey = lead.channel || lead.source || '';
    const source = sourceLabels[channelKey] || { label: channelKey || 'Khác', color: 'bg-gray-100 text-gray-700' };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[450px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Phone className="h-5 w-5 text-primary" />
                        Cập nhật số điện thoại
                    </DialogTitle>
                    <DialogDescription>
                        Cần có số điện thoại để tiếp tục chốt đơn cho khách hàng này.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    {/* Lead Info Card */}
                    <div className="rounded-lg border bg-slate-50/50 p-4 space-y-3">
                        <div className="flex items-start gap-3">
                            <Avatar className="h-10 w-10 border">
                                {lead.fb_profile_pic && <AvatarImage src={lead.fb_profile_pic} />}
                                <AvatarFallback className="bg-primary/10 text-primary font-bold">
                                    {lead.name.charAt(0).toUpperCase()}
                                </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1">
                                <h4 className="font-bold text-foreground leading-none mb-1.5">{lead.name}</h4>
                                <div className="flex flex-wrap gap-1.5">
                                    <Badge variant="secondary" className={`text-[10px] font-medium h-5 ${source.color}`}>
                                        <Tag className="h-2.5 w-2.5 mr-1" />
                                        {source.label}
                                    </Badge>
                                    {lead.assigned_user && (
                                        <Badge variant="outline" className="text-[10px] font-medium h-5 bg-white">
                                            <User className="h-2.5 w-2.5 mr-1" />
                                            {lead.assigned_user.name}
                                        </Badge>
                                    )}
                                </div>
                            </div>
                            {lead.fb_link && (
                                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" asChild>
                                    <a href={lead.fb_link} target="_blank" rel="noopener noreferrer">
                                        <ExternalLink className="h-4 w-4" />
                                    </a>
                                </Button>
                            )}
                        </div>

                        {(lead.notes || lead.note || lead.sale_note_summary) && (
                            <div className="pt-2 border-t border-slate-200">
                                <div className="flex items-start gap-2 text-xs text-muted-foreground">
                                    <FileText className="h-3 w-3 mt-0.5 shrink-0" />
                                    <p className="line-clamp-3 italic">
                                        {lead.sale_note_summary || lead.notes || lead.note}
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Phone Input */}
                    <div className="grid gap-2">
                        <Label htmlFor="phone" className="text-sm font-semibold">
                            Số điện thoại khách hàng <span className="text-red-500">*</span>
                        </Label>
                        <div className="relative">
                            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                id="phone"
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                placeholder="Ví dụ: 0912345678"
                                className="pl-9 h-11 border-primary/20 focus-visible:ring-primary"
                                autoFocus
                            />
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                            Số điện thoại này sẽ được dùng để tạo đơn hàng và lưu vào danh sách khách hàng.
                        </p>
                    </div>
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button variant="outline" onClick={onClose} disabled={isSubmitting}>Hủy</Button>
                    <Button onClick={handleSubmit} disabled={isSubmitting} className="min-w-[100px]">
                        {isSubmitting ? 'Đang lưu...' : 'Tiếp tục chốt đơn'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
