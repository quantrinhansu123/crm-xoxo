import { supabaseAdmin } from '../config/supabase';

async function checkTasks() {
    console.log('Checking V2 Tasks...');

    // 1. Get a technician ID (Võ Hoàng Tùng)
    // We'll search by name or email if possible, or list all technicians
    const { data: users, error: userError } = await supabaseAdmin
        .from('users')
        .select('id, name, email')
        //.eq('name', 'Võ Hoàng Tùng') // Try exact match first
        .limit(10);

    if (userError) {
        console.error('Error fetching users:', userError);
        return;
    }

    console.log('Found users:', users);

    const technician = users.find(u => u.name?.includes('Tùng'));
    if (!technician) {
        console.log('Technician "Tùng" not found in first 10 users.');
        return;
    }

    console.log(`Checking for Technician: ${technician.name} (${technician.id})`);

    // 2. Query order_product_services
    const { data: services, error: serviceError } = await supabaseAdmin
        .from('order_product_services')
        .select(`
            *,
            order_products (
                id, 
                product_code,
                orders (id, order_code)
            )
        `)
        .eq('technician_id', technician.id);

    if (serviceError) {
        console.error('Error fetching services:', serviceError);
    } else {
        console.log(`Found ${services?.length} services:`, JSON.stringify(services, null, 2));
    }

    // 3. Query order_item_steps
    const { data: steps, error: stepsError } = await supabaseAdmin
        .from('order_item_steps')
        .select('*')
        .eq('technician_id', technician.id);

    if (stepsError) {
        console.error('Error fetching steps:', stepsError);
    } else {
        console.log(`Found ${steps?.length} steps:`, steps);
    }
}

checkTasks();
