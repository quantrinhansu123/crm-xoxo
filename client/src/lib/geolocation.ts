export interface GeoPosition {
    latitude: number;
    longitude: number;
    accuracyM: number;
}

export type GeoErrorCode = 'unsupported' | 'denied' | 'unavailable' | 'timeout' | 'unknown';

export class GeoLocationError extends Error {
    code: GeoErrorCode;
    constructor(code: GeoErrorCode, message: string) {
        super(message);
        this.code = code;
    }
}

export function getCurrentPosition(options?: PositionOptions): Promise<GeoPosition> {
    return new Promise((resolve, reject) => {
        if (typeof navigator === 'undefined' || !navigator.geolocation) {
            reject(new GeoLocationError('unsupported', 'Trình duyệt không hỗ trợ GPS'));
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                resolve({
                    latitude: pos.coords.latitude,
                    longitude: pos.coords.longitude,
                    accuracyM: pos.coords.accuracy,
                });
            },
            (err) => {
                const code: GeoErrorCode =
                    err.code === 1 ? 'denied'
                        : err.code === 2 ? 'unavailable'
                            : err.code === 3 ? 'timeout'
                                : 'unknown';
                const messages: Record<GeoErrorCode, string> = {
                    unsupported: 'Trình duyệt không hỗ trợ GPS',
                    denied: 'Bạn đã từ chối quyền truy cập vị trí. Hãy bật GPS trong cài đặt trình duyệt.',
                    unavailable: 'Không lấy được vị trí. Kiểm tra GPS / mạng và thử lại.',
                    timeout: 'Hết thời gian chờ GPS. Thử lại ở nơi thoáng hơn.',
                    unknown: err.message || 'Lỗi GPS không xác định',
                };
                reject(new GeoLocationError(code, messages[code]));
            },
            {
                enableHighAccuracy: true,
                timeout: 20000,
                maximumAge: 15000,
                ...options,
            },
        );
    });
}
