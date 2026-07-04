import bcrypt from 'bcryptjs';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import readline from 'readline';

// Load environment variables
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trong file .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

function getArg(name: string): string | null {
    const arg = process.argv.find(a => a.startsWith(`--${name}=`));
    return arg ? arg.split('=')[1] : null;
}

function askQuestion(query: string, defaultValue: string): Promise<string> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    return new Promise(resolve => {
        rl.question(`${query} [${defaultValue}]: `, ans => {
            rl.close();
            resolve(ans.trim() || defaultValue);
        });
    });
}

async function createAdmin() {
    console.log('\n=======================================');
    console.log('🚀   KHỞI TẠO TÀI KHOẢN ADMIN CRM   🚀');
    console.log('=======================================');

    const args = {
        email: getArg('email'),
        password: getArg('password'),
        name: getArg('name'),
        phone: getArg('phone'),
        department: getArg('department'),
        nonInteractive: process.argv.includes('--non-interactive') || process.argv.includes('-y')
    };

    let email = args.email;
    let password = args.password;
    let name = args.name;
    let phone = args.phone;
    let department = args.department;

    if (!args.nonInteractive) {
        if (!email) email = await askQuestion('📧 Email', 'admin@crm.com');
        if (!password) password = await askQuestion('🔑 Mật khẩu', 'AdminPassword@2026');
        if (!name) name = await askQuestion('👤 Họ tên', 'Quản trị viên');
        if (!phone) phone = await askQuestion('📞 Số điện thoại', '0999999999');
        if (!department) department = await askQuestion('🏢 Phòng ban', 'Quản trị');
    } else {
        email = email || 'admin@crm.com';
        password = password || 'AdminPassword@2026';
        name = name || 'Quản trị viên';
        phone = phone || '0999999999';
        department = department || 'Quản trị';
    }

    email = email.toLowerCase().trim();

    console.log('\n⏳ Đang kiểm tra cơ sở dữ liệu...');

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Check if user exists
    const { data: existingUser, error: checkError } = await supabase
        .from('users')
        .select('id, name, role')
        .eq('email', email)
        .maybeSingle();

    if (checkError) {
        console.error('❌ Lỗi khi kiểm tra tài khoản:', checkError.message);
        process.exit(1);
    }

    if (existingUser) {
        console.log(`\n⚠️  Tài khoản với email "${email}" đã tồn tại trong hệ thống!`);
        console.log(`   - Tên hiện tại: ${existingUser.name}`);
        console.log(`   - Vai trò hiện tại: ${existingUser.role}`);
        
        let update = false;
        if (!args.nonInteractive) {
            const ans = await askQuestion(`🔄 Bạn có muốn nâng cấp lên ADMIN và cập nhật mật khẩu mới không? (y/n)`, 'y');
            update = ans.toLowerCase() === 'y';
        } else {
            update = true;
        }

        if (update) {
            console.log('⏳ Đang cập nhật tài khoản...');
            const { error: updateError } = await supabase
                .from('users')
                .update({
                    password_hash: passwordHash,
                    role: 'admin',
                    department: department,
                    status: 'active',
                    updated_at: new Date().toISOString()
                })
                .eq('id', existingUser.id);

            if (updateError) {
                console.error('❌ Lỗi khi cập nhật tài khoản:', updateError.message);
                process.exit(1);
            }

            console.log('\n==================================================');
            console.log('🎉 CẬP NHẬT TÀI KHOẢN ADMIN THÀNH CÔNG!');
            console.log('──────────────────────────────────────────────────');
            console.log(`📧 Email:      ${email}`);
            console.log(`🔑 Mật khẩu:   ${password}`);
            console.log(`👤 Họ tên:     ${existingUser.name}`);
            console.log(`👑 Vai trò:    admin (Đã nâng cấp)`);
            console.log(`🏢 Phòng ban:  ${department}`);
            console.log('==================================================\n');
        } else {
            console.log('❌ Đã hủy thao tác.');
        }
        process.exit(0);
    }

    // Create new admin
    console.log('⏳ Đang tạo tài khoản admin mới...');
    const { data: newUser, error: createError } = await supabase
        .from('users')
        .insert({
            email,
            password_hash: passwordHash,
            name,
            role: 'admin',
            department,
            phone,
            status: 'active',
            base_salary: 0,
            hourly_rate: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        })
        .select()
        .single();

    if (createError) {
        console.error('❌ Lỗi khi tạo tài khoản admin:', createError.message);
        process.exit(1);
    }

    console.log('\n==================================================');
    console.log('🎉 TẠO TÀI KHOẢN ADMIN MỚI THÀNH CÔNG!');
    console.log('──────────────────────────────────────────────────');
    console.log(`📧 Email:      ${email}`);
    console.log(`🔑 Mật khẩu:   ${password}`);
    console.log(`👤 Họ tên:     ${name}`);
    console.log(`👑 Vai trò:    admin`);
    console.log(`📞 SĐT:        ${phone}`);
    console.log(`🏢 Phòng ban:  ${department}`);
    console.log('==================================================\n');
}

createAdmin().catch(err => {
    console.error('❌ Đã xảy ra lỗi hệ thống:', err);
    process.exit(1);
});
