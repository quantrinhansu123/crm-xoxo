import { Router } from 'express';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.js';
import { ApiError } from '../middleware/errorHandler.js';

const router = Router();

async function callAppsScript(payload: Record<string, unknown>) {
    const appsScriptUrl = process.env.GOOGLE_DRIVE_APPSCRIPT_URL || '';
    if (!appsScriptUrl) {
        return { skipped: true as const };
    }

    const response = await fetch(appsScriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        redirect: 'follow',
    });

    const text = await response.text();
    let data: any = null;
    try {
        data = JSON.parse(text);
    } catch {
        data = { raw: text };
    }

    if (!response.ok || data?.ok === false) {
        console.error('[media/to-drive] Apps Script error:', data);
        throw new ApiError(data?.error || 'Apps Script lưu Drive thất bại', 502);
    }

    return {
        skipped: false as const,
        driveFileId: data.id as string,
        driveLink: data.link as string,
        playUrl: (data.playUrl ||
            (data.id ? `https://drive.google.com/file/d/${data.id}/preview` : data.link)) as string,
        fileName: data.name as string,
    };
}

/**
 * Mirror URL (ảnh đã lên Supabase) → Drive
 * Body: { url, fileName?, folder? }
 */
router.post('/to-drive', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { url, fileName, folder } = req.body || {};
        if (!url || typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
            throw new ApiError('url không hợp lệ', 400);
        }

        const result = await callAppsScript({
            url,
            fileName: fileName || undefined,
            folder: folder || undefined,
        });

        if (result.skipped) {
            return res.json({
                status: 'skipped',
                message: 'GOOGLE_DRIVE_APPSCRIPT_URL chưa cấu hình — bỏ qua lưu Drive',
            });
        }

        res.json({ status: 'success', data: result });
    } catch (error) {
        next(error);
    }
});

/**
 * Upload VIDEO trực tiếp lên Drive (không qua Supabase)
 * Body: { base64, mimeType, fileName, folder? }
 */
router.post('/to-drive-file', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { base64, mimeType, fileName, folder } = req.body || {};
        if (!base64 || typeof base64 !== 'string') {
            throw new ApiError('base64 là bắt buộc', 400);
        }
        if (!fileName || typeof fileName !== 'string') {
            throw new ApiError('fileName là bắt buộc', 400);
        }

        // Giới hạn ~40MB base64 (~30MB file) — Apps Script quota
        if (base64.length > 40 * 1024 * 1024) {
            throw new ApiError('Video quá lớn để đẩy Drive qua Apps Script (tối đa ~30MB)', 413);
        }

        const result = await callAppsScript({
            base64,
            mimeType: mimeType || 'video/mp4',
            fileName,
            folder: folder || undefined,
        });

        if (result.skipped) {
            throw new ApiError('GOOGLE_DRIVE_APPSCRIPT_URL chưa cấu hình — không thể lưu video', 503);
        }

        res.json({ status: 'success', data: result });
    } catch (error) {
        next(error);
    }
});

export { router as mediaRouter };
