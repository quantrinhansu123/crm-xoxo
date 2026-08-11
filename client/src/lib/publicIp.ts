/** Lấy IP public của WiFi/mạng đang dùng (WAN), không phải 127.0.0.1. */
export async function fetchWifiPublicIp(): Promise<string | null> {
    const endpoints = [
        'https://api.ipify.org?format=json',
        'https://api64.ipify.org?format=json',
    ];

    for (const url of endpoints) {
        try {
            const res = await fetch(url, { cache: 'no-store' });
            if (!res.ok) continue;
            const data = (await res.json()) as { ip?: string };
            const ip = data.ip?.trim();
            if (ip && /^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
                return ip;
            }
        } catch {
            // thử endpoint tiếp theo
        }
    }
    return null;
}
