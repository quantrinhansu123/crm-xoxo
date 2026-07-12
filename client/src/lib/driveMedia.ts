/** Helpers cho URL Google Drive trong CRM UI */

export function extractDriveFileId(url: string): string | null {
    if (!url) return null;
    const patterns = [
        /\/file\/d\/([a-zA-Z0-9_-]+)/,
        /[?&]id=([a-zA-Z0-9_-]+)/,
        /\/open\?id=([a-zA-Z0-9_-]+)/,
    ];
    for (const re of patterns) {
        const m = url.match(re);
        if (m?.[1]) return m[1];
    }
    return null;
}

export function isDriveUrl(url: string): boolean {
    return /drive\.google\.com/i.test(url || '');
}

/** Link xem/phát trong iframe — hoạt động với video/ảnh đã share anyone-with-link */
export function getDrivePreviewUrl(url: string): string | null {
    const id = extractDriveFileId(url);
    return id ? `https://drive.google.com/file/d/${id}/preview` : null;
}

export function getDriveViewUrl(url: string): string | null {
    const id = extractDriveFileId(url);
    return id ? `https://drive.google.com/file/d/${id}/view` : null;
}

/** Thumbnail Drive (ảnh + frame video) */
export function getDriveThumbnailUrl(url: string, size = 600): string | null {
    const id = extractDriveFileId(url);
    return id ? `https://drive.google.com/thumbnail?id=${id}&sz=w${size}` : null;
}

export function buildDriveMediaUrl(fileId: string, fileName?: string): string {
    const base = `https://drive.google.com/file/d/${fileId}/preview`;
    return fileName ? `${base}#${fileName}` : base;
}
