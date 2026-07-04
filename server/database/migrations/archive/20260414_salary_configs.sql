-- ============================================================
-- Migration: salary_configs + bonus_tiers + deduction_rules
-- Per-employee salary configuration
-- ============================================================

-- 1. Bảng cấu hình lương cho từng nhân viên
CREATE TABLE IF NOT EXISTS public.salary_configs (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL UNIQUE,
  salary_template text,                           -- Mẫu áp dụng (tên template, null = Không áp dụng)
  salary_type text DEFAULT 'standard_day',        -- standard_day | hourly | monthly_fixed
  base_amount numeric DEFAULT 0,                  -- Mức lương cơ bản
  bonus_type text DEFAULT 'none',                 -- none | personal_revenue | team_revenue | fixed
  commission_enabled boolean DEFAULT false,        -- Hoa hồng
  overtime_enabled boolean DEFAULT false,          -- Lương làm thêm giờ
  allowance_enabled boolean DEFAULT false,         -- Phụ cấp
  allowance_amount numeric DEFAULT 0,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT salary_configs_pkey PRIMARY KEY (id),
  CONSTRAINT salary_configs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE
);

-- 2. Bảng bậc thang thưởng doanh thu (nhiều bậc cho mỗi nhân viên)
CREATE TABLE IF NOT EXISTS public.bonus_tiers (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  salary_config_id uuid NOT NULL,
  from_amount numeric NOT NULL DEFAULT 0,          -- Từ mức doanh thu
  bonus_percent numeric NOT NULL DEFAULT 0,        -- % thưởng doanh thu
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT bonus_tiers_pkey PRIMARY KEY (id),
  CONSTRAINT bonus_tiers_salary_config_id_fkey FOREIGN KEY (salary_config_id) REFERENCES public.salary_configs(id) ON DELETE CASCADE
);

-- 3. Bảng quy tắc giảm trừ (đi muộn, nghỉ không phép, v.v.)
CREATE TABLE IF NOT EXISTS public.deduction_rules (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  salary_config_id uuid NOT NULL,
  name text NOT NULL,                              -- Tên loại giảm trừ (Đi muộn, Nghỉ không phép...)
  condition text,                                  -- Điều kiện (1 lần đi muộn, 1 ngày nghỉ...)
  amount numeric NOT NULL DEFAULT 0,               -- Mức áp dụng (VND)
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT deduction_rules_pkey PRIMARY KEY (id),
  CONSTRAINT deduction_rules_salary_config_id_fkey FOREIGN KEY (salary_config_id) REFERENCES public.salary_configs(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_salary_configs_user_id ON public.salary_configs(user_id);
CREATE INDEX IF NOT EXISTS idx_bonus_tiers_config_id ON public.bonus_tiers(salary_config_id);
CREATE INDEX IF NOT EXISTS idx_deduction_rules_config_id ON public.deduction_rules(salary_config_id);

-- RLS policies (allow all for authenticated)
ALTER TABLE public.salary_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bonus_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deduction_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for salary_configs" ON public.salary_configs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for bonus_tiers" ON public.bonus_tiers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for deduction_rules" ON public.deduction_rules FOR ALL USING (true) WITH CHECK (true);
