import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Phone, Tag, Calendar, Truck } from 'lucide-react';
import type { Lead } from '@/hooks/useLeads';
import { sourceLabels } from './constants';

interface LeadHenQuaShipDialogProps {
    open: boolean;
    onClose: () => void;
    onSubmit: (data: Partial<Lead>) => Promise<void>;
    lead: Lead | null;
}

export function LeadHenQuaShipDialog({ open, onClose, onSubmit, lead }: LeadHenQuaShipDialogProps) {
    const [method, setMethod] = useState<'direct' | 'ship'>('direct');
    const [phone, setPhone] = useState('');
    const [appointmentTime, setAppointmentTime] = useState('');
    const [trackingCode, setTrackingCode] = useState('');
    const [shippingFee, setShippingFee] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (lead && open) {
            setMethod(lead.delivery_method || 'direct');
            setPhone(lead.phone || '');
            if (lead.appointment_time) {
                const dt = new Date(lead.appointment_time);
                const pad = (n: number) => String(n).padStart(2, '0');
                const local = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
                setAppointmentTime(local);
            } else {
                setAppointmentTime('');
            }
            setTrackingCode(lead.tracking_code || '');
            setShippingFee(lead.shipping_fee?.toString() || '');
        }
    }, [lead, open]);

    const handleSubmit = async () => {
        if (!lead) return;

        if (!phone) {
            alert('Vui lòng nhập số điện thoại');
            return;
        }

        if (method === 'direct' && !appointmentTime) {
            alert('Vui lòng nhập ngày và giờ hẹn');
            return;
        }

        setIsSubmitting(true);
        try {
            const data: Partial<Lead> = {
                phone,
                delivery_method: method,
                pipeline_stage: 'hen_qua_ship',
                status: 'hen_qua_ship'
            };

            if (method === 'direct') {
                data.appointment_time = new Date(appointmentTime).toISOString();
            } else {
                data.tracking_code = trackingCode;
                data.shipping_fee = parseFloat(shippingFee) || 0;
            }

            await onSubmit(data);
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
                        {method === 'direct' ? <Calendar className="h-5 w-5 text-orange-500" /> : <Truck className="h-5 w-5 text-blue-500" />}
                        Thông tin nhận hàng / Hẹn qua
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-5 py-2">
                    {/* Lead Info Summary */}
                    <div className="flex items-center gap-3 p-3 rounded-lg border bg-slate-50/50">
                        <Avatar className="h-10 w-10 border">
                            {lead.fb_profile_pic && <AvatarImage src={lead.fb_profile_pic} />}
                            <AvatarFallback className="bg-primary/10 text-primary font-bold">
                                {lead.name.charAt(0).toUpperCase()}
                            </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                            <h4 className="font-bold text-sm text-foreground truncate">{lead.name}</h4>
                            <Badge variant="secondary" className={`text-[9px] font-medium h-4 mt-0.5 ${source.color}`}>
                                <Tag className="h-2 w-2 mr-1" />
                                {source.label}
                            </Badge>
                        </div>
                    </div>

                    <div className="grid gap-4">
                        <div className="grid gap-2">
                            <Label htmlFor="phone" className="text-sm font-semibold">Số điện thoại</Label>
                            <div className="relative">
                                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    id="phone"
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value)}
                                    placeholder="Nhập số điện thoại"
                                    className="pl-9"
                                />
                            </div>
                        </div>

                        <div className="grid gap-2">
                            <Label className="text-sm font-semibold">Phương thức</Label>
                            <Select value={method} onValueChange={(v: any) => setMethod(v)}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Chọn phương thức" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="direct">Nhận trực tiếp (Hẹn qua)</SelectItem>
                                    <SelectItem value="ship">Ship hàng</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {method === 'direct' ? (
                            <div className="grid gap-2 animate-in fade-in slide-in-from-top-1">
                                <Label htmlFor="appointmentTime" className="text-sm font-semibold">Ngày & giờ khách hẹn qua</Label>
                                <Input
                                    id="appointmentTime"
                                    type="datetime-local"
                                    value={appointmentTime}
                                    onChange={(e) => setAppointmentTime(e.target.value)}
                                    className="focus:ring-orange-500"
                                />
                            </div>
                        ) : (
                            <div className="space-y-4 animate-in fade-in slide-in-from-top-1">
                                <div className="grid gap-2">
                                    <Label htmlFor="trackingCode" className="text-sm font-semibold">Mã vận chuyển</Label>
                                    <Input
                                        id="trackingCode"
                                        value={trackingCode}
                                        onChange={(e) => setTrackingCode(e.target.value)}
                                        placeholder="Nhập mã vận chuyển"
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="shippingFee" className="text-sm font-semibold">Phí ship</Label>
                                    <Input
                                        id="shippingFee"
                                        type="number"
                                        value={shippingFee}
                                        onChange={(e) => setShippingFee(e.target.value)}
                                        placeholder="Nhập phí ship"
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                <DialogFooter className="gap-2 sm:gap-0">
                    <Button variant="outline" onClick={onClose} disabled={isSubmitting}>Hủy</Button>
                    <Button onClick={handleSubmit} disabled={isSubmitting}>
                        {isSubmitting ? 'Đang lưu...' : 'Lưu thông tin'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
