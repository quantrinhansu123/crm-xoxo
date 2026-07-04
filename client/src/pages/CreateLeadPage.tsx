import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Loader2, Facebook, MessageSquare, ArrowLeft } from 'lucide-react';
import { toast, Toaster } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useLeads } from '@/hooks/useLeads';
import { useEmployees } from '@/hooks/useEmployees';
import { ImageUpload } from '@/components/products/ImageUpload';

export function CreateLeadPage() {
    const navigate = useNavigate();
    const { createLead } = useLeads();
    const { employees, fetchEmployees } = useEmployees();

    const [formData, setFormData] = useState({
        name: '',
        phone: '',
        email: '',
        company: '',
        address: '',
        source: 'facebook', // Default to facebook since user is focused on social
        lead_type: 'individual',
        assigned_to: '',
        notes: '',
        fb_thread_id: '',
        link_message: '',
        fb_profile_pic: null as string | null,
        fb_link: '',
        dob: '',
        appointment_time: ''
    });
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        fetchEmployees({ role: 'sale' });
    }, [fetchEmployees]);

    const handleProfilePicChange = useCallback((img: string | null) => {
        setFormData((prev) => ({ ...prev, fb_profile_pic: img }));
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name || !formData.phone) {
            toast.error('Vui lòng nhập tên và số điện thoại');
            return;
        }

        setSubmitting(true);
        try {
            await createLead(formData);
            toast.success('Đã tạo lead thành công!');
            navigate('/leads');
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Lỗi khi tạo lead';
            toast.error(message);
        } finally {
            setSubmitting(false);
        }
    };

    const submitButton = (className?: string) => (
        <Button
            type="submit"
            onClick={handleSubmit}
            disabled={submitting}
            className={className ?? 'h-11 sm:h-12 px-6 sm:px-10 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-xl shadow-blue-200 transition-all active:scale-95'}
        >
            {submitting ? (
                <>
                    <Loader2 className="h-4 w-4 sm:h-5 sm:w-5 mr-2 sm:mr-3 animate-spin" />
                    Đang tạo...
                </>
            ) : (
                <>
                    <Plus className="h-4 w-4 sm:h-5 sm:w-5 mr-2 sm:mr-3" />
                    Tạo Lead
                </>
            )}
        </Button>
    );

    return (
        <div className="w-full max-w-full mx-auto overflow-x-hidden px-1 sm:px-2 md:px-4 space-y-3 sm:space-y-4 pb-24 md:pb-8">
            <Toaster richColors position="top-right" />
            {/* Header */}
            <div className="bg-white p-3 sm:p-5 rounded-xl sm:rounded-2xl border border-border shadow-md mb-4 sm:mb-8">
                <div className="flex items-start gap-3 sm:gap-4 min-w-0">
                    <Button
                        variant="ghost"
                        size="icon"
                        type="button"
                        onClick={() => navigate('/leads')}
                        className="shrink-0 rounded-xl h-10 w-10 sm:h-12 sm:w-12 hover:bg-slate-100 transition-colors"
                    >
                        <ArrowLeft className="h-5 w-5 sm:h-6 sm:w-6" />
                    </Button>
                    <div className="min-w-0 flex-1">
                        <h1 className="text-lg sm:text-2xl lg:text-3xl font-extrabold text-slate-900 tracking-tight leading-tight">
                            Thêm Lead mới
                        </h1>
                        <p className="hidden sm:block text-slate-500 font-medium text-sm sm:text-base">
                            Khởi tạo hành trình phục vụ khách hàng mới của bạn
                        </p>
                    </div>
                </div>
                <div className="hidden md:flex items-center justify-end gap-3 mt-4">
                        <Button
                        type="button"
                        variant="outline"
                        onClick={() => navigate('/leads')}
                        disabled={submitting}
                        className="h-12 px-8 font-semibold rounded-xl border-2"
                    >
                        Hủy
                    </Button>
                    {submitButton('h-11 sm:h-12 px-6 sm:px-8 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all active:scale-95')}
                </div>
            </div>

            <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 xl:grid-cols-5 gap-4 sm:gap-6 min-w-0">
                {/* Left Column - Main Info (2/5 width) */}
                <div className="xl:col-span-2 space-y-6">
                    <Card className="border-none shadow-md ring-1 ring-border overflow-hidden">
                        <CardHeader className="bg-slate-50/80 border-b border-slate-100 py-3 sm:py-5">
                            <CardTitle className="text-base sm:text-xl font-bold flex items-center gap-2 sm:gap-3 text-slate-800">
                                <div className="h-6 sm:h-8 w-1 bg-blue-500 rounded-full shrink-0"></div>
                                Thông tin cơ bản
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 sm:p-6 space-y-4 sm:space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                                <div className="space-y-3">
                                    <Label htmlFor="name" className="text-sm font-bold text-slate-700 uppercase tracking-wider">Tên khách hàng <span className="text-red-500">*</span></Label>
                                    <Input
                                        id="name"
                                        value={formData.name}
                                        onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                        placeholder="Nguyễn Văn A"
                                        className="h-12 text-base border-slate-200 focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
                                        required
                                    />
                                </div>
                                <div className="space-y-3">
                                    <Label htmlFor="phone" className="text-sm font-bold text-slate-700 uppercase tracking-wider">Số điện thoại <span className="text-red-500">*</span></Label>
                                    <Input
                                        id="phone"
                                        value={formData.phone}
                                        onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                                        placeholder="0912345678"
                                        className="h-12 text-base border-slate-200 focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                                <div className="space-y-3">
                                    <Label htmlFor="email" className="text-sm font-bold text-slate-700 uppercase tracking-wider">Email</Label>
                                    <Input
                                        id="email"
                                        type="email"
                                        value={formData.email}
                                        onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                                        placeholder="email@example.com"
                                        className="h-12 text-base border-slate-200 focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
                                    />
                                </div>
                                <div className="space-y-3">
                                    <Label htmlFor="dob" className="text-sm font-bold text-slate-700 uppercase tracking-wider">Ngày sinh</Label>
                                    <Input
                                        id="dob"
                                        type="date"
                                        value={formData.dob || ''}
                                        onChange={(e) => setFormData(prev => ({ ...prev, dob: e.target.value }))}
                                        className="h-12 text-base border-slate-200 focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                                <div className="space-y-3">
                                    <Label htmlFor="company" className="text-sm font-bold text-slate-700 uppercase tracking-wider">Công ty</Label>
                                    <Input
                                        id="company"
                                        value={formData.company}
                                        onChange={(e) => setFormData(prev => ({ ...prev, company: e.target.value }))}
                                        placeholder="Công ty ABC"
                                        className="h-12 text-base border-slate-200 focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
                                    />
                                </div>
                                <div className="space-y-3">
                                    <Label htmlFor="address" className="text-sm font-bold text-slate-700 uppercase tracking-wider">Địa chỉ</Label>
                                    <Input
                                        id="address"
                                        value={formData.address || ''}
                                        onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                                        placeholder="Số nhà, đường, quận/huyện..."
                                        className="h-12 text-base border-slate-200 focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-none shadow-md ring-1 ring-border overflow-hidden">
                        <CardHeader className="bg-slate-50/80 border-b border-slate-100 py-3 sm:py-5">
                            <CardTitle className="text-base sm:text-xl font-bold flex items-center gap-2 sm:gap-3 text-slate-800">
                                <div className="h-6 sm:h-8 w-1 bg-blue-500 rounded-full shrink-0"></div>
                                Ghi chú chi tiết
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 sm:p-6">
                            <textarea
                                id="notes"
                                value={formData.notes}
                                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                                placeholder="Nhập thêm các ghi chú quan trọng về khách hàng mới này..."
                                className="w-full min-h-[140px] sm:min-h-[250px] px-3 sm:px-4 py-3 text-sm sm:text-base rounded-xl border border-slate-200 bg-slate-50/30 resize-none focus:outline-none focus:ring-4 focus:ring-blue-50 focus:border-blue-400 transition-all outline-none"
                            />
                        </CardContent>
                    </Card>
                </div>

                {/* Middle Column - Classification (1/5 width) */}
                <div className="xl:col-span-1 space-y-6">
                    <Card className="border-none shadow-md ring-1 ring-border overflow-hidden h-fit">
                        <CardHeader className="bg-slate-50/80 border-b border-slate-100 py-3 sm:py-5">
                            <CardTitle className="text-base sm:text-xl font-bold flex items-center gap-2 sm:gap-3 text-slate-800">
                                <span className="h-6 sm:h-8 w-1 bg-blue-500 rounded-full shrink-0"></span>
                                Phân loại & Phụ trách
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 sm:p-6 space-y-4 sm:space-y-6">
                            <div className="space-y-3">
                                <Label htmlFor="channel" className="text-xs font-bold text-slate-500 uppercase tracking-widest">Kênh khách hàng</Label>
                                <Select value={formData.source} onValueChange={(value) => setFormData(prev => ({ ...prev, source: value }))}>
                                    <SelectTrigger id="channel" className="h-12 border-slate-200">
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
                            <div className="space-y-3">
                                <Label htmlFor="lead_type" className="text-xs font-bold text-slate-500 uppercase tracking-widest">Loại khách hàng</Label>
                                <Select value={formData.lead_type} onValueChange={(value) => setFormData(prev => ({ ...prev, lead_type: value }))}>
                                    <SelectTrigger id="lead_type" className="h-12 border-slate-200">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="individual">Cá nhân</SelectItem>
                                        <SelectItem value="company">Doanh nghiệp</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-3">
                                <Label htmlFor="assigned_to" className="text-xs font-bold text-slate-500 uppercase tracking-widest">Sale phụ trách</Label>
                                <Select value={formData.assigned_to} onValueChange={(value) => setFormData(prev => ({ ...prev, assigned_to: value }))}>
                                    <SelectTrigger id="assigned_to" className="h-12 border-slate-200">
                                        <SelectValue placeholder="Chọn nhân viên" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {employees.map(emp => (
                                            <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-3">
                                <Label htmlFor="appointment_time" className="text-xs font-bold text-slate-500 uppercase tracking-widest">Thời gian liên hệ</Label>
                                <Input
                                    id="appointment_time"
                                    type="datetime-local"
                                    value={formData.appointment_time || ''}
                                    onChange={(e) => setFormData(prev => ({ ...prev, appointment_time: e.target.value }))}
                                    className="h-12 border-slate-200 focus:ring-blue-50"
                                />
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Right Column - Social Integration (2/5 width) */}
                <div className="xl:col-span-2 space-y-6">
                    <Card className="border-none shadow-md ring-1 ring-border overflow-hidden h-fit">
                        <CardHeader className="bg-slate-50/80 border-b border-slate-100 py-3 sm:py-5">
                            <CardTitle className="text-base sm:text-xl font-bold flex items-center gap-2 sm:gap-3 text-slate-800">
                                <div className="h-6 sm:h-8 w-1 bg-blue-500 rounded-full shrink-0"></div>
                                Ảnh đại diện & MXH
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 sm:p-6 flex flex-col items-center gap-4 sm:gap-6 min-w-0">
                            {/* Larger Image Upload Area */}
                            <div className="w-full flex flex-col items-center space-y-3 min-w-0">
                                <Label className="text-xs sm:text-sm font-bold text-slate-700 uppercase tracking-wider">Hình ảnh Lead</Label>
                                <ImageUpload
                                    value={formData.fb_profile_pic}
                                    onChange={handleProfilePicChange}
                                    folder="leads"
                                    className="w-full max-w-[240px] sm:max-w-[320px] aspect-square"
                                    hideInfo={true}
                                />
                                <p className="text-xs sm:text-sm text-slate-500 italic max-w-xs text-center px-2">Tải ảnh đại diện rõ nét của khách hàng lên</p>
                            </div>

                            <Separator className="w-full bg-slate-100" />

                            {/* Tighter Social Inputs */}
                            <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 pb-2 min-w-0">
                                <div className="space-y-3">
                                    <div className="flex items-center gap-2">
                                        <div className="p-1.5 bg-blue-50 rounded-lg">
                                            <Facebook className="h-4 w-4 text-blue-600" />
                                        </div>
                                        <Label htmlFor="fb_link" className="text-xs font-bold text-slate-600 uppercase tracking-widest">Link Profile MXH</Label>
                                    </div>
                                    <Input
                                        id="fb_link"
                                        value={formData.fb_link || ''}
                                        onChange={(e) => setFormData(prev => ({ ...prev, fb_link: e.target.value }))}
                                        placeholder="facebook.com/zuck"
                                        className="h-12 border-slate-200 shadow-sm focus:ring-blue-100 text-sm"
                                    />
                                </div>
                                <div className="space-y-3">
                                    <div className="flex items-center gap-2">
                                        <div className="p-1.5 bg-blue-50 rounded-lg">
                                            <MessageSquare className="h-4 w-4 text-blue-600" />
                                        </div>
                                        <Label htmlFor="fb_thread_id" className="text-xs font-bold text-slate-600 uppercase tracking-widest">Mã hội thoại (Thread ID)</Label>
                                    </div>
                                    <Input
                                        id="fb_thread_id"
                                        value={formData.fb_thread_id || ''}
                                        onChange={(e) => setFormData(prev => ({ ...prev, fb_thread_id: e.target.value }))}
                                        placeholder="t_123456789..."
                                        className="h-12 border-slate-200 shadow-sm focus:ring-blue-100 text-sm"
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </form>

            {/* Mobile sticky actions */}
            <div className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-white p-3 shadow-[0_-2px_10px_rgba(0,0,0,0.06)]">
                <div className="flex gap-2 max-w-lg mx-auto">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => navigate('/leads')}
                        disabled={submitting}
                        className="flex-1 h-11 font-semibold rounded-xl border-2"
                    >
                        Hủy
                    </Button>
                    {submitButton('flex-1 h-11 font-bold rounded-xl')}
                </div>
            </div>
        </div>
    );
}
