import { useCallback, useEffect, useMemo, useState } from 'react';
import { Shield, Loader2, Search, Trash2, Pencil, Eye, LayoutGrid } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { VIEW_DEFINITIONS, VIEW_GROUPS } from '@/lib/viewPermissions';
import {
    employeeViewPermissionsApi,
    type EmployeeViewPermissionRow,
    type ViewActionFlags,
    type ViewActionsMap,
} from '@/lib/api';

const emptyActions = (): ViewActionFlags => ({ edit: false, delete: false });

export function ViewPermissionsPanel({ embedded = false }: { embedded?: boolean }) {
    const [rows, setRows] = useState<EmployeeViewPermissionRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [search, setSearch] = useState('');
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
    const [draftViews, setDraftViews] = useState<string[]>([]);
    const [draftActions, setDraftActions] = useState<ViewActionsMap>({});

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await employeeViewPermissionsApi.list();
            setRows(res.data?.data?.permissions ?? []);
        } catch (err: unknown) {
            const ax = err as { response?: { data?: { message?: string }; status?: number } };
            const msg = ax.response?.data?.message;
            if (ax.response?.status === 403) {
                toast.error('Bạn cần quyền admin/manager để cấu hình phân quyền');
            } else if (msg?.includes('view_actions') || msg?.includes('employee_view_permissions') || ax.response?.status === 500) {
                toast.error('Chưa cấu hình bảng phân quyền trên cơ sở dữ liệu. Liên hệ quản trị viên.');
            } else {
                toast.error(msg ?? 'Không tải được danh sách quyền');
            }
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return rows;
        return rows.filter(
            (r) =>
                r.email.toLowerCase().includes(q) ||
                r.name.toLowerCase().includes(q) ||
                r.role.toLowerCase().includes(q),
        );
    }, [rows, search]);

    const selected = rows.find((r) => r.user_id === selectedUserId) ?? null;

    const selectEmployee = (row: EmployeeViewPermissionRow) => {
        setSelectedUserId(row.user_id);
        const views = row.has_custom_permissions && row.allowed_views ? [...row.allowed_views] : [];
        setDraftViews(views);
        const actions: ViewActionsMap = {};
        for (const viewId of views) {
            const flags = row.view_actions?.[viewId];
            actions[viewId] = flags ? { ...flags } : { edit: false, delete: false };
        }
        setDraftActions(actions);
    };

    const toggleView = (viewId: string) => {
        if (draftViews.includes(viewId)) {
            setDraftViews((prev) => prev.filter((id) => id !== viewId));
            setDraftActions((prev) => {
                const next = { ...prev };
                delete next[viewId];
                return next;
            });
        } else {
            setDraftViews((prev) => [...prev, viewId]);
            setDraftActions((prev) => ({
                ...prev,
                [viewId]: prev[viewId] ?? { edit: true, delete: false },
            }));
        }
    };

    const toggleAction = (viewId: string, action: keyof ViewActionFlags) => {
        setDraftActions((prev) => ({
            ...prev,
            [viewId]: {
                ...(prev[viewId] ?? emptyActions()),
                [action]: !(prev[viewId]?.[action] ?? false),
            },
        }));
    };

    const selectAllInGroup = (group: string) => {
        const ids = VIEW_DEFINITIONS.filter((v) => v.group === group).map((v) => v.id);
        setDraftViews((prev) => [...new Set([...prev, ...ids])]);
        setDraftActions((prev) => {
            const next = { ...prev };
            for (const id of ids) {
                if (!next[id]) next[id] = { edit: true, delete: false };
            }
            return next;
        });
    };

    const handleSave = async () => {
        if (!selectedUserId || !selected) return;
        if (selected.role === 'admin') {
            toast.error('Không cấu hình quyền cho admin');
            return;
        }
        if (draftViews.length === 0) {
            toast.error('Chọn ít nhất một màn hình');
            return;
        }
        setSaving(true);
        try {
            const payload: ViewActionsMap = {};
            for (const viewId of draftViews) {
                payload[viewId] = draftActions[viewId] ?? emptyActions();
            }
            await employeeViewPermissionsApi.save(selectedUserId, draftViews, payload);
            toast.success(`Đã lưu phân quyền cho ${selected.email}. Nhân viên cần tải lại trang hoặc đăng nhập lại.`);
            await load();
        } catch (err: unknown) {
            const ax = err as { response?: { data?: { message?: string } } };
            toast.error(ax.response?.data?.message ?? 'Lưu thất bại');
        } finally {
            setSaving(false);
        }
    };

    const handleClear = async () => {
        if (!selectedUserId || !selected) return;
        setSaving(true);
        try {
            await employeeViewPermissionsApi.remove(selectedUserId);
            toast.success(`Đã xóa cấu hình — ${selected.email} dùng quyền theo vai trò`);
            setDraftViews([]);
            setDraftActions({});
            await load();
        } catch {
            toast.error('Xóa cấu hình thất bại');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-6">
            {!embedded && (
                <div>
                    <h2 className="text-[17px] font-bold text-gray-900 flex items-center gap-2">
                        <Shield className="h-5 w-5 text-blue-600" />
                        Phân quyền
                    </h2>
                </div>
            )}

            {!embedded && (
                <p className="text-[13px] text-gray-500 max-w-2xl">
                    Cấu hình <strong>xem</strong>, <strong>sửa</strong>, <strong>xóa</strong> theo từng màn hình và email
                    đăng nhập. Chưa cấu hình → quyền mặc định theo vai trò.
                </p>
            )}

            <div className="flex flex-col lg:flex-row gap-6 min-h-[420px]">
                <div className="lg:w-[320px] flex-shrink-0 border border-gray-200 rounded-xl overflow-hidden">
                    <div className="p-3 border-b border-gray-100 bg-gray-50">
                        <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <Input
                                placeholder="Tìm email, tên..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="pl-9 h-9 text-[13px]"
                            />
                        </div>
                    </div>
                    <div className="max-h-[480px] overflow-y-auto">
                        {loading ? (
                            <div className="flex justify-center py-12">
                                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                            </div>
                        ) : filtered.length === 0 ? (
                            <p className="text-sm text-gray-500 p-4 text-center">Không có nhân viên</p>
                        ) : (
                            filtered.map((row) => (
                                <button
                                    key={row.user_id}
                                    type="button"
                                    onClick={() => selectEmployee(row)}
                                    className={cn(
                                        'w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-blue-50/50 transition-colors',
                                        selectedUserId === row.user_id && 'bg-blue-50',
                                    )}
                                >
                                    <p className="text-[13px] font-semibold text-gray-900 truncate">{row.name}</p>
                                    <p className="text-[12px] text-gray-500 truncate">{row.email}</p>
                                    <p className="text-[11px] text-gray-400 mt-0.5">
                                        {row.role}
                                        {row.has_custom_permissions ? (
                                            <span className="ml-2 text-blue-600">
                                                · {row.allowed_views?.length ?? 0} màn
                                            </span>
                                        ) : (
                                            <span className="ml-2">· Theo role</span>
                                        )}
                                    </p>
                                </button>
                            ))
                        )}
                    </div>
                </div>

                <div className="flex-1 border border-gray-200 rounded-xl p-5">
                    {!selected ? (
                        <p className="text-sm text-gray-500 text-center py-16">Chọn nhân viên để cấu hình phân quyền</p>
                    ) : selected.role === 'admin' ? (
                        <p className="text-sm text-gray-600 text-center py-16">
                            Tài khoản <strong>{selected.role}</strong> có toàn quyền.
                        </p>
                    ) : (
                        <>
                            <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                                <div>
                                    <p className="font-semibold text-gray-900">{selected.name}</p>
                                    <p className="text-sm text-gray-500">{selected.email}</p>
                                </div>
                                <div className="flex gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={saving || !selected.has_custom_permissions}
                                        onClick={handleClear}
                                    >
                                        <Trash2 className="h-4 w-4 mr-1" />
                                        Xóa cấu hình
                                    </Button>
                                    <Button size="sm" disabled={saving} onClick={handleSave}>
                                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Lưu'}
                                    </Button>
                                </div>
                            </div>

                            <div className="sticky top-0 z-10 flex items-center gap-2 sm:gap-4 mb-3 px-2 py-2.5 rounded-lg bg-slate-100 border border-slate-200 shadow-sm">
                                <span className="w-[140px] min-w-0 flex items-center gap-2 text-[13px] font-bold text-slate-800">
                                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-600 text-white shadow-sm">
                                        <LayoutGrid className="h-4 w-4" />
                                    </span>
                                    Màn hình
                                </span>
                                <span className="w-14 flex justify-center">
                                    <span className="inline-flex flex-col items-center gap-1 text-[12px] font-bold text-blue-700">
                                        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-600 text-white shadow-sm">
                                            <Eye className="h-4 w-4" />
                                        </span>
                                        Xem
                                    </span>
                                </span>
                                <span className="w-14 flex justify-center">
                                    <span className="inline-flex flex-col items-center gap-1 text-[12px] font-bold text-amber-800">
                                        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-amber-500 text-white shadow-sm">
                                            <Pencil className="h-4 w-4" />
                                        </span>
                                        Sửa
                                    </span>
                                </span>
                                <span className="w-14 flex justify-center">
                                    <span className="inline-flex flex-col items-center gap-1 text-[12px] font-bold text-rose-700">
                                        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-rose-600 text-white shadow-sm">
                                            <Trash2 className="h-4 w-4" />
                                        </span>
                                        Xóa
                                    </span>
                                </span>
                            </div>

                            <div className="space-y-5 max-h-[520px] overflow-y-auto pr-1">
                                {VIEW_GROUPS.map((group) => (
                                    <div key={group}>
                                        <div className="flex items-center justify-between mb-2">
                                            <p className="text-[12px] font-bold text-gray-500 uppercase tracking-wide">
                                                {group}
                                            </p>
                                            <button
                                                type="button"
                                                className="text-[11px] text-blue-600 hover:underline"
                                                onClick={() => selectAllInGroup(group)}
                                            >
                                                Chọn nhóm
                                            </button>
                                        </div>
                                        <div className="space-y-1">
                                            {VIEW_DEFINITIONS.filter((v) => v.group === group).map((view) => {
                                                const enabled = draftViews.includes(view.id);
                                                const flags = draftActions[view.id] ?? emptyActions();
                                                return (
                                                    <div
                                                        key={view.id}
                                                        className={cn(
                                                            'flex flex-wrap items-center gap-2 sm:gap-4 p-2.5 rounded-lg border',
                                                            enabled
                                                                ? 'border-blue-100 bg-blue-50/30'
                                                                : 'border-gray-100',
                                                        )}
                                                    >
                                                        <span className="text-[13px] text-gray-800 w-[140px] min-w-0 truncate">
                                                            {view.label}
                                                        </span>
                                                        <div className="w-14 flex justify-center">
                                                            <Checkbox
                                                                checked={enabled}
                                                                onCheckedChange={() => toggleView(view.id)}
                                                            />
                                                        </div>
                                                        <div className="w-14 flex justify-center">
                                                            <Checkbox
                                                                disabled={!enabled}
                                                                checked={enabled && flags.edit}
                                                                onCheckedChange={() => toggleAction(view.id, 'edit')}
                                                            />
                                                        </div>
                                                        <div className="w-14 flex justify-center">
                                                            <Checkbox
                                                                disabled={!enabled}
                                                                checked={enabled && flags.delete}
                                                                onCheckedChange={() => toggleAction(view.id, 'delete')}
                                                            />
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

export const ViewPermissionsTab = ViewPermissionsPanel;
