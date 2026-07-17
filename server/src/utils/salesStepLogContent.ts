import {
    buildLightweightHistoryNote,
    normalizeMediaRefs,
    sanitizeHistoryNotes,
    summarizeMediaUpload,
} from './historyLog.js';

export interface SalesStepLogContent {
    reason: string;
    notes: string;
    photos: string[];
}

function asPhotoArray(val: unknown): string[] {
    return normalizeMediaRefs(val);
}

/**
 * Snapshot nhẹ khi rời bước Sale: ghi chú ngắn + link Drive refs.
 * Form đầy đủ vẫn nằm trên entity (sales_step_data), không dump vào history.
 */
export function extractSalesStepLogContent(
    fromStatus: string | null | undefined,
    salesStepData: Record<string, unknown> | null | undefined
): SalesStepLogContent {
    const data = salesStepData || {};
    const empty: SalesStepLogContent = { reason: '', notes: '', photos: [] };

    if (!fromStatus || !fromStatus.startsWith('step')) return empty;

    switch (fromStatus) {
        case 'step1': {
            const photos = asPhotoArray(data.step1_evidence_photos);
            const receiver = typeof data.step1_receiver_name === 'string' ? data.step1_receiver_name.trim() : '';
            const userNote = sanitizeHistoryNotes(
                typeof data.step1_notes === 'string' ? data.step1_notes : ''
            );
            return {
                reason: 'Hoàn thành bước Nhận đồ & Chụp ảnh',
                notes: buildLightweightHistoryNote([
                    summarizeMediaUpload(photos, 'nhận đồ'),
                    receiver ? `NV nhận: ${receiver}` : '',
                    userNote,
                ]),
                photos,
            };
        }
        case 'step2': {
            const tags = asPhotoArray(data.step2_tags_photos);
            const form = asPhotoArray(data.step2_form_photos);
            const photos = [...tags, ...form];
            const parts: string[] = [];
            if (tags.length) parts.push(summarizeMediaUpload(tags, 'tags'));
            if (form.length) parts.push(summarizeMediaUpload(form, 'form túi/shoestree', 'thêm'));
            return {
                reason: 'Hoàn thành bước Gắn Tags & Form',
                notes: buildLightweightHistoryNote(parts),
                photos,
            };
        }
        case 'step3': {
            const photos = asPhotoArray(data.step3_photos);
            const tech = typeof data.step3_technician_name === 'string' ? data.step3_technician_name.trim() : '';
            const userNote = sanitizeHistoryNotes(
                typeof data.step3_notes === 'string' ? data.step3_notes : ''
            );
            return {
                reason: 'Hoàn thành bước Trao đổi kỹ thuật',
                notes: buildLightweightHistoryNote([
                    tech ? `KT: ${tech}` : '',
                    summarizeMediaUpload(photos, 'QC / trao đổi KT', 'thêm'),
                    userNote,
                ]),
                photos,
            };
        }
        case 'step4': {
            const photos = asPhotoArray(data.step4_photos);
            const userNote = sanitizeHistoryNotes(
                typeof data.step4_notes === 'string' ? data.step4_notes : ''
            );
            return {
                reason: 'Hoàn thành bước Chốt gói / Chờ duyệt',
                notes: buildLightweightHistoryNote([
                    summarizeMediaUpload(photos, 'chốt gói', 'thêm'),
                    userNote,
                ]),
                photos,
            };
        }
        default:
            return empty;
    }
}
