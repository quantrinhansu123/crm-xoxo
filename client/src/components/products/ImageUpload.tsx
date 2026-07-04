import { memo, useState, useRef } from 'react';
import { Upload, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { uploadFile } from '@/lib/supabase';

interface ImageUploadProps {
    value: string | null;
    onChange: (url: string | null) => void;
    bucket?: string;
    folder?: string;
    disabled?: boolean;
    className?: string;
    hideInfo?: boolean;
    placeholderIcon?: React.ReactNode;
}

export const ImageUpload = memo(function ImageUpload({
    value,
    onChange,
    bucket = 'products',
    folder = 'images',
    disabled = false,
    className,
    hideInfo = false,
    placeholderIcon
}: ImageUploadProps) {
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const sizeClasses = className || "w-24 h-24";

    const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            toast.error('Vui lòng chọn file hình ảnh');
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            toast.error('File không được lớn hơn 5MB');
            return;
        }

        setUploading(true);
        try {
            const { url, error } = await uploadFile(bucket, folder, file);
            if (error) {
                toast.error('Lỗi khi tải lên hình ảnh');
                console.error('Upload error:', error);
                return;
            }
            onChange(url);
        } finally {
            setUploading(false);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    const handleRemoveImage = () => {
        onChange(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    if (uploading) {
        return (
            <div className={`${sizeClasses} rounded-lg border-2 border-dashed border-muted-foreground/30 flex flex-col items-center justify-center gap-1`}>
                <Loader2 className="h-5 w-5 text-primary animate-spin" />
                <span className="text-xs text-muted-foreground">Đang tải...</span>
            </div>
        );
    }

    return (
        <div className={`flex ${hideInfo ? 'flex-col' : 'items-center'} gap-4`}>
            {value ? (
                <div className={`relative ${sizeClasses} rounded-lg overflow-hidden border`}>
                    <img src={value} alt="Preview" className="w-full h-full object-cover" />
                    {!disabled && (
                        <button
                            type="button"
                            onClick={handleRemoveImage}
                            className="absolute top-1 right-1 p-1 bg-black/50 rounded-full hover:bg-black/70 transition-colors"
                        >
                            <X className="h-3 w-3 text-white" />
                        </button>
                    )}
                </div>
            ) : (
                <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={disabled}
                    className={`${sizeClasses} rounded-lg border-2 border-dashed border-muted-foreground/30 flex flex-col items-center justify-center gap-1 hover:border-primary/50 hover:bg-muted/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                    {placeholderIcon || <Upload className="h-5 w-5 text-muted-foreground" />}
                    <span className="text-xs text-muted-foreground">Tải lên</span>
                </button>
            )}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageSelect}
                className="hidden"
                disabled={disabled}
            />
            {!hideInfo && (
                <div className="text-xs text-muted-foreground">
                    <p>Định dạng: JPG, PNG, WebP</p>
                    <p>Tối đa: 5MB</p>
                </div>
            )}
        </div>
    );
});

ImageUpload.displayName = 'ImageUpload';
