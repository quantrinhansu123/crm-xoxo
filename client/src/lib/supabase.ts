import { createClient } from '@supabase/supabase-js';
import api from '@/lib/api';
import { buildDriveMediaUrl } from '@/lib/driveMedia';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');

function isVideoFile(file: File): boolean {
    if (file.type.startsWith('video/')) return true;
    return /\.(mp4|webm|mov|m4v|ogg|avi|mkv)$/i.test(file.name);
}

/**
 * Upload tạm lên Supabase → Apps Script lấy URL lưu Drive → xóa file tạm trên Supabase.
 * Khớp Web App đang live (chỉ nhận { url }).
 * URL lưu DB = link Drive (play được).
 */
export async function uploadFile(
    bucket: string,
    path: string,
    file: File
): Promise<{ url: string | null; error: Error | null }> {
    let tempPath: string | null = null;

    try {
        const fileExt = file.name.split('.').pop() || (isVideoFile(file) ? 'mp4' : 'jpg');
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        tempPath = `${path}/${fileName}`;

        const { error: uploadError } = await supabase.storage
            .from(bucket)
            .upload(tempPath, file, {
                cacheControl: '3600',
                upsert: false,
            });

        if (uploadError) throw uploadError;

        const { data } = supabase.storage.from(bucket).getPublicUrl(tempPath);
        const publicUrl = data.publicUrl;

        let driveRes;
        try {
            driveRes = await api.post('/media/to-drive', {
                url: publicUrl,
                fileName,
                folder: path || 'media',
            });
        } catch (driveErr: any) {
            const status = driveErr?.response?.status;
            // Server chưa deploy /api/media hoặc Apps Script lỗi → giữ file trên Supabase
            if (status === 404 || status === 502 || status === 503) {
                console.warn(
                    `[uploadFile] /media/to-drive trả ${status} — giữ URL Supabase. Cần deploy backend + GOOGLE_DRIVE_APPSCRIPT_URL.`
                );
                tempPath = null; // giữ file trên Supabase
                return { url: publicUrl, error: null };
            }
            throw driveErr;
        }

        const drive = driveRes.data?.data;
        if (driveRes.data?.status === 'skipped') {
            // Chưa cấu hình Apps Script → giữ URL Supabase
            tempPath = null;
            return { url: publicUrl, error: null };
        }

        const driveId = drive?.driveFileId;
        if (!driveId && !drive?.playUrl && !drive?.driveLink) {
            throw new Error('Drive không trả về link file');
        }

        // Xóa file tạm trên Supabase — media chính nằm trên Drive
        await supabase.storage.from(bucket).remove([tempPath]);
        tempPath = null;

        // Dùng /preview để bấm xem được trong CRM (iframe)
        const url = driveId
            ? buildDriveMediaUrl(driveId, fileName)
            : `${drive?.playUrl || drive?.driveLink}#${fileName}`;

        return { url, error: null };
    } catch (error: any) {
        if (tempPath) {
            try {
                await supabase.storage.from(bucket).remove([tempPath]);
            } catch {
                /* ignore cleanup */
            }
        }
        const message =
            error?.response?.data?.message ||
            error?.message ||
            'Lỗi upload lên Google Drive';
        return { url: null, error: new Error(message) };
    }
}

export async function deleteFile(
    bucket: string,
    filePath: string
): Promise<{ error: Error | null }> {
    try {
        const { error } = await supabase.storage.from(bucket).remove([filePath]);
        if (error) throw error;
        return { error: null };
    } catch (error) {
        return { error: error as Error };
    }
}

export default supabase;
