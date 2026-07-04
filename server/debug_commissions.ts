import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

async function checkConfigs() {
    console.log('Fetching configs...');
    const { data: configs, error: configError } = await supabaseAdmin
        .from('salary_configs')
        .select('*');
    
    if (configError) {
        console.error('Config Error:', configError);
    } else {
        console.log('Found', configs.length, 'configs');
        configs.forEach(c => {
            console.log(`User ${c.user_id}: enabled=${c.commission_enabled}, rules=${JSON.stringify(c.commission_rules)}`);
        });
    }

    const { data: users, error: userError } = await supabaseAdmin
        .from('users')
        .select('id, name, status');

    if (userError) {
        console.error('User Error:', userError);
    } else {
        console.log('Found', users.length, 'users');
        users.forEach(u => {
            console.log(`User ${u.id}: name=${u.name}, status=${u.status}`);
        });
    }
}

checkConfigs();
