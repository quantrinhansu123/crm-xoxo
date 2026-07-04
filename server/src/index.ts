import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';

import { config } from './config/index.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authRouter } from './routes/auth.js';
import { usersRouter } from './routes/users.js';
import { leadsRouter } from './routes/leads.js';
import { customersRouter } from './routes/customers.js';
import { ordersRouter } from './routes/orders.js';
import { invoicesRouter } from './routes/invoices.js';
import { productsRouter } from './routes/products.js';
import { servicesRouter } from './routes/services.js';
import packagesRouter from './routes/packages.js';
import vouchersRouter from './routes/vouchers.js';
import { financeRouter } from './routes/finance.js';
import { kpiRouter } from './routes/kpi.js';
import { salaryRouter } from './routes/salary.js';
import { reportsRouter } from './routes/reports.js';
import { interactionsRouter } from './routes/interactions.js';
import technicianTasksRouter from './routes/technician-tasks.js';
import departmentsRouter from './routes/departments.js';
import { commissionsRouter } from './routes/commissions.js';
import orderItemsRouter from './routes/order-items.js';
import notificationsRouter from './routes/notifications.js';
import workflowsRouter from './routes/workflows.js';
import orderProductsRouter from './routes/order-products.js';
import { transactionsRouter } from './routes/transactions.js';
import { requestsRouter } from './routes/requests.js';
import productTypesRouter from './routes/product-types.js';
import productChatsRouter from './routes/product-chats.js';
import { upsellTicketsRouter } from './routes/upsell-tickets.js';
import webhooksRouter from './routes/webhooks.js';
import n8nRouter from './routes/n8n.js';
import leaveRequestsRouter from './routes/leave-requests.js';
import branchesRouter from './routes/branches.js';
import jobTitlesRouter from './routes/job-titles.js';
import { workSchedulesRouter } from './routes/work-schedules.js';
import { timesheetsRouter } from './routes/timesheets.js';
import { employeeViewPermissionsRouter } from './routes/employee-view-permissions.js';
import { cronRouter } from './routes/cron.js';
import { payrollBatchesRouter } from './routes/payroll-batches.js';
import { salaryAdvancesRouter } from './routes/salary-advances.js';
import { violationsRouter } from './routes/violations.js';
import { salaryConfigsRouter } from './routes/salary-configs.js';
import { commissionTablesRouter } from './routes/commission-tables.js';
import { checkAllSLA } from './utils/slaManager.js';

dotenv.config();

const app = express();

// Disable ETag globally to ensure fresh data during debugging
app.set('etag', false);

// Middleware
app.use(helmet());
app.use(cors({
    origin: config.cors.origin,
    credentials: true,
}));
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        environment: config.nodeEnv,
    });
});

// Root route for Render health check
app.get('/', (req, res) => {
    res.json({
        status: 'online',
        message: 'CRM API is running',
        timestamp: new Date().toISOString()
    });
});


// API Routes
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/leads', leadsRouter);
app.use('/api/customers', customersRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/invoices', invoicesRouter);
app.use('/api/products', productsRouter);
app.use('/api/services', servicesRouter);
app.use('/api/packages', packagesRouter);
app.use('/api/vouchers', vouchersRouter);
app.use('/api/finance', financeRouter);
app.use('/api/kpi', kpiRouter);
app.use('/api/salary', salaryRouter);
app.use('/api/salary-configs', salaryConfigsRouter);
app.use('/api/commission-tables', commissionTablesRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/interactions', interactionsRouter);
app.use('/api/technician-tasks', technicianTasksRouter);
app.use('/api/departments', departmentsRouter);
app.use('/api/commissions', commissionsRouter);
app.use('/api/order-items', orderItemsRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/workflows', workflowsRouter);
app.use('/api/order-products', orderProductsRouter);
app.use('/api/transactions', transactionsRouter);
app.use('/api/requests', (req, res, next) => {
    console.log('📡 Request hitting /api/requests:', req.method, req.path);
    next();
}, requestsRouter);
app.use('/api/product-chats', productChatsRouter);
app.use('/api/product-types', productTypesRouter);
app.use('/api/upsell-tickets', upsellTicketsRouter);
app.use('/api/webhooks', webhooksRouter);
app.use('/api/n8n', n8nRouter);
app.use('/api/leave-requests', leaveRequestsRouter);
app.use('/api/branches', branchesRouter);
app.use('/api/job-titles', jobTitlesRouter);
app.use('/api/work-schedules', workSchedulesRouter);
app.use('/api/timesheets', timesheetsRouter);
app.use('/api/employee-view-permissions', employeeViewPermissionsRouter);
app.use('/api/cron', cronRouter);
app.use('/api/payroll-batches', payrollBatchesRouter);
app.use('/api/salary-advances', salaryAdvancesRouter);
app.use('/api/violations', violationsRouter);

// Error handling
app.use(errorHandler);

// Start server
const port = config.port;
const host = '0.0.0.0';

app.listen(port, host, () => {
    console.log(`🚀 Server running on http://${host}:${port}`);
    console.log(`📊 Environment: ${config.nodeEnv}`);
    console.log(`🕒 Last Reload: ${new Date().toLocaleString()}`);
    
    // Start SLA Manager
    console.log(`⏱️ Starting SLA Manager cron job`);
    setInterval(checkAllSLA, 60000); // Check every minute
});

export default app;
// End of File - Force Reload (Re-triggering)
