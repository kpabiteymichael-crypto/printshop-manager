import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import Layout from './components/Layout';

import Login from './pages/Login';

const Dashboard     = lazy(() => import('./pages/Dashboard'));
const POS           = lazy(() => import('./pages/POS'));
const PrintJobs     = lazy(() => import('./pages/PrintJobs'));
const Inventory     = lazy(() => import('./pages/Inventory'));
const Bookstore     = lazy(() => import('./pages/Bookstore'));
const Customers     = lazy(() => import('./pages/Customers'));
const Suppliers     = lazy(() => import('./pages/Suppliers'));
const Cash          = lazy(() => import('./pages/Cash'));
const Expenses      = lazy(() => import('./pages/Expenses'));
const Reports       = lazy(() => import('./pages/Reports'));
const Staff         = lazy(() => import('./pages/Staff'));
const Settings      = lazy(() => import('./pages/Settings'));
const Debts         = lazy(() => import('./pages/Debts'));
const Receipts      = lazy(() => import('./pages/Receipts'));
const SalesHistory  = lazy(() => import('./pages/SalesHistory'));
const Quotations    = lazy(() => import('./pages/Quotations'));
const Invoices        = lazy(() => import('./pages/Invoices'));
const PurchaseOrders  = lazy(() => import('./pages/PurchaseOrders'));

function PageLoader() {
  return (
    <div className="flex-1 flex items-center justify-center min-h-96">
      <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function ProtectedRoute({ children, roles, module }: { children: React.ReactNode; roles?: string[]; module?: string }) {
  const { user, loading, activeOverrides } = useAuth();
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-slate-500 dark:text-slate-400 font-medium">Loading PrintShop Manager...</p>
      </div>
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  if (roles) {
    const hasRole = roles.includes(user.role);
    const hasOverride = module ? activeOverrides.includes(module) : false;
    if (!hasRole && !hasOverride) return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

function HomeRedirect() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'cashier') return <Navigate to="/pos" replace />;
  if (user.role === 'print_operator') return <Navigate to="/print-jobs" replace />;
  if (user.role === 'inventory_officer') return <Navigate to="/inventory" replace />;
  return <Navigate to="/dashboard" replace />;
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/login" element={<Login />} />

              <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
                <Route index element={<HomeRedirect />} />

                <Route path="dashboard" element={
                  <ProtectedRoute roles={['owner', 'manager']} module="dashboard">
                    <Suspense fallback={<PageLoader />}><Dashboard /></Suspense>
                  </ProtectedRoute>
                } />

                <Route path="pos" element={
                  <ProtectedRoute roles={['owner', 'manager', 'cashier']} module="pos">
                    <Suspense fallback={<PageLoader />}><POS /></Suspense>
                  </ProtectedRoute>
                } />

                <Route path="print-jobs" element={
                  <ProtectedRoute roles={['owner', 'manager', 'print_operator', 'cashier']} module="print-jobs">
                    <Suspense fallback={<PageLoader />}><PrintJobs /></Suspense>
                  </ProtectedRoute>
                } />

                <Route path="inventory" element={
                  <ProtectedRoute roles={['owner', 'manager', 'inventory_officer']} module="inventory">
                    <Suspense fallback={<PageLoader />}><Inventory /></Suspense>
                  </ProtectedRoute>
                } />

                <Route path="bookstore" element={
                  <ProtectedRoute roles={['owner', 'manager', 'inventory_officer', 'cashier']} module="bookstore">
                    <Suspense fallback={<PageLoader />}><Bookstore /></Suspense>
                  </ProtectedRoute>
                } />

                <Route path="customers" element={
                  <ProtectedRoute roles={['owner', 'manager', 'cashier']} module="customers">
                    <Suspense fallback={<PageLoader />}><Customers /></Suspense>
                  </ProtectedRoute>
                } />

                <Route path="suppliers" element={
                  <ProtectedRoute roles={['owner', 'manager', 'inventory_officer']} module="suppliers">
                    <Suspense fallback={<PageLoader />}><Suppliers /></Suspense>
                  </ProtectedRoute>
                } />

                <Route path="purchase-orders" element={
                  <ProtectedRoute roles={['owner', 'manager', 'inventory_officer']} module="purchase-orders">
                    <Suspense fallback={<PageLoader />}><PurchaseOrders /></Suspense>
                  </ProtectedRoute>
                } />

                <Route path="cash" element={
                  <ProtectedRoute roles={['owner', 'manager', 'cashier']} module="cash">
                    <Suspense fallback={<PageLoader />}><Cash /></Suspense>
                  </ProtectedRoute>
                } />

                <Route path="expenses" element={
                  <ProtectedRoute roles={['owner', 'manager', 'cashier']} module="expenses">
                    <Suspense fallback={<PageLoader />}><Expenses /></Suspense>
                  </ProtectedRoute>
                } />

                <Route path="debts" element={
                  <ProtectedRoute roles={['owner', 'manager', 'cashier']} module="debts">
                    <Suspense fallback={<PageLoader />}><Debts /></Suspense>
                  </ProtectedRoute>
                } />

                <Route path="reports" element={
                  <ProtectedRoute roles={['owner', 'manager']} module="reports">
                    <Suspense fallback={<PageLoader />}><Reports /></Suspense>
                  </ProtectedRoute>
                } />

                <Route path="receipts" element={
                  <ProtectedRoute roles={['owner', 'manager', 'cashier']} module="receipts">
                    <Suspense fallback={<PageLoader />}><Receipts /></Suspense>
                  </ProtectedRoute>
                } />

                <Route path="sales" element={
                  <ProtectedRoute roles={['owner', 'manager', 'cashier']} module="sales">
                    <Suspense fallback={<PageLoader />}><SalesHistory /></Suspense>
                  </ProtectedRoute>
                } />

                <Route path="quotations" element={
                  <ProtectedRoute roles={['owner', 'manager', 'cashier']} module="quotations">
                    <Suspense fallback={<PageLoader />}><Quotations /></Suspense>
                  </ProtectedRoute>
                } />

                <Route path="invoices" element={
                  <ProtectedRoute roles={['owner', 'manager', 'cashier']} module="invoices">
                    <Suspense fallback={<PageLoader />}><Invoices /></Suspense>
                  </ProtectedRoute>
                } />

                <Route path="staff" element={
                  <ProtectedRoute roles={['owner', 'manager']} module="staff">
                    <Suspense fallback={<PageLoader />}><Staff /></Suspense>
                  </ProtectedRoute>
                } />

                <Route path="settings" element={
                  <ProtectedRoute roles={['owner', 'manager']} module="settings">
                    <Suspense fallback={<PageLoader />}><Settings /></Suspense>
                  </ProtectedRoute>
                } />
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
