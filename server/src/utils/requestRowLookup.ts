import { supabaseAdmin } from '../config/supabase.js';
import { ApiError } from '../middleware/errorHandler.js';

export type RequestLookupTable =
    | 'order_item_accessories'
    | 'order_item_partner'
    | 'order_extension_requests';

export type RequestLookupHints = {
    order_item_id?: string | null;
    order_product_id?: string | null;
    order_product_service_id?: string | null;
};

type ResolvedOrderEntity = {
    isV1: boolean;
    isV2Service: boolean;
    isV2Product: boolean;
};

async function resolveOrderEntityId(id: string): Promise<ResolvedOrderEntity | null> {
    const [{ data: v1Item }, { data: v2Service }, { data: v2Product }] = await Promise.all([
        supabaseAdmin.from('order_items').select('id').eq('id', id).maybeSingle(),
        supabaseAdmin.from('order_product_services').select('id').eq('id', id).maybeSingle(),
        supabaseAdmin.from('order_products').select('id').eq('id', id).maybeSingle(),
    ]);

    const isV1 = !!v1Item;
    const isV2Service = !!v2Service;
    const isV2Product = !!v2Product;

    if (!isV1 && !isV2Service && !isV2Product) return null;

    return { isV1, isV2Service, isV2Product };
}

async function findLatestRow(
    table: RequestLookupTable,
    column: string,
    value: string,
    extraNullColumn?: string,
): Promise<{ id: string } | null> {
    let query = supabaseAdmin.from(table).select('id').eq(column, value);
    if (extraNullColumn) {
        query = query.is(extraNullColumn, null);
    }
    const { data, error } = await query.order('updated_at', { ascending: false }).limit(1);
    if (error) {
        throw new ApiError(`Không thể xóa yêu cầu: ${error.message}`, 500);
    }
    return data?.[0] ?? null;
}

function collectLookupValues(rawId: string, hints?: RequestLookupHints): string[] {
    const values = new Set<string>();
    const add = (value?: string | null) => {
        const trimmed = String(value || '').trim();
        if (trimmed) values.add(trimmed);
    };

    add(rawId);
    add(hints?.order_item_id);
    add(hints?.order_product_id);
    add(hints?.order_product_service_id);

    return [...values];
}

export async function findRequestRowForDelete(
    table: RequestLookupTable,
    rawId: string,
    hints?: RequestLookupHints,
): Promise<{ id: string } | null> {
    const candidates = collectLookupValues(rawId, hints);

    for (const candidate of candidates) {
        const directMatches = await Promise.all([
            findLatestRow(table, 'id', candidate),
            findLatestRow(table, 'order_item_id', candidate),
            findLatestRow(table, 'order_product_service_id', candidate),
            findLatestRow(table, 'order_product_id', candidate),
            findLatestRow(table, 'order_product_id', candidate, 'order_product_service_id'),
        ]);

        const found = directMatches.find(Boolean);
        if (found) return found;

        const entity = await resolveOrderEntityId(candidate);
        if (!entity) continue;

        if (entity.isV1) {
            const byItem = await findLatestRow(table, 'order_item_id', candidate);
            if (byItem) return byItem;
        }

        if (entity.isV2Service) {
            const byService = await findLatestRow(table, 'order_product_service_id', candidate);
            if (byService) return byService;
        }

        if (entity.isV2Product) {
            const byProduct = await findLatestRow(
                table,
                'order_product_id',
                candidate,
                'order_product_service_id',
            );
            if (byProduct) return byProduct;

            const { data: services, error: servicesError } = await supabaseAdmin
                .from('order_product_services')
                .select('id')
                .eq('order_product_id', candidate);

            if (servicesError) {
                throw new ApiError(`Không thể xóa yêu cầu: ${servicesError.message}`, 500);
            }

            for (const service of services || []) {
                const byLinkedService = await findLatestRow(
                    table,
                    'order_product_service_id',
                    service.id,
                );
                if (byLinkedService) return byLinkedService;
            }
        }
    }

    return null;
}

export function parseRequestLookupHints(query: Record<string, unknown>): RequestLookupHints {
    const pick = (key: keyof RequestLookupHints) => {
        const value = query[key];
        return typeof value === 'string' && value.trim() ? value.trim() : undefined;
    };

    return {
        order_item_id: pick('order_item_id'),
        order_product_id: pick('order_product_id'),
        order_product_service_id: pick('order_product_service_id'),
    };
}
