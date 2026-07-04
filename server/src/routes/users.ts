import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { ApiError } from '../middleware/errorHandler.js';
import { authenticate, AuthenticatedRequest, requireManager } from '../middleware/auth.js';
import { hashPassword } from '../utils/password.js';

const router = Router();

function normalizeTelegramChatId(value: unknown): string | null {
    if (value === undefined || value === null) return null;
    const trimmed = String(value).trim();
    return trimmed === '' ? null : trimmed;
}

function mapUserDbError(error: { code?: string; message?: string }, action: string): ApiError {
    console.error(`[users] Supabase error during ${action}:`, error);

    if (error.code === '23505') {
        if (/telegram|users_telegram_chat_id/i.test(error.message || '')) {
            return new ApiError('Telegram Chat ID này đã được gắn với nhân viên khác', 409);
        }
        return new ApiError('Dữ liệu bị trùng trong hệ thống', 409);
    }
    if (error.code === '42703') {
        if (/telegram_chat_id/i.test(error.message || '')) {
            return new ApiError('Database chưa có cột telegram_chat_id. Vui lòng chạy migration 20260531_add_telegram_chat_id_to_users.sql', 500);
        }
        if (/kpi_policy_id/i.test(error.message || '')) {
            return new ApiError('Database chưa có cột kpi_policy_id trên bảng users', 500);
        }
        return new ApiError(`Database thiếu cột: ${error.message || 'unknown column'}`, 500);
    }
    if (error.code === '22P02') {
        return new ApiError('Dữ liệu không hợp lệ. Kiểm tra phòng ban, chức danh hoặc chi nhánh.', 400);
    }

    return new ApiError(`${action}: ${error.message || 'Lỗi database'}`, 500);
}

function parseOptionalUuid(value: unknown): string | null | undefined {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    const str = String(value).trim();
    if (!str || str === 'none') return null;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)) {
        return null;
    }
    return str;
}

const USER_DETAIL_SELECT =
    'id, email, name, role, phone, avatar, department, department_id, departments!department_id(name), status, created_at, last_login, salary, base_salary, hourly_rate, commission, bank_account, bank_name, telegram_chat_id, employee_code, timekeeping_code, dob, gender, identity_card, job_title_id, join_date, payroll_branch_id, working_branch_id, kiotviet_account, facebook, address, mobile_device, notes';

async function assertTelegramChatIdAvailable(userId: string, telegramChatId: string | null) {
    if (!telegramChatId) return;

    const { data: existing, error } = await supabaseAdmin
        .from('users')
        .select('id, name')
        .eq('telegram_chat_id', telegramChatId)
        .neq('id', userId)
        .maybeSingle();

    if (error) {
        console.error('[users] Failed to check telegram_chat_id uniqueness:', error);
        return;
    }

    if (existing) {
        throw new ApiError(`Telegram Chat ID này đã được gắn với nhân viên "${existing.name}"`, 409);
    }
}

function mapUserRecord(user: any) {
    return {
        ...user,
        department: user.departments?.name || user.department || null,
        departmentId: user.department_id,
        bankAccount: user.bank_account,
        bankName: user.bank_name,
        telegramChatId: user.telegram_chat_id,
        employeeCode: user.employee_code,
        timekeepingCode: user.timekeeping_code,
        jobTitleId: user.job_title_id,
        joinDate: user.join_date,
        payrollBranchId: user.payroll_branch_id,
        workingBranchId: user.working_branch_id,
        kiotvietAccount: user.kiotviet_account,
        mobileDevice: user.mobile_device,
        identityCard: user.identity_card,
    };
}

// Get technicians list (cho tất cả user đã đăng nhập - dùng để phân công)
router.get('/technicians', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { data: technicians, error } = await supabaseAdmin
            .from('users')
            .select('id, name, avatar, phone, department, status, role')
            .eq('role', 'technician')
            .eq('status', 'active')
            .order('name', { ascending: true });

        if (error) {
            throw new ApiError('Lỗi khi lấy danh sách kỹ thuật viên', 500);
        }

        res.json({
            status: 'success',
            data: { users: technicians || [] },
        });
    } catch (error) {
        next(error);
    }
});

// Get sales list (cho tất cả user đã đăng nhập - dùng để phân công)
router.get('/sales', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { data: sales, error } = await supabaseAdmin
            .from('users')
            .select('id, name, avatar, phone, department, status, role')
            .eq('role', 'sale')
            .eq('status', 'active')
            .order('name', { ascending: true });

        if (error) {
            throw new ApiError('Lỗi khi lấy danh sách sales', 500);
        }

        res.json({
            status: 'success',
            data: { users: sales || [] },
        });
    } catch (error) {
        next(error);
    }
});

// Danh sách nhân viên để @ nhắc tên trong chat (mọi user đã đăng nhập)
router.get('/mentionable', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { data: users, error } = await supabaseAdmin
            .from('users')
            .select('id, name, avatar, role')
            .eq('status', 'active')
            .in('role', ['sale', 'technician', 'tech', 'manager', 'admin', 'accountant', 'cashier'])
            .order('name', { ascending: true });

        if (error) {
            throw new ApiError('Lỗi khi lấy danh sách nhân viên', 500);
        }

        res.json({
            status: 'success',
            data: { users: users || [] },
        });
    } catch (error) {
        next(error);
    }
});

// Get all users (chỉ manager)
router.get('/', authenticate, requireManager, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { role, department, status, search } = req.query;

        let query = supabaseAdmin
            .from('users')
            .select(USER_DETAIL_SELECT)
            .order('created_at', { ascending: false });

        if (role) query = query.eq('role', role);
        if (department) query = query.eq('department', department);
        if (status) query = query.eq('status', status);
        if (search) query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`);

        const { data: users, error } = await query;

        if (error) {
            throw new ApiError('Lỗi khi lấy danh sách người dùng', 500);
        }

        // Fetch all departments for name resolution fallback
        const { data: deptList } = await supabaseAdmin.from('departments').select('id, name');
        const deptMap = new Map((deptList || []).map(d => [d.id, d.name]));

        // Map snake_case to camelCase
        const mappedUsers = (users || []).map((user: any) => ({
            ...user,
            department: user.departments?.name || (user.department ? (deptMap.get(user.department) || user.department) : null),
            departmentId: user.department_id,
            bankAccount: user.bank_account,
            bankName: user.bank_name,
            telegramChatId: user.telegram_chat_id,
            employeeCode: user.employee_code,
            timekeepingCode: user.timekeeping_code,
            jobTitleId: user.job_title_id,
            joinDate: user.join_date,
            payrollBranchId: user.payroll_branch_id,
            workingBranchId: user.working_branch_id,
            kiotvietAccount: user.kiotviet_account,
            mobileDevice: user.mobile_device,
            identityCard: user.identity_card,
        }));

        res.json({
            status: 'success',
            data: { users: mappedUsers },
        });
    } catch (error) {
        next(error);
    }
});

// Create new user (manager only) - Uses bcrypt for password hashing
router.post('/', authenticate, requireManager, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { 
            email, password, name, phone, role, department, departmentId, avatar, salary, commission, bankAccount, bankName, telegramChatId,
            dob, gender, identityCard, jobTitleId, joinDate, payrollBranchId, workingBranchId, kiotvietAccount, facebook, address, mobileDevice, notes 
        } = req.body;

        if (!email || !password || !name) {
            throw new ApiError('Email, mật khẩu và tên là bắt buộc', 400);
        }

        if (password.length < 6) {
            throw new ApiError('Mật khẩu phải có ít nhất 6 ký tự', 400);
        }

        const normalizedEmail = email.toLowerCase().trim();

        // Check if email already exists. Soft-deleted/inactive employees may be
        // reactivated so their email can be reused without breaking history.
        const { data: existingUser } = await supabaseAdmin
            .from('users')
            .select('id, status, timekeeping_code')
            .eq('email', normalizedEmail)
            .maybeSingle();

        if (existingUser && existingUser.status === 'active') {
            throw new ApiError('Email đã tồn tại trong hệ thống', 400);
        }

        const passwordHash = await hashPassword(password);

        // Generate timekeepingCode
        const { data: lastTimekeeping } = await supabaseAdmin
            .from('users')
            .select('timekeeping_code')
            .order('created_at', { ascending: false })
            .limit(1);
        
        let nt = 1;
        if (lastTimekeeping && lastTimekeeping.length > 0 && lastTimekeeping[0].timekeeping_code) {
            const match = lastTimekeeping[0].timekeeping_code.match(/CC(\d+)/);
            if (match) nt = parseInt(match[1]) + 1;
        }
        const timekeepingCode = `CC${nt.toString().padStart(4, '0')}`;

        const userPayload = {
                email: normalizedEmail,
                password_hash: passwordHash,
                name,
                phone: phone || null,
                role: role || 'sale',
                department: department || null,
                department_id: departmentId || null,
                avatar: avatar || null,
                salary: salary || 0,
                base_salary: salary || 0,
                commission: commission || 0,
                bank_account: bankAccount || null,
                bank_name: bankName || null,
                telegram_chat_id: normalizeTelegramChatId(telegramChatId),
                status: 'active',
                timekeeping_code: existingUser?.timekeeping_code || timekeepingCode,
                dob: dob || null,
                gender: gender || null,
                identity_card: identityCard || null,
                job_title_id: jobTitleId || null,
                join_date: joinDate || null,
                payroll_branch_id: payrollBranchId || null,
                working_branch_id: workingBranchId || null,
                kiotviet_account: kiotvietAccount || null,
                facebook: facebook || null,
                address: address || null,
                mobile_device: mobileDevice || null,
                notes: notes || null,
                updated_at: new Date().toISOString()
        };

        const userMutation = existingUser
            ? supabaseAdmin.from('users').update(userPayload).eq('id', existingUser.id)
            : supabaseAdmin.from('users').insert({ ...userPayload, created_at: new Date().toISOString() });

        const { data: user, error: insertError } = await userMutation
            .select(USER_DETAIL_SELECT)
            .single();

        if (insertError) {
            throw mapUserDbError(insertError, 'Lỗi tạo hồ sơ người dùng');
        }

        // Map snake_case to camelCase
        const mappedUser = {
            ...user,
            bankAccount: user.bank_account,
            bankName: user.bank_name,
            telegramChatId: user.telegram_chat_id,
            employeeCode: user.employee_code,
            timekeepingCode: user.timekeeping_code,
            jobTitleId: user.job_title_id,
            joinDate: user.join_date,
            payrollBranchId: user.payroll_branch_id,
            workingBranchId: user.working_branch_id,
            kiotvietAccount: user.kiotviet_account,
            mobileDevice: user.mobile_device,
            identityCard: user.identity_card,
        };

        res.status(201).json({
            status: 'success',
            data: { user: mappedUser },
            message: 'Đã tạo tài khoản nhân viên thành công',
        });
    } catch (error) {
        next(error);
    }
});

// Get user by ID
router.get('/:id', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;

        // Chỉ cho phép xem thông tin của chính mình hoặc quản lý
        if (req.user!.id !== id && req.user!.role !== 'manager' && req.user!.role !== 'admin') {
            throw new ApiError('Không có quyền xem thông tin người dùng này', 403);
        }

        const { data: user, error } = await supabaseAdmin
            .from('users')
            .select('id, email, name, role, phone, avatar, department, status, created_at, last_login, salary, base_salary, hourly_rate, commission, bank_account, bank_name, telegram_chat_id, employee_code, timekeeping_code, dob, gender, identity_card, job_title_id, join_date, payroll_branch_id, working_branch_id, kiotviet_account, facebook, address, mobile_device, notes')
            .eq('id', id)
            .single();

        if (error || !user) {
            throw new ApiError('Không tìm thấy người dùng', 404);
        }

        res.json({
            status: 'success',
            data: { 
                user: {
                    ...user,
                    bankAccount: user.bank_account,
                    bankName: user.bank_name,
                    telegramChatId: user.telegram_chat_id,
                    employeeCode: user.employee_code,
                    timekeepingCode: user.timekeeping_code,
                    jobTitleId: user.job_title_id,
                    joinDate: user.join_date,
                    payrollBranchId: user.payroll_branch_id,
                    workingBranchId: user.working_branch_id,
                    kiotvietAccount: user.kiotviet_account,
                    mobileDevice: user.mobile_device,
                    identityCard: user.identity_card,
                } 
            },
        });
    } catch (error) {
        next(error);
    }
});

// Update user
router.put('/:id', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;
        const { 
            name, phone, avatar, department, departmentId, status, role, salary, commission, bankAccount, bankName, telegramChatId,
            dob, gender, identityCard, jobTitleId, joinDate, payrollBranchId, workingBranchId, kiotvietAccount, facebook, address, mobileDevice, notes,
            password
        } = req.body;

        // Chỉ cho phép cập nhật thông tin của chính mình hoặc quản lý
        const isOwner = req.user!.id === id;
        const isManager = req.user!.role === 'manager' || req.user!.role === 'admin';

        if (!isOwner && !isManager) {
            throw new ApiError('Không có quyền cập nhật thông tin người dùng này', 403);
        }

        const updateData: Record<string, any> = {};

        // Thông tin cơ bản - ai cũng có thể cập nhật cho mình
        if (name) updateData.name = name;
        if (phone !== undefined) updateData.phone = phone || null;
        if (avatar !== undefined) updateData.avatar = avatar || null;
        if (telegramChatId !== undefined) {
            updateData.telegram_chat_id = normalizeTelegramChatId(telegramChatId);
            await assertTelegramChatIdAvailable(id, updateData.telegram_chat_id);
        }
        if (dob !== undefined) updateData.dob = dob || null;
        if (gender !== undefined) updateData.gender = gender || null;
        if (identityCard !== undefined) updateData.identity_card = identityCard || null;
        if (facebook !== undefined) updateData.facebook = facebook || null;
        if (address !== undefined) updateData.address = address || null;
        if (mobileDevice !== undefined) updateData.mobile_device = mobileDevice || null;
        if (notes !== undefined) updateData.notes = notes || null;

        // Chỉ manager mới được cập nhật role, status, department, salary, etc.
        if (isManager) {
            if (department !== undefined) updateData.department = department || null;
            const parsedDepartmentId = parseOptionalUuid(departmentId);
            if (parsedDepartmentId !== undefined) updateData.department_id = parsedDepartmentId;
            if (status) updateData.status = status;
            if (role) updateData.role = role;
            if (salary !== undefined) updateData.salary = salary;
            if (commission !== undefined) updateData.commission = commission;
            if (bankAccount !== undefined) updateData.bank_account = bankAccount || null;
            if (bankName !== undefined) updateData.bank_name = bankName || null;
            const parsedJobTitleId = parseOptionalUuid(jobTitleId);
            if (parsedJobTitleId !== undefined) updateData.job_title_id = parsedJobTitleId;
            if (joinDate !== undefined) updateData.join_date = joinDate || null;
            const parsedPayrollBranchId = parseOptionalUuid(payrollBranchId);
            if (parsedPayrollBranchId !== undefined) updateData.payroll_branch_id = parsedPayrollBranchId;
            const parsedWorkingBranchId = parseOptionalUuid(workingBranchId);
            if (parsedWorkingBranchId !== undefined) updateData.working_branch_id = parsedWorkingBranchId;
            if (kiotvietAccount !== undefined) updateData.kiotviet_account = kiotvietAccount || null;
            if (password) {
                if (password.length < 6) {
                    throw new ApiError('Mật khẩu phải có ít nhất 6 ký tự', 400);
                }
                updateData.password_hash = await hashPassword(password);
            }
        }

        if (Object.keys(updateData).length === 0) {
            throw new ApiError('Không có dữ liệu để cập nhật', 400);
        }

        console.log('[PUT /users/:id] updateData =', JSON.stringify(updateData));

        const { error: updateError } = await supabaseAdmin
            .from('users')
            .update(updateData)
            .eq('id', id);

        if (updateError) {
            throw mapUserDbError(updateError, 'Lỗi khi cập nhật người dùng');
        }

        const { data: user, error: fetchError } = await supabaseAdmin
            .from('users')
            .select(USER_DETAIL_SELECT)
            .eq('id', id)
            .single();

        if (fetchError) {
            throw mapUserDbError(fetchError, 'Lỗi khi lấy thông tin người dùng sau cập nhật');
        }

        res.json({
            status: 'success',
            data: { user: mapUserRecord(user) },
        });
    } catch (error) {
        next(error);
    }
});

// Delete user (soft delete - chỉ manager)
router.delete('/:id', authenticate, requireManager, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;

        // Không cho phép xóa chính mình
        if (req.user!.id === id) {
            throw new ApiError('Không thể xóa tài khoản của chính mình', 400);
        }

        const { error } = await supabaseAdmin
            .from('users')
            .update({ status: 'inactive', updated_at: new Date().toISOString() })
            .eq('id', id);

        if (error) {
            throw new ApiError('Lỗi khi xóa người dùng', 500);
        }

        res.json({
            status: 'success',
            message: 'Đã vô hiệu hóa người dùng',
        });
    } catch (error) {
        next(error);
    }
});

export { router as usersRouter };



