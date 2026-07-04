-- Ensure upsell_tickets → users FK exists for PostgREST joins (sales_user)

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'upsell_tickets'
    ) AND EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'upsell_tickets' AND column_name = 'sales_id'
    ) AND NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'upsell_tickets_sales_id_fkey'
    ) THEN
        ALTER TABLE public.upsell_tickets
        ADD CONSTRAINT upsell_tickets_sales_id_fkey
        FOREIGN KEY (sales_id) REFERENCES public.users(id) ON DELETE SET NULL;
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'upsell_tickets'
    ) AND EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'upsell_tickets' AND column_name = 'approved_by'
    ) AND NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'upsell_tickets_approved_by_fkey'
    ) THEN
        ALTER TABLE public.upsell_tickets
        ADD CONSTRAINT upsell_tickets_approved_by_fkey
        FOREIGN KEY (approved_by) REFERENCES public.users(id) ON DELETE SET NULL;
    END IF;
END $$;
