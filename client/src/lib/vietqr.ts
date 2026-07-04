/**
 * Tạo chuỗi EMV QR (VietQR / NAPAS) để máy in nhiệt & app ngân hàng quét được.
 * Khớp chuẩn VietQR: BIN 6 số + số tài khoản + số tiền + nội dung.
 */

function tlv(id: string, value: string): string {
    const len = value.length.toString().padStart(2, '0');
    return `${id}${len}${value}`;
}

/** CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF) */
export function crc16Ccitt(data: string): string {
    let crc = 0xffff;
    for (let i = 0; i < data.length; i++) {
        crc ^= data.charCodeAt(i) << 8;
        for (let j = 0; j < 8; j++) {
            if (crc & 0x8000) {
                crc = ((crc << 1) ^ 0x1021) & 0xffff;
            } else {
                crc = (crc << 1) & 0xffff;
            }
        }
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
}

function stripAccents(text: string): string {
    return text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D');
}

function normalizeMerchantName(name: string): string {
    return stripAccents(name).toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').trim().slice(0, 25);
}

function normalizeTransferNote(note: string): string {
    return stripAccents(note)
        .replace(/[^a-zA-Z0-9 ]/g, ' ')
        .trim()
        .slice(0, 25);
}

export interface VietQrOptions {
    bankBin: string;
    accountNumber: string;
    amount?: number;
    description?: string;
    merchantName?: string;
}

/** Payload quét được bằng app ngân hàng (VietQR). */
export function buildVietQrPayload(options: VietQrOptions): string {
    const { bankBin, accountNumber, amount, description, merchantName } = options;
    const bin = bankBin.replace(/\D/g, '').slice(0, 6);
    const account = accountNumber.replace(/\s/g, '');

    const consumerInfo =
        tlv('00', 'A000000727') + tlv('01', bin) + tlv('02', account);
    const merchantAccount = tlv('38', consumerInfo);

    let payload = tlv('00', '01');
    payload += tlv('01', amount && amount > 0 ? '12' : '11');
    payload += merchantAccount;
    payload += tlv('52', '0000');
    payload += tlv('53', '704');

    if (amount && amount > 0) {
        payload += tlv('54', String(Math.round(amount)));
    }

    if (description) {
        payload += tlv('62', tlv('08', normalizeTransferNote(description)));
    }

    payload += tlv('58', 'VN');

    if (merchantName) {
        payload += tlv('59', normalizeMerchantName(merchantName));
    }

    payload += tlv('60', 'VN');
    payload += '6304';

    return payload + crc16Ccitt(payload);
}

/** Ảnh QR từ VietQR (dự phòng khi cần in qua URL). */
export function getVietQrImageUrl(options: VietQrOptions): string {
    const bin = options.bankBin.replace(/\D/g, '');
    const account = options.accountNumber.replace(/\s/g, '');
    const base = `https://img.vietqr.io/image/${bin}-${account}-print.jpg`;
    const params = new URLSearchParams();
    if (options.amount && options.amount > 0) {
        params.set('amount', String(Math.round(options.amount)));
    }
    if (options.description) {
        params.set('addInfo', normalizeTransferNote(options.description));
    }
    if (options.merchantName) {
        params.set('accountName', normalizeMerchantName(options.merchantName));
    }
    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
}
