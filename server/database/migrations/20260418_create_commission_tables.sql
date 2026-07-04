-- Create commission_tables table
CREATE TABLE IF NOT EXISTS public.commission_tables (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'custom',
    checked BOOLEAN DEFAULT false,
    scope TEXT DEFAULT 'all',
    branch_id UUID REFERENCES public.branches(id),
    status TEXT DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.commission_tables ENABLE ROW LEVEL SECURITY;

-- Create policies (allow all for now as per system pattern)
CREATE POLICY "Allow all for authenticated users" ON public.commission_tables
    FOR ALL USING (auth.role() = 'authenticated');

-- Seed default tables
INSERT INTO public.commission_tables (id, name, type, checked, scope)
VALUES 
    ('common', 'Bảng hoa hồng chung', 'common', true, 'all'),
ON CONFLICT (id) DO NOTHING;
