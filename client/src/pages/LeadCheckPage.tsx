import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SLACountdown } from '@/components/leads/SLACountdown';
import { formatCurrency, formatDateTime } from '@/lib/utils';

const TOKEN_KEY = 'lead-check-token';
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3005/api';

const KANBAN_COLUMNS = [
    { id: 'NEED_DISCOVERY', title: 'Tìm hiểu nhu cầu', hint: 'Chat thông thường' },
    { id: 'PRICE_NEGOTIATION', title: 'Báo giá', hint: 'Thương lượng giá' },
    { id: 'APPOINTMENT_SHOP', title: 'Hẹn qua shop', hint: 'Mang đồ trực tiếp' },
    { id: 'APPOINTMENT_SHIP', title: 'Hẹn ship', hint: 'Gửi ship hoặc qua lấy' },
    { id: 'WON', title: 'Đã chốt', hint: 'Chốt đơn thành công' },
] as const;

type KanbanColumnId = (typeof KANBAN_COLUMNS)[number]['id'];

type NormalizedLead = {
    lead_id: string;
    customer: {
        display_name: string;
        phone: string | null;
        avatar_url: string | null;
    };
    conversation: {
        source: string | null;
        conversation_id: string | null;
        pancake_url: string | null;
    };
    owner: {
        staff_uid: string | null;
        display_name: string | null;
    } | null;
    operational_state: 'assigned' | 'unassigned';
    kanban_column: KanbanColumnId;
    last_message: {
        content_text: string | null;
        inserted_at: string | null;
    } | null;
    created_at: string | null;
    order_amount: number | null;
    state_version: number;
    sla: { deadline_at: string } | null;
};

function textOf(value: unknown): string {
    if (value == null) return '';
    return String(value).trim();
}

function asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
}

function moneyOf(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const digits = textOf(value).replace(/[^\d]/g, '');
    if (!digits) return null;
    const amount = Number(digits);
    return Number.isFinite(amount) ? amount : null;
}

function tokenIdentity(token: string): { userId: string; name: string } | null {
    try {
        const part = token.trim().replace(/^Bearer\s+/i, '').split('.')[1];
        if (!part) return null;
        const padded = part.replace(/-/g, '+').replace(/_/g, '/');
        const json = JSON.parse(atob(padded)) as { userId?: string; name?: string };
        if (!json.userId) return null;
        return { userId: String(json.userId), name: textOf(json.name) || 'Bạn' };
    } catch {
        return null;
    }
}

function isKanbanColumn(value: string): value is KanbanColumnId {
    return KANBAN_COLUMNS.some((column) => column.id === value);
}

function legacyKanbanColumn(raw: Record<string, unknown>): KanbanColumnId {
    const stage = textOf(raw.pipeline_stage || raw.status).toLowerCase();
    const outcome = textOf(raw.outcome).toLowerCase();
    if (stage === 'chot_don' || stage === 'converted' || stage === 'won' || outcome === 'won') return 'WON';
    if (stage === 'dam_phan_gia') return 'PRICE_NEGOTIATION';
    if (stage === 'hen_qua_ship') {
        const method = textOf(raw.delivery_method).toLowerCase();
        const shippingFee = Number(raw.shipping_fee);
        if (method === 'ship' || textOf(raw.tracking_code) || (Number.isFinite(shippingFee) && shippingFee > 0)) {
            return 'APPOINTMENT_SHIP';
        }
        return 'APPOINTMENT_SHOP';
    }
    return 'NEED_DISCOVERY';
}

function normalizeLead(raw: Record<string, unknown>, index: number): NormalizedLead {
    const customer = asRecord(raw.customer);
    const conversation = asRecord(raw.conversation);
    const ownerRaw = asRecord(raw.owner);
    const lastMessage = asRecord(raw.last_message);
    const assignedUser = asRecord(raw.assigned_user);

    const explicitColumn = textOf(raw.kanban_column).toUpperCase();
    const kanban_column = isKanbanColumn(explicitColumn) ? explicitColumn : legacyKanbanColumn(raw);

    const displayName = textOf(
        customer?.display_name || raw.customer_name || raw.name || raw.fb_profile_name,
    );
    const phone = textOf(customer?.phone ?? raw.phone) || null;
    const avatar = textOf(customer?.avatar_url || raw.avatar_url || raw.avatar || raw.fb_profile_pic) || null;

    const ownerName = textOf(
        ownerRaw?.display_name || raw.assigned_sale_name || raw.owner_name || assignedUser?.name || raw.owner_sale,
    );
    const ownerUid = textOf(ownerRaw?.staff_uid || raw.assigned_to || assignedUser?.id) || null;
    const state = textOf(raw.operational_state || raw.assign_state).toLowerCase();
    const unassigned = state === 'unassigned'
        || !ownerName
        || ownerName === 'Chưa phân bổ'
        || ownerName === 'Chưa gán Sale';

    const messageText = textOf(lastMessage?.content_text || raw.last_message_text || raw.content_text) || null;
    const messageAt = textOf(lastMessage?.inserted_at || raw.last_message_time) || null;
    const createdAt = textOf(raw.created_at) || null;
    const orderAmount = moneyOf(raw.order_amount ?? raw.quoted_price_last ?? raw.quoted_price);
    const slaRaw = asRecord(raw.sla);
    const slaDeadline = ('sla' in raw)
        ? textOf(slaRaw?.deadline_at)
        : textOf(raw.sla_deadline_at);
    const versionRaw = raw.state_version ?? raw.version;
    const stateVersion = Number.isFinite(Number(versionRaw)) ? Number(versionRaw) : 0;

    return {
        lead_id: textOf(raw.lead_id || raw.id) || `lead-${index}`,
        customer: {
            display_name: displayName || 'Khách',
            phone,
            avatar_url: avatar,
        },
        conversation: {
            source: textOf(conversation?.source || raw.source) || null,
            conversation_id: textOf(conversation?.conversation_id || raw.pancake_conversation_id || raw.conversation_id) || null,
            pancake_url: textOf(conversation?.pancake_url || raw.pancake_url) || null,
        },
        owner: unassigned ? null : { staff_uid: ownerUid, display_name: ownerName },
        operational_state: unassigned ? 'unassigned' : 'assigned',
        kanban_column,
        last_message: messageText || messageAt ? { content_text: messageText, inserted_at: messageAt } : null,
        created_at: createdAt,
        order_amount: orderAmount,
        state_version: stateVersion,
        sla: slaDeadline ? { deadline_at: slaDeadline } : null,
    };
}

function extractLeads(body: unknown): { leads: Record<string, unknown>[]; pagination?: { page: number; limit: number; total: number; totalPages: number } } {
    if (Array.isArray(body)) return { leads: body.filter(asRecord) as Record<string, unknown>[] };
    const record = asRecord(body);
    if (!record) return { leads: [] };
    const data = asRecord(record.data);
    const list = Array.isArray(data?.leads)
        ? data.leads
        : Array.isArray(record.leads)
            ? record.leads
            : Array.isArray(record.data)
                ? record.data
                : [];
    const pagination = (data?.pagination || record.pagination) as { page: number; limit: number; total: number; totalPages: number } | undefined;
    return {
        leads: list.map(asRecord).filter((item): item is Record<string, unknown> => !!item),
        pagination,
    };
}

function readStoredToken() {
    try {
        return sessionStorage.getItem(TOKEN_KEY) || '';
    } catch {
        return '';
    }
}

export function LeadCheckPage() {
    const [token, setToken] = useState(readStoredToken);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(50);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [leads, setLeads] = useState<NormalizedLead[]>([]);
    const [pagination, setPagination] = useState<{ page: number; limit: number; total: number; totalPages: number } | null>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [claimingId, setClaimingId] = useState<string | null>(null);
    const [claimError, setClaimError] = useState('');

    const load = useCallback(async (nextPage = page) => {
        const raw = token.trim().replace(/^Bearer\s+/i, '');
        if (!raw) {
            setError('Dán token Bearer vào ô phía trên rồi bấm Tải dữ liệu.');
            return;
        }
        setLoading(true);
        setError('');
        try {
            sessionStorage.setItem(TOKEN_KEY, raw);
        } catch {
            // sessionStorage có thể bị chặn; vẫn gọi API được
        }
        try {
            const params = new URLSearchParams({
                page: String(nextPage),
                limit: String(limit),
            });
            if (search.trim()) params.set('search', search.trim());
            const response = await fetch(`${API_BASE}/dev/lead-check?${params}`, {
                headers: { Authorization: `Bearer ${raw}` },
            });
            const body = await response.json();
            if (!response.ok || (body && typeof body === 'object' && body.status && body.status !== 'success')) {
                setLeads([]);
                setPagination(null);
                setSelectedId(null);
                setError(body?.message || `API trả ${response.status}`);
                return;
            }
            const extracted = extractLeads(body);
            setLeads(extracted.leads.map(normalizeLead));
            setPagination(extracted.pagination || null);
            setPage(extracted.pagination?.page || nextPage);
            setSelectedId(null);
        } catch (err) {
            setLeads([]);
            setError(err instanceof Error ? err.message : 'Không tải được dữ liệu');
        } finally {
            setLoading(false);
        }
    }, [limit, page, search, token]);

    useEffect(() => {
        if (readStoredToken()) {
            void load(1);
        }
        // Chỉ tự tải lần đầu nếu tab này đã lưu token
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const claimLead = async (lead: NormalizedLead) => {
        const raw = token.trim().replace(/^Bearer\s+/i, '');
        const identity = tokenIdentity(raw);
        if (!identity) {
            setClaimError('Token không có userId, không nhận lead được.');
            return;
        }
        setClaimingId(lead.lead_id);
        setClaimError('');
        try {
            const response = await fetch(`${API_BASE}/dev/lead-check/${encodeURIComponent(lead.lead_id)}/claim`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${raw}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    command_id: crypto.randomUUID(),
                    correlation_id: crypto.randomUUID(),
                    occurred_at: new Date().toISOString(),
                    target_owner_id: identity.userId,
                    expected_state_version: lead.state_version,
                    reason: 'Nhận lead',
                }),
            });
            const body = await response.json().catch(() => null);
            const accepted = response.ok && (body?.status === 'ACCEPTED' || body?.status === 'DUPLICATE_NOOP' || body?.status === 'success');
            if (!accepted) {
                if (body?.status === 'VERSION_CONFLICT') {
                    setClaimError('Lead vừa được cập nhật. Bấm Tải dữ liệu rồi nhận lại.');
                } else if (body?.status === 'BUSINESS_REJECTED') {
                    setClaimError(body?.code === 'TERMINAL_LEAD' ? 'Lead đã đóng, không nhận được.' : `Không nhận được lead (${body?.code || 'từ chối'})`);
                } else {
                    setClaimError(body?.message || body?.code || `Không nhận được lead (${response.status})`);
                }
                return;
            }
            setLeads((current) => current.map((item) => (
                item.lead_id === lead.lead_id
                    ? {
                        ...item,
                        operational_state: 'assigned',
                        owner: { staff_uid: identity.userId, display_name: identity.name },
                        state_version: Number(body?.state_version ?? item.state_version + 1),
                    }
                    : item
            )));
        } catch (err) {
            setClaimError(err instanceof Error ? err.message : 'Không nhận được lead');
        } finally {
            setClaimingId(null);
        }
    };

    const grouped = useMemo(() => {
        const buckets: Record<KanbanColumnId, NormalizedLead[]> = {
            NEED_DISCOVERY: [],
            PRICE_NEGOTIATION: [],
            APPOINTMENT_SHOP: [],
            APPOINTMENT_SHIP: [],
            WON: [],
        };
        for (const lead of leads) {
            buckets[lead.kanban_column].push(lead);
        }
        return buckets;
    }, [leads]);

    const selected = leads.find((lead) => lead.lead_id === selectedId) || null;
    const totalPages = pagination?.totalPages || 1;

    return (
        <div className="min-h-screen bg-slate-50">
            <div className="mx-auto max-w-[1600px] space-y-4 p-4 md:p-6">
                <div>
                    <h1 className="text-xl font-bold text-slate-900">Leads Kanban</h1>
                    <p className="mt-1 text-sm text-slate-500">
                        Dữ liệu từ GET /api/leads, xếp theo kanban_column. Lead chưa có cột được đưa vào NEED_DISCOVERY.
                    </p>
                </div>

                <div className="rounded-xl border bg-white p-4 shadow-sm">
                    <div className="grid gap-3 md:grid-cols-[1fr_220px_120px_auto] md:items-end">
                        <div className="space-y-1.5">
                            <Label htmlFor="lead-check-token">Token</Label>
                            <Input
                                id="lead-check-token"
                                type="password"
                                value={token}
                                onChange={(e) => setToken(e.target.value)}
                                placeholder="Dán Bearer token"
                                autoComplete="off"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="lead-check-search">Tìm</Label>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                <Input
                                    id="lead-check-search"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') void load(1);
                                    }}
                                    placeholder="Tên, SĐT..."
                                    className="pl-9"
                                />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="lead-check-limit">Số dòng</Label>
                            <Input
                                id="lead-check-limit"
                                type="number"
                                min={1}
                                max={100}
                                value={limit}
                                onChange={(e) => setLimit(Math.min(100, Math.max(1, Number(e.target.value) || 50)))}
                            />
                        </div>
                        <Button type="button" onClick={() => void load(1)} disabled={loading}>
                            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                            Tải dữ liệu
                        </Button>
                    </div>
                    {error && (
                        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
                    )}
                    {claimError && (
                        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{claimError}</p>
                    )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
                    <p>
                        {pagination
                            ? `Tổng ${pagination.total.toLocaleString('vi-VN')} lead · trang ${pagination.page}/${pagination.totalPages} · đang hiện ${leads.length}`
                            : leads.length
                                ? `Đang hiện ${leads.length} lead`
                                : 'Chưa có dữ liệu'}
                    </p>
                    <div className="flex items-center gap-2">
                        <Button type="button" variant="outline" size="sm" disabled={loading || page <= 1} onClick={() => void load(page - 1)}>
                            Trước
                        </Button>
                        <span className="min-w-16 text-center">{page}/{totalPages}</span>
                        <Button type="button" variant="outline" size="sm" disabled={loading || page >= totalPages} onClick={() => void load(page + 1)}>
                            Sau
                        </Button>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-3 xl:grid-cols-5">
                    {KANBAN_COLUMNS.map((column) => (
                        <section key={column.id} className="flex min-h-[280px] flex-col rounded-xl border bg-slate-100/80">
                            <header className="border-b px-3 py-2">
                                <div className="flex items-center justify-between gap-2">
                                    <h2 className="text-sm font-semibold text-slate-900">{column.title}</h2>
                                    <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-600">
                                        {grouped[column.id].length}
                                    </span>
                                </div>
                                <p className="mt-0.5 font-mono text-[10px] text-slate-500">{column.id}</p>
                                <p className="text-[11px] text-slate-500">{column.hint}</p>
                            </header>
                            <div className="flex flex-1 flex-col gap-2 p-2">
                                {grouped[column.id].length === 0 && (
                                    <p className="px-1 py-6 text-center text-xs text-slate-400">Không có lead</p>
                                )}
                                {grouped[column.id].map((lead) => {
                                    const unassigned = lead.operational_state === 'unassigned' || !lead.owner?.display_name;
                                    return (
                                    <div
                                        key={lead.lead_id}
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => setSelectedId(lead.lead_id)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') setSelectedId(lead.lead_id);
                                        }}
                                        className={`rounded-lg border bg-white p-3 text-left shadow-sm transition hover:border-amber-300 ${selectedId === lead.lead_id ? 'border-amber-400 ring-2 ring-amber-200' : 'border-slate-200'}`}
                                    >
                                        <div className="flex items-start gap-2">
                                            {lead.customer.avatar_url ? (
                                                <img src={lead.customer.avatar_url} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
                                            ) : (
                                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600">
                                                    {lead.customer.display_name.charAt(0).toUpperCase()}
                                                </div>
                                            )}
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-sm font-semibold text-slate-900">{lead.customer.display_name}</p>
                                                <p className="truncate text-xs text-slate-500">{lead.customer.phone || 'Chưa có SĐT'}</p>
                                            </div>
                                        </div>
                                        {lead.sla && (
                                            <div className="mt-2">
                                                <SLACountdown lead={lead} size="sm" className="shadow-none" />
                                            </div>
                                        )}
                                        <p className="mt-2 text-xs font-semibold text-slate-800">
                                            {lead.order_amount != null ? formatCurrency(lead.order_amount) : 'Chưa báo giá'}
                                        </p>
                                        <p className="mt-1 line-clamp-2 text-xs text-slate-600">
                                            {lead.last_message?.content_text || 'Chưa có tin nhắn'}
                                        </p>
                                        <div className="mt-2 flex items-center justify-between gap-2">
                                            {unassigned ? (
                                                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                                                    Chưa gán Sale
                                                </span>
                                            ) : (
                                                <span className="truncate text-xs font-medium text-slate-700">{lead.owner?.display_name}</span>
                                            )}
                                            <span className="shrink-0 text-[10px] text-slate-400">
                                                {lead.created_at ? formatDateTime(lead.created_at) : ''}
                                            </span>
                                        </div>
                                        {unassigned && (
                                            <Button
                                                type="button"
                                                size="sm"
                                                className="mt-2 h-7 w-full text-xs"
                                                disabled={claimingId === lead.lead_id}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    void claimLead(lead);
                                                }}
                                            >
                                                {claimingId === lead.lead_id ? 'Đang nhận...' : 'Nhận Lead'}
                                            </Button>
                                        )}
                                    </div>
                                    );
                                })}
                            </div>
                        </section>
                    ))}
                </div>

                {selected && (
                    <div className="rounded-xl border bg-white p-4 shadow-sm">
                        <div className="mb-3 flex items-center justify-between gap-2">
                            <h2 className="font-semibold text-slate-900">{selected.customer.display_name}</h2>
                            <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedId(null)}>Đóng</Button>
                        </div>
                        <pre className="max-h-80 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">
                            {JSON.stringify(selected, null, 2)}
                        </pre>
                    </div>
                )}
            </div>
        </div>
    );
}
