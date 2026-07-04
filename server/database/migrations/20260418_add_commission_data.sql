-- Add commission_data JSONB to products and services
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS commission_data jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS commission_data jsonb DEFAULT '{}'::jsonb;

-- Comment for clarity
COMMENT ON COLUMN public.products.commission_data IS 'Stores per-table commission rates and assignments: { "table_id": { "sale_rate": 10, "tech_rate": 5 } }';
COMMENT ON COLUMN public.services.commission_data IS 'Stores per-table commission rates and assignments: { "table_id": { "sale_rate": 10, "tech_rate": 5 } }';
