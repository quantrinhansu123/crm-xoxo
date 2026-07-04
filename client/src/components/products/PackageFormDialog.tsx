import { useState, useEffect } from 'react';
import { Gift, Wrench, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { formatCurrency } from '@/lib/utils';
import { toast } from 'sonner';
import type { ServicePackage, Service } from './types';
import { formatNumber, parseNumber } from './utils';
import { ImageUpload } from './ImageUpload';

interface PackageFormDialogProps {
    open: boolean;
    onClose: () => void;
    pkg?: ServicePackage | null;
    services: Service[];
    onSubmit: (data: Partial<ServicePackage>) => Promise<void>;
}

export function PackageFormDialog({ open, onClose, pkg, services, onSubmit }: PackageFormDialogProps) {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [items, setItems] = useState<{ service_id: string; quantity: number }[]>([]);
    const [price, setPrice] = useState(0);
    const [priceDisplay, setPriceDisplay] = useState('0');
    const [commissionSale, setCommissionSale] = useState(0);
    const [commissionTech, setCommissionTech] = useState(0);
    const [image, setImage] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    // Reset form when pkg changes
    useEffect(() => {
        if (pkg) {
            setName(pkg.name || '');
            setDescription(pkg.description || '');
            setItems(pkg.items || []);
            setPrice(pkg.price || 0);
            setPriceDisplay(formatNumber(pkg.price || 0));
            setCommissionSale(pkg.commission_sale || 0);
            setCommissionTech(pkg.commission_tech || 0);
            setImage(pkg.image || null);
        } else {
            setName('');
            setDescription('');
            setItems([]);
            setPrice(0);
            setPriceDisplay('0');
            setCommissionSale(0);
            setCommissionTech(0);
            setImage(null);
        }
    }, [pkg, open]);

    const handlePriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        const numValue = parseNumber(value);
        setPrice(numValue);
        setPriceDisplay(numValue === 0 ? '0' : formatNumber(numValue));
    };

    const handlePriceFocus = (e: React.FocusEvent<HTMLInputElement>) => {
        if (price === 0) e.target.select();
    };

    const addItem = () => {
        setItems([...items, { service_id: '', quantity: 1 }]);
    };

    const updateItem = (index: number, field: string, value: string | number) => {
        setItems(prev => prev.map((item, i) => {
            if (i !== index) return item;
            return { ...item, [field]: value };
        }));
    };

    const removeItem = (index: number) => {
        setItems(prev => prev.filter((_, i) => i !== index));
    };

    const handleSubmit = async () => {
        if (!name || items.length === 0 || price <= 0) {
            toast.error('Vui lòng điền đầy đủ thông tin');
            return;
        }

        setSubmitting(true);
        try {
            await onSubmit({
                name,
                description,
                price,
                image: image || undefined,
                commission_sale: commissionSale,
                commission_tech: commissionTech,
                items: items.map(item => ({
                    service_id: item.service_id,
                    quantity: item.quantity
                }))
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
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Gift className="h-5 w-5 text-primary" />
                        {pkg ? 'Sửa gói dịch vụ' : 'Thêm gói dịch vụ mới'}
                    </DialogTitle>
                    <DialogDescription>Nhập thông tin gói dịch vụ / liệu trình</DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {/* Image Upload */}
                    <div className="space-y-2">
                        <Label>Hình ảnh gói dịch vụ</Label>
                        <ImageUpload
                            value={image}
                            onChange={setImage}
                            folder="packages"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Mã gói</Label>
                            <Input value={pkg?.code || 'GOI...'} disabled className="bg-muted" />
                            <p className="text-xs text-muted-foreground">Mã tự động sinh khi tạo</p>
                        </div>
                        <div className="space-y-2">
                            <Label>Giá bán gói *</Label>
                            <Input
                                value={priceDisplay}
                                onChange={handlePriceChange}
                                onFocus={handlePriceFocus}
                                placeholder="0"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Tên gói *</Label>
                        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nhập tên gói" />
                    </div>

                    <div className="space-y-2">
                        <Label>Mô tả</Label>
                        <textarea
                            className="w-full min-h-15 px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Mô tả gói dịch vụ"
                        />
                    </div>

                    {/* Commission Section */}
                    <div className="pt-2 border-t">
                        <Label className="text-sm font-medium text-muted-foreground">Hoa hồng (%)</Label>
                        <div className="grid grid-cols-2 gap-4 mt-2">
                            <div className="space-y-2">
                                <Label className="text-xs">Sale</Label>
                                <Input
                                    type="number"
                                    min={0}
                                    max={100}
                                    value={commissionSale}
                                    onChange={(e) => setCommissionSale(Number(e.target.value))}
                                    onFocus={(e) => e.target.select()}
                                    placeholder="0"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs">Kỹ thuật viên</Label>
                                <Input
                                    type="number"
                                    min={0}
                                    max={100}
                                    value={commissionTech}
                                    onChange={(e) => setCommissionTech(Number(e.target.value))}
                                    onFocus={(e) => e.target.select()}
                                    placeholder="0"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Package Items */}
                    <div className="space-y-3 pt-4 border-t">
                        <div className="flex items-center justify-between">
                            <Label className="text-base font-semibold">Dịch vụ trong gói</Label>
                            <Button variant="outline" size="sm" onClick={addItem}>
                                <Wrench className="h-4 w-4 mr-1" />
                                Thêm dịch vụ
                            </Button>
                        </div>

                        {items.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-4">Chưa có dịch vụ trong gói</p>
                        ) : (
                            <div className="space-y-2">
                                {items.map((item, index) => (
                                    <div key={index} className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                                        <Select value={item.service_id} onValueChange={(v) => updateItem(index, 'service_id', v)}>
                                            <SelectTrigger className="flex-1">
                                                <SelectValue placeholder="Chọn dịch vụ" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {services.map(s => (
                                                    <SelectItem key={s.id} value={s.id}>{s.name} - {formatCurrency(s.price)}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <Input
                                            type="number"
                                            className="w-20"
                                            value={item.quantity}
                                            onChange={(e) => updateItem(index, 'quantity', Number(e.target.value))}
                                            min="1"
                                        />
                                        <Button variant="ghost" size="icon" onClick={() => removeItem(index)} className="text-red-500">
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        )}
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
