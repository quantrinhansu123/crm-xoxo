-- 1. Thêm cột employee_code vào bảng users (nếu chưa có)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS employee_code VARCHAR(20) UNIQUE;

-- 2. Cập nhật mã nhân viên cho các bản ghi đã tồn tại dựa theo thời gian tạo (created_at)
DO $$
DECLARE
    emp_record RECORD;
    counter INT := 1;
    new_code VARCHAR(20);
BEGIN
    FOR emp_record IN 
        SELECT id FROM public.users 
        WHERE employee_code IS NULL 
        ORDER BY created_at ASC
    LOOP
        -- Định dạng mã tự động: NV001, NV002...
        new_code := 'NV' || LPAD(counter::TEXT, 3, '0');
        
        -- Cập nhật dữ liệu
        UPDATE public.users 
        SET employee_code = new_code 
        WHERE id = emp_record.id;
        
        counter := counter + 1;
    END LOOP;
END $$;

-- 3. Tạo Function sinh mã tự động cho nhân viên mới
CREATE OR REPLACE FUNCTION public.auto_generate_employee_code()
RETURNS TRIGGER AS $$
DECLARE
    next_val INT;
BEGIN
    -- Chỉ tự sinh mã nếu chưa được truyền vào
    IF NEW.employee_code IS NULL OR NEW.employee_code = '' THEN
        -- Tìm số thứ tự lớn nhất trong các mã bắt đầu bằng 'NV' 
        SELECT COALESCE(MAX(NULLIF(REGEXP_REPLACE(employee_code, '\D', '', 'g'), '')::INTEGER), 0) + 1
        INTO next_val
        FROM public.users
        WHERE employee_code LIKE 'NV%';
        
        -- Gắn mã mới form NVxxx
        NEW.employee_code := 'NV' || LPAD(next_val::TEXT, 3, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Gắn Trigger vào bảng users để chạy trước khi thêm dòng mới
DROP TRIGGER IF EXISTS trigger_auto_generate_employee_code ON public.users;

CREATE TRIGGER trigger_auto_generate_employee_code
BEFORE INSERT ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.auto_generate_employee_code();
