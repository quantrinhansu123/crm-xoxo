import { supabaseAdmin } from './src/config/supabase.js';
import dotenv from 'dotenv';
dotenv.config();

async function checkSchema() {
    const { data, error } = await supabaseAdmin.rpc('get_table_columns', { table_name_input: 'salary_configs' });
    if (error) {
        // Fallback or another way
        const { data: cols, error: err2 } = await supabaseAdmin
            .from('salary_configs')
            .select('*')
            .limit(1);
        
        if (err2) console.error(err2);
        else console.log('Columns:', Object.keys(cols[0] || {}));
    } else {
        console.log('Columns:', data);
    }
}
checkSchema();
