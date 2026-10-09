import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useBrandingStore } from '../stores/brandingStore';
import { useModuleStore } from '../stores/moduleStore';
import { authAPI, subscriptionAPI } from '../services/api';
import PoweredBy from '../components/ui/PoweredBy';
import AdminAIChat from '../components/ai/AdminAIChat';
import {
    HiOutlineHome,
    HiOutlineClipboardList,
    HiOutlineCollection,
    HiOutlineTag,
    HiOutlineTable,
    HiOutlineShoppingCart,
    HiOutlineChartBar,
    HiOutlineCash,
    HiOutlineUsers,
    HiOutlineCog,
    HiOutlineLogout,
    HiOutlineOfficeBuilding,
    HiOutlineCreditCard,
    HiOutlineMenu,
    HiOutlineX,
    HiOutlineDesktopComputer,
    HiOutlineBell,
    HiOutlineUser,
    HiOutlineChevronDown,
    HiOutlineSpeakerphone,
    HiOutlineServer,
    HiOutlineDocumentText,
    HiOutlineMail,
    HiOutlineTicket,
    HiOutlineClock,
    HiOutlineExclamation,
} from 'react-icons/hi';
import { HiArrowsPointingOut, HiArrowsPointingIn } from 'react-icons/hi2';
import BrandLogo from '../components/ui/BrandLogo';

// Restaurant/Tenant menu items
const tenantMenuItems = [
    { icon: HiOutlineHome, label: 'Dashboard', to: '/dashboard', roles: ['restaurant_admin', 'staff'] },
    { icon: HiOutlineDesktopComputer, label: 'POS Terminal', to: '/dashboard/pos', roles: ['restaurant_admin', 'staff'] },
    { icon: HiOutlineShoppingCart, label: 'Orders', to: '/dashboard/orders', roles: ['restaurant_admin', 'staff'] },
    { icon: HiOutlineClipboardList, label: 'Menu Items', to: '/dashboard/menu', roles: ['restaurant_admin'] },
    { icon: HiOutlineCollection, label: 'Categories', to: '/dashboard/categories', roles: ['restaurant_admin'] },
    { icon: HiOutlineTable, label: 'Tables', to: '/dashboard/tables', roles: ['restaurant_admin', 'staff'] },
    { icon: HiOutlineTag, label: 'Vouchers', to: '/dashboard/vouchers', roles: ['restaurant_admin'] },
    { icon: HiOutlineChartBar, label: 'Reports', to: '/dashboard/reports', roles: ['restaurant_admin'] },
    { icon: HiOutlineCash, label: 'Settlements', to: '/dashboard/settlements', roles: ['restaurant_admin'] },
    { icon: HiOutlineUsers, label: 'Users', to: '/dashboard/users', roles: ['restaurant_admin'] },
    { icon: HiOutlineCog, label: 'Settings', to: '/dashboard/settings', roles: ['restaurant_admin'] },
];

// Super Admin menu items
const superAdminMenuItems = [
    { icon: HiOutlineHome, label: 'Dashboard', to: '/dashboard/admin', roles: ['super_admin'] },
    { icon: HiOutlineClock, label: 'Applications', to: '/dashboard/admin/applications', roles: ['super_admin'] },
    { icon: HiOutlineOfficeBuilding, label: 'Tenants', to: '/dashboard/admin/tenants', roles: ['super_admin'] },
    { icon: HiOutlineUsers, label: 'Users', to: '/dashboard/admin/users', roles: ['super_admin'] },
    { icon: HiOutlineCreditCard, label: 'Subscriptions', to: '/dashboard/admin/subscriptions', roles: ['super_admin'] },
    { icon: HiOutlineTicket, label: 'Plans', to: '/dashboard/admin/plans', roles: ['super_admin'] },
    { icon: HiOutlineCash, label: 'Financials', to: '/dashboard/admin/financials', roles: ['super_admin'] },
    { icon: HiOutlineSpeakerphone, label: 'Announcements', to: '/dashboard/admin/announcements', roles: ['super_admin'] },
    { icon: HiOutlineMail, label: 'Enquiries', to: '/dashboard/admin/enquiries', roles: ['super_admin'] },
    { icon: HiOutlineServer, label: 'System', to: '/dashboard/admin/system', roles: ['super_admin'] },
    { icon: HiOutlineDocumentText, label: 'Audit Logs', to: '/dashboard/admin/audit-logs', roles: ['super_admin'] },
    { icon: HiOutlineCog, label: 'Platform Settings', to: '/dashboard/admin/settings', roles: ['super_admin'] },
];

// Combine based on user role
const getMenuItems = (userRole) => {
    if (userRole === 'super_admin') {
        return superAdminMenuItems;
    }
    return tenantMenuItems.filter(item => item.roles.includes(userRole));
};

const MENU_MODULE_MAP = {
    '/dashboard/pos': 'pos',
    '/dashboard/vouchers': 'voucher_system',
    '/dashboard/reports': 'reports_analytics',
    '/dashboard/settlements': 'settlement_management',
    '/dashboard/users': 'user_management',
};

export default function DashboardLayout() {
    const { user, logout, updateUser, isImpersonating, stopImpersonation } = useAuthStore();
    const hasModule = useModuleStore((s) => s.hasModule);
    const moduleIsLoaded = useModuleStore((s) => s.isLoaded);
    const fetchModules = useModuleStore((s) => s.fetchModules);
    const clearModules = useModuleStore((s) => s.clear);
    const { branding } = useBrandingStore();
    const navigate = useNavigate();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [profileOpen, setProfileOpen] = useState(false);
    const [trialInfo, setTrialInfo] = useState({ isOnTrial: false, daysRemaining: 0, trialEndsAt: null });
    const [notificationsOpen, setNotificationsOpen] = useState(false);
    const [graceInfo, setGraceInfo] = useState({ show: false, daysLeft: 0 });
    const profileRef = useRef(null);
    const notificationsRef = useRef(null);

    const handleLogout = () => {
        // Blacklist the token server-side too; the local session is cleared regardless
        authAPI.logout().catch(() => {});
        logout();
        clearModules();
        navigate('/login');
    };

    const handleStopImpersonation = () => {
        stopImpersonation();
        clearModules();
        navigate('/dashboard/admin/tenants');
    };

    const toggleFullscreen = useCallback(() => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
        } else {
            document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
        }
    }, []);

    // Refresh user + tenant data on mount so VAT settings are always current
    useEffect(() => {
        authAPI.me().then((res) => {
            const data = res.data?.data ?? res.data;
            const userData = data?.user ?? res.data?.user;
            if (userData) updateUser(userData);
            // Store trial info from me() response
            if (data?.is_on_trial) {
                setTrialInfo({
                    isOnTrial: data.is_on_trial,
                    daysRemaining: data.trial_days_remaining ?? 0,
                    trialEndsAt: data.trial_ends_at,
                });
            }
        }).catch(() => {});
    }, []);

    useEffect(() => {
        if (!user || user.role === 'super_admin' || moduleIsLoaded) {
            return;
        }

        fetchModules();
    }, [user, moduleIsLoaded, fetchModules]);

    useEffect(() => {
        const warning = sessionStorage.getItem('subscription_warning');

        if (warning !== 'grace_period' || user?.role === 'super_admin') {
            return;
        }

        subscriptionAPI.current()
            .then((res) => {
                const payload = res.data?.data || {};
                if (payload.status === 'grace' && payload.grace_ends_at) {
                    const days = Math.max(0, Math.ceil((new Date(payload.grace_ends_at) - new Date()) / (1000 * 60 * 60 * 24)));
                    setGraceInfo({ show: true, daysLeft: days });
                }
            })
            .catch(() => {});
    }, [user?.role]);

    // Listen for fullscreen changes (e.g. user presses Esc)
    useEffect(() => {
        const handler = () => setIsFullscreen(!!document.fullscreenElement);
        document.addEventListener('fullscreenchange', handler);
        return () => document.removeEventListener('fullscreenchange', handler);
    }, []);

    // Close dropdowns on outside click
    useEffect(() => {
        const handler = (e) => {
            if (profileRef.current && !profileRef.current.contains(e.target)) {
                setProfileOpen(false);
            }
            if (notificationsRef.current && !notificationsRef.current.contains(e.target)) {
                setNotificationsOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const filteredMenu = getMenuItems(user?.role).filter((item) => {
        if (user?.role === 'super_admin') {
            return true;
        }

        const requiredModule = MENU_MODULE_MAP[item.to];

        if (!requiredModule) {
            return true;
        }

        if (!moduleIsLoaded) {
            return false;
        }

        return hasModule(requiredModule);
    });

    const sidebarWidth = sidebarCollapsed ? 'w-[72px]' : 'w-64';

    const SidebarContent = ({ collapsed = false }) => (
        <>
            {/* Logo */}
            <div className="flex items-center justify-between h-16 px-4 border-b border-gray-200 shrink-0">
                <div className="flex items-center overflow-hidden">
                    {/* An uploaded platform logo is a full wordmark; otherwise (or if it fails to load) show the mark + name */}
                    <BrandLogo
                        src={branding.platform_logo ? `/storage/${branding.platform_logo}` : null}
                        alt={branding.platform_name}
                        className="h-8"
                        fallback={
                            <>
                                <img src="/assets/images/tablepilot-mark.svg" alt={branding.platform_name} className="h-8 w-8" />
                                {!collapsed && branding.platform_name && (
                                    <span className="ml-2 text-sm font-bold text-gray-800 truncate hidden lg:inline">{branding.platform_name}</span>
                                )}
                            </>
                        }
                    />
                </div>
                {/* Close button for mobile overlay */}
                <button onClick={() => setSidebarOpen(false)} className="md:hidden text-gray-400 hover:text-gray-600">
                    <HiOutlineX className="w-5 h-5" />
                </button>
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
                {filteredMenu.map((item) => (
                    <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.to === '/dashboard' || item.to === '/dashboard/admin'}
                        onClick={() => setSidebarOpen(false)}
                        title={collapsed ? item.label : undefined}
                        className={({ isActive }) =>
                            `flex items-center ${collapsed ? 'justify-center px-2' : 'px-3'} py-2.5 text-sm font-medium rounded-lg transition-colors ${
                                isActive
                                    ? 'bg-brand-50 text-brand-800'
                                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                            }`
                        }
                    >
                        <item.icon className="w-5 h-5 shrink-0" />
                        {!collapsed && <span className="ml-3 truncate">{item.label}</span>}
                    </NavLink>
                ))}

                {/* Kitchen Display Link */}
                {user?.role !== 'super_admin' && moduleIsLoaded && hasModule('kitchen_display') && (
                    <NavLink
                        to="/kitchen"
                        onClick={() => setSidebarOpen(false)}
                        title={collapsed ? 'Kitchen Display' : undefined}
                        className={`flex items-center ${collapsed ? 'justify-center px-2' : 'px-3'} py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg`}
                    >
                        <HiOutlineClipboardList className="w-5 h-5 shrink-0" />
                        {!collapsed && <span className="ml-3">Kitchen Display</span>}
                    </NavLink>
                )}
            </nav>

            {/* Bottom section */}
            {!collapsed && (
                <div className="border-t border-gray-200 p-4 shrink-0">
                    {user?.role !== 'super_admin' && (
                        <div className="text-center">
                            <PoweredBy />
                        </div>
                    )}
                </div>
            )}
        </>
    );

    return (
        <div className="flex h-screen bg-gray-50">
            {/* Mobile Sidebar Overlay */}
            {sidebarOpen && (
                <div className="fixed inset-0 z-40 md:hidden">
                    <div className="fixed inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
                    <aside className="fixed inset-y-0 left-0 z-50 w-64 bg-white flex flex-col shadow-xl">
                        <SidebarContent collapsed={false} />
                    </aside>
                </div>
            )}

            {/* Desktop Sidebar */}
            <aside className={`hidden md:flex md:flex-col ${sidebarWidth} bg-white border-r border-gray-200 shrink-0 transition-all duration-300`}>
                <SidebarContent collapsed={sidebarCollapsed} />
            </aside>

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Header */}
                <header className="flex items-center justify-between h-16 px-4 md:px-6 bg-white border-b border-gray-200 sticky top-0 z-30 shrink-0">
                    {/* Left: Sidebar Toggle */}
                    <div className="flex items-center gap-2">
                        {/* Mobile hamburger */}
                        <button
                            onClick={() => setSidebarOpen(true)}
                            className="md:hidden text-gray-500 hover:text-gray-700 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                        >
                            <HiOutlineMenu className="w-6 h-6" />
                        </button>
                        {/* Desktop sidebar toggle */}
                        <button
                            onClick={() => setSidebarCollapsed((prev) => !prev)}
                            className="hidden md:flex text-gray-500 hover:text-gray-700 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                        >
                            <HiOutlineMenu className="w-6 h-6" />
                        </button>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-1 sm:gap-2">
                        {/* Fullscreen Toggle */}
                        <button
                            onClick={toggleFullscreen}
                            className="hidden sm:flex text-gray-500 hover:text-gray-700 p-2 rounded-lg hover:bg-gray-100 transition-colors"
                            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                        >
                            {isFullscreen ? (
                                <HiArrowsPointingIn className="w-5 h-5" />
                            ) : (
                                <HiArrowsPointingOut className="w-5 h-5" />
                            )}
                        </button>

                        {/* Notifications */}
                        <div className="relative" ref={notificationsRef}>
                            <button
                                onClick={() => { setNotificationsOpen((v) => !v); setProfileOpen(false); }}
                                className="relative text-gray-500 hover:text-gray-700 p-2 rounded-lg hover:bg-gray-100 transition-colors"
                                title="Notifications"
                            >
                                <HiOutlineBell className="w-5 h-5" />
                                {/* Unread dot */}
                                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full ring-2 ring-white" />
                            </button>
                            {notificationsOpen && (
                                <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-lg ring-1 ring-gray-200 z-50">
                                    <div className="px-4 py-3 border-b border-gray-100">
                                        <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
                                    </div>
                                    <div className="max-h-72 overflow-y-auto divide-y divide-gray-100">
                                        <div className="px-4 py-8 text-center text-sm text-gray-400">
                                            No new notifications
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Profile Dropdown */}
                        <div className="relative" ref={profileRef}>
                            <button
                                onClick={() => { setProfileOpen((v) => !v); setNotificationsOpen(false); }}
                                className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                            >
                                <div className="w-8 h-8 bg-brand-600 rounded-full flex items-center justify-center text-white text-sm font-medium shrink-0">
                                    {user?.name?.[0]?.toUpperCase()}
                                </div>
                                <div className="hidden sm:block text-left min-w-0">
                                    <p className="text-sm font-medium text-gray-700 truncate max-w-[120px]">{user?.name}</p>
                                    <p className="text-xs text-gray-400 capitalize">{user?.role?.replace('_', ' ')}</p>
                                </div>
                                <HiOutlineChevronDown className="w-4 h-4 text-gray-400 hidden sm:block" />
                            </button>
                            {profileOpen && (
                                <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg ring-1 ring-gray-200 z-50 py-1">
                                    <div className="px-4 py-3 border-b border-gray-100">
                                        <p className="text-sm font-medium text-gray-900 truncate">{user?.name}</p>
                                        <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                                    </div>
                                    <button
                                        onClick={() => { setProfileOpen(false); navigate('/dashboard/profile'); }}
                                        className="flex items-center w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                                    >
                                        <HiOutlineUser className="w-4 h-4 mr-3 text-gray-400" />
                                        My Profile
                                    </button>
                                    {user?.role === 'restaurant_admin' && (
                                        <button
                                            onClick={() => { setProfileOpen(false); navigate('/dashboard/settings'); }}
                                            className="flex items-center w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                                        >
                                            <HiOutlineCog className="w-4 h-4 mr-3 text-gray-400" />
                                            Restaurant Settings
                                        </button>
                                    )}
                                    <div className="border-t border-gray-100">
                                        <button
                                            onClick={handleLogout}
                                            className="flex items-center w-full px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                                        >
                                            <HiOutlineLogout className="w-4 h-4 mr-3" />
                                            Logout
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </header>

                {/* Impersonation Banner — super admin is logged in as a tenant user */}
                {user?.role !== 'super_admin' && isImpersonating() && (
                    <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm font-medium bg-purple-600 text-white">
                        <div className="flex items-center gap-2">
                            <HiOutlineUser className="w-5 h-5 shrink-0" />
                            <span>You are viewing as {user?.name}{user?.tenant?.name ? ` (${user.tenant.name})` : ''}.</span>
                        </div>
                        <button
                            onClick={handleStopImpersonation}
                            className="shrink-0 whitespace-nowrap rounded-lg border border-white/30 bg-white/15 px-3 py-1 text-xs font-semibold hover:bg-white/25 transition-colors"
                        >
                            Return to admin
                        </button>
                    </div>
                )}

                {/* Trial Banner — shown to restaurant admins during active trial */}
                {graceInfo.show && (
                    <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm font-medium bg-amber-500 text-amber-950">
                        <div className="flex items-center gap-2">
                            <HiOutlineExclamation className="w-5 h-5 shrink-0" />
                            <span>
                                Your subscription expired. You have {graceInfo.daysLeft} day{graceInfo.daysLeft !== 1 ? 's' : ''} left in your grace period.
                            </span>
                        </div>
                        <button
                            onClick={() => navigate('/dashboard/subscription/renew')}
                            className="shrink-0 whitespace-nowrap rounded-lg border border-amber-900/20 bg-white/25 px-3 py-1 text-xs font-semibold hover:bg-white/35 transition-colors"
                        >
                            Renew now
                        </button>
                    </div>
                )}

                {user?.role === 'restaurant_admin' && trialInfo.isOnTrial && (
                    <div className={`flex items-center justify-between gap-3 px-4 py-2.5 text-sm font-medium ${
                        trialInfo.daysRemaining <= 3
                            ? 'bg-red-500 text-white'
                            : trialInfo.daysRemaining <= 7
                                ? 'bg-amber-400 text-amber-900'
                                : 'bg-brand-600 text-white'
                    }`}>
                        <div className="flex items-center gap-2">
                            {trialInfo.daysRemaining <= 3
                                ? <HiOutlineExclamation className="w-5 h-5 shrink-0" />
                                : <HiOutlineClock className="w-5 h-5 shrink-0" />
                            }
                            <span>
                                {trialInfo.daysRemaining <= 0
                                    ? 'Your free trial has ended.'
                                    : trialInfo.daysRemaining === 1
                                        ? 'Your free trial ends today!'
                                        : `Free trial — ${trialInfo.daysRemaining} day${trialInfo.daysRemaining !== 1 ? 's' : ''} remaining`
                                }
                            </span>
                        </div>
                        <button
                            onClick={() => navigate('/dashboard/settings?tab=subscription')}
                            className="shrink-0 whitespace-nowrap rounded-lg border border-white/30 bg-white/20 px-3 py-1 text-xs font-semibold hover:bg-white/30 transition-colors"
                        >
                            Upgrade Now
                        </button>
                    </div>
                )}

                {/* Page Content */}
                <main className="flex-1 overflow-y-auto">
                    <div className="p-4 md:p-6 lg:p-8">
                        <Outlet />
                    </div>
                </main>
            </div>

            {/* AI Analytics Assistant - Available for restaurant_admin */}
            {user?.role === 'restaurant_admin' && <AdminAIChat />}
        </div>
    );
}
