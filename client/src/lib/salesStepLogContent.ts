export interface SalesStepLogContent {
    reason: string;
    notes: string;
    photos: string[];
}

function asPhotoArray(val: unknown): string[] {
    if (Array.isArray(val)) {
        return val.filter((u): u is string => typeof u === 'string' && u.length > 0);
    }
    if (typeof val === 'string' && val.trim()) {
        try {
            const parsed = JSON.parse(val);
            if (Array.isArray(parsed)) {
                return parsed.filter((u): u is string => typeof u === 'string' && u.length > 0);
            }
        } catch {
            return [val];
        }
    }
    return [];
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

export function extractSalesStepLogContent(
    fromStatus: string | null | undefined,
    salesStepData: Record<string, unknown> | string | null | undefined
): SalesStepLogContent {
    const data = normalizeSalesStepData(salesStepData);
    const empty: SalesStepLogContent = { reason: '', notes: '', photos: [] };

    if (!fromStatus || !fromStatus.startsWith('step')) return empty;

    switch (fromStatus) {
        case 'step1': {
            const receiver = typeof data.step1_receiver_name === 'string' ? data.step1_receiver_name : '';
            const notes = typeof data.step1_notes === 'string' ? data.step1_notes : '';
            const photos = asPhotoArray(data.step1_evidence_photos);
            const extras: string[] = [];
            const shippingFee = Number(data.step1_shipping_fee) || 0;
            if (shippingFee > 0) {
                extras.push(`Phí ship: ${shippingFee.toLocaleString('vi-VN')}đ`);
            }
            if (data.step1_accessories_checked) {
                extras.push('Đã xác nhận phụ kiện đi kèm');
            }
            if (typeof data.step1_payment_method === 'string' && data.step1_payment_method && shippingFee > 0) {
                extras.push(`PT thanh toán ship: ${data.step1_payment_method}`);
            }
            return {
                reason: receiver ? `NV Sale nhận: ${receiver}` : 'Nhận đồ & Chụp ảnh',
                notes: [notes, ...extras].filter(Boolean).join('\n'),
                photos,
            };
        }
        case 'step2':
            return {
                reason: 'Gắn Tags & Form túi/Shoestree',
                notes: '',
                photos: [
                    ...asPhotoArray(data.step2_tags_photos),
                    ...asPhotoArray(data.step2_form_photos),
                ],
            };
        case 'step3': {
            const tech = typeof data.step3_technician_name === 'string' ? data.step3_technician_name : '';
            const parts = [
                typeof data.step3_work_details === 'string' ? data.step3_work_details : '',
                typeof data.step3_work_location === 'string' ? `Vị trí: ${data.step3_work_location}` : '',
                typeof data.step3_notes === 'string' ? data.step3_notes : '',
            ].filter(Boolean);
            return {
                reason: tech ? `Trao đổi KT: ${tech}` : 'Trao đổi KT',
                notes: parts.join('\n'),
                photos: asPhotoArray(data.step3_photos),
            };
        }
        case 'step4':
            return {
                reason: 'Chốt gói / chờ duyệt',
                notes: typeof data.step4_notes === 'string' ? data.step4_notes : '',
                photos: asPhotoArray(data.step4_photos),
            };
        default:
            return empty;
    }
}

export function enrichSalesTransitionLog(
    log: Record<string, unknown> | null | undefined,
    salesStepData?: Record<string, unknown> | string | null
): Record<string, unknown> | null | undefined {
    if (!log) return log;

    const fromStatus = (log.from_status || log.from_stage) as string | undefined;
    if (!fromStatus?.startsWith('step')) return log;

    const stepData = salesStepData ?? (log._sales_step_data as Record<string, unknown> | string | undefined);
    const extracted = extractSalesStepLogContent(fromStatus, stepData);

    const existingPhotos = asPhotoArray(log.photos);
    const mergedPhotos = [...new Set([...existingPhotos, ...extracted.photos])];

    const existingReason = typeof log.reason === 'string' ? log.reason.trim() : '';
    const existingNotes = typeof log.notes === 'string' ? log.notes.trim() : '';

    return {
        ...log,
        reason: existingReason || extracted.reason || null,
        notes: existingNotes || extracted.notes || null,
        photos: mergedPhotos,
        _enriched_from_step: fromStatus,
    };
}
