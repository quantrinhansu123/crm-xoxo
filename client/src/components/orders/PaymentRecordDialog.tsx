import { useState, useRef, useEffect } from 'react';
import { Loader2, Upload, X, Wallet, Banknote, Smartphone, ImagePlus, CheckCircle2, Camera } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog';
import { ordersApi } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { uploadFile } from '@/lib/supabase';

interface PaymentRecordDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    orderId: string;
    orderCode: string;
    remainingDebt: number;
    onSuccess: () => void;
    initialContent?: string;
    initialAmount?: number;
}

const PAYMENT_METHODS = [
    { value: 'cash', label: 'Tiền mặt', icon: Banknote },
    { value: 'transfer', label: 'Chuyển khoản', icon: Smartphone },
    { value: 'zalopay', label: 'Zalo Pay', icon: Wallet },
] as const;

const CONTENT_SUGGESTIONS = [
    'Đặt cọc',
    'Thanh toán đợt 1',
    'Thanh toán đợt 2',
    'Thanh toán hết',
    'Thanh toán một phần',
];

export function PaymentRecordDialog({
    open,
    onOpenChange,
    orderId,
    orderCode,
    remainingDebt,
    onSuccess,
    initialContent = '',
    initialAmount = 0,
}: PaymentRecordDialogProps) {
    const [content, setContent] = useState(initialContent);
    const [amount, setAmount] = useState<number>(initialAmount);

    // Update values when dialog opens with initial props
    useEffect(() => {
        if (open) {
            if (initialContent) setContent(initialContent);
            if (initialAmount) setAmount(initialAmount);
        }
    }, [open, initialContent, initialAmount]);

    const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer' | 'zalopay'>('cash');
    const [imageUrl, setImageUrl] = useState('');
    const [notes, setNotes] = useState('');
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Format input currency
    const formatInputCurrency = (value: number): string => {
        if (value === 0) return '';
        return value.toLocaleString('vi-VN');
    };

    const parseInputCurrency = (value: string): number => {
        const cleaned = value.replace(/[^\d]/g, '');
        return parseInt(cleaned) || 0;
    };

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        // Validate file type
        if (!file.type.startsWith('image/')) {
            toast.error('Vui lòng chọn file ảnh');
            return;
        }

        // Validate file size (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
            toast.error('Kích thước ảnh không được vượt quá 5MB');
            return;
        }

        setUploading(true);
        try {
            const { url, error } = await uploadFile('payment-proofs', `orders/${orderId}`, file);

            if (error) {
                throw error;
            }

            if (url) {
                setImageUrl(url);
                toast.success('Tải ảnh lên thành công');
            }
        } catch (error: any) {
            toast.error('Lỗi khi tải ảnh lên: ' + (error.message || 'Vui lòng thử lại'));
        } finally {
            setUploading(false);
            // Reset input
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    const handleRemoveImage = () => {
        setImageUrl('');
    };

    const handleSubmit = async () => {
        if (!content.trim()) {
            toast.error('Vui lòng nhập nội dung thanh toán');
            return;
        }

        if (amount <= 0) {
            toast.error('Số tiền phải lớn hơn 0');
            return;
        }

        setLoading(true);
        try {
            await ordersApi.createPayment(orderId, {
                content: content.trim(),
                amount,
                payment_method: paymentMethod,
                image_url: imageUrl || undefined,
                notes: notes || undefined,
            });

            toast.success(`Đã ghi nhận thanh toán ${formatCurrency(amount)}`);
            onSuccess();
            handleClose();
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Lỗi khi tạo thanh toán');
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        setContent('');
        setAmount(0);
        setPaymentMethod('cash');
        setImageUrl('');
        setNotes('');
        onOpenChange(false);
    };

    const handlePayFull = () => {
        setAmount(remainingDebt);
        setContent('Thanh toán hết');
    };

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="max-w-md p-0 overflow-hidden">
                <DialogHeader className="p-6 pb-2">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                            <Wallet className="h-5 w-5 text-green-600" />
                        </div>
                        <div>
                            <DialogTitle className="text-xl">Ghi nhận thanh toán</DialogTitle>
                            <DialogDescription className="text-xs mt-0.5">
                                Đơn hàng: <span className="font-medium text-foreground">{orderCode}</span>
                                <span className="mx-2 text-muted-foreground">|</span>
                                Còn nợ: <span className="font-semibold text-red-600">{formatCurrency(remainingDebt)}</span>
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                <div className="px-6 py-4 space-y-4">
                    {/* Content */}
                    <div className="space-y-2">
                        <Label className="text-sm font-medium">Nội dung thanh toán *</Label>
                        <Input
                            placeholder="VD: Đặt cọc, Thanh toán đợt 1..."
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                        />
                        <div className="flex flex-wrap gap-1.5">
                            {CONTENT_SUGGESTIONS.map((suggestion) => (
                                <button
                                    key={suggestion}
                                    type="button"
                                    onClick={() => {
                                        setContent(suggestion);
                                        if (suggestion === 'Thanh toán hết') handlePayFull();
                                    }}
                                    className="text-xs px-2.5 py-1 rounded-full bg-muted hover:bg-muted/80 transition-colors"
                                >
                                    {suggestion}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Amount */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label className="text-sm font-medium">Số tiền *</Label>
                            {remainingDebt > 0 && (
                                <button
                                    type="button"
                                    onClick={handlePayFull}
                                    className="text-xs text-green-600 hover:underline font-medium"
                                >
                                    Thanh toán hết ({formatCurrency(remainingDebt)})
                                </button>
                            )}
                        </div>
                        <div className="relative">
                            <Input
                                type="text"
                                placeholder="0"
                                value={formatInputCurrency(amount)}
                                onChange={(e) => setAmount(parseInputCurrency(e.target.value))}
                                className="pr-12 text-lg font-semibold text-green-600"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-bold">
                                VND
                            </span>
                        </div>
                    </div>

                    {/* Payment Method */}
                    <div className="space-y-2">
                        <Label className="text-sm font-medium">Phương thức thanh toán</Label>
                        <div className="grid grid-cols-3 gap-2">
                            {PAYMENT_METHODS.map((method) => {
                                const Icon = method.icon;
                                const isSelected = paymentMethod === method.value;
                                return (
                                    <button
                                        key={method.value}
                                        type="button"
                                        onClick={() => setPaymentMethod(method.value)}
                                        className={`flex items-center justify-center gap-2 p-2.5 rounded-lg border-2 transition-all ${isSelected
                                            ? 'border-primary bg-primary/5 text-primary'
                                            : 'border-muted hover:border-muted-foreground/30 text-muted-foreground'
                                            }`}
                                    >
                                        <Icon className="h-4 w-4" />
                                        <span className="text-xs font-medium">{method.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Payment Verification - Image Upload */}
                    <div className="space-y-2">
                        <Label className="text-sm font-medium">Xác minh thanh toán</Label>
                        <input
                            type="file"
                            accept="image/*"
                            onChange={handleFileUpload}
                            ref={fileInputRef}
                            className="hidden"
                        />
                        <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            onChange={handleFileUpload}
                            id="cameraInput"
                            className="hidden"
                        />

                        {!imageUrl ? (
                            <div
                                onClick={() => fileInputRef.current?.click()}
                                className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all ${uploading ? 'opacity-50 pointer-events-none' : ''}`}
                            >
                                {uploading ? (
                                    <div className="flex items-center justify-center gap-2 py-1">
                                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                        <span className="text-sm text-muted-foreground">Đang tải ảnh...</span>
                                    </div>
                                ) : (
                                    <div className="flex items-center justify-center gap-4">
                                        <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                                            <ImagePlus className="h-5 w-5 text-muted-foreground" />
                                        </div>
                                        <div className="text-left">
                                            <p className="text-sm font-medium">Tải ảnh chứng từ</p>
                                            <p className="text-xs text-muted-foreground">QR code, biên lai, ảnh chuyển khoản...</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="relative">
                                <div className="border rounded-lg p-3 bg-green-50/50 border-green-200">
                                    <div className="flex items-center gap-4">
                                        <div className="relative group">
                                            <img
                                                src={imageUrl}
                                                alt="Payment proof"
                                                className="h-16 w-16 object-cover rounded-lg border shadow-sm"
                                            />
                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center rounded-lg transition-opacity">
                                                <button
                                                    type="button"
                                                    onClick={() => fileInputRef.current?.click()}
                                                    className="p-1.5 bg-white rounded-full text-primary"
                                                >
                                                    <Upload className="h-4 w-4" />
                                                </button>
                                            </div>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 text-green-600 mb-1">
                                                <CheckCircle2 className="h-4 w-4" />
                                                <span className="text-sm font-medium">Đã tải lên</span>
                                            </div>
                                            <div className="flex gap-3">
                                                <button
                                                    type="button"
                                                    onClick={() => fileInputRef.current?.click()}
                                                    className="text-xs font-medium text-blue-600 hover:text-blue-700"
                                                >
                                                    Đổi ảnh
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={handleRemoveImage}
                                                    className="text-xs font-medium text-red-600 hover:text-red-700"
                                                >
                                                    Xóa
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Notes */}
                    <div className="space-y-2">
                        <Label className="text-sm font-medium">Ghi chú (không bắt buộc)</Label>
                        <Input
                            placeholder="Ghi chú thêm..."
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            className="resize-none"
                        />
                    </div>
                </div>

                <DialogFooter className="p-6 pt-2 pb-6 gap-2 sm:gap-0">
                    <Button variant="ghost" onClick={handleClose} disabled={loading || uploading} className="h-10 text-muted-foreground hover:text-foreground">
                        Hủy
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={loading || uploading || !content.trim() || amount <= 0}
                        className="h-10 px-8 bg-green-600 hover:bg-green-700 shadow-md transition-all active:scale-95"
                    >
                        {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                        Xác nhận thanh toán
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
