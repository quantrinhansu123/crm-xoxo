import { useMemo } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';

type StaffOption = { id: string; name: string };

interface StaffNameSelectProps {
    value: string;
    onValueChange: (name: string) => void;
    users: StaffOption[];
    placeholder?: string;
    disabled?: boolean;
    className?: string;
    /** Khi không có danh sách NV — cho phép gõ tự do */
    allowFreeText?: boolean;
}

/** Chọn tên NV; giữ được giá trị đã lưu dù không còn trong danh sách (fix aftersale không chọn được tên) */
export function StaffNameSelect({
    value,
    onValueChange,
    users,
    placeholder = 'Chọn...',
    disabled,
    className,
    allowFreeText = true,
}: StaffNameSelectProps) {
    const options = useMemo(() => {
        const byName = new Map<string, StaffOption>();
        for (const u of users) {
            if (u.name?.trim()) byName.set(u.name.trim(), u);
        }
        const trimmed = value?.trim();
        if (trimmed && !byName.has(trimmed)) {
            byName.set(trimmed, { id: `__saved__:${trimmed}`, name: trimmed });
        }
        return Array.from(byName.values());
    }, [users, value]);

    if (allowFreeText && options.length === 0) {
        return (
            <Input
                className={className}
                placeholder={placeholder}
                value={value || ''}
                disabled={disabled}
                onChange={(e) => onValueChange(e.target.value)}
            />
        );
    }

    return (
        <Select value={value || ''} onValueChange={onValueChange} disabled={disabled}>
            <SelectTrigger className={className}>
                <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
                {options.map((u) => (
                    <SelectItem key={u.id} value={u.name}>
                        {u.name}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
