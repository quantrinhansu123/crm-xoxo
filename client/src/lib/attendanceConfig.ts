export interface OfficeGeofenceConfig {
    lat: number;
    lng: number;
    radiusM: number;
    name: string;
    address: string;
}

function parseNum(value: string | undefined): number | null {
    if (!value) return null;
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : null;
}

/** Văn phòng mặc định (Quận 7) — ghi đè bằng VITE_ATTENDANCE_OFFICE_* trong .env */
const DEFAULT_OFFICE: OfficeGeofenceConfig = {
    lat: 10.7327,
    lng: 106.7197,
    radiusM: 150,
    name: 'Văn phòng',
    address: '123 Nguyễn Văn Linh, Quận 7, TP.HCM',
};

export function getClientOfficeGeofence(): OfficeGeofenceConfig {
    const lat = parseNum(import.meta.env.VITE_ATTENDANCE_OFFICE_LAT) ?? DEFAULT_OFFICE.lat;
    const lng = parseNum(import.meta.env.VITE_ATTENDANCE_OFFICE_LNG) ?? DEFAULT_OFFICE.lng;
    const radiusM = parseNum(import.meta.env.VITE_ATTENDANCE_OFFICE_RADIUS_M) ?? DEFAULT_OFFICE.radiusM;
    return {
        lat,
        lng,
        radiusM,
        name: import.meta.env.VITE_ATTENDANCE_OFFICE_NAME || DEFAULT_OFFICE.name,
        address: import.meta.env.VITE_ATTENDANCE_OFFICE_ADDRESS || DEFAULT_OFFICE.address,
    };
}

export function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function isWithinClientGeofence(userLat: number, userLng: number): boolean {
    const office = getClientOfficeGeofence();
    return distanceMeters(userLat, userLng, office.lat, office.lng) <= office.radiusM;
}
