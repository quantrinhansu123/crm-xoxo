import 'dotenv/config';
import { supabaseAdmin } from '../config/supabase.js';
import { processInvoiceCancellation } from '../utils/billingHelper.js';

async function main(): Promise<void> {
    const { data: invoices, error } = await supabaseAdmin
        .from('invoices')
        .select('id, invoice_code, status, order_id')
        .eq('status', 'cancelled')
        .order('created_at', { ascending: true });

    if (error) {
        throw error;
    }

    for (const invoice of invoices || []) {
        await processInvoiceCancellation(invoice.id, { cancelRelatedPayments: true });
        console.log(`[Backfill] Cascaded cancellation for ${invoice.invoice_code}`);
    }

    console.log(`[Backfill] Completed ${invoices?.length || 0} invoice(s).`);
}

main().catch((error) => {
    console.error('[Backfill] Failed:', error);
    process.exit(1);
});
