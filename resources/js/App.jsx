import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import LoadingSpinner from './components/ui/LoadingSpinner';
import { ModuleGate } from './components/ModuleGate';
import { UpgradePrompt } from './components/UpgradePrompt';

// Layouts
const DashboardLayout = lazy(() => import('./layouts/DashboardLayout'));
const CustomerLayout = lazy(() => import('./layouts/CustomerLayout'));

// Auth Pages
const LoginPage = lazy(() => import('./pages/auth/LoginPage'));
const RegisterPage = lazy(() => import('./pages/auth/RegisterPage'));
const OtpVerificationPage = lazy(() => import('./pages/auth/OtpVerificationPage'));

// Dashboard Pages
const DashboardPage = lazy(() => import('./pages/dashboard/DashboardPage'));
const MenuItemsPage = lazy(() => import('./pages/dashboard/MenuItemsPage'));
const CategoriesPage = lazy(() => import('./pages/dashboard/CategoriesPage'));
const TablesPage = lazy(() => import('./pages/dashboard/TablesPage'));
const OrdersPage = lazy(() => import('./pages/dashboard/OrdersPage'));
const VouchersPage = lazy(() => import('./pages/dashboard/VouchersPage'));
const ReportsPage = lazy(() => import('./pages/dashboard/ReportsPage'));
const SettlementsPage = lazy(() => import('./pages/dashboard/SettlementsPage'));
const UsersPage = lazy(() => import('./pages/dashboard/UsersPage'));
const SettingsPage = lazy(() => import('./pages/dashboard/SettingsPage'));
const SubscriptionRenewPage = lazy(() => import('./pages/dashboard/SubscriptionRenewPage'));

// POS
const POSPage = lazy(() => import('./pages/dashboard/POSPage'));

// Kitchen
const KitchenDisplayPage = lazy(() => import('./pages/kitchen/KitchenDisplayPage'));

// Customer
const CustomerMenuPage = lazy(() => import('./pages/customer/CustomerMenuPage'));
const CustomerCartPage = lazy(() => import('./pages/customer/CustomerCartPage'));
const OrderTrackingPage = lazy(() => import('./pages/customer/OrderTrackingPage'));

// Landing
const LandingPage = lazy(() => import('./pages/LandingPage'));

// Admin
const TenantsPage = lazy(() => import('./pages/admin/TenantsPage'));
const SubscriptionsPage = lazy(() => import('./pages/admin/SubscriptionsPage'));
const AdminSettingsPage = lazy(() => import('./pages/admin/AdminSettingsPage'));
const AdminDashboardPage = lazy(() => import('./pages/admin/AdminDashboardPage'));
const AdminTenantDetailPage = lazy(() => import('./pages/admin/AdminTenantDetailPage'));
const AdminPlansPage = lazy(() => import('./pages/admin/AdminPlansPage'));
const AdminTenantApplicationsPage = lazy(() => import('./pages/admin/AdminTenantApplicationsPage'));
const AdminAnnouncementsPage = lazy(() => import('./pages/admin/AdminAnnouncementsPage'));
const AdminSystemPage = lazy(() => import('./pages/admin/AdminSystemPage'));
const AdminAuditLogPage = lazy(() => import('./pages/admin/AdminAuditLogPage'));
const AdminEnquiriesPage = lazy(() => import('./pages/admin/AdminEnquiriesPage'));
const AdminFinancialPage = lazy(() => import('./pages/admin/AdminFinancialPage'));

function getDefaultDashboardPath(role) {
    if (role === 'super_admin') return '/dashboard/admin';
    if (role === 'kitchen') return '/kitchen';
    return '/dashboard';
}

function DashboardIndexRoute() {
    const { user } = useAuthStore();

    if (user?.role === 'super_admin') {
        return <Navigate to="/dashboard/admin" replace />;
    }

    return <DashboardPage />;
}

function ProtectedRoute({ children, roles }) {
    const { user, token } = useAuthStore();

    if (!token || !user) {
        return <Navigate to="/login" replace />;
    }

    if (roles && !roles.includes(user.role)) {
        return <Navigate to={getDefaultDashboardPath(user.role)} replace />;
    }

    return children;
}

export default function App() {
    return (
        <Suspense fallback={<LoadingSpinner fullScreen />}>
            <Routes>
                {/* Auth Routes */}
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
                <Route path="/verify-email" element={<OtpVerificationPage />} />

                {/* Dashboard Routes */}
                <Route
                    path="/dashboard"
                    element={
                        <ProtectedRoute>
                            <DashboardLayout />
                        </ProtectedRoute>
                    }
                >
                    <Route index element={<DashboardIndexRoute />} />
                    <Route path="menu" element={<MenuItemsPage />} />
                    <Route path="categories" element={<CategoriesPage />} />
                    <Route path="tables" element={<TablesPage />} />
                    <Route path="orders" element={<OrdersPage />} />
                    <Route
                        path="vouchers"
                        element={
                            <ModuleGate module="voucher_system" fallback={<UpgradePrompt module="voucher_system" />} loading={<LoadingSpinner />}>
                                <VouchersPage />
                            </ModuleGate>
                        }
                    />
                    <Route
                        path="reports"
                        element={
                            <ModuleGate module="reports_analytics" fallback={<UpgradePrompt module="reports_analytics" />} loading={<LoadingSpinner />}>
                                <ReportsPage />
                            </ModuleGate>
                        }
                    />
                    <Route
                        path="settlements"
                        element={
                            <ModuleGate module="settlement_management" fallback={<UpgradePrompt module="settlement_management" />} loading={<LoadingSpinner />}>
                                <SettlementsPage />
                            </ModuleGate>
                        }
                    />
                    <Route
                        path="users"
                        element={
                            <ModuleGate module="user_management" fallback={<UpgradePrompt module="user_management" />} loading={<LoadingSpinner />}>
                                <UsersPage />
                            </ModuleGate>
                        }
                    />
                    <Route path="settings" element={<SettingsPage />} />
                    <Route path="subscription/renew" element={<SubscriptionRenewPage />} />
                    <Route path="pos" element={
                        <ProtectedRoute roles={['restaurant_admin', 'staff']}>
                            <ModuleGate module="pos" fallback={<UpgradePrompt module="pos" />} loading={<LoadingSpinner />}>
                                <POSPage />
                            </ModuleGate>
                        </ProtectedRoute>
                    } />
                    {/* Admin routes */}
                    <Route path="admin" element={
                        <ProtectedRoute roles={['super_admin']}>
                            <AdminDashboardPage />
                        </ProtectedRoute>
                    } />
                    <Route path="admin/tenants" element={
                        <ProtectedRoute roles={['super_admin']}>
                            <TenantsPage />
                        </ProtectedRoute>
                    } />
                    <Route path="admin/applications" element={
                        <ProtectedRoute roles={['super_admin']}>
                            <AdminTenantApplicationsPage />
                        </ProtectedRoute>
                    } />
                    <Route path="admin/tenants/:id" element={
                        <ProtectedRoute roles={['super_admin']}>
                            <AdminTenantDetailPage />
                        </ProtectedRoute>
                    } />
                    <Route path="admin/subscriptions" element={
                        <ProtectedRoute roles={['super_admin']}>
                            <SubscriptionsPage />
                        </ProtectedRoute>
                    } />
                    <Route path="admin/plans" element={
                        <ProtectedRoute roles={['super_admin']}>
                            <AdminPlansPage />
                        </ProtectedRoute>
                    } />
                    <Route path="admin/announcements" element={
                        <ProtectedRoute roles={['super_admin']}>
                            <AdminAnnouncementsPage />
                        </ProtectedRoute>
                    } />
                    <Route path="admin/enquiries" element={
                        <ProtectedRoute roles={['super_admin']}>
                            <AdminEnquiriesPage />
                        </ProtectedRoute>
                    } />
                    <Route path="admin/financials" element={
                        <ProtectedRoute roles={['super_admin']}>
                            <AdminFinancialPage />
                        </ProtectedRoute>
                    } />
                    <Route path="admin/system" element={
                        <ProtectedRoute roles={['super_admin']}>
                            <AdminSystemPage />
                        </ProtectedRoute>
                    } />
                    <Route path="admin/audit-logs" element={
                        <ProtectedRoute roles={['super_admin']}>
                            <AdminAuditLogPage />
                        </ProtectedRoute>
                    } />
                    <Route path="admin/settings" element={
                        <ProtectedRoute roles={['super_admin']}>
                            <AdminSettingsPage />
                        </ProtectedRoute>
                    } />
                </Route>

                {/* Kitchen Display */}
                <Route
                    path="/kitchen"
                    element={
                        <ProtectedRoute roles={['kitchen', 'restaurant_admin', 'super_admin']}>
                            <ModuleGate module="kitchen_display" fallback={<UpgradePrompt module="kitchen_display" />} loading={<LoadingSpinner />}>
                                <KitchenDisplayPage />
                            </ModuleGate>
                        </ProtectedRoute>
                    }
                />

                {/* Customer Routes (public, no auth) */}
                <Route path="/restaurant/:slug" element={<CustomerLayout />}>
                    <Route index element={<CustomerMenuPage />} />
                    <Route path="cart" element={<CustomerCartPage />} />
                </Route>
                <Route path="/order/:orderNumber" element={<OrderTrackingPage />} />

                {/* Landing Page */}
                <Route path="/" element={<LandingPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </Suspense>
    );
}
