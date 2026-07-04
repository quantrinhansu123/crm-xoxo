
import { supabaseAdmin } from './src/config/supabase.js';

async function checkUsers() {
    const ids = [
        '10319c82-a9e4-4512-976a-68d7ab342dbd',
        '657bdd87-748a-47af-b536-ffcfde198adf',
        'ab202026-f822-46c2-9e73-159e3c63945f'
    ];

    const { data, error } = await supabaseAdmin
        .from('users')
        .select('id, name, department, department_id')
        .in('id', ids);

    if (error) {
        console.error('Error:', error);
        return;
    }

    console.log('User Data:', JSON.stringify(data, null, 2));
}

checkUsers();
