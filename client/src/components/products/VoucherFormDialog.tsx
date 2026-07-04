import { useState, useEffect } from 'react';
import { CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import type { APIVoucher } from './types';
import { formatNumber, parseNumber } from './utils';
import { ImageUpload } from './ImageUpload';

interface VoucherFormDialogProps {
    open: boolean;
    onClose: () => void;
    voucher?: APIVoucher | null;
    onSubmit: (data: Partial<APIVoucher>) => Promise<void>;
}

export function VoucherFormDialog({ open, onClose, voucher, onSubmit }: VoucherFormDialogProps) {
    const [name, setName] = useState('');
    const [type, setType] = useState<'percentage' | 'fixed'>('percentage');
    const [value, setValue] = useState(0);
    const [valueDisplay, setValueDisplay] = useState('0');
    const [minOrderValue, setMinOrderValue] = useState(0);
    const [minOrderDisplay, setMinOrderDisplay] = useState('0');
    const [maxDiscount, setMaxDiscount] = useState(0);
    const [maxDiscountDisplay, setMaxDiscountDisplay] = useState('0');
    const [quantity, setQuantity] = useState(0);
    const [quantityDisplay, setQuantityDisplay] = useState('0');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [image, setImage] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    // Reset form when voucher changes
    useEffect(() => {
        if (voucher) {
            setName(voucher.name || '');
            setType(voucher.type || 'percentage');
            setValue(voucher.value || 0);
            setValueDisplay(formatNumber(voucher.value || 0));
            setMinOrderValue(voucher.min_order_value || 0);
            setMinOrderDisplay(formatNumber(voucher.min_order_value || 0));
            setMaxDiscount(voucher.max_discount || 0);
            setMaxDiscountDisplay(formatNumber(voucher.max_discount || 0));
            setQuantity(voucher.quantity || 0);
            setQuantityDisplay(formatNumber(voucher.quantity || 0));
            setStartDate(voucher.start_date || '');
            setEndDate(voucher.end_date || '');
            setImage(voucher.image || null);
        } else {
            setName('');
            setType('percentage');
            setValue(0);
            setValueDisplay('0');
            setMinOrderValue(0);
            setMinOrderDisplay('0');
            setMaxDiscount(0);
            setMaxDiscountDisplay('0');
            setQuantity(0);
            setQuantityDisplay('0');
            setStartDate('');
            setEndDate('');
            setImage(null);
        }
    }, [voucher, open]);

    const handleValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const v = e.target.value;
        const numValue = parseNumber(v);
        setValue(numValue);
        setValueDisplay(numValue === 0 ? '0' : formatNumber(numValue));
    };

    const handleMinOrderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const v = e.target.value;
        const numValue = parseNumber(v);
        setMinOrderValue(numValue);
        setMinOrderDisplay(numValue === 0 ? '0' : formatNumber(numValue));
    };

    const handleMaxDiscountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const v = e.target.value;
        const numValue = parseNumber(v);
        setMaxDiscount(numValue);
        setMaxDiscountDisplay(numValue === 0 ? '0' : formatNumber(numValue));
    };

    const handleQuantityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const v = e.target.value;
        const numValue = parseNumber(v);
        setQuantity(numValue);
        setQuantityDisplay(numValue === 0 ? '0' : formatNumber(numValue));
    };

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
        const numValue = parseNumber(e.target.value);
        if (numValue === 0) e.target.select();
    };

    const handleSubmit = async () => {
        if (!name || value <= 0 || quantity <= 0 || !startDate || !endDate) {
            toast.error('Vui lòng điền đầy đủ thông tin');
            return;
        }

        setSubmitting(true);
        try {
            await onSubmit({
                name,
                type,
                value,
                min_order_value: minOrderValue || undefined,
                max_discount: maxDiscount || undefined,
                quantity,
                image: image || undefined,
                start_date: startDate,
                end_date: endDate
            });
            onClose();
        } catch (error) {
            // Error is already handled by onSubmit
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <CreditCard className="h-5 w-5 text-primary" />
                        {voucher ? 'Sửa voucher' : 'Thêm voucher mới'}
                    </DialogTitle>
                    <DialogDescription>Nhập thông tin voucher giảm giá</DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {/* Image Upload */}
                    <div className="space-y-2">
                        <Label>Hình ảnh voucher</Label>
                        <ImageUpload
                            value={image}
                            onChange={setImage}
                            folder="vouchers"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>Mã voucher</Label>
                        <Input value={voucher?.code || 'VC...'} disabled className="bg-muted" />
                        <p className="text-xs text-muted-foreground">Mã tự động sinh khi tạo</p>
                    </div>

                    <div className="space-y-2">
                        <Label>Tên voucher *</Label>
                        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nhập tên voucher" />
                    </div>

                    <div className="space-y-2">
                        <Label>Loại giảm giá *</Label>
                        <Select value={type} onValueChange={(v: 'percentage' | 'fixed') => setType(v)}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="percentage">Phần trăm (%)</SelectItem>
                                <SelectItem value="fixed">Số tiền cố định (VNĐ)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Giá trị *</Label>
                            <Input
                                type="text"
                                value={valueDisplay}
                                onChange={handleValueChange}
                                onFocus={handleFocus}
                                placeholder="0"
                            />
                            <p className="text-xs text-muted-foreground">
                                {type === 'percentage' ? '% giảm giá' : 'Số tiền giảm'}
                            </p>
                        </div>
                        <div className="space-y-2">
                            <Label>Số lượng *</Label>
                            <Input
                                type="text"
                                value={quantityDisplay}
                                onChange={handleQuantityChange}
                                onFocus={handleFocus}
                                placeholder="0"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Đơn hàng tối thiểu</Label>
                            <Input
                                type="text"
                                value={minOrderDisplay}
                                onChange={handleMinOrderChange}
                                onFocus={handleFocus}
                                placeholder="0"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Giảm tối đa</Label>
                            <Input
                                type="text"
                                value={maxDiscountDisplay}
                                onChange={handleMaxDiscountChange}
                                onFocus={handleFocus}
                                placeholder="0"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Ngày bắt đầu *</Label>
                            <Input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Ngày kết thúc *</Label>
                            <Input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                            />
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Huỷ</Button>
                    <Button onClick={handleSubmit} disabled={submitting}>
                        {submitting ? 'Đang lưu...' : 'Lưu'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
