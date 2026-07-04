import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    ArrowLeft, Phone, MessageCircle, Copy, Check, ArrowRightLeft,
    Loader2, User, Building, Calendar, Tag, UserCheck, Mail,
    Clock, MessageSquare, TrendingUp, Timer, Facebook, ExternalLink, CalendarClock,
    ShoppingBag, Globe, Zap, AlertTriangle, Flame,
    Image as ImageIcon,
    Smile,
    Paperclip,
    X,
    Trash2,
    Camera,
    Truck,
    Layout,
    Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { leadsApi } from '@/lib/api';
import { uploadFile } from '@/lib/supabase';
import { formatDateTime, isOverdueVN } from '@/lib/utils';
import type { Lead } from '@/hooks/useLeads';
import { useLeads } from '@/hooks/useLeads';
import { kanbanColumns, sourceLabels, getStatusLabel } from '@/components/leads/constants';
import { format } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { usersApi } from '@/lib/api';
import { SLACountdown } from '@/components/leads/SLACountdown';

interface MentionUser {
    id: string;
    name: string;
    avatar_url?: string;
    role?: string;
}

export function LeadDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { updateLead, convertLead, deleteLead, fetchLeads } = useLeads();
    const { user } = useAuth();

    const [lead, setLead] = useState<Lead | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [newNote, setNewNote] = useState('');
    const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);
    const [selectedSticker, setSelectedSticker] = useState<string | null>(null);
    const [uploadingImage, setUploadingImage] = useState(false);
    const [showMediaPicker, setShowMediaPicker] = useState(false);
    const [pickerTab, setPickerTab] = useState<'emoji' | 'sticker'>('emoji');
    const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const avatarInputRef = useRef<HTMLInputElement>(null);
    const [uploadingAvatar, setUploadingAvatar] = useState(false);

    const [selectedStatus, setSelectedStatus] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [phoneCopied, setPhoneCopied] = useState(false);
    const [emailCopied, setEmailCopied] = useState(false);
    const [activities, setActivities] = useState<any[]>([]);
    const [loadingActivities, setLoadingActivities] = useState(false);
    const [elapsedTime, setElapsedTime] = useState('');
    const [appointmentCountdown, setAppointmentCountdown] = useState('');
    const [followupCountdown, setFollowupCountdown] = useState('');

    // Edit lead fields state
    const [editFbLink, setEditFbLink] = useState('');
    const [editFbName, setEditFbName] = useState('');
    const [editNextFollowup, setEditNextFollowup] = useState('');
    const [editAppointment, setEditAppointment] = useState('');
    const [editPhone, setEditPhone] = useState('');
    const [editEmail, setEditEmail] = useState('');
    const [editCompany, setEditCompany] = useState('');
    const [editAddress, setEditAddress] = useState('');
    const [editDob, setEditDob] = useState('');
    const [isEditingInfo, setIsEditingInfo] = useState(false);
    const [isEditingContact, setIsEditingContact] = useState(false);
    
    // Suggestion state
    const [users, setUsers] = useState<MentionUser[]>([]);
    const [showMentions, setShowMentions] = useState(false);
    const [mentionFilter, setMentionFilter] = useState('');
    const [cursorPosition, setCursorPosition] = useState(0);
    const [mentionStyle, setMentionStyle] = useState({ top: 0, left: 0 });
    const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);
    const textAreaRef = useRef<HTMLTextAreaElement>(null);

    // Fetch lead data
    const fetchLead = useCallback(async () => {
        if (!id) return;

        setLoading(true);
        setError(null);

        try {
            const response = await leadsApi.getById(id);
            const leadData = response.data?.data?.lead || response.data?.data;
            if (leadData && leadData.id) {
                setLead(leadData as Lead);
                setSelectedStatus(leadData.pipeline_stage || leadData.status);
            } else {
                setError('Không tìm thấy thông tin lead');
            }
        } catch (err: any) {
            console.error('Error fetching lead:', err);
            setError(err.response?.data?.message || 'Lỗi khi tải thông tin lead');
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        fetchLead();
    }, [fetchLead]);

    // Initialize edit fields when lead data loads
    useEffect(() => {
        if (lead) {
            setEditFbLink(lead.fb_link || lead.link_message || '');
            setEditFbName(lead.fb_profile_name || '');
            setEditNextFollowup(lead.next_followup_time ? new Date(lead.next_followup_time).toISOString().slice(0, 16) : '');
            setEditAppointment(lead.appointment_time ? new Date(lead.appointment_time).toISOString().slice(0, 16) : '');
            setEditPhone(lead.phone || '');
            setEditEmail(lead.email || '');
            setEditCompany(lead.company || '');
            setEditAddress(lead.address || '');
            setEditDob(lead.dob || '');
        }
    }, [lead]);

    // Fetch activities
    const fetchActivities = async () => {
        if (!id) return;

        setLoadingActivities(true);
        try {
            const res = await leadsApi.getActivities(id);
            setActivities(res.data.data?.activities || []);
        } catch {
            setActivities([]);
        } finally {
            setLoadingActivities(false);
        }
    };

    useEffect(() => {
        fetchActivities();
        fetchUsers();
    }, [id]);

    const fetchUsers = async () => {
        try {
            const res = await usersApi.getAll();
            setUsers(res.data.data?.users || []);
        } catch (err) {
            console.error('Error fetching users:', err);
        }
    };

    // Timer for elapsed time since lead creation
    useEffect(() => {
        if (!lead?.created_at) return;

        const calculateElapsedTime = () => {
            const createdDate = new Date(lead.created_at);
            const now = new Date();
            const diff = now.getTime() - createdDate.getTime();

            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((diff % (1000 * 60)) / 1000);

            let timeStr = '';
            if (days > 0) timeStr += `${days} ngày `;
            if (hours > 0 || days > 0) timeStr += `${hours.toString().padStart(2, '0')}:`;
            timeStr += `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

            setElapsedTime(timeStr);
        };

        calculateElapsedTime();
        const interval = setInterval(calculateElapsedTime, 1000);

        return () => clearInterval(interval);
    }, [lead?.created_at]);

    // Timer for appointment countdown
    useEffect(() => {
        if (!lead?.appointment_time) {
            setAppointmentCountdown('');
            return;
        }

        let hasFetched = false;
        const calculateCountdown = () => {
            const appointDate = new Date(lead.appointment_time as string);
            const now = new Date();
            const diff = appointDate.getTime() - now.getTime();

            if (diff <= 0) {
                setAppointmentCountdown('');
                if (!hasFetched) {
                    hasFetched = true;
                    setTimeout(() => fetchLead(), 2000);
                }
                return;
            }

            const hours = Math.floor(diff / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((diff % (1000 * 60)) / 1000);

            setAppointmentCountdown(`${hours.toString().padStart(2, '0')}h:${minutes.toString().padStart(2, '0')}p:${seconds.toString().padStart(2, '0')}s`);
        };

        calculateCountdown();
        const interval = setInterval(calculateCountdown, 1000);

        return () => clearInterval(interval);
    }, [lead?.appointment_time, fetchLead]);

    // Timer for follow-up countdown
    useEffect(() => {
        if (!lead?.next_followup_time) {
            setFollowupCountdown('');
            return;
        }

        let hasFetched = false;
        const calculateCountdown = () => {
            const followupDate = new Date(lead.next_followup_time as string);
            const now = new Date();
            const diff = followupDate.getTime() - now.getTime();

            if (diff <= 0) {
                setFollowupCountdown('');
                if (!hasFetched) {
                    hasFetched = true;
                    setTimeout(() => fetchLead(), 2000);
                }
                return;
            }

            const hours = Math.floor(diff / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((diff % (1000 * 60)) / 1000);

            setFollowupCountdown(`${hours.toString().padStart(2, '0')}h:${minutes.toString().padStart(2, '0')}p:${seconds.toString().padStart(2, '0')}s`);
        };

        calculateCountdown();
        const interval = setInterval(calculateCountdown, 1000);

        return () => clearInterval(interval);
    }, [lead?.next_followup_time, fetchLead]);

    if (loading) {
        return (
            <div className="min-h-[60vh] flex items-center justify-center">
                <div className="text-center">
                    <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
                    <p className="mt-4 text-muted-foreground">Đang tải thông tin lead...</p>
                </div>
            </div>
        );
    }

    if (error || !lead) {
        return (
            <div className="min-h-[60vh] flex items-center justify-center">
                <Card className="max-w-md w-full text-center">
                    <CardContent className="pt-6">
                        <div className="h-16 w-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                            <User className="h-8 w-8 text-red-600" />
                        </div>
                        <h2 className="text-xl font-bold mb-2">Không tìm thấy Lead</h2>
                        <p className="text-muted-foreground mb-4">{error || 'Lead không tồn tại hoặc đã bị xóa'}</p>
                        <Button onClick={() => navigate('/leads')}>
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Quay lại
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    const column = kanbanColumns.find(c => c.id === (lead.pipeline_stage || lead.status)) || kanbanColumns[0];

    const handleCallPhone = () => {
        window.location.href = `tel:${lead.phone}`;
    };

    const handleCopyPhone = async () => {
        try {
            await navigator.clipboard.writeText(lead.phone);
            setPhoneCopied(true);
            setTimeout(() => setPhoneCopied(false), 2000);
            toast.success('Đã copy số điện thoại');
        } catch {
            toast.error('Không thể copy số điện thoại');
        }
    };

    const handleZaloClick = () => {
        const phone = lead.phone.replace(/^0/, '84');
        window.open(`https://zalo.me/${phone}`, '_blank');
    };

    const handleCopyEmail = async () => {
        if (lead.email) {
            try {
                await navigator.clipboard.writeText(lead.email);
                setEmailCopied(true);
                setTimeout(() => setEmailCopied(false), 2000);
                toast.success('Đã copy email');
            } catch {
                toast.error('Không thể copy email');
            }
        }
    };

    const handleStatusChange = async (newStatus: string) => {
        // Validation: Must have phone number to move to 'chot_don'
        if (newStatus === 'chot_don' && !lead.phone) {
            toast.error('Vui lòng cập nhật số điện thoại trước khi chốt đơn');
            return;
        }

        setIsSaving(true);
        try {
            await updateLead(lead.id, { status: newStatus, pipeline_stage: newStatus });
            await fetchLead();
            setSelectedStatus(newStatus);
            toast.success('Đã cập nhật trạng thái');

            // Refresh activities to show status change
            const res = await leadsApi.getActivities(lead.id);
            setActivities(res.data.data?.activities || []);
        } catch {
            toast.error('Lỗi khi cập nhật trạng thái');
        } finally {
            setIsSaving(false);
        }
    };

    const handleConvert = async () => {
        if (confirm(`Xác nhận chuyển đổi ${lead.name} thành khách hàng?`)) {
            try {
                await convertLead(lead.id);
                toast.success(`Đã chuyển đổi ${lead.name} thành khách hàng!`);
                await fetchLeads();
                navigate('/leads');
            } catch {
                toast.error('Lỗi khi chuyển đổi lead');
            }
        }
    };

    const handleDelete = async () => {
        if (confirm(`Bạn có chắc chắn muốn xóa lead "${lead.name}"? Hành động này không thể hoàn tác.`)) {
            setIsSaving(true);
            try {
                await deleteLead(lead.id);
                toast.success('Đã xóa lead thành công');
                navigate('/leads');
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Lỗi khi xóa lead';
                toast.error(message);
            } finally {
                setIsSaving(false);
            }
        }
    };

    const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !lead) return;

        if (!file.type.startsWith('image/')) {
            toast.error('Vui lòng chọn file hình ảnh');
            return;
        }

        setUploadingAvatar(true);
        try {
            const { url, error } = await uploadFile('products', `leads/${lead.id}/avatars`, file);
            if (error) {
                toast.error('Lỗi khi tải ảnh lên');
                return;
            }

            await updateLead(lead.id, { avatar_url: url || undefined });
            await fetchLead();
            toast.success('Đã cập nhật ảnh đại diện');
        } catch (err) {
            toast.error('Lỗi khi cập nhật ảnh đại diện');
        } finally {
            setUploadingAvatar(false);
            if (avatarInputRef.current) avatarInputRef.current.value = '';
        }
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            toast.error('Vui lòng chọn file hình ảnh');
            return;
        }

        setUploadingImage(true);
        try {
            const { url, error } = await uploadFile('products', `leads/notes/${lead!.id}`, file);
            if (error) {
                toast.error('Lỗi khi tải lên hình ảnh');
                return;
            }
            setSelectedImageUrl(url);
        } finally {
            setUploadingImage(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const getCaretCoordinates = () => {
        if (!textAreaRef.current) return { top: 30, left: 10 };
        
        const el = textAreaRef.current;
        const { offsetLeft, offsetTop } = el;
        
        // This is a simplified caret position calculator
        // For a more precise one, we would need a mirror div
        // But we can approximate based on line height and character width
        const fontSize = 14; // text-sm
        const lineHeight = 20;
        
        const textBeforeCaret = el.value.substring(0, el.selectionStart);
        const lines = textBeforeCaret.split('\n');
        const currentLineIndex = lines.length - 1;
        const currentLineText = lines[currentLineIndex];
        
        // Approximate character width (not perfect for non-monospace)
        const charWidth = fontSize * 0.6; 
        
        return {
            top: (currentLineIndex + 1) * lineHeight + 8, // +8 for padding
            left: Math.min(el.clientWidth - 200, currentLineText.length * charWidth + 12)
        };
    };

    const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const value = e.target.value;
        const position = e.target.selectionStart;
        setNewNote(value);
        setCursorPosition(position);

        // Check for @ trigger
        const lastAtPos = value.lastIndexOf('@', position - 1);
        if (lastAtPos !== -1) {
            const textAfterAt = value.substring(lastAtPos + 1, position);
            const isAtStartOrAfterSpace = lastAtPos === 0 || value[lastAtPos - 1] === ' ' || value[lastAtPos - 1] === '\n';
            
            if (isAtStartOrAfterSpace && !textAfterAt.includes(' ')) {
                setMentionFilter(textAfterAt);
                setShowMentions(true);
                setSelectedMentionIndex(-1);
                
                // Set dynamic position
                setMentionStyle(getCaretCoordinates()); 
            } else {
                setShowMentions(false);
            }
        } else {
            setShowMentions(false);
        }
    };

    const insertMention = (user: MentionUser) => {
        const beforeAt = newNote.substring(0, newNote.lastIndexOf('@', cursorPosition - 1));
        const afterMention = newNote.substring(cursorPosition);
        const updatedNote = `${beforeAt}@${user.name} ${afterMention}`;
        
        setNewNote(updatedNote);
        setShowMentions(false);
        
        // Focus back to textarea
        setTimeout(() => {
            if (textAreaRef.current) {
                textAreaRef.current.focus();
                const newPos = beforeAt.length + user.name.length + 2; 
                textAreaRef.current.setSelectionRange(newPos, newPos);
            }
        }, 0);
    };

    const filteredUsers = users.filter(u => 
        u.name.toLowerCase().includes(mentionFilter.toLowerCase())
    ).slice(0, 8);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (showMentions) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedMentionIndex(prev => {
                    if (prev === -1) return 0;
                    return (prev + 1) % filteredUsers.length;
                });
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedMentionIndex(prev => {
                    if (prev <= 0) return filteredUsers.length - 1;
                    return prev - 1;
                });
            } else if (e.key === 'Enter' || e.key === 'Tab') {
                if (filteredUsers.length > 0 && selectedMentionIndex !== -1) {
                    e.preventDefault();
                    insertMention(filteredUsers[selectedMentionIndex]);
                }
            } else if (e.key === 'Escape') {
                setShowMentions(false);
            }
        }
    };

    const handleAddNote = async () => {
        if (!id || (!newNote.trim() && !selectedImageUrl)) return;

        setIsSaving(true);
        try {
            const metadata: any = {};
            if (selectedImageUrl) {
                metadata.image_url = selectedImageUrl;
            }

            // Extract mentioned user IDs from content
            const mentions: string[] = [];
            users.forEach(u => {
                if (newNote.includes(`@${u.name}`)) {
                    mentions.push(u.id);
                }
            });
            if (mentions.length > 0) {
                metadata.mentions = mentions;
            }

            await leadsApi.addActivity(id, {
                activity_type: 'note',
                content: newNote.trim() || (selectedImageUrl ? 'Đã gửi một ảnh' : 'Ghi chú'),
                metadata
            });

            setNewNote('');
            setSelectedImageUrl(null);
            fetchActivities();
            toast.success('Đã thêm ghi chú');
        } catch (err) {
            toast.error('Lỗi khi thêm ghi chú');
        } finally {
            setIsSaving(false);
        }
    };

    const handleAddSticker = async (sticker: string) => {
        if (!id) return;

        setIsSaving(true);
        try {
            await leadsApi.addActivity(id, {
                activity_type: 'note',
                content: 'Đã gửi một sticker',
                metadata: { sticker_id: sticker }
            });

            setShowMediaPicker(false);
            fetchActivities();
            toast.success('Đã gửi sticker');
        } catch (err) {
            toast.error('Lỗi khi gửi sticker');
        } finally {
            setIsSaving(false);
        }
    };

    const handleSaveInfo = async () => {
        setIsSaving(true);
        try {
            const updateData: Partial<Lead> = {
                fb_link: editFbLink || undefined,
                fb_profile_name: editFbName || undefined,
                next_followup_time: editNextFollowup ? new Date(editNextFollowup).toISOString() : undefined,
                appointment_time: editAppointment ? new Date(editAppointment).toISOString() : undefined,
                phone: editPhone || undefined,
                email: editEmail || undefined,
                company: editCompany || undefined,
                address: editAddress || undefined,
                dob: editDob || undefined,
            };

            await updateLead(lead.id, updateData);

            await fetchLead();
            setIsEditingInfo(false);
            setIsEditingContact(false);
            toast.success('Đã cập nhật thông tin');
        } catch {
            toast.error('Lỗi khi cập nhật thông tin');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                <div className="flex items-start gap-3 flex-1">
                    <Button variant="ghost" size="icon" onClick={() => navigate('/leads')} className="-ml-2 shrink-0">
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div className="flex items-center gap-3 sm:gap-4 flex-1">
                        <div className="relative group cursor-pointer" onClick={() => avatarInputRef.current?.click()}>
                            <Avatar className="h-12 w-12 sm:h-14 sm:w-14 shrink-0 border-2 border-slate-100 overflow-hidden ring-2 ring-transparent group-hover:ring-primary/20 transition-all">
                                {lead.avatar_url || lead.fb_profile_pic ? (
                                    <AvatarImage src={lead.avatar_url || lead.fb_profile_pic || ''} alt={lead.name} className="object-cover" />
                                ) : null}
                                <AvatarFallback className={`${column.color} text-white text-lg sm:text-xl font-semibold`}>
                                    {lead.name.charAt(0)}
                                </AvatarFallback>
                            </Avatar>
                            
                            {/* Hover Overlay */}
                            <div className="absolute inset-0 bg-black/50 rounded-full opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all duration-200">
                                {uploadingAvatar ? (
                                    <Loader2 className="h-5 w-5 text-white animate-spin" />
                                ) : (
                                    <div className="flex flex-col items-center">
                                        <Camera className="h-5 w-5 text-white" />
                                        <span className="text-[8px] text-white font-bold uppercase mt-0.5">Tải lên</span>
                                    </div>
                                )}
                            </div>

                            {/* Hidden Input */}
                            <input
                                type="file"
                                ref={avatarInputRef}
                                onChange={handleAvatarChange}
                                accept="image/*"
                                className="hidden"
                            />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-3 mb-1">
                                <h1 className="text-xl sm:text-2xl font-bold truncate">{lead.name}</h1>
                                <SLACountdown lead={lead} size="lg" />
                            </div>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                <p className="text-muted-foreground text-sm sm:text-base">{lead.phone}</p>
                                {elapsedTime && (
                                    <div className="flex items-center gap-1.5 px-2 py-0.5 sm:py-1 bg-orange-100 text-orange-700 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap">
                                        <Timer className="h-3.5 w-3.5" />
                                        <span>{elapsedTime}</span>
                                    </div>
                                )}
                                {lead.next_followup_time && (
                                    <div className={`flex items-center gap-1.5 px-2 py-0.5 sm:py-1 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap ${
                                        isOverdueVN(lead.next_followup_time)
                                        ? 'bg-red-100 text-red-700 animate-pulse border border-red-200'
                                        : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                                    }`}>
                                        <CalendarClock className="h-3.5 w-3.5" />
                                        <span>{formatDateTime(lead.next_followup_time)}</span>
                                        {followupCountdown && (
                                            <span className="text-[10px] opacity-75 ml-1">({followupCountdown})</span>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Quick Actions */}
                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto mt-1 sm:mt-0">
                    <Select value={selectedStatus} onValueChange={handleStatusChange} disabled={isSaving}>
                        <SelectTrigger className="h-9 w-auto min-w-[150px] bg-white border-slate-200 shadow-sm transition-all hover:border-slate-300">
                            <div className="flex items-center gap-2 pr-1">
                                <div className={`w-2 h-2 rounded-full ${column.color} shadow-sm`} />
                                <span className="text-xs font-semibold uppercase tracking-wider">{column.label}</span>
                            </div>
                        </SelectTrigger>
                        <SelectContent>
                            {kanbanColumns.map(col => (
                                <SelectItem key={col.id} value={col.id}>
                                    <div className="flex items-center gap-2">
                                        <div className={`w-2 h-2 rounded-full ${col.color}`} />
                                        {col.label}
                                    </div>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Button variant="outline" size="sm" onClick={handleCallPhone} className="flex-1 sm:flex-none">
                        <Phone className="h-4 w-4 mr-2" />
                        Gọi điện
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleZaloClick} className="flex-1 sm:flex-none">
                        <MessageCircle className="h-4 w-4 mr-2" />
                        Zalo
                    </Button>
                    <Button
                        size="sm"
                        onClick={() => {
                            // Navigate to create order with lead info
                            const params = new URLSearchParams({
                                lead_id: lead.id,
                                lead_name: lead.name,
                                lead_phone: lead.phone,
                                lead_email: lead.email || '',
                            });
                            navigate(`/orders/new?${params.toString()}`);
                        }}
                        className="bg-green-600 hover:bg-green-700 flex-1 sm:flex-none whitespace-nowrap"
                    >
                        <ShoppingBag className="h-4 w-4 mr-2" />
                        Tạo đơn
                    </Button>
                    {(user?.role === 'admin' || user?.role === 'manager') && (
                        <Button
                            variant="destructive"
                            size="sm"
                            onClick={handleDelete}
                            className="flex-1 sm:flex-none"
                            disabled={isSaving}
                        >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Xóa Lead
                        </Button>
                    )}
                </div>
            </div>

            {/* Main Content - 2 Column Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                {/* Left Column - Lead Info (40%) */}
                <div className="lg:col-span-2 space-y-4">
                    {/* Contact Info Card */}
                    <Card>
                        <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-base flex items-center gap-2">
                                    <User className="h-4 w-4 text-primary" />
                                    Thông tin liên hệ
                                </CardTitle>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setIsEditingContact(!isEditingContact)}
                                    className="text-xs"
                                >
                                    {isEditingContact ? 'Hủy' : 'Chỉnh sửa'}
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-2.5">
                            {/* Phone */}
                            <div className="flex items-center gap-3 group">
                                <div className="w-[110px] sm:w-[130px] flex items-center gap-2 text-[11px] text-slate-500 font-bold uppercase tracking-tight shrink-0">
                                    <Phone className="h-3.5 w-3.5 text-blue-500" />
                                    Điện thoại
                                </div>
                                <div className="flex-1 bg-slate-50/80 rounded-lg border border-transparent group-hover:border-slate-200 transition-all flex justify-between items-center min-h-[36px] px-0 overflow-hidden">
                                    {isEditingContact ? (
                                        <Input
                                            value={editPhone}
                                            onChange={(e) => setEditPhone(e.target.value)}
                                            className="h-9 border-none bg-transparent text-sm font-bold focus-visible:ring-0 shadow-none"
                                        />
                                    ) : (
                                        <div className="flex flex-1 justify-between items-center pl-3 pr-1">
                                            {lead.phone}
                                            <Button variant="ghost" size="icon" className="h-6 w-6 opacity-40 hover:opacity-100" onClick={handleCopyPhone}>
                                                {phoneCopied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Email */}
                            <div className="flex items-center gap-3 group">
                                <div className="w-[110px] sm:w-[130px] flex items-center gap-2 text-[11px] text-slate-500 font-bold uppercase tracking-tight shrink-0">
                                    <Mail className="h-3.5 w-3.5 text-purple-500" />
                                    Email
                                </div>
                                <div className="flex-1 bg-slate-50/80 rounded-lg border border-transparent group-hover:border-slate-200 transition-all flex justify-between items-center min-h-[36px] px-0 overflow-hidden">
                                    {isEditingContact ? (
                                        <Input
                                            value={editEmail}
                                            onChange={(e) => setEditEmail(e.target.value)}
                                            className="h-9 border-none bg-transparent text-sm font-bold focus-visible:ring-0 shadow-none"
                                        />
                                    ) : (
                                        <div className="flex flex-1 justify-between items-center pl-3 pr-1">
                                            <span className="truncate">{lead.email || '-'}</span>
                                            {lead.email && (
                                                <Button variant="ghost" size="icon" className="h-6 w-6 opacity-40 hover:opacity-100" onClick={handleCopyEmail}>
                                                    {emailCopied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                                                </Button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Company */}
                            <div className="flex items-center gap-3 group">
                                <div className="w-[110px] sm:w-[130px] flex items-center gap-2 text-[11px] text-slate-500 font-bold uppercase tracking-tight shrink-0">
                                    <Building className="h-3.5 w-3.5 text-amber-500" />
                                    Công ty
                                </div>
                                <div className="flex-1 bg-slate-50/80 rounded-lg border border-transparent group-hover:border-slate-200 transition-all min-h-[36px] flex items-center px-0 overflow-hidden">
                                    {isEditingContact ? (
                                        <Input
                                            value={editCompany}
                                            onChange={(e) => setEditCompany(e.target.value)}
                                            className="h-9 border-none bg-transparent text-sm font-bold focus-visible:ring-0 shadow-none"
                                        />
                                    ) : (
                                        <div className="px-3 py-1.5 text-sm font-bold truncate">{lead.company || '-'}</div>
                                    )}
                                </div>
                            </div>

                            {/* Source */}
                            <div className="flex items-center gap-3 group">
                                <div className="w-[110px] sm:w-[130px] flex items-center gap-2 text-[11px] text-slate-500 font-bold uppercase tracking-tight shrink-0">
                                    <Tag className="h-3.5 w-3.5 text-green-500" />
                                    Nguồn/Kênh
                                </div>
                                <div className="flex-1 bg-slate-50/80 px-3 py-1.5 rounded-lg text-sm font-bold text-slate-900 border border-transparent group-hover:border-slate-200 transition-all min-h-[36px] flex items-center">
                                    <Badge variant="outline" className="bg-white text-[10px] font-bold uppercase border-slate-200">
                                        {sourceLabels[lead.channel || lead.source || '']?.label || lead.channel || lead.source || '-'}
                                    </Badge>
                                </div>
                            </div>

                            {/* Assigned User */}
                            <div className="flex items-center gap-3 group">
                                <div className="w-[110px] sm:w-[130px] flex items-center gap-2 text-[11px] text-slate-500 font-bold uppercase tracking-tight shrink-0">
                                    <UserCheck className="h-3.5 w-3.5 text-indigo-500" />
                                    Người phụ trách
                                </div>
                                <div className="flex-1 bg-slate-50/80 px-3 py-1.5 rounded-lg text-sm font-bold text-slate-900 border border-transparent group-hover:border-slate-200 transition-all min-h-[36px] flex items-center">
                                    <span className="truncate">{lead.assigned_user?.name || '-'}</span>
                                </div>
                            </div>

                            {/* Created Date */}
                            <div className="flex items-center gap-3 group">
                                <div className="w-[110px] sm:w-[130px] flex items-center gap-2 text-[11px] text-slate-500 font-bold uppercase tracking-tight shrink-0">
                                    <Calendar className="h-3.5 w-3.5 text-slate-400" />
                                    Ngày tạo
                                </div>
                                <div className="flex-1 bg-slate-50/80 px-3 py-1.5 rounded-lg text-sm font-bold text-slate-900 border border-transparent group-hover:border-slate-200 transition-all min-h-[36px] flex items-center">
                                    {formatDateTime(lead.created_at)}
                                </div>
                            </div>

                            {/* Date of Birth */}
                            <div className="flex items-center gap-3 group">
                                <div className="w-[110px] sm:w-[130px] flex items-center gap-2 text-[11px] text-slate-500 font-bold uppercase tracking-tight shrink-0">
                                    <Calendar className="h-3.5 w-3.5 text-rose-500" />
                                    Ngày sinh
                                </div>
                                <div className="flex-1 bg-slate-50/80 rounded-lg border border-transparent group-hover:border-slate-200 transition-all min-h-[36px] flex items-center px-0 overflow-hidden">
                                    {isEditingContact ? (
                                        <Input
                                            type="date"
                                            value={editDob ? editDob.split('T')[0] : ''}
                                            onChange={(e) => setEditDob(e.target.value)}
                                            className="h-9 border-none bg-transparent text-sm font-bold focus-visible:ring-0 shadow-none"
                                        />
                                    ) : (
                                        <div className="px-3 py-1.5 text-sm font-bold">
                                            {lead.dob ? new Date(lead.dob).toLocaleDateString('vi-VN') : '-'}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Address */}
                            <div className="flex items-start gap-3 group">
                                <div className="w-[110px] sm:w-[130px] flex items-center gap-2 text-[11px] text-slate-500 font-bold uppercase tracking-tight shrink-0 pt-2">
                                    <Globe className="h-3.5 w-3.5 text-slate-400" />
                                    Địa chỉ
                                </div>
                                <div className="flex-1 bg-slate-50/80 rounded-lg border border-transparent group-hover:border-slate-200 transition-all min-h-[36px] px-0 overflow-hidden">
                                    {isEditingContact ? (
                                        <textarea
                                            value={editAddress}
                                            onChange={(e) => setEditAddress(e.target.value)}
                                            className="w-full min-h-[80px] bg-transparent text-sm font-bold p-3 border-none focus:outline-none focus:ring-0 resize-none"
                                            placeholder="Địa chỉ khách hàng..."
                                        />
                                    ) : (
                                        <div className="px-3 py-2 text-sm font-bold text-slate-900 leading-snug">
                                            {lead.address || '-'}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Facebook Profile */}
                            {(lead.fb_link || lead.link_message) && (
                                <div className="flex items-center gap-3 group">
                                    <div className="w-[110px] sm:w-[130px] flex items-center gap-2 text-[11px] text-slate-500 font-bold uppercase tracking-tight shrink-0">
                                        <Facebook className="h-3.5 w-3.5 text-blue-600" />
                                        Facebook
                                    </div>
                                    <div className="flex-1 bg-slate-50/80 px-3 py-1.5 rounded-lg text-sm font-bold text-slate-900 border border-transparent group-hover:border-slate-200 transition-all flex justify-between items-center min-h-[36px]">
                                        <span className="truncate max-w-[150px]">{lead.fb_profile_name || 'Trang cá nhân'}</span>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6 opacity-40 hover:opacity-100"
                                            onClick={() => window.open(lead.fb_link || lead.link_message, '_blank')}
                                        >
                                            <ExternalLink className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                </div>
                            )}

                            {/* Last Message */}
                            {lead.last_message_time && (
                                <div className="flex items-center gap-3 group">
                                    <div className="w-[110px] sm:w-[130px] flex items-center gap-2 text-[11px] text-slate-500 font-bold uppercase tracking-tight shrink-0">
                                        <MessageCircle className="h-3.5 w-3.5 text-cyan-500" />
                                        Tin nhắn cuối
                                    </div>
                                    <div className="flex-1 bg-slate-50/80 px-3 py-1.5 rounded-lg text-sm font-bold text-slate-900 border border-transparent group-hover:border-slate-200 transition-all min-h-[36px] flex flex-col justify-center">
                                        <div className="flex items-center justify-between">
                                            <span>{formatDateTime(lead.last_message_time)}</span>
                                            {lead.last_actor && (
                                                <span className={`text-[9px] uppercase px-1 rounded ${lead.last_actor === 'lead' ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-700'}`}>
                                                    {lead.last_actor === 'lead' ? 'Khách' : 'Sale'}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Next Follow-up Time */}
                            <div className="flex items-center gap-3 group">
                                <div className="w-[110px] sm:w-[130px] flex items-center gap-2 text-[11px] text-slate-500 font-bold uppercase tracking-tight shrink-0">
                                    <CalendarClock className="h-3.5 w-3.5 text-orange-500" />
                                    Hẹn chăm sóc
                                </div>
                                <div className="flex-1 bg-slate-50/80 rounded-lg border border-transparent group-hover:border-slate-200 transition-all min-h-[36px] flex items-center px-0 overflow-hidden">
                                    {isEditingContact ? (
                                        <Input
                                            type="datetime-local"
                                            value={editNextFollowup}
                                            onChange={(e) => setEditNextFollowup(e.target.value)}
                                            className="h-9 border-none bg-transparent text-sm font-bold focus-visible:ring-0 shadow-none"
                                        />
                                    ) : (
                                        <div className={`flex-1 px-3 py-1.5 rounded-lg text-sm font-bold transition-all min-h-[36px] flex items-center ${
                                            lead.next_followup_time
                                            ? (isOverdueVN(lead.next_followup_time)
                                                ? 'bg-red-50 text-red-700 animate-pulse'
                                                : 'bg-emerald-50 text-emerald-700')
                                            : ''
                                        }`}>
                                            {lead.next_followup_time ? formatDateTime(lead.next_followup_time) : '-'}
                                            {followupCountdown && (
                                                <span className="text-xs text-orange-600 animate-pulse ml-2">
                                                    Còn lại: {followupCountdown}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Appointment Time */}
                            <div className="flex items-center gap-3 group">
                                <div className="w-[110px] sm:w-[130px] flex items-center gap-2 text-[11px] text-slate-500 font-bold uppercase tracking-tight shrink-0">
                                    <Clock className="h-3.5 w-3.5 text-pink-500" />
                                    Hẹn lịch họp
                                </div>
                                <div className="flex-1 bg-slate-50/80 rounded-lg border border-transparent group-hover:border-slate-200 transition-all min-h-[36px] flex items-center px-0 overflow-hidden">
                                    {isEditingContact ? (
                                        <Input
                                            type="datetime-local"
                                            value={editAppointment}
                                            onChange={(e) => setEditAppointment(e.target.value)}
                                            className="h-9 border-none bg-transparent text-sm font-bold focus-visible:ring-0 shadow-none"
                                        />
                                    ) : (
                                        <div className="px-3 py-1.5 text-sm font-bold flex flex-col">
                                            {lead.appointment_time ? (
                                                <>
                                                    <span>{formatDateTime(lead.appointment_time)}</span>
                                                    {appointmentCountdown && (
                                                        <span className="text-xs text-pink-600 animate-pulse">
                                                            Còn lại : {appointmentCountdown}
                                                        </span>
                                                    )}
                                                </>
                                            ) : '-'}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Save Button */}
                            {isEditingContact && (
                                <Button
                                    className="w-full mt-4 bg-primary text-white font-bold shadow-lg shadow-primary/20 transition-all hover:scale-[1.01] active:scale-[0.99]"
                                    onClick={handleSaveInfo}
                                    disabled={isSaving}
                                >
                                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
                                    Lưu thay đổi
                                </Button>
                            )}

                            {/* Owner Sale */}
                            {lead.owner_sale && (
                                <div className="flex items-center gap-3 group">
                                    <div className="w-[110px] sm:w-[130px] flex items-center gap-2 text-[11px] text-slate-500 font-bold uppercase tracking-tight shrink-0">
                                        <UserCheck className="h-3.5 w-3.5 text-violet-500" />
                                        Sale phụ trách
                                    </div>
                                    <div className="flex-1 bg-slate-50/80 px-3 py-1.5 rounded-lg text-sm font-bold text-slate-900 border border-transparent group-hover:border-slate-200 transition-all min-h-[36px] flex items-center">
                                        {lead.owner_sale}
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Sale Memory Box (Latest Context) */}
                    {(lead.quoted_price_last || lead.quoted_service || lead.appointment_time || lead.delivery_method || lead.sale_note_summary) && (
                        <Card className="border-emerald-100 bg-gradient-to-br from-emerald-50/30 to-white overflow-hidden shadow-sm">
                            <CardHeader className="pb-3 border-b border-emerald-50 bg-emerald-50/20">
                                <CardTitle className="text-xs font-extrabold flex items-center gap-2 text-emerald-800 uppercase tracking-wider">
                                    <Layout className="h-4 w-4 text-emerald-500" />
                                    Bộ nhớ sale gần nhất
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-4 space-y-4">
                                {lead.quoted_price_last && (
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                                            <Wallet className="h-4 w-4 text-emerald-600" />
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-bold text-emerald-600 uppercase">Giá báo gần nhất</p>
                                            <p className="text-sm font-black text-slate-900">{lead.quoted_price_last}đ</p>
                                        </div>
                                    </div>
                                )}

                                {lead.quoted_service && (
                                    <div className="flex items-start gap-3">
                                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
                                            <ArrowRightLeft className="h-4 w-4 text-blue-600" />
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-bold text-blue-600 uppercase">Dịch vụ</p>
                                            <p className="text-sm font-bold text-slate-800">{lead.quoted_service}</p>
                                        </div>
                                    </div>
                                )}

                                {lead.appointment_time && (
                                    <div className="flex items-start gap-3">
                                        <div className="w-8 h-8 rounded-full bg-pink-100 flex items-center justify-center shrink-0 mt-0.5">
                                            <Calendar className="h-4 w-4 text-pink-600" />
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-bold text-pink-600 uppercase">Hẹn</p>
                                            <p className="text-sm font-bold text-slate-800">{formatDateTime(lead.appointment_time)}</p>
                                        </div>
                                    </div>
                                )}

                                {lead.delivery_method && (
                                    <div className="flex items-start gap-3">
                                        <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
                                            <Truck className="h-4 w-4 text-amber-600" />
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-bold text-amber-600 uppercase">Giao nhận</p>
                                            <p className="text-sm font-bold text-slate-800">
                                                {lead.delivery_method === 'direct' ? 'Qua shop' : 
                                                 lead.delivery_method === 'ship' ? 'Gửi ship' : lead.delivery_method}
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {lead.sale_note_summary && (
                                    <div className="mt-2 pt-3 border-t border-emerald-50">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-1.5 flex items-center gap-1">
                                            <MessageSquare className="h-3 w-3" />
                                            Ghi chú sale
                                        </p>
                                        <div className="bg-white/60 p-3 rounded-lg border border-emerald-100/50 italic text-xs text-slate-700 leading-relaxed">
                                            "{lead.sale_note_summary}"
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    )}
 
                    {/* AI Analysis Card */}
                    {(lead.lead_score !== undefined || lead.loss_risk || lead.next_action || lead.customer_insight) && (
                        <Card className="border-indigo-100 bg-gradient-to-br from-indigo-50/50 to-white overflow-hidden shadow-sm">
                            <CardHeader className="pb-3 border-b border-indigo-50 bg-indigo-50/30">
                                <CardTitle className="text-xs font-extrabold flex items-center justify-between text-indigo-800 uppercase tracking-wider">
                                    <div className="flex items-center gap-2">
                                        <Zap className="h-4 w-4 fill-indigo-500 text-indigo-500" />
                                        Phân tích AI từ n8n
                                    </div>
                                    {lead.lead_score !== undefined && lead.lead_score >= 80 && (
                                        <Badge className="bg-red-500 hover:bg-red-600 animate-pulse border-none text-[10px]">🔥 HOT LEAD</Badge>
                                    )}
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-4 space-y-5">
                                <div className="grid grid-cols-2 gap-4">
                                    {/* Lead Heat Score */}
                                    <div className="space-y-2">
                                        <p className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
                                            <TrendingUp className="h-3 w-3" />
                                            Lead Heat Score
                                        </p>
                                        <div className="flex items-center gap-2">
                                            <div className="relative flex items-center justify-center">
                                                <Flame className={`h-8 w-8 ${
                                                    (lead.lead_score || 0) >= 80 ? 'text-red-500 fill-red-500 animate-bounce' :
                                                    (lead.lead_score || 0) >= 60 ? 'text-orange-500 fill-orange-500' :
                                                    'text-blue-400 fill-blue-500/20'
                                                }`} />
                                                <span className="absolute text-[10px] font-black text-white p-1">
                                                    {lead.lead_score || 0}
                                                </span>
                                            </div>
                                            <div className="flex-1 space-y-1">
                                                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                                    <div 
                                                        className={`h-full transition-all duration-1000 ${
                                                            (lead.lead_score || 0) >= 80 ? 'bg-red-500' :
                                                            (lead.lead_score || 0) >= 60 ? 'bg-orange-500' :
                                                            'bg-blue-400'
                                                        }`}
                                                        style={{ width: `${lead.lead_score || 0}%` }}
                                                    />
                                                </div>
                                                <p className={`text-[10px] font-bold ${
                                                    (lead.lead_score || 0) >= 80 ? 'text-red-600' :
                                                    (lead.lead_score || 0) >= 60 ? 'text-orange-600' :
                                                    'text-blue-600'
                                                }`}>
                                                    {(lead.lead_score || 0) >= 80 ? 'Rất tiềm năng' :
                                                     (lead.lead_score || 0) >= 60 ? 'Tiềm năng trung bình' :
                                                     'Cần nuôi dưỡng thêm'}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    {/* Loss Risk */}
                                    <div className="space-y-2">
                                        <p className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
                                            <AlertTriangle className="h-3 w-3" />
                                            Nguy cơ rớt khách
                                        </p>
                                        <div className="pt-1">
                                            {lead.loss_risk?.toLowerCase() === 'high' ? (
                                                <div className="bg-red-600 text-white text-[10px] font-black px-2 py-1.5 rounded shadow-lg animate-pulse flex items-center gap-1 w-fit rotate-[-2deg]">
                                                    <AlertTriangle className="h-3 w-3" />
                                                    NGUY CƠ RỚT KHÁCH
                                                </div>
                                            ) : lead.loss_risk?.toLowerCase() === 'medium' ? (
                                                <Badge variant="outline" className="border-orange-200 bg-orange-50 text-orange-700">Trung bình</Badge>
                                            ) : (
                                                <Badge variant="outline" className="border-green-200 bg-green-50 text-green-700 text-[10px]">Rủi ro thấp</Badge>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Next Best Action */}
                                {lead.next_action && (
                                    <div className="p-3 bg-white border-2 border-dashed border-indigo-200 rounded-xl relative overflow-hidden group hover:border-indigo-400 transition-colors shadow-sm">
                                        <div className="absolute top-0 right-0 p-1 opacity-10 group-hover:opacity-20 transition-opacity">
                                            <Zap className="h-10 w-10 text-indigo-400" />
                                        </div>
                                        <p className="text-[11px] font-black text-indigo-700 mb-1.5 flex items-center gap-1 uppercase tracking-tighter">
                                            <ArrowRightLeft className="h-3 w-3" />
                                            Gợi ý hành động:
                                        </p>
                                        <p className="text-sm font-bold text-slate-800 leading-relaxed pl-1">
                                            {lead.next_action}
                                        </p>
                                    </div>
                                )}

                                {/* AI Memory (Customer Insight) */}
                                {lead.customer_insight && (
                                    <div className="space-y-2 pt-1 border-t border-indigo-50">
                                        <p className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
                                            <Globe className="h-3 w-3 text-indigo-500" />
                                            Trí nhớ AI (Customer Insight)
                                        </p>
                                        <div className="bg-amber-50/50 p-3 rounded-lg border border-amber-100/50">
                                            <p className="text-xs text-amber-900 leading-relaxed whitespace-pre-wrap font-medium">
                                                {lead.customer_insight}
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    )}
 
                    {/* Edit Info Card */}
                    <Card>
                        <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-base flex items-center gap-2">
                                    <Facebook className="h-4 w-4 text-blue-600" />
                                    Chăm sóc & Theo dõi
                                </CardTitle>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setIsEditingInfo(!isEditingInfo)}
                                    className="text-xs"
                                >
                                    {isEditingInfo ? 'Hủy' : 'Chỉnh sửa'}
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-2.5">
                            {/* Facebook Link */}
                            <div className="flex items-center gap-3 group">
                                <div className="w-[110px] sm:w-[130px] flex items-center gap-2 text-[11px] text-slate-500 font-bold uppercase tracking-tight shrink-0">
                                    <Facebook className="h-3.5 w-3.5 text-blue-500" />
                                    Link Facebook
                                </div>
                                <div className="flex-1 bg-slate-50/80 rounded-lg border border-transparent group-hover:border-slate-200 transition-all min-h-[36px] flex items-center px-0 overflow-hidden">
                                    {isEditingInfo ? (
                                        <Input
                                            value={editFbLink}
                                            onChange={(e) => setEditFbLink(e.target.value)}
                                            placeholder="https://facebook.com/..."
                                            className="h-9 border-none bg-transparent text-sm font-bold focus-visible:ring-0 shadow-none"
                                        />
                                    ) : (
                                        <div className="px-3 py-1.5 text-sm font-bold truncate max-w-[200px] text-blue-600">
                                            {lead.fb_link || lead.link_message || '-'}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* FB Profile Name */}
                            <div className="flex items-center gap-3 group">
                                <div className="w-[110px] sm:w-[130px] flex items-center gap-2 text-[11px] text-slate-500 font-bold uppercase tracking-tight shrink-0">
                                    <User className="h-3.5 w-3.5 text-slate-400" />
                                    Tên Facebook
                                </div>
                                <div className="flex-1 bg-slate-50/80 rounded-lg border border-transparent group-hover:border-slate-200 transition-all min-h-[36px] flex items-center px-0 overflow-hidden">
                                    {isEditingInfo ? (
                                        <Input
                                            value={editFbName}
                                            onChange={(e) => setEditFbName(e.target.value)}
                                            placeholder="Tên profile"
                                            className="h-9 border-none bg-transparent text-sm font-bold focus-visible:ring-0 shadow-none"
                                        />
                                    ) : (
                                        <div className="px-3 py-1.5 text-sm font-bold truncate">
                                            {lead.fb_profile_name || '-'}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* FB Thread ID */}
                            <div className="flex items-center gap-3 group">
                                <div className="w-[110px] sm:w-[130px] flex items-center gap-2 text-[11px] text-slate-500 font-bold uppercase tracking-tight shrink-0">
                                    <MessageSquare className="h-3.5 w-3.5 text-slate-400" />
                                    Mã hội thoại
                                </div>
                                <div className="flex-1 bg-slate-50/80 px-3 py-1.5 rounded-lg text-sm font-mono font-bold text-slate-500 border border-transparent group-hover:border-slate-200 transition-all min-h-[36px] flex items-center truncate">
                                    {lead.fb_thread_id || '-'}
                                </div>
                            </div>

                            {/* Next Follow-up */}
                            <div className="flex items-center gap-3 group">
                                <div className="w-[110px] sm:w-[130px] flex items-center gap-2 text-[11px] text-slate-500 font-bold uppercase tracking-tight shrink-0">
                                    <CalendarClock className="h-3.5 w-3.5 text-orange-500" />
                                    Hẹn liên hệ
                                </div>
                                <div className="flex-1 bg-slate-50/80 rounded-lg border border-transparent group-hover:border-slate-200 transition-all min-h-[36px] flex items-center px-0 overflow-hidden">
                                    {isEditingInfo ? (
                                        <Input
                                            type="datetime-local"
                                            value={editNextFollowup}
                                            onChange={(e) => setEditNextFollowup(e.target.value)}
                                            className="h-9 border-none bg-transparent text-sm font-bold focus-visible:ring-0 shadow-none mr-2"
                                        />
                                    ) : (
                                        <div className="px-3 py-1.5 text-sm font-bold">
                                            {lead.next_followup_time ? formatDateTime(lead.next_followup_time) : '-'}
                                            {followupCountdown && (
                                                <span className="text-xs text-orange-600 animate-pulse ml-2">
                                                    Còn lại: {followupCountdown}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Appointment Time */}
                            <div className="flex items-center gap-3 group">
                                <div className="w-[110px] sm:w-[130px] flex items-center gap-2 text-[11px] text-slate-500 font-bold uppercase tracking-tight shrink-0">
                                    <Clock className="h-3.5 w-3.5 text-pink-500" />
                                    Hẹn lịch họp
                                </div>
                                <div className="flex-1 bg-slate-50/80 rounded-lg border border-transparent group-hover:border-slate-200 transition-all min-h-[36px] flex items-center px-0 overflow-hidden">
                                    {isEditingInfo ? (
                                        <Input
                                            type="datetime-local"
                                            value={editAppointment}
                                            onChange={(e) => setEditAppointment(e.target.value)}
                                            className="h-9 border-none bg-transparent text-sm font-bold focus-visible:ring-0 shadow-none mr-2"
                                        />
                                    ) : (
                                        <div className="px-3 py-1.5 text-sm font-bold">
                                            {lead.appointment_time ? formatDateTime(lead.appointment_time) : '-'}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Save Button */}
                            {isEditingInfo && (
                                <Button
                                    className="w-full mt-4 bg-primary text-white font-bold shadow-lg shadow-primary/20 transition-all hover:scale-[1.01] active:scale-[0.99]"
                                    onClick={handleSaveInfo}
                                    disabled={isSaving}
                                >
                                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
                                    Lưu thay đổi
                                </Button>
                            )}
                        </CardContent>
                    </Card>

                    {/* Main Notes Card */}
                    {lead.notes && (
                        <Card className="bg-amber-50/30 border-amber-100">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-bold flex items-center gap-2 text-amber-900">
                                    <MessageSquare className="h-4 w-4" />
                                    Ghi chú hệ thống
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-sm text-amber-900 whitespace-pre-wrap leading-relaxed italic">
                                    "{lead.notes}"
                                </p>
                            </CardContent>
                        </Card>
                    )}

                </div>

                {/* Right Column - Activity Timeline (60%) */}
                <div className="lg:col-span-3 space-y-4">
                    {/* Add Note Card */}
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base flex items-center gap-2">
                                <MessageSquare className="h-4 w-4 text-primary" />
                                Thêm ghi chú
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-3">
                                {selectedImageUrl && (
                                    <div className="relative w-24 h-24 rounded-lg overflow-hidden border">
                                        <img src={selectedImageUrl} alt="Selected" className="w-full h-full object-cover" />
                                        <button
                                            onClick={() => setSelectedImageUrl(null)}
                                            className="absolute top-1 right-1 p-1 bg-black/50 rounded-full text-white hover:bg-black/70"
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    </div>
                                )}
                                <div className="relative">
                                    <textarea
                                        ref={textAreaRef}
                                        value={newNote}
                                        onChange={handleTextareaChange}
                                        onKeyDown={handleKeyDown}
                                        placeholder="Nhập ghi chú mới... Dùng @ để nhắc tên đồng nghiệp"
                                        className="w-full min-h-24 px-3 py-2 pb-10 text-sm rounded-lg border border-input bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                                    />
                                    
                                    {/* Mentions dropdown */}
                                    {showMentions && filteredUsers.length > 0 && (
                                        <Card 
                                            className="absolute shadow-2xl z-[100] border-slate-200 overflow-hidden animate-in fade-in slide-in-from-top-2 w-64"
                                            style={{ 
                                                top: `${mentionStyle.top}px`, 
                                                left: `${mentionStyle.left}px` 
                                            }}
                                        >
                                            <div className="bg-slate-50 border-b px-3 py-2">
                                                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Đồng nghiệp</p>
                                            </div>
                                            <div className="max-h-60 overflow-y-auto p-1">
                                                {filteredUsers.map((user, index) => (
                                                    <button
                                                        key={user.id}
                                                        onClick={() => insertMention(user)}
                                                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all ${index === selectedMentionIndex ? 'bg-primary/10 text-primary' : 'hover:bg-slate-100'}`}
                                                    >
                                                        <Avatar className="h-8 w-8 shrink-0 border border-slate-100">
                                                            <AvatarImage src={user.avatar_url} />
                                                            <AvatarFallback className="bg-slate-200 text-xs text-slate-600 font-bold uppercase">
                                                                {user.name.charAt(0)}
                                                            </AvatarFallback>
                                                        </Avatar>
                                                        <div className="min-w-0">
                                                            <p className="text-sm font-bold truncate">{user.name}</p>
                                                            {user.role && (
                                                                <p className="text-[10px] text-slate-500 font-medium uppercase truncate">{user.role}</p>
                                                            )}
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        </Card>
                                    )}
                                    <div className="absolute bottom-2 left-2 flex items-center gap-1">
                                        <input
                                            type="file"
                                            ref={fileInputRef}
                                            onChange={handleImageUpload}
                                            accept="image/*"
                                            className="hidden"
                                        />
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-muted-foreground"
                                            onClick={() => fileInputRef.current?.click()}
                                            disabled={uploadingImage}
                                        >
                                            {uploadingImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-muted-foreground"
                                            onClick={() => setShowMediaPicker(!showMediaPicker)}
                                        >
                                            <Smile className="h-4 w-4" />
                                        </Button>
                                    </div>
                                    {showMediaPicker && (
                                        <Card className="absolute bottom-full left-0 mb-2 p-0 w-64 shadow-xl z-50 overflow-hidden border-slate-200">
                                            <div className="flex border-b bg-muted/50">
                                                <button
                                                    onClick={() => setPickerTab('emoji')}
                                                    className={`flex-1 py-2 text-xs font-medium transition-colors ${pickerTab === 'emoji' ? 'bg-white text-primary border-b-2 border-primary' : 'text-muted-foreground hover:bg-muted'}`}
                                                >
                                                    Emoji
                                                </button>
                                                <button
                                                    onClick={() => setPickerTab('sticker')}
                                                    className={`flex-1 py-2 text-xs font-medium transition-colors ${pickerTab === 'sticker' ? 'bg-white text-primary border-b-2 border-primary' : 'text-muted-foreground hover:bg-muted'}`}
                                                >
                                                    Stickers
                                                </button>
                                            </div>
                                            <div className="p-2 max-h-48 overflow-y-auto">
                                                {pickerTab === 'emoji' ? (
                                                    <div className="grid grid-cols-6 gap-1">
                                                        {['😊', '👍', '❤️', '🔥', '👏', '🙌', '⭐', '📍', '📞', '💬', '💼', '💰', '✅', '❌', '⏰', '🚀', '🎁', '🎉'].map(emoji => (
                                                            <button
                                                                key={emoji}
                                                                onClick={() => {
                                                                    setNewNote(prev => prev + emoji);
                                                                    setShowMediaPicker(false);
                                                                }}
                                                                className="w-8 h-8 flex items-center justify-center hover:bg-muted rounded text-lg"
                                                            >
                                                                {emoji}
                                                            </button>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div className="grid grid-cols-3 gap-2 p-1">
                                                        {['⭐', '🏆', '🚀', '💎', '🎯', '📢', '✅', '🆘', '🎉'].map(sticker => (
                                                            <button
                                                                key={sticker}
                                                                onClick={() => handleAddSticker(sticker)}
                                                                className="w-16 h-16 flex items-center justify-center hover:bg-primary/5 rounded-xl border border-transparent hover:border-primary/20 transition-all text-4xl"
                                                            >
                                                                {sticker}
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </Card>
                                    )}
                                </div>
                                <div className="flex justify-end">
                                    <Button
                                        className="w-full sm:w-auto min-w-[140px]"
                                        disabled={(!newNote.trim() && !selectedImageUrl) || isSaving || uploadingImage}
                                        onClick={handleAddNote}
                                    >
                                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                                        Thêm ghi chú
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-3 border-b sticky top-0 bg-card z-10">
                            <CardTitle className="text-base flex items-center gap-2">
                                <Clock className="h-4 w-4 text-primary" />
                                Lịch sử hoạt động
                                {activities.length > 0 && (
                                    <Badge variant="secondary" className="ml-2">
                                        {activities.length}
                                    </Badge>
                                )}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div>
                                {loadingActivities ? (
                                    <div className="flex items-center justify-center py-12">
                                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                    </div>
                                ) : activities.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                                        <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
                                            <Clock className="h-8 w-8 text-muted-foreground" />
                                        </div>
                                        <h3 className="font-medium mb-1">Chưa có hoạt động</h3>
                                        <p className="text-sm text-muted-foreground">
                                            Các hoạt động sẽ được ghi lại khi bạn tương tác với lead này
                                        </p>
                                    </div>
                                ) : (
                                    <div className="divide-y">
                                        {activities.map((activity, index) => (
                                            <div
                                                key={activity.id}
                                                className="p-4 hover:bg-muted/50 transition-colors"
                                            >
                                                <div className="flex gap-4">
                                                    {/* Timeline indicator */}
                                                    <div className="relative flex flex-col items-center">
                                                        <div className={`w-3 h-3 rounded-full shrink-0 ${activity.activity_type === 'status_change' ? 'bg-blue-500' :
                                                            activity.activity_type === 'lead_created' ? 'bg-orange-500' :
                                                                activity.activity_type === 'owner_assigned' ? 'bg-indigo-500' :
                                                                    activity.activity_type === 'customer_message' ? 'bg-cyan-500' :
                                                                        activity.activity_type === 'sale_reply' ? 'bg-emerald-500' :
                                                                            activity.activity_type === 'ai_suggestion' ? 'bg-purple-500' :
                                                                                'bg-green-500'
                                                            }`} />
                                                        {index < activities.length - 1 && (
                                                            <div className="w-0.5 h-full bg-border absolute top-4" />
                                                        )}
                                                    </div>

                                                    {/* Content */}
                                                    <div className="flex-1 min-w-0 pb-2">
                                                        {(activity.activity_type === 'status_change' ||
                                                            activity.activity_type === 'lead_created' ||
                                                            activity.activity_type === 'owner_assigned' ||
                                                            activity.activity_type === 'customer_message' ||
                                                            activity.activity_type === 'sale_reply' ||
                                                            activity.activity_type === 'ai_suggestion') ? (
                                                            <div className="space-y-2">
                                                                <div className="flex items-center gap-2 mb-1">
                                                                    <span className="text-xs font-medium text-primary">
                                                                        {formatDateTime(activity.created_at)}
                                                                    </span>
                                                                    <Badge
                                                                        variant="outline"
                                                                        className={`text-[10px] h-4 leading-none uppercase ${activity.activity_type === 'lead_created' ? 'border-orange-200 text-orange-700 bg-orange-50' :
                                                                            activity.activity_type === 'owner_assigned' ? 'border-indigo-200 text-indigo-700 bg-indigo-50' :
                                                                                activity.activity_type === 'customer_message' ? 'border-cyan-200 text-cyan-700 bg-cyan-50' :
                                                                                    activity.activity_type === 'sale_reply' ? 'border-emerald-200 text-emerald-700 bg-emerald-50' :
                                                                                        activity.activity_type === 'ai_suggestion' ? 'border-purple-200 text-purple-700 bg-purple-50 font-bold' :
                                                                                            'border-blue-200 text-blue-700 bg-blue-50'
                                                                            }`}
                                                                    >
                                                                        {activity.activity_type === 'lead_created' ? 'Tạo Lead' :
                                                                            activity.activity_type === 'owner_assigned' ? 'Gán Sale' :
                                                                                activity.activity_type === 'customer_message' ? 'Khách nhắn' :
                                                                                    activity.activity_type === 'sale_reply' ? 'Sale trả lời' :
                                                                                        activity.activity_type === 'ai_suggestion' ? '✨ Gợi ý AI' :
                                                                                            'Đổi trạng thái'
                                                                        }
                                                                    </Badge>
                                                                </div>

                                                                {activity.activity_type === 'status_change' ? (
                                                                    <>
                                                                        <p className="text-sm">
                                                                            <span className="font-medium">{activity.created_by_name || 'Hệ thống'}</span>
                                                                            <span className="text-muted-foreground"> đã chuyển trạng thái</span>
                                                                        </p>
                                                                        <div className="flex items-center gap-2 flex-wrap">
                                                                            <Badge variant="outline" className="text-xs">
                                                                                {getStatusLabel(activity.old_status)}
                                                                            </Badge>
                                                                            <span className="text-muted-foreground">→</span>
                                                                            <Badge className="text-xs">
                                                                                {getStatusLabel(activity.new_status)}
                                                                            </Badge>
                                                                        </div>
                                                                    </>
                                                                ) : (
                                                                    <div className={`rounded-lg py-2 px-3 border ${activity.activity_type === 'ai_suggestion' ? 'bg-purple-50/50 border-purple-100 italic shadow-sm' : 'bg-muted/30 border-muted/50'}`}>
                                                                        {activity.activity_type === 'ai_suggestion' && lead.next_action && (
                                                                            <div className="mb-2 pb-2 border-b border-purple-100 flex items-center gap-2 not-italic">
                                                                                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-purple-100">
                                                                                    <Zap className="h-3 w-3 text-purple-600 fill-purple-600" />
                                                                                </div>
                                                                                <p className="text-xs font-bold text-slate-800">
                                                                                    <span className="text-purple-700 uppercase tracking-tighter mr-1">Gợi ý hành động:</span> 
                                                                                    {lead.next_action}
                                                                                </p>
                                                                            </div>
                                                                        )}
                                                                        <p className="text-sm font-medium mb-1">
                                                                            {activity.created_by_name || (activity.activity_type === 'customer_message' ? 'Khách hàng' : (activity.activity_type === 'ai_suggestion' ? 'AI Assistant' : 'Hệ thống'))}
                                                                        </p>
                                                                        <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                                                                            {activity.content}
                                                                        </p>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <div className="space-y-2">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="font-semibold text-sm">
                                                                        {activity.created_by_name || 'Ẩn danh'}
                                                                    </span>
                                                                    <span className="text-xs text-muted-foreground">
                                                                        {format(new Date(activity.created_at), 'HH:mm dd/MM/yyyy')}
                                                                    </span>
                                                                </div>
                                                                <div className="text-sm bg-muted/30 rounded-lg py-2 px-3 border border-muted/50">
                                                                    <div className={`text-sm whitespace-pre-wrap ${activity.metadata?.sticker_id ? 'text-4xl py-2' : 'text-muted-foreground'}`}>
                                                                        {activity.metadata?.sticker_id || (() => {
                                                                            const content = activity.content || '';
                                                                            if (users.length === 0) return content;
                                                                            
                                                                            // Build a regex that matches exactly the names of our users
                                                                            const names = users.map(u => u.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
                                                                            const regex = new RegExp(`(@(?:${names}))`, 'g');
                                                                            
                                                                            const parts = content.split(regex);
                                                                            return parts.map((part: string, i: number) => {
                                                                                if (part.startsWith('@')) {
                                                                                    const nameOnly = part.substring(1);
                                                                                    const isValidUser = users.some(u => u.name === nameOnly);
                                                                                    if (isValidUser) {
                                                                                        return <span key={i} className="text-primary font-bold bg-primary/5 px-1 rounded">{part}</span>;
                                                                                    }
                                                                                }
                                                                                return part;
                                                                            });
                                                                        })()}
                                                                    </div>
                                                                    {activity.metadata?.image_url && (
                                                                        <div className="mt-2 group relative w-fit max-w-full">
                                                                            <img
                                                                                src={activity.metadata.image_url}
                                                                                alt="Activity"
                                                                                className="max-h-48 w-auto min-w-[120px] rounded-lg border shadow-sm cursor-zoom-in hover:opacity-95 transition-all object-cover"
                                                                                onClick={() => setImagePreviewUrl(activity.metadata.image_url)}
                                                                            />
                                                                            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                                <Button
                                                                                    size="icon"
                                                                                    variant="secondary"
                                                                                    className="h-8 w-8 rounded-full shadow-lg bg-white/80 backdrop-blur-sm hover:bg-white"
                                                                                    onClick={() => setImagePreviewUrl(activity.metadata.image_url)}
                                                                                >
                                                                                    <ExternalLink className="h-4 w-4" />
                                                                                </Button>
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Image Preview Dialog */}
            <Dialog open={!!imagePreviewUrl} onOpenChange={(open: boolean) => !open && setImagePreviewUrl(null)}>
                <DialogContent className="max-w-4xl p-0 overflow-hidden bg-black/90 border-none">
                    <div className="relative w-full h-full min-h-[50vh] flex items-center justify-center p-4">
                        <img
                            src={imagePreviewUrl || ''}
                            alt="Full Screen Preview"
                            className="max-w-full max-h-[85vh] object-contain rounded-sm"
                        />
                        <Button
                            variant="ghost"
                            size="icon"
                            className="absolute top-4 right-4 text-white hover:bg-white/20 rounded-full"
                            onClick={() => setImagePreviewUrl(null)}
                        >
                            <X className="h-6 w-6" />
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
