import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Header } from '@/components/layout/Header';
import { Sidebar } from '@/components/layout/Sidebar';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { LeadsPage } from '@/pages/LeadsPage';
import { LeadDetailPage } from '@/pages/LeadDetailPage';
import { OrdersPage } from '@/pages/OrdersPage';
import { OrderDetailPage } from '@/pages/OrderDetailPage';
import { InvoicesPage } from '@/pages/InvoicesPage';
import { FinancePage } from '@/pages/FinancePage';
import { ProductsPage } from '@/pages/ProductsPage';
import { EmployeesPage } from '@/pages/EmployeesPage';
import { EmployeeDepartmentsPage } from '@/pages/EmployeeDepartmentsPage';
import { EmployeeDetailPage } from '@/pages/EmployeeDetailPage';
import { KPIPage } from '@/pages/KPIPage';
import { SalaryPage } from '@/pages/SalaryPage';
import { PayrollDetailPage } from '@/pages/PayrollDetailPage';
import { CustomersPage } from '@/pages/CustomersPage';
import { CustomerDetailPage } from '@/pages/CustomerDetailPage';
import { InteractionsPage } from '@/pages/InteractionsPage';
import { ReportsPage } from '@/pages/ReportsPage';
import { TechnicianPage } from '@/pages/TechnicianPage';
import { TaskQRPage } from '@/pages/TaskQRPage';
import { QRScannerPage } from '@/pages/QRScannerPage';
import { DepartmentsPage } from '@/pages/DepartmentsPage';
import { ProductDetailPage } from '@/pages/ProductDetailPage';
import { WorkflowsPage } from '@/pages/WorkflowsPage';
import { CreateWorkflowPage } from '@/pages/CreateWorkflowPage';
import { WorkflowKanbanBoardPage } from '@/pages/WorkflowKanbanBoardPage';
import { CreateServicePage } from '@/pages/CreateServicePage';
import { ProductQRPage } from '@/pages/ProductQRPage';
import { CreateOrderPage } from '@/pages/CreateOrderPage';
import { RequestsPage } from '@/pages/RequestsPage';
import { CreateLeadPage } from '@/pages/CreateLeadPage';
import { CreatePackagePage } from '@/pages/CreatePackagePage';
import { CreateProductPage } from '@/pages/CreateProductPage';
import { UpsellManagementPage } from '@/pages/UpsellManagementPage';
import { LeaveRequestsPage } from '@/pages/LeaveRequestsPage';
import { AttendanceMobilePage } from '@/pages/AttendanceMobilePage';
import { WorkSchedulePage } from '@/pages/WorkSchedulePage';
import { TimesheetsPage } from '@/pages/TimesheetsPage';
import { CommissionsPage } from '@/pages/CommissionsPage';
import { EmployeeSettingsPage } from '@/pages/EmployeeSettingsPage';
import { SalaryAdvancesPage } from '@/pages/SalaryAdvancesPage';
import { ViolationsPage } from '@/pages/ViolationsPage';
import { TrainingPage } from '@/pages/TrainingPage';
import { RecruitmentPage } from '@/pages/RecruitmentPage';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import type { UserRole, User } from '@/types';
import { Toaster } from 'sonner';
import { canAccessView, getDefaultHomePath, resolveViewKeyFromPath } from '@/lib/viewPermissions';


// Permission configuration
const pagePermissions: Record<string, UserRole[]> = {
  dashboard: ['admin', 'manager', 'accountant', 'sale', 'technician'],
  leads: ['admin', 'manager', 'sale'],
  customers: ['admin', 'manager', 'sale'],
  interactions: ['admin', 'manager', 'sale'],
  orders: ['admin', 'manager', 'accountant', 'sale', 'technician'],
  invoices: ['admin', 'manager', 'accountant', 'sale'],
  income: ['admin', 'manager', 'accountant', 'sale'],
  expense: ['admin', 'manager', 'accountant', 'sale'],
  adjustment: ['admin', 'manager', 'accountant'],
  'product-list': ['admin', 'manager', 'accountant', 'sale', 'technician'],
  services: ['admin', 'manager', 'accountant', 'sale', 'technician'],
  packages: ['admin', 'manager', 'accountant', 'sale', 'technician'],
  vouchers: ['admin', 'manager', 'accountant', 'sale', 'technician'],
  'product-types': ['admin', 'manager', 'accountant', 'sale', 'technician'],
  products: ['admin', 'manager', 'accountant', 'sale', 'technician'],
  tasks: ['admin', 'manager', 'technician'],
  departments: ['admin', 'manager'],
  workflows: ['admin', 'manager'],
  'workflow-board': ['admin', 'manager', 'sale', 'technician'],
  accessories: ['admin', 'manager', 'technician'],
  extension: ['admin', 'manager', 'technician'],
  upgrade: ['admin', 'manager', 'technician'],
  employees: ['admin', 'manager'],
  kpi: ['admin', 'manager'],
  salary: ['admin', 'manager', 'accountant'],
  reports: ['admin', 'manager', 'accountant'],
  'upsell-management': ['admin', 'manager'],
  requests: ['admin', 'manager', 'sale', 'technician'],
  settings: ['admin', 'manager'],
  'leave-requests': ['admin', 'manager', 'accountant', 'sale', 'technician'],
  'attendance-mobile': ['admin', 'manager', 'accountant', 'sale', 'technician'],
  'work-schedule': ['admin', 'manager', 'accountant', 'sale', 'technician'],
  timesheets: ['admin', 'manager', 'accountant'],
  commissions: ['admin', 'manager', 'accountant'],
  'employee-settings': ['admin', 'manager'],
  'salary-advances': ['admin', 'manager', 'accountant'],
  violations: ['admin', 'manager', 'accountant'],
  training: ['admin', 'manager', 'accountant', 'sale', 'technician'],
  recruitment: ['admin', 'manager', 'accountant'],
};

// Protected Route Component
function ProtectedRoute({ children, allowedRoles, managerOnly }: { children: React.ReactNode; allowedRoles?: UserRole[]; managerOnly?: boolean }) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="h-12 w-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">Đang tải...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (managerOnly && user && user.role !== 'admin' && user.role !== 'manager') {
    return <Navigate to="/requests" replace />;
  }

  const viewId = resolveViewKeyFromPath(location.pathname);
  const roleAllowed = !allowedRoles || !user || allowedRoles.includes(user.role);
  const viewAllowed = !viewId || !user || canAccessView(user, viewId, roleAllowed);

  if (!viewAllowed) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <div className="h-20 w-20 rounded-2xl bg-red-100 flex items-center justify-center mb-4">
          <span className="text-4xl">🔒</span>
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-2">Không có quyền truy cập</h2>
        <p className="text-muted-foreground max-w-md">
          Bạn không có quyền truy cập trang này. Vui lòng liên hệ quản trị viên hoặc đăng nhập lại sau khi được cấp quyền.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}

function DefaultHomeRedirect() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={getDefaultHomePath(user)} replace />;
}

// Wrapper for ProductsPage with routing
function ProductsPageWrapper({ initialTab }: { initialTab: 'products' | 'services' | 'packages' | 'vouchers' | 'product-types' }) {
  const navigate = useNavigate();

  const handleTabChange = (tab: string) => {
    navigate(`/${tab}`);
  };

  return <ProductsPage initialTab={initialTab} onTabChange={handleTabChange} />;
}

// Wrapper for FinancePage with routing
function FinancePageWrapper({ initialTab }: { initialTab: 'income' | 'expense' }) {
  const navigate = useNavigate();

  const handleTabChange = (tab: string) => {
    navigate(`/${tab}`);
  };

  return (
    <WithCurrentUser>
      {(user) => <FinancePage currentUser={user} initialTab={initialTab} onTabChange={handleTabChange} />}
    </WithCurrentUser>
  );
}

// Wrapper to inject currentUser from context
function WithCurrentUser({ children }: { children: (user: User) => React.ReactNode }) {
  const { user } = useAuth();
  if (!user) return null;
  return <>{children(user)}</>;
}

// Layout wrapper for authenticated pages
function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 1024);
      if (window.innerWidth >= 1024) {
        setSidebarOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  if (!user) return null;

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <Sidebar
        isMobile={isMobile}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        currentUser={user}
        onLogout={handleLogout}
      />

      {/* Main Content */}
      <div className="flex min-w-0 flex-1 flex-col min-h-screen lg:ml-64">
        <Header
          currentUser={user}
          onLogout={handleLogout}
          isMobile={isMobile}
          onMenuToggle={() => setSidebarOpen(prev => !prev)}
        />
        <main className="mt-16 min-w-0 max-w-full flex-1 overflow-x-hidden p-4 md:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}

function AppContent() {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  // Show loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="h-12 w-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">Đang tải...</p>
        </div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated && location.pathname !== '/login') {
    return <Navigate to="/login" replace />;
  }

  // Redirect to dashboard if authenticated and on login page
  if (isAuthenticated && location.pathname === '/login') {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <Routes>
      {/* Public Route */}
      <Route path="/login" element={<LoginPage />} />

      {/* QR Code Route - Accessible by technicians */}
      <Route path="/task/:code" element={
        <ProtectedRoute allowedRoles={['admin', 'manager', 'technician']}>
          <TaskQRPage />
        </ProtectedRoute>
      } />

      {/* Product QR Code Route - For customer products */}
      <Route path="/product/:code" element={
        <ProtectedRoute allowedRoles={['admin', 'manager', 'technician', 'sale']}>
          <ProductQRPage />
        </ProtectedRoute>
      } />

      {/* QR Scanner Route */}
      <Route path="/scan" element={
        <ProtectedRoute allowedRoles={['admin', 'manager', 'technician']}>
          <QRScannerPage />
        </ProtectedRoute>
      } />

      {/* Product/Service/Package Detail Route - Accessible via QR scan */}
      <Route path="/item/:type/:id" element={
        <ProtectedRoute allowedRoles={['admin', 'manager', 'technician', 'sale', 'accountant']}>
          <ProductDetailPage />
        </ProtectedRoute>
      } />

      {/* Protected Routes - All wrapped in AppLayout */}
      <Route path="/*" element={
        <AppLayout>
          <Routes>
            <Route path="/dashboard" element={
              <ProtectedRoute allowedRoles={pagePermissions.dashboard}>
                <WithCurrentUser>
                  {(user) => <DashboardPage currentUser={user} />}
                </WithCurrentUser>
              </ProtectedRoute>
            } />

            <Route path="/leads" element={
              <ProtectedRoute allowedRoles={pagePermissions.leads}>
                <LeadsPage />
              </ProtectedRoute>
            } />

            <Route path="/leads/new" element={
              <ProtectedRoute allowedRoles={pagePermissions.leads}>
                <CreateLeadPage />
              </ProtectedRoute>
            } />

            <Route path="/leads/:id" element={
              <ProtectedRoute allowedRoles={pagePermissions.leads}>
                <LeadDetailPage />
              </ProtectedRoute>
            } />

            <Route path="/customers" element={
              <ProtectedRoute allowedRoles={pagePermissions.customers}>
                <CustomersPage />
              </ProtectedRoute>
            } />

            <Route path="/customers/:id" element={
              <ProtectedRoute allowedRoles={pagePermissions.customers}>
                <CustomerDetailPage />
              </ProtectedRoute>
            } />

            <Route path="/interactions" element={
              <ProtectedRoute allowedRoles={pagePermissions.interactions}>
                <InteractionsPage />
              </ProtectedRoute>
            } />

            <Route path="/orders" element={
              <ProtectedRoute allowedRoles={pagePermissions.orders}>
                <OrdersPage />
              </ProtectedRoute>
            } />

            <Route path="/orders/upsell-tickets" element={
              <ProtectedRoute allowedRoles={pagePermissions['upsell-management']} managerOnly>
                <UpsellManagementPage />
              </ProtectedRoute>
            } />

            <Route path="/orders/new" element={
              <ProtectedRoute allowedRoles={pagePermissions.orders}>
                <CreateOrderPage />
              </ProtectedRoute>
            } />

            <Route path="/orders/:id/edit" element={
              <ProtectedRoute allowedRoles={pagePermissions.orders}>
                <CreateOrderPage />
              </ProtectedRoute>
            } />

            <Route path="/orders/:id" element={
              <ProtectedRoute allowedRoles={pagePermissions.orders}>
                <OrderDetailPage />
              </ProtectedRoute>
            } />

            <Route path="/requests" element={
              <ProtectedRoute allowedRoles={pagePermissions.requests}>
                <RequestsPage />
              </ProtectedRoute>
            } />

            <Route path="/work-schedule" element={
              <ProtectedRoute allowedRoles={pagePermissions['work-schedule']}>
                <WorkSchedulePage />
              </ProtectedRoute>
            } />

            <Route path="/commissions" element={
              <ProtectedRoute allowedRoles={pagePermissions.commissions}>
                <CommissionsPage />
              </ProtectedRoute>
            } />

            <Route path="/timesheets" element={
              <ProtectedRoute allowedRoles={pagePermissions.timesheets}>
                <TimesheetsPage />
              </ProtectedRoute>
            } />

            <Route path="/leave-requests" element={
              <ProtectedRoute allowedRoles={pagePermissions['leave-requests']}>
                <LeaveRequestsPage />
              </ProtectedRoute>
            } />

            <Route path="/attendance-mobile" element={
              <ProtectedRoute allowedRoles={pagePermissions['attendance-mobile']}>
                <AttendanceMobilePage />
              </ProtectedRoute>
            } />

            <Route path="/invoices" element={
              <ProtectedRoute allowedRoles={pagePermissions.invoices}>
                <WithCurrentUser>
                  {(user) => <InvoicesPage currentUser={user} />}
                </WithCurrentUser>
              </ProtectedRoute>
            } />

            <Route path="/income" element={
              <ProtectedRoute allowedRoles={pagePermissions.income}>
                <FinancePageWrapper initialTab="income" />
              </ProtectedRoute>
            } />

            <Route path="/expense" element={
              <ProtectedRoute allowedRoles={pagePermissions.expense}>
                <FinancePageWrapper initialTab="expense" />
              </ProtectedRoute>
            } />

            <Route path="/product-list" element={
              <ProtectedRoute allowedRoles={pagePermissions['product-list']}>
                <ProductsPageWrapper initialTab="products" />
              </ProtectedRoute>
            } />

            <Route path="/services" element={
              <ProtectedRoute allowedRoles={pagePermissions.services}>
                <ProductsPageWrapper initialTab="services" />
              </ProtectedRoute>
            } />

            <Route path="/packages" element={
              <ProtectedRoute allowedRoles={pagePermissions.packages}>
                <ProductsPageWrapper initialTab="packages" />
              </ProtectedRoute>
            } />

            <Route path="/packages/new" element={
              <ProtectedRoute allowedRoles={pagePermissions.packages}>
                <CreatePackagePage />
              </ProtectedRoute>
            } />

            <Route path="/packages/:id/edit" element={
              <ProtectedRoute allowedRoles={pagePermissions.packages}>
                <CreatePackagePage />
              </ProtectedRoute>
            } />

            <Route path="/vouchers" element={
              <ProtectedRoute allowedRoles={pagePermissions.vouchers}>
                <ProductsPageWrapper initialTab="vouchers" />
              </ProtectedRoute>
            } />

            <Route path="/product-types" element={
              <ProtectedRoute allowedRoles={pagePermissions['product-types']}>
                <ProductsPageWrapper initialTab="product-types" />
              </ProtectedRoute>
            } />

            <Route path="/leave-requests" element={
              <ProtectedRoute allowedRoles={pagePermissions['leave-requests']}>
                <LeaveRequestsPage />
              </ProtectedRoute>
            } />

            <Route path="/work-schedule" element={
              <ProtectedRoute allowedRoles={pagePermissions['work-schedule']}>
                <WorkSchedulePage />
              </ProtectedRoute>
            } />

            <Route path="/timesheets" element={
              <ProtectedRoute allowedRoles={pagePermissions.timesheets}>
                <TimesheetsPage />
              </ProtectedRoute>
            } />

            <Route path="/commissions" element={
              <ProtectedRoute allowedRoles={pagePermissions.commissions}>
                <CommissionsPage />
              </ProtectedRoute>
            } />

            <Route path="/employees" element={
              <ProtectedRoute allowedRoles={pagePermissions.employees}>
                <EmployeesPage />
              </ProtectedRoute>
            } />

            <Route path="/employees/departments" element={
              <ProtectedRoute allowedRoles={pagePermissions.departments}>
                <EmployeeDepartmentsPage />
              </ProtectedRoute>
            } />

            <Route path="/employees/:id" element={
              <ProtectedRoute allowedRoles={pagePermissions.employees}>
                <EmployeeDetailPage />
              </ProtectedRoute>
            } />

            <Route path="/employee-settings" element={
              <ProtectedRoute allowedRoles={pagePermissions['employee-settings']}>
                <EmployeeSettingsPage />
              </ProtectedRoute>
            } />

            <Route path="/training" element={
              <ProtectedRoute allowedRoles={pagePermissions.training}>
                <TrainingPage />
              </ProtectedRoute>
            } />

            <Route path="/recruitment" element={
              <ProtectedRoute allowedRoles={pagePermissions.recruitment}>
                <RecruitmentPage />
              </ProtectedRoute>
            } />

            <Route path="/salary-advances" element={
              <ProtectedRoute allowedRoles={pagePermissions['salary-advances']}>
                <SalaryAdvancesPage />
              </ProtectedRoute>
            } />

            <Route path="/violations" element={
              <ProtectedRoute allowedRoles={pagePermissions.violations}>
                <ViolationsPage />
              </ProtectedRoute>
            } />

            <Route path="/kpi" element={
              <ProtectedRoute allowedRoles={pagePermissions.kpi}>
                <KPIPage />
              </ProtectedRoute>
            } />

            <Route path="/salary" element={
              <ProtectedRoute allowedRoles={pagePermissions.salary}>
                <SalaryPage />
              </ProtectedRoute>
            } />

            <Route path="/salary/:id" element={
              <ProtectedRoute allowedRoles={pagePermissions.salary}>
                <PayrollDetailPage />
              </ProtectedRoute>
            } />

            <Route path="/reports" element={
              <ProtectedRoute allowedRoles={pagePermissions.reports}>
                <ReportsPage />
              </ProtectedRoute>
            } />

            <Route path="/tasks" element={
              <ProtectedRoute allowedRoles={pagePermissions.tasks}>
                <TechnicianPage />
              </ProtectedRoute>
            } />

            <Route path="/departments" element={
              <ProtectedRoute allowedRoles={pagePermissions.departments}>
                <DepartmentsPage />
              </ProtectedRoute>
            } />

            <Route path="/workflows" element={
              <ProtectedRoute allowedRoles={pagePermissions.workflows}>
                <WorkflowsPage />
              </ProtectedRoute>
            } />

            <Route path="/workflow-board" element={
              <ProtectedRoute allowedRoles={pagePermissions['workflow-board']}>
                <WorkflowKanbanBoardPage />
              </ProtectedRoute>
            } />

            <Route path="/workflows/new" element={
              <ProtectedRoute allowedRoles={pagePermissions.workflows}>
                <CreateWorkflowPage />
              </ProtectedRoute>
            } />

            <Route path="/workflows/:id/edit" element={
              <ProtectedRoute allowedRoles={pagePermissions.workflows}>
                <CreateWorkflowPage />
              </ProtectedRoute>
            } />

            <Route path="/services/new" element={
              <ProtectedRoute allowedRoles={pagePermissions.products}>
                <CreateServicePage />
              </ProtectedRoute>
            } />

            <Route path="/services/:id/edit" element={
              <ProtectedRoute allowedRoles={pagePermissions.products}>
                <CreateServicePage />
              </ProtectedRoute>
            } />

            <Route path="/products/new" element={
              <ProtectedRoute allowedRoles={pagePermissions.products}>
                <CreateProductPage />
              </ProtectedRoute>
            } />

            <Route path="/products/:id/edit" element={
              <ProtectedRoute allowedRoles={pagePermissions.products}>
                <CreateProductPage />
              </ProtectedRoute>
            } />

            {/* <Route path="/settings" element={
              <ProtectedRoute allowedRoles={pagePermissions.settings}>
                <PlaceholderPage title="Cài đặt" />
              </ProtectedRoute>
            } /> */}

            {/* Default redirect */}
            <Route path="/" element={<DefaultHomeRedirect />} />
            <Route path="*" element={<DefaultHomeRedirect />} />
          </Routes>
        </AppLayout>
      } />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="top-right" richColors />
        <AppContent />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
