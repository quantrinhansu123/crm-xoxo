import { useCallback, useEffect, useState } from 'react';
import { Loader2, Save, Wifi } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

export interface AttendanceWifiSettings {
    allowed_ips: string[];
    office_name: string;
    wifi_name: string;
    office_address: string | null;
    enforce_wifi: boolean;
    updated_at?: string | null;
}

const DEFAULT_IPS = [
    '42.114.71.44',
    '192.168.1.0/24',
    '192.168.11.0/24',
    '192.168.31.0/24',
].join('\n');

export function AttendanceWifiSettingsPanel() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [officeName, setOfficeName] = useState('XOXO');
    const [wifiName, setWifiName] = useState('XOXO / AURA');
    const [officeAddress, setOfficeAddress] = useState('');
    const [allowedIpsText, setAllowedIpsText] = useState(DEFAULT_IPS);
    const [enforceWifi, setEnforceWifi] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get('/attendance-settings');
            const data = res.data?.data as AttendanceWifiSettings | undefined;
            if (data) {
                setOfficeName(data.office_name || 'XOXO');
                setWifiName(data.wifi_name || 'XOXO / AURA');
                setOfficeAddress(data.office_address || '');
                setAllowedIpsText(
                    (data.allowed_ips?.length ? data.allowed_ips : DEFAULT_IPS.split('\n')).join('\n'),
                );
                setEnforceWifi(data.enforce_wifi !== false);
            }
        } catch (err: unknown) {
            const ax = err as { response?: { data?: { message?: string } } };
            toast.error(ax.response?.data?.message ?? 'Không tải được cài đặt WiFi chấm công');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const handleSave = async () => {
        const ips = allowedIpsText
            .split(/[,;\n]+/)
            .map((s) => s.trim())
            .filter(Boolean);

        if (enforceWifi && ips.length === 0) {
            toast.error('Cần ít nhất 1 IP/CIDR khi bật kiểm tra WiFi');
            return;
        }

        setSaving(true);
        try {
            await api.put('/attendance-settings', {
                allowed_ips: ips,
                office_name: officeName.trim() || 'XOXO',
                wifi_name: wifiName.trim() || 'XOXO / AURA',
                office_address: officeAddress.trim() || null,
                enforce_wifi: enforceWifi,
            });
            toast.success('Đã lưu cài đặt chấm công WiFi');
            await load();
        } catch (err: unknown) {
            const ax = err as { response?: { data?: { message?: string } } };
            toast.error(ax.response?.data?.message ?? 'Không lưu được cài đặt');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center gap-2 text-[13px] text-gray-500 py-6">
                <Loader2 className="h-4 w-4 animate-spin" />
                Đang tải cài đặt WiFi…
            </div>
        );
    }

    return (
        <div id="wifi-ip-setup" className="space-y-5">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h3 className="text-[14px] font-bold text-orange-600 flex items-center gap-2">
                        <Wifi className="h-4 w-4" />
                        Chấm công theo WiFi / IP
                    </h3>
                    <p className="text-[13px] text-gray-500 mt-0.5 max-w-[640px]">
                        Nhân viên chỉ chấm công được khi IP request khớp danh sách bên dưới
                        (lưu trong hệ thống, không cần cấu hình .env).
                        Dùng IP public (cloud) hoặc dải LAN (CIDR) của WiFi văn phòng.
                    </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[13px] text-gray-600">Bắt buộc WiFi</span>
                    <Switch checked={enforceWifi} onCheckedChange={setEnforceWifi} />
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                    <label className="text-[13px] font-medium text-gray-700">Tên văn phòng</label>
                    <Input
                        value={officeName}
                        onChange={(e) => setOfficeName(e.target.value)}
                        className="h-[36px] text-[13px] border-gray-300 rounded-lg"
                        placeholder="XOXO"
                    />
                </div>
                <div className="space-y-1.5">
                    <label className="text-[13px] font-medium text-gray-700">Tên WiFi hiển thị</label>
                    <Input
                        value={wifiName}
                        onChange={(e) => setWifiName(e.target.value)}
                        className="h-[36px] text-[13px] border-gray-300 rounded-lg"
                        placeholder="XOXO / AURA"
                    />
                </div>
            </div>

            <div className="space-y-1.5">
                <label className="text-[13px] font-medium text-gray-700">Địa chỉ (tuỳ chọn)</label>
                <Input
                    value={officeAddress}
                    onChange={(e) => setOfficeAddress(e.target.value)}
                    className="h-[36px] text-[13px] border-gray-300 rounded-lg"
                    placeholder="Địa chỉ văn phòng"
                />
            </div>

            <div className="space-y-1.5">
                <label className="text-[13px] font-medium text-gray-700">
                    Danh sách IP / CIDR cho phép
                </label>
                <Textarea
                    value={allowedIpsText}
                    onChange={(e) => setAllowedIpsText(e.target.value)}
                    className="min-h-[140px] text-[13px] font-mono border-gray-300 rounded-lg"
                    placeholder={'42.114.71.44\n192.168.1.0/24'}
                />
                <p className="text-[12px] text-gray-400">
                    Mỗi dòng một IP hoặc CIDR. Ví dụ: <code>42.114.71.44</code>,{' '}
                    <code>192.168.1.0/24</code>. Khi deploy cloud (Render), chỉ IP{' '}
                    <strong>public</strong> mới khớp — dải <code>192.168.*</code> chỉ dùng khi
                    API cùng mạng LAN. Lấy IP đúng: mở Chấm công (Mobile) xem dòng IP, hoặc
                    ifconfig.me khi đang dính WiFi văn phòng.
                </p>
            </div>

            <div className="flex justify-end">
                <Button
                    onClick={handleSave}
                    disabled={saving}
                    className="h-[36px] px-4 text-[13px] gap-2"
                >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Lưu cài đặt WiFi
                </Button>
            </div>
        </div>
    );
}
