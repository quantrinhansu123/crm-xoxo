/** Trích mã từ nội dung QR (URL hoặc chuỗi thô). */
export function parseScannedCode(raw: string): string {
    // Loại bỏ BOM (\uFEFF), ký tự thay thế (\uFFFD), ký tự NUL và các ký tự điều khiển non-printable
    let cleaned = raw.replace(/[\uFEFF\uFFFD\x00-\x1F\x7F-\x9F]/g, '').trim();
    if (!cleaned) return '';

    try {
        // Giải mã toàn bộ URI phòng trường hợp chuỗi quét bị mã hóa toàn phần
        cleaned = decodeURIComponent(cleaned);
    } catch {
        // ignore
    }

    try {
        if (cleaned.startsWith('http://') || cleaned.startsWith('https://')) {
            const url = new URL(cleaned);
            const path = decodeURIComponent(url.pathname);
            for (const prefix of ['/task/', '/product/', '/orders/']) {
                const idx = path.indexOf(prefix);
                if (idx !== -1) {
                    const segment = path
                        .slice(idx + prefix.length)
                        .split('/')[0]
                        ?.split('?')[0]
                        ?.split('#')[0];
                    if (segment) return decodeURIComponent(segment);
                }
            }
        }
    } catch {
        // fall through
    }

    for (const prefix of ['/task/', '/product/', '/orders/']) {
        if (cleaned.includes(prefix)) {
            const segment = cleaned.split(prefix).pop()?.split(/[?#]/)[0];
            if (segment) {
                try {
                    return decodeURIComponent(segment).trim();
                } catch {
                    return segment.trim();
                }
            }
        }
    }

    return cleaned;
}
