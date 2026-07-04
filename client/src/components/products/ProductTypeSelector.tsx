
import { useState, useRef, useEffect } from 'react';
import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandSeparator,
} from "@/components/ui/command";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { useProductTypes } from '@/hooks/useProductTypes';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface ProductTypeSelectorProps {
    value: string[];
    onChange: (value: string[]) => void;
}

export function ProductTypeSelector({ value, onChange }: ProductTypeSelectorProps) {
    const { productTypes, fetchProductTypes, createProductType } = useProductTypes();
    const [open, setOpen] = useState(false);
    const [inputValue, setInputValue] = useState("");

    useEffect(() => {
        fetchProductTypes();
    }, [fetchProductTypes]);

    const handleSelect = (code: string) => {
        if (value.includes(code)) {
            onChange(value.filter(v => v !== code));
        } else {
            onChange([...value, code]);
        }
    };

    const handleCreateType = async () => {
        if (!inputValue.trim()) return;

        // Basic code generation
        const code = inputValue.trim().toUpperCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            .replace(/[^A-Z0-9]/g, '_');

        // Check if code already exists
        if (productTypes.some(t => t.code === code)) {
            toast.error(`Đã tồn tại loại sản phẩm với mã ${code}`);
            return;
        }

        try {
            const newType = await createProductType({
                name: inputValue.trim(),
                code: code,
                description: 'Created via quick add'
            });
            if (newType) {
                // Add to selection
                onChange([...value, newType.code]);
                setInputValue('');
                toast.success(`Đã thêm loại sản phẩm: ${newType.name}`);
            }
        } catch (error) {
            console.error("Failed to create type", error);
        }
    };

    // Filtered types for searching
    // Command component handles filtering automatically if we don't override it,
    // but here we want to handle custom creation logic.
    // However, cmdk's CommandInput automatically filters CommandItems by default based on value.
    // We can use `onValueChange` on CommandInput to track input for "Add new".

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="w-full justify-between h-auto min-h-[44px] py-2 px-3 text-left font-normal"
                >
                    <div className="flex flex-wrap gap-1">
                        {value.length === 0 && (
                            <span className="text-muted-foreground">Chọn loại sản phẩm áp dụng...</span>
                        )}
                        {value.length > 0 && (
                            value.map(code => {
                                const type = productTypes.find(t => t.code === code);
                                return (
                                    <Badge key={code} variant="secondary" className="mr-1 mb-1">
                                        {type?.name || code}
                                    </Badge>
                                );
                            })
                        )}
                    </div>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[400px] p-0" align="start">
                <Command>
                    <CommandInput
                        placeholder="Tìm kiếm hoặc thêm mới..."
                        value={inputValue}
                        onValueChange={setInputValue}
                    />
                    <CommandList>
                        <CommandEmpty>
                            {inputValue ? (
                                <div className="p-2">
                                    <p className="text-sm text-muted-foreground text-center mb-2">
                                        Không tìm thấy "{inputValue}"
                                    </p>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="w-full justify-center text-primary"
                                        onClick={handleCreateType}
                                    >
                                        <Plus className="mr-2 h-4 w-4" />
                                        Thêm mới "{inputValue}"
                                    </Button>
                                </div>
                            ) : (
                                "Không tìm thấy loại sản phẩm nào."
                            )}
                        </CommandEmpty>
                        <CommandGroup>
                            {productTypes.map((type) => (
                                <CommandItem
                                    key={type.code}
                                    value={type.name}
                                    onSelect={() => handleSelect(type.code)}
                                >
                                    <div
                                        className={cn(
                                            "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                                            value.includes(type.code)
                                                ? "bg-primary text-primary-foreground"
                                                : "opacity-50 [&_svg]:invisible"
                                        )}
                                    >
                                        <Check className={cn("h-4 w-4")} />
                                    </div>
                                    <span>{type.name}</span>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                        <CommandSeparator />
                        <div className="p-2 text-center">
                            <p className="text-[10px] text-muted-foreground">
                                Chọn checkbox để chọn nhiều loại.
                            </p>
                        </div>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
