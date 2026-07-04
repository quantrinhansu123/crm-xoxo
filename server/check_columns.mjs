import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const check = async () => {
    const { data: row, error } = await supabase.from('salary_records').select('*').limit(1).maybeSingle();
    if (error) {
        console.error('Error:', error.message);
    } else if (row) {
        console.log('Columns in salary_records:', Object.keys(row));
    }
};
check();
