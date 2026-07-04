/** OpenStreetMap Nominatim — chỉ dùng hiển thị, không lưu pháp lý. */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
    try {
        const url = new URL('https://nominatim.openstreetmap.org/reverse');
        url.searchParams.set('format', 'json');
        url.searchParams.set('lat', String(lat));
        url.searchParams.set('lon', String(lng));
        url.searchParams.set('accept-language', 'vi');

        const res = await fetch(url.toString(), {
            headers: { Accept: 'application/json' },
        });
        if (!res.ok) return null;
        const data = (await res.json()) as { display_name?: string };
        return data.display_name?.trim() || null;
    } catch {
        return null;
    }
}
