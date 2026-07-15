import { useMemo, useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';

type StaffOption = { id: string; name: string; role?: string };

interface StaffNameSelectProps {
    value: string;
    onValueChange: (name: string) => void;
    users: StaffOption[];
    placeholder?: string;
    disabled?: boolean;
    className?: string;
    /** Khi không có danh sách NV — vẫn hiện ô tìm (danh sách trống) */
    allowFreeText?: boolean;
}

/** Combobox chọn NV: gõ để lọc tên. */
export function StaffNameSelect({
    value,
    onValueChange,
    users,
    placeholder = 'Chọn hoặc gõ tìm...',
    disabled,
    className,
}: StaffNameSelectProps) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');

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

    const filtered = useMemo(() => {
        const q = search.trim().toLocaleLowerCase('vi-VN');
        if (!q) return options;
        return options.filter((u) => {
            const name = u.name.toLocaleLowerCase('vi-VN');
            const role = (u.role || '').toLocaleLowerCase('vi-VN');
            return name.includes(q) || role.includes(q);
        });
    }, [options, search]);

    const handleSelect = (name: string) => {
        onValueChange(name);
        setSearch('');
        setOpen(false);
    };

    return (
        <Popover
            open={open}
            onOpenChange={(next) => {
                if (disabled) return;
                setOpen(next);
                if (!next) setSearch('');
            }}
        >
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    disabled={disabled}
                    className={cn(
                        'h-9 w-full justify-between px-3 text-left font-normal bg-white',
                        !value && 'text-muted-foreground',
                        className,
                    )}
                >
                    <span className="truncate">{value || placeholder}</span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent
                className="w-[--radix-popover-trigger-width] p-0 z-[300]"
                align="start"
            >
                <Command shouldFilter={false}>
                    <CommandInput
                        placeholder="Gõ tên nhân viên..."
                        value={search}
                        onValueChange={setSearch}
                    />
                    <CommandList>
                        <CommandEmpty>
                            {options.length === 0 ? 'Đang tải nhân viên...' : 'Không tìm thấy nhân viên'}
                        </CommandEmpty>
                        <CommandGroup>
                            {filtered.map((u) => (
                                <CommandItem
                                    key={u.id}
                                    value={u.name}
                                    onSelect={() => handleSelect(u.name)}
                                >
                                    <Check
                                        className={cn(
                                            'mr-2 h-4 w-4 shrink-0',
                                            value === u.name ? 'opacity-100' : 'opacity-0',
                                        )}
                                    />
                                    <span className="truncate">{u.name}</span>
                                    {u.role && (
                                        <span className="ml-auto text-[10px] uppercase text-muted-foreground">
                                            {u.role}
                                        </span>
                                    )}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
