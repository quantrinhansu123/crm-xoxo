/** Haversine distance in meters between two WGS84 points. */
export function distanceMeters(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
): number {
    const R = 6371000;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface OfficeGeofence {
    lat: number;
    lng: number;
    radiusM: number;
    name?: string;
    address?: string;
}

export function getOfficeGeofenceFromEnv(): OfficeGeofence | null {
    const lat = parseFloat(process.env.ATTENDANCE_OFFICE_LAT ?? '');
    const lng = parseFloat(process.env.ATTENDANCE_OFFICE_LNG ?? '');
    const radiusM = parseFloat(process.env.ATTENDANCE_OFFICE_RADIUS_M ?? '150');
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return {
        lat,
        lng,
        radiusM: Number.isFinite(radiusM) ? radiusM : 150,
        name: process.env.ATTENDANCE_OFFICE_NAME || undefined,
        address: process.env.ATTENDANCE_OFFICE_ADDRESS || undefined,
    };
}

export function isWithinGeofence(
    userLat: number,
    userLng: number,
    office: OfficeGeofence,
): boolean {
    return distanceMeters(userLat, userLng, office.lat, office.lng) <= office.radiusM;
}
