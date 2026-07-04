import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: './server/.env' });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const check = async () => {
    const { data, error } = await supabase.from('salary_configs').select('*').limit(1).single();
    if (error) {
        console.error('Error:', error.message);
        if (error.code === 'PGRST116') {
             console.log('No rows found, but table exists.');
        }
    } else {
        console.log('Columns found:', Object.keys(data));
    }
};

check();
