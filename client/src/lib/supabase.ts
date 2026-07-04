import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');

// Upload file to Supabase Storage
export async function uploadFile(
    bucket: string,
    path: string,
    file: File
): Promise<{ url: string | null; error: Error | null }> {
    try {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `${path}/${fileName}`;

        const { error: uploadError } = await supabase.storage
            .from(bucket)
            .upload(filePath, file, {
                cacheControl: '3600',
                upsert: false,
            });

        if (uploadError) {
            throw uploadError;
        }

        const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);

        return { url: data.publicUrl, error: null };
    } catch (error) {
        return { url: null, error: error as Error };
    }
}

// Delete file from Supabase Storage
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
