import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithEsbuild } from 'vite';

const url = 'https://dhsywwqoi.datadex.vn/webhook/crm-mock-hdn';
const source = await readFile(new URL('../src/lib/leadReadSource.ts', import.meta.url), 'utf8');
const result = await transformWithEsbuild(source.replaceAll('import.meta.env', JSON.stringify({ VITE_LEADS_READ_URL: url, DEV: true })), 'leadReadSource.ts', { loader: 'ts', target: 'es2022' });
const adapter = await import(`data:text/javascript;base64,${Buffer.from(result.code).toString('base64')}`);

const liveResponse = await fetch(url, { signal: AbortSignal.timeout(30000) });
assert.equal(liveResponse.status, 200);
assert.equal(liveResponse.headers.get('access-control-allow-origin'), '*');
const live = await liveResponse.json();
assert.equal(live.status, 'success');
assert.ok(Array.isArray(live.data));
assert.ok(live.data.length > 0);
const raw = live.data.find(lead => lead.lead_id === live.lead.lead_id);
assert.deepEqual(raw, live.lead, 'List and detail JSON must describe the same lead');
const normalized = adapter.normalizeExternalLead(raw);
assert.equal(normalized.name, raw.customer.display_name);
assert.equal(normalized.kanban_column, raw.kanban_column);
assert.deepEqual(normalized.next_action, raw.next_action);
assert.equal(adapter.getLeadNextActionText(normalized), raw.next_action.display_text);
assert.equal(normalized.customer_insight, raw.customer_insight);
assert.equal(normalized.ai_suggested_reply, raw.ai_suggested_reply);
assert.equal(adapter.getLeadOwnerName(normalized), raw.owner === null ? 'Chưa gán Sale' : raw.owner.display_name);

let body = live;
let status = 200;
const calls = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (requestUrl, options) => {
    calls.push({ requestUrl, options });
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
};
try {
    const list = await adapter.readExternalLeads();
    const detail = await adapter.readExternalLead(raw.lead_id);
    assert.deepEqual(detail.data.data.lead, list.data.data.leads.find(lead => lead.id === raw.lead_id));
    assert.equal(list.data.data.pagination.total, live.data.length);
    assert.equal((await adapter.readExternalLeads({ search: 'no-matching-lead-xyz' })).data.data.leads.length, 0);
    assert.equal((await adapter.readExternalLeads({ source: raw.channel })).data.data.leads.length, live.data.filter(lead => lead.channel === raw.channel).length);
    await assert.rejects(adapter.readExternalLead('missing-id'), /Không tìm thấy/);
    assert.deepEqual(adapter.extractExternalLeadList({ data: [], lead: raw }), []);
    for (const column of adapter.canonicalLeadColumns) {
        const lead = adapter.normalizeExternalLead({ ...raw, kanban_column: column, pipeline_stage: 'xac_dinh_nhu_cau' });
        assert.equal(lead.kanban_column, column);
        assert.equal(lead.status, column);
    }
    assert.deepEqual(adapter.canonicalLeadColumnToStage, {
        NEED_DISCOVERY: 'xac_dinh_nhu_cau', PRICE_NEGOTIATION: 'dam_phan_gia',
        APPOINTMENT_SHOP: 'hen_qua_ship', APPOINTMENT_SHIP: 'hen_qua_ship', WON: 'chot_don',
    });
    const unassigned = adapter.normalizeExternalLead({ ...raw, owner: null, assigned_user: { name: 'Stale Sale' }, assigned_to: 'stale', owner_sale: 'Stale Sale' });
    assert.equal(adapter.getLeadOwnerName(unassigned), 'Chưa gán Sale');
    assert.equal(unassigned.assigned_user, undefined);
    assert.equal(adapter.normalizeExternalLead({ ...raw, customer: { ...raw.customer, phone: null }, phone: 'stale-phone' }).phone, '');
    assert.equal(adapter.getLeadOwnerName(adapter.normalizeExternalLead({ ...raw, owner: { staff_uid: 'sale-1', display_name: 'Sale mới' } })), 'Sale mới');
    assert.equal(adapter.getLeadNextActionText(adapter.normalizeExternalLead({ ...raw, next_action: null })), '');
    assert.throws(() => adapter.normalizeExternalLead({ ...raw, next_action: 'Old AI text' }), /object/);
    assert.throws(() => adapter.normalizeExternalLead({ ...raw, kanban_column: 'UNKNOWN' }), /kanban_column/);
    assert.throws(adapter.requireCrmLeadWrites, /chỉ hỗ trợ đọc/);
    body = { lead: raw };
    assert.equal((await adapter.readExternalLeads()).data.data.leads.length, 1);
    body = { data: [{ ...raw, lead_id: 'another-id' }], lead: raw };
    assert.equal((await adapter.readExternalLead('another-id')).data.data.lead.id, 'another-id');
    body = { status: 'error', message: 'Source unavailable' };
    await assert.rejects(adapter.readExternalLeads(), /Source unavailable/);
    status = 503;
    await assert.rejects(adapter.readExternalLeads(), /HTTP 503/);
    for (const call of calls) {
        assert.equal(call.requestUrl, url);
        assert.equal(call.options.credentials, 'omit');
        assert.equal(call.options.headers, undefined);
    }
} finally {
    globalThis.fetch = originalFetch;
}
console.log('PASS: live list/detail JSON, all 5 API codes mapped to existing CRM columns, next_action, insight/reply, null owner/phone, filtering, missing ID, read-only guard and API failures.');
console.log(JSON.stringify({ lead_id: raw.lead_id, name: normalized.name, kanban_column: normalized.kanban_column, next_action: normalized.next_action, owner: normalized.owner }, null, 2));
