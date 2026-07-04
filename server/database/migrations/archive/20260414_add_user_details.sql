-- Create branches table
CREATE TABLE IF NOT EXISTS public.branches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    address TEXT,
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add missing columns to users
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS timekeeping_code VARCHAR(100),
ADD COLUMN IF NOT EXISTS dob DATE,
ADD COLUMN IF NOT EXISTS gender VARCHAR(20),
ADD COLUMN IF NOT EXISTS identity_card VARCHAR(50),
ADD COLUMN IF NOT EXISTS job_title_id UUID REFERENCES public.job_titles(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS join_date DATE,
ADD COLUMN IF NOT EXISTS payroll_branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS working_branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS kiotviet_account VARCHAR(100),
ADD COLUMN IF NOT EXISTS facebook VARCHAR(255),
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS mobile_device VARCHAR(255),
ADD COLUMN IF NOT EXISTS notes TEXT;

-- Create basic indexes for the new relationships
CREATE INDEX IF NOT EXISTS users_job_title_id_idx ON public.users(job_title_id);
CREATE INDEX IF NOT EXISTS users_payroll_branch_id_idx ON public.users(payroll_branch_id);
CREATE INDEX IF NOT EXISTS users_working_branch_id_idx ON public.users(working_branch_id);
