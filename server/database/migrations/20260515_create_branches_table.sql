-- Chi nhánh (branches) — dùng cho payroll_branch_id, working_branch_id trên users
CREATE TABLE IF NOT EXISTS public.branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    address TEXT,
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS branches_status_idx ON public.branches(status);

ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS payroll_branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS working_branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL;
