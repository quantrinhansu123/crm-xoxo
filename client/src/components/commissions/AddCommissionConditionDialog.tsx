import { useState, useEffect } from 'react';
import { 
    Dialog, 
    DialogContent, 
    DialogHeader, 
    DialogTitle, 
    DialogFooter 
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { 
    Select, 
    SelectContent, 
    SelectItem, 
    SelectTrigger, 
    SelectValue 
} from '@/components/ui/select';
import { api } from '@/lib/api';
import type { Branch } from '@/types';
import { toast } from 'sonner';

interface AddCommissionConditionDialogProps {
    open: boolean;
    onClose: () => void;
    onSave: (data: {
        name: string;
        scope: 'all' | 'branch';
        branchId?: string;
        status: 'active' | 'inactive';
    }) => void;
}

export function AddCommissionConditionDialog({ 
    open, 
    onClose, 
    onSave 
}: AddCommissionConditionDialogProps) {
    const [name, setName] = useState('');
    const [scope, setScope] = useState<'all' | 'branch'>('all');
    const [branchId, setBranchId] = useState<string>('');
    const [status, setStatus] = useState<'active' | 'inactive'>('active');
    
    const [branches, setBranches] = useState<Branch[]>([]);
    const [loadingBranches, setLoadingBranches] = useState(false);

    useEffect(() => {
        if (open) {
            fetchBranches();
            // Reset form when opening
            setName('');
            setScope('all');
            setBranchId('');
            setStatus('active');
        }
    }, [open]);

    const fetchBranches = async () => {
        setLoadingBranches(true);
        try {
            const response = await api.get('/branches');
            const data = response.data?.data?.branches || [];
            setBranches(data);
        } catch (error) {
            console.error('Error fetching branches:', error);
            toast.error('Không thể lấy danh sách chi nhánh');
        } finally {
            setLoadingBranches(false);
        }
    };

    const handleSave = () => {
        if (!name.trim()) {
            toast.error('Vui lòng nhập tên điều kiện');
            return;
        }
        if (scope === 'branch' && !branchId) {
            toast.error('Vui lòng chọn chi nhánh');
            return;
        }

        onSave({
            name,
            scope,
            branchId: scope === 'branch' ? branchId : undefined,
            status,
        });
        onClose();
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[500px] p-0 overflow-hidden rounded-xl border-none shadow-2xl">
                <DialogHeader className="px-6 py-4 border-b bg-white">
                    <DialogTitle className="text-[17px] font-bold text-gray-800">
                        Thêm mới điều kiện hoa hồng
                    </DialogTitle>
                </DialogHeader>

                <div className="p-6 space-y-6 bg-white">
                    {/* Name Field */}
                    <div className="space-y-2">
                        <Label htmlFor="name" className="text-[14px] font-semibold text-gray-700">
                            Tên
                        </Label>
                        <Input
                            id="name"
                            placeholder="Nhập tên điều kiện..."
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="h-[40px] border-gray-200 focus:ring-blue-500 rounded-lg text-[14px]"
                        />
                    </div>

                    {/* Scope Field */}
                    <div className="space-y-3">
                        <Label className="text-[14px] font-semibold text-gray-700">
                            Phạm vi áp dụng
                        </Label>
                        <div className="flex items-center gap-8">
                            <RadioGroup 
                                value={scope} 
                                onValueChange={(val) => setScope(val as 'all' | 'branch')}
                                className="flex items-center gap-6"
                            >
                                <div className="flex items-center space-x-2.5">
                                    <RadioGroupItem value="all" id="scope-all" className="w-4 h-4 text-blue-600 border-gray-300" />
                                    <Label htmlFor="scope-all" className="text-[14px] font-medium text-gray-600 cursor-pointer">
                                        Toàn hệ thống
                                    </Label>
                                </div>
                                <div className="flex items-center space-x-2.5">
                                    <RadioGroupItem value="branch" id="scope-branch" className="w-4 h-4 text-blue-600 border-gray-300" />
                                    <Label htmlFor="scope-branch" className="text-[14px] font-medium text-gray-600 cursor-pointer">
                                        Chi nhánh
                                    </Label>
                                </div>
                            </RadioGroup>

                            {scope === 'branch' && (
                                <div className="flex-1 min-w-[200px] animate-in fade-in slide-in-from-left-2 duration-200">
                                    <Select value={branchId} onValueChange={setBranchId}>
                                        <SelectTrigger className="h-[36px] bg-gray-50 border-gray-200 rounded-md text-[13px] text-gray-600">
                                            <SelectValue placeholder="Chọn chi nhánh áp dụng" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {branches.map((branch) => (
                                                <SelectItem key={branch.id} value={branch.id} className="text-[13px]">
                                                    {branch.name}
                                                </SelectItem>
                                            ))}
                                            {branches.length === 0 && !loadingBranches && (
                                                <div className="p-2 text-[12px] text-center text-gray-400">
                                                    Không có dữ liệu chi nhánh
                                                </div>
                                            )}
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Status Field */}
                    <div className="space-y-3">
                        <Label className="text-[14px] font-semibold text-gray-700">
                            Trạng thái
                        </Label>
                        <RadioGroup 
                            value={status} 
                            onValueChange={(val) => setStatus(val as 'active' | 'inactive')}
                            className="flex items-center gap-8"
                        >
                            <div className="flex items-center space-x-2.5">
                                <RadioGroupItem value="active" id="status-active" className="w-4 h-4 text-blue-600 border-gray-300" />
                                <Label htmlFor="status-active" className="text-[14px] font-medium text-gray-600 cursor-pointer">
                                    Áp dụng
                                </Label>
                            </div>
                            <div className="flex items-center space-x-2.5">
                                <RadioGroupItem value="inactive" id="status-inactive" className="w-4 h-4 text-blue-600 border-gray-300" />
                                <Label htmlFor="status-inactive" className="text-[14px] font-medium text-gray-600 cursor-pointer">
                                    Ngừng áp dụng
                                </Label>
                            </div>
                        </RadioGroup>
                    </div>
                </div>

                <DialogFooter className="px-6 py-4 bg-gray-50 border-t flex items-center justify-end gap-3">
                    <Button
                        variant="ghost"
                        onClick={onClose}
                        className="h-[40px] px-6 text-[14px] font-semibold text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        Bỏ qua
                    </Button>
                    <Button
                        onClick={handleSave}
                        className="h-[40px] px-8 text-[14px] font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-md shadow-blue-200 transition-all hover:scale-[1.02] active:scale-[0.98]"
                    >
                        Lưu
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
