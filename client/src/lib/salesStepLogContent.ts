import {
    buildLightweightHistoryNote,
    mediaRefLabel,
    normalizeMediaRefs,
    sanitizeHistoryNotes,
    summarizeMediaUpload,
} from './historyLog';

export interface SalesStepLogContent {
    reason: string;
    notes: string;
    photos: string[];
}

export interface SalesStepField {
    label: string;
    value: string;
}

const SALES_STEP_TITLES: Record<string, string> = {
    step1: 'Nhận đồ & Chụp ảnh',
    step2: 'Gắn Tags & Form túi/Shoestree',
    step3: 'Trao đổi kỹ thuật',
    step4: 'Chốt gói / Chờ duyệt',
};

function asPhotoArray(val: unknown): string[] {
    return normalizeMediaRefs(val);
}

function normalizeSalesStepData(
    salesStepData: Record<string, unknown> | string | null | undefined
): Record<string, unknown> {
    if (!salesStepData) return {};
    if (typeof salesStepData === 'string') {
        try {
            const parsed = JSON.parse(salesStepData);
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
        } catch {
            return {};
        }
    }
    return salesStepData;
}

/**
 * Snapshot nhẹ khi rời bước Sale: ghi chú ngắn + link Drive refs.
 * Form đầy đủ vẫn nằm trên entity — history không dump toàn bộ field.
 */
export function extractSalesStepLogContent(
    fromStatus: string | null | undefined,
    salesStepData: Record<string, unknown> | string | null | undefined
): SalesStepLogContent {
    const data = normalizeSalesStepData(salesStepData);
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

/** Field đầy đủ — chỉ dùng khi mở form entity, không phải nguồn chính của history. */
export function extractSalesStepFields(
    fromStatus: string | null | undefined,
    salesStepData: Record<string, unknown> | string | null | undefined
): SalesStepField[] {
    const data = normalizeSalesStepData(salesStepData);
    if (!fromStatus || !fromStatus.startsWith('step')) return [];

    const fields: SalesStepField[] = [];
    const pushStr = (label: string, val: unknown) => {
        if (typeof val === 'string' && val.trim()) fields.push({ label, value: val.trim() });
    };

    switch (fromStatus) {
        case 'step1': {
            pushStr('NV Sale nhận đồ', data.step1_receiver_name);
            const fee = Number(data.step1_shipping_fee) || 0;
            if (fee > 0) {
                fields.push({ label: 'Phí ship', value: `${fee.toLocaleString('vi-VN')}đ` });
                pushStr('PT thanh toán ship', data.step1_payment_method);
            }
            fields.push({
                label: 'Phụ kiện đi kèm',
                value: data.step1_accessories_checked ? 'Đã xác nhận' : 'Chưa xác nhận',
            });
            pushStr('Ghi chú', data.step1_notes);
            break;
        }
        case 'step3': {
            pushStr('Kỹ thuật viên', data.step3_technician_name);
            pushStr('Chi tiết công việc', data.step3_work_details);
            pushStr('Vị trí xử lý', data.step3_work_location);
            pushStr('Ghi chú', data.step3_notes);
            break;
        }
        case 'step4': {
            pushStr('Ghi chú', data.step4_notes);
            break;
        }
        default:
            break;
    }

    return fields;
}

export function getSalesStepTitle(fromStatus: string | null | undefined): string | null {
    if (!fromStatus) return null;
    return SALES_STEP_TITLES[fromStatus] || null;
}

/**
 * Enrich nhẹ: bổ sung reason/notes/photos ngắn nếu log thiếu.
 * Không merge full form fields vào history display.
 */
export function enrichSalesTransitionLog(
    log: Record<string, unknown> | null | undefined,
    salesStepData?: Record<string, unknown> | string | null
): Record<string, unknown> | null | undefined {
    if (!log) return log;

    const fromStatus = (log.from_status || log.from_stage) as string | undefined;
    if (!fromStatus?.startsWith('step')) {
        return {
            ...log,
            notes: sanitizeHistoryNotes(typeof log.notes === 'string' ? log.notes : ''),
            photos: normalizeMediaRefs(log.photos),
        };
    }

    const stepData = salesStepData ?? (log._sales_step_data as Record<string, unknown> | string | undefined);
    const extracted = extractSalesStepLogContent(fromStatus, stepData);

    const existingPhotos = normalizeMediaRefs(log.photos);
    const mergedPhotos = [...new Set([...existingPhotos, ...extracted.photos])];

    const existingReason = typeof log.reason === 'string' ? log.reason.trim() : '';
    const existingNotes = sanitizeHistoryNotes(typeof log.notes === 'string' ? log.notes : '');

    return {
        ...log,
        reason: existingReason || extracted.reason || null,
        notes: existingNotes || extracted.notes || null,
        photos: mergedPhotos,
        _enriched_from_step: fromStatus,
        _step_title: getSalesStepTitle(fromStatus),
        // Giữ fields cho debug/form — UI history không còn ưu tiên block này
        _step_fields: extractSalesStepFields(fromStatus, stepData),
        _media_labels: mergedPhotos.map((url, i) => mediaRefLabel(url, i)),
    };
}
