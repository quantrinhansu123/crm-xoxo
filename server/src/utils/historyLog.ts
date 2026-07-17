/**
 * History CRM chỉ lưu dữ liệu nhẹ:
 * thời gian, người thao tác, loại thao tác, trạng thái trước/sau,
 * ghi chú ngắn, tham chiếu link Drive (không nhúng URL dài vào notes).
 */

const URL_IN_TEXT_RE = /https?:\/\/\S+/gi;
const MAX_NOTE_LEN = 280;

export function isMediaUrl(url: string): boolean {
    return /^https?:\/\//i.test((url || '').trim());
}

export function normalizeMediaRefs(urls: unknown): string[] {
    if (!Array.isArray(urls)) return [];
    const out: string[] = [];
    const seen = new Set<string>();
    for (const u of urls) {
        if (typeof u !== 'string') continue;
        const t = u.trim();
        if (!isMediaUrl(t) || seen.has(t)) continue;
        seen.add(t);
        out.push(t);
    }
    return out;
}

export function sanitizeHistoryNotes(notes: string | null | undefined): string {
    if (!notes) return '';
    let s = notes
        .replace(URL_IN_TEXT_RE, '')
        .replace(/Ảnh bằng chứng:\s*/gi, '')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    if (s.length > MAX_NOTE_LEN) {
        s = s.slice(0, MAX_NOTE_LEN - 1).trimEnd() + '…';
    }
    return s;
}

function countMediaByKind(urls: string[]): { photos: number; videos: number; other: number } {
    let photos = 0;
    let videos = 0;
    let other = 0;
    for (const url of urls) {
        const lower = url.toLowerCase();
        const nameHint = decodeURIComponent((url.split('#').pop() || '').toLowerCase());
        if (/\.(mp4|mov|webm|m4v|avi)(\?|$)/i.test(lower) || /\.(mp4|mov|webm|m4v|avi)$/i.test(nameHint)) {
            videos += 1;
        } else if (
            /\.(jpe?g|png|gif|webp|heic|bmp)(\?|$)/i.test(lower)
            || /\.(jpe?g|png|gif|webp|heic|bmp)$/i.test(nameHint)
            || /drive\.google\.com/i.test(lower)
        ) {
            photos += 1;
        } else {
            other += 1;
        }
    }
    return { photos, videos, other };
}

export function summarizeMediaUpload(
    urls: string[],
    context: string,
    verb: 'upload' | 'thêm' | 'cập nhật' = 'upload',
): string {
    const refs = normalizeMediaRefs(urls);
    if (refs.length === 0) return '';
    const { photos, videos, other } = countMediaByKind(refs);
    const parts: string[] = [];
    const verbLabel = verb === 'upload' ? 'Đã upload' : verb === 'thêm' ? 'Đã thêm' : 'Đã cập nhật';
    if (photos > 0) parts.push(`${photos} ảnh`);
    if (videos > 0) parts.push(`${videos} video`);
    if (other > 0 && photos === 0 && videos === 0) parts.push(`${other} file`);
    if (parts.length === 0) parts.push(`${refs.length} file`);
    const ctx = context.trim();
    return `${verbLabel} ${parts.join(' và ')}${ctx ? ` ${ctx}` : ''}`.trim();
}

export function summarizeStatusChange(fromLabel: string, toLabel: string): string {
    const from = (fromLabel || '').trim();
    const to = (toLabel || '').trim();
    if (from && to) return `Đã đổi trạng thái từ ${from} sang ${to}`;
    if (to) return `Đã chuyển sang ${to}`;
    return 'Đã cập nhật trạng thái';
}

export function buildLightweightHistoryNote(parts: Array<string | null | undefined>): string {
    return sanitizeHistoryNotes(parts.filter((p) => typeof p === 'string' && p.trim()).join(' · '));
}
