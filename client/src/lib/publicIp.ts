/** Lấy IP public của WiFi/mạng đang dùng (WAN), không phải 127.0.0.1. */
export async function fetchWifiPublicIp(): Promise<string | null> {
    const endpoints = [
        'https://api.ipify.org?format=json',
        'https://api64.ipify.org?format=json',
        'https://ifconfig.me/ip',
    ];

    for (const url of endpoints) {
        try {
            const res = await fetch(url, { cache: 'no-store' });
            if (!res.ok) continue;

            const contentType = res.headers.get('content-type') || '';
            let ip: string | undefined;
            if (contentType.includes('application/json')) {
                const data = (await res.json()) as { ip?: string };
                ip = data.ip?.trim();
            } else {
                ip = (await res.text()).trim();
            }

            if (ip && isPublicIpv4(ip)) {
                return ip;
            }
        } catch {
            // thử endpoint tiếp theo
        }
    }
    return null;
}

export function isLoopbackIp(ip: string | null | undefined): boolean {
    if (!ip) return false;
    const n = ip.trim();
    return n === '127.0.0.1' || n === '::1' || n.startsWith('127.') || n === 'localhost';
}

export function isPublicIpv4(ip: string | null | undefined): boolean {
    if (!ip) return false;
    const n = ip.trim();
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(n)) return false;
    const parts = n.split('.').map(Number);
    if (parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return false;
    if (isLoopbackIp(n)) return false;
    if (n.startsWith('10.')) return false;
    if (n.startsWith('192.168.')) return false;
    if (n.startsWith('169.254.')) return false;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return false;
    return true;
}
