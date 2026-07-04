
import { supabaseAdmin } from './src/config/supabase';

async function listDepartments() {
    const { data, error } = await supabaseAdmin
        .from('departments')
        .select('id, name');

    if (error) {
        console.error('Error:', error);
        return;
    }

    console.log('Departments:', JSON.stringify(data, null, 2));
}

listDepartments();
