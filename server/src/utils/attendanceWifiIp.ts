import type { Request } from 'express';
import { supabaseAdmin as supabase } from '../config/supabase.js';

/** Chỉ dùng khi chưa có bảng/bản ghi DB (bootstrap). Không đọc .env. */
const BOOTSTRAP_SETTINGS: AttendanceWifiSettings = {
    allowed_ips: [],
    office_name: 'XOXO',
    wifi_name: 'XOXO / AURA',
    office_address: null,
    enforce_wifi: false,
};

export interface AttendanceWifiSettings {
    allowed_ips: string[];
    office_name: string;
    wifi_name: string;
    office_address: string | null;
    enforce_wifi: boolean;
    updated_at?: string | null;
}

let cache: { value: AttendanceWifiSettings; expiresAt: number } | null = null;
const CACHE_TTL_MS = 5_000;

function parseIpList(raw: string): string[] {
    return raw
        .split(/[,;\s\n]+/)
        .map((s) => s.trim())
        .filter(Boolean);
}

function normalizeSettingsRow(row: {
    allowed_ips?: string[] | null;
    office_name?: string | null;
    wifi_name?: string | null;
    office_address?: string | null;
    enforce_wifi?: boolean | null;
    updated_at?: string | null;
} | null): AttendanceWifiSettings {
    if (!row) return { ...BOOTSTRAP_SETTINGS };
    const ips = Array.isArray(row.allowed_ips)
        ? row.allowed_ips.map((s) => String(s).trim()).filter(Boolean)
        : [];
    return {
        allowed_ips: ips,
        office_name: row.office_name?.trim() || BOOTSTRAP_SETTINGS.office_name,
        wifi_name: row.wifi_name?.trim() || BOOTSTRAP_SETTINGS.wifi_name,
        office_address: row.office_address?.trim() || null,
        enforce_wifi: row.enforce_wifi !== false,
        updated_at: row.updated_at ?? null,
    };
}

export function invalidateAttendanceSettingsCache(): void {
    cache = null;
}

/** Chỉ đọc từ bảng attendance_settings (UI Thiết lập nhân viên → Chấm công). */
export async function getAttendanceWifiSettings(): Promise<AttendanceWifiSettings> {
    if (cache && cache.expiresAt > Date.now()) {
        return cache.value;
    }

    try {
        const { data, error } = await supabase
            .from('attendance_settings')
            .select('allowed_ips, office_name, wifi_name, office_address, enforce_wifi, updated_at')
            .eq('id', 1)
            .maybeSingle();

        if (error) {
            console.warn('[attendance] load settings failed:', error.message);
            const fallback = { ...BOOTSTRAP_SETTINGS };
            cache = { value: fallback, expiresAt: Date.now() + CACHE_TTL_MS };
            return fallback;
        }

        const value = normalizeSettingsRow(data);
        cache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
        return value;
    } catch (err) {
        console.warn('[attendance] load settings error:', err);
        const fallback = { ...BOOTSTRAP_SETTINGS };
        cache = { value: fallback, expiresAt: Date.now() + CACHE_TTL_MS };
        return fallback;
    }
}

export function getClientIp(req: Request): string {
    const headerCandidates = [
        req.headers['cf-connecting-ip'],
        req.headers['true-client-ip'],
        req.headers['x-real-ip'],
        req.headers['x-client-ip'],
        req.headers['x-forwarded-for'],
    ];

    for (const header of headerCandidates) {
        if (typeof header === 'string' && header.trim()) {
            // x-forwarded-for: client, proxy1, proxy2 → lấy IP đầu
            return normalizeIp(header.split(',')[0].trim());
        }
        if (Array.isArray(header) && header[0]) {
            return normalizeIp(String(header[0]).split(',')[0].trim());
        }
    }

    if (typeof req.ip === 'string' && req.ip.trim()) {
        return normalizeIp(req.ip.trim());
    }
    return normalizeIp(req.socket.remoteAddress ?? '');
}

function normalizeIp(ip: string): string {
    if (!ip) return '';
    let value = ip.trim();
    // bỏ port dạng [IPv6]:port hoặc IPv4:port
    if (value.startsWith('[') && value.includes(']')) {
        value = value.slice(1, value.indexOf(']'));
    } else if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(value)) {
        value = value.split(':')[0];
    }
    if (value.startsWith('::ffff:')) value = value.slice(7);
    if (value === '::1') return '127.0.0.1';
    return value;
}

function isLoopbackIp(ip: string): boolean {
    const n = normalizeIp(ip);
    return n === '127.0.0.1' || n === 'localhost' || n.startsWith('127.');
}

function ipv4ToInt(ip: string): number | null {
    const parts = ip.split('.');
    if (parts.length !== 4) return null;
    let n = 0;
    for (const part of parts) {
        if (!/^\d+$/.test(part)) return null;
        const octet = Number(part);
        if (!Number.isInteger(octet) || octet < 0 || octet > 255) return null;
        n = (n << 8) + octet;
    }
    return n >>> 0;
}

function matchCidr(ip: string, rule: string): boolean {
    const [base, bitsRaw] = rule.split('/');
    const ipInt = ipv4ToInt(ip);
    const baseInt = ipv4ToInt(base);
    if (ipInt === null || baseInt === null) return false;
    const bits = bitsRaw === undefined ? 32 : Number(bitsRaw);
    if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
    if (bits === 0) return true;
    const mask = bits === 32 ? 0xffffffff : (~0 << (32 - bits)) >>> 0;
    return (ipInt & mask) === (baseInt & mask);
}

/** true nếu khớp; null nếu không enforce / chưa có allowlist */
export function isWifiIpAllowed(ip: string, allowed: string[], enforce = true): boolean | null {
    if (!enforce || allowed.length === 0) return null;
    if (!ip) return false;
    const normalized = normalizeIp(ip);

    // Không cho phép localhost — chỉ khớp IP public/LAN trong danh sách cấu hình (vd. 14.191.162.71)
    if (isLoopbackIp(normalized)) {
        return false;
    }

    return allowed.some((rule) => {
        const r = rule.trim();
        if (!r) return false;
        if (r.includes('/')) return matchCidr(normalized, r);
        return normalizeIp(r) === normalized;
    });
}

export function parseAllowedIpsInput(input: unknown): string[] {
    if (Array.isArray(input)) {
        return input.map((s) => String(s).trim()).filter(Boolean);
    }
    if (typeof input === 'string') {
        return parseIpList(input);
    }
    return [];
}
