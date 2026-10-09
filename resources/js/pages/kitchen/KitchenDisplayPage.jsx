import React, { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { kitchenAPI, authAPI } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import { useModuleStore } from '../../stores/moduleStore';
import { HiOutlineFire, HiOutlineLogout, HiOutlineUser, HiOutlineViewGrid } from 'react-icons/hi';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import toast from 'react-hot-toast';

// Accent strip, label colour and next-step button per status
const STATUS_STYLES = {
    placed: { strip: 'bg-red-500', label: 'text-red-300', button: 'bg-red-500 hover:bg-red-400', name: 'New' },
    confirmed: { strip: 'bg-orange-500', label: 'text-orange-300', button: 'bg-orange-500 hover:bg-orange-400', name: 'Confirmed' },
    preparing: { strip: 'bg-amber-400', label: 'text-amber-300', button: 'bg-emerald-600 hover:bg-emerald-500', name: 'Preparing' },
    ready: { strip: 'bg-emerald-500', label: 'text-emerald-300', button: 'bg-sky-600 hover:bg-sky-500', name: 'Ready' },
};

const minutesSince = (date, now) => Math.max(0, Math.floor((now - new Date(date).getTime()) / 60000));

export default function KitchenDisplayPage() {
    const queryClient = useQueryClient();
    const audioRef = useRef(null);
    const navigate = useNavigate();
    const { user, logout } = useAuthStore();
    const clearModules = useModuleStore((s) => s.clear);
    const [now, setNow] = useState(() => Date.now());

    // Tick so ticket ages and the clock stay current between refetches
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 30000);
        return () => clearInterval(timer);
    }, []);

    const handleLogout = () => {
        authAPI.logout().catch(() => {});
        logout();
        clearModules();
        navigate('/login');
    };

    const { data, isLoading } = useQuery({
        queryKey: ['kitchen-orders'],
        queryFn: () => kitchenAPI.activeOrders().then((r) => r.data.data),
        refetchInterval: 5000,
    });

    const { data: stats } = useQuery({
        queryKey: ['kitchen-stats'],
        queryFn: () => kitchenAPI.stats().then((r) => r.data.data),
        refetchInterval: 10000,
    });

    const advanceMutation = useMutation({
        mutationFn: (id) => kitchenAPI.advanceOrder(id),
        onSuccess: () => {
            queryClient.invalidateQueries(['kitchen-orders']);
            queryClient.invalidateQueries(['kitchen-stats']);
            toast.success('Order advanced');
        },
        onError: (err) => toast.error(err.response?.data?.message || 'Error'),
    });

    // Play sound on new orders
    const prevCountRef = useRef(0);
    useEffect(() => {
        if (data && data.length > prevCountRef.current) {
            try { audioRef.current?.play(); } catch {}
        }
        prevCountRef.current = data?.length || 0;
    }, [data?.length]);

    if (isLoading) return <LoadingSpinner fullScreen />;

    const orders = data || [];

    return (
        <div className="min-h-screen bg-gray-950 text-white">
            {/* Hidden audio element for notification */}
            <audio ref={audioRef} preload="auto">
                <source src="data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==" type="audio/wav" />
            </audio>

            {/* Header */}
            <header className="sticky top-0 z-20 bg-gray-950/90 backdrop-blur border-b border-white/10">
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div className="flex items-center gap-3">
                        <span className="w-10 h-10 rounded-xl bg-brand-500/15 ring-1 ring-brand-500/30 flex items-center justify-center">
                            <HiOutlineFire className="w-6 h-6 text-brand-400" />
                        </span>
                        <div>
                            <h1 className="text-lg sm:text-xl font-bold tracking-tight leading-tight">Kitchen Display</h1>
                            <p className="text-xs text-gray-400">
                                {new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                <span className="mx-1.5 text-gray-600">·</span>
                                {user?.name}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1">
                        {user?.role !== 'kitchen' && (
                            <Link to="/dashboard" className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-gray-300 hover:text-white hover:bg-white/10 transition">
                                <HiOutlineViewGrid className="w-4 h-4" />
                                <span className="hidden sm:inline">Dashboard</span>
                            </Link>
                        )}
                        <Link to="/dashboard/profile" className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-gray-300 hover:text-white hover:bg-white/10 transition">
                            <HiOutlineUser className="w-4 h-4" />
                            <span className="hidden sm:inline">Profile</span>
                        </Link>
                        <button onClick={handleLogout} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 transition">
                            <HiOutlineLogout className="w-4 h-4" />
                            <span className="hidden sm:inline">Logout</span>
                        </button>
                    </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-4 gap-2 px-4 pb-3">
                    {[
                        { label: 'Pending', value: stats?.pending, dot: 'bg-red-500' },
                        { label: 'Preparing', value: stats?.preparing, dot: 'bg-amber-400' },
                        { label: 'Ready', value: stats?.ready, dot: 'bg-emerald-500' },
                        { label: 'Today', value: stats?.total_today, dot: 'bg-brand-500' },
                    ].map((stat) => (
                        <div key={stat.label} className="rounded-xl bg-white/5 ring-1 ring-white/10 px-3 py-2">
                            <p className="flex items-center gap-1.5 text-[11px] sm:text-xs font-medium uppercase tracking-wider text-gray-400">
                                <span className={`w-1.5 h-1.5 rounded-full ${stat.dot}`} />
                                {stat.label}
                            </p>
                            <p className="text-xl sm:text-2xl font-bold tabular">{stat.value || 0}</p>
                        </div>
                    ))}
                </div>
            </header>

            {/* Orders Grid */}
            <main className="p-4">
                {orders.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-[60vh] text-center">
                        <span className="w-20 h-20 rounded-full bg-white/5 ring-1 ring-white/10 flex items-center justify-center mb-4">
                            <HiOutlineFire className="w-10 h-10 text-gray-600" />
                        </span>
                        <p className="text-2xl sm:text-3xl text-gray-400 font-bold">No active orders</p>
                        <p className="mt-1 text-sm text-gray-500">New tickets appear here automatically.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {orders.map((order) => {
                            const style = STATUS_STYLES[order.status];
                            const age = minutesSince(order.created_at, now);
                            const ageClass = age >= 20
                                ? 'bg-red-500/20 text-red-300 ring-red-500/40'
                                : age >= 10
                                    ? 'bg-amber-500/15 text-amber-300 ring-amber-500/30'
                                    : 'bg-white/5 text-gray-300 ring-white/10';

                            return (
                                <div key={order.id} className="relative flex flex-col rounded-2xl bg-gray-900 ring-1 ring-white/10 overflow-hidden shadow-lg shadow-black/30">
                                    <div className={`h-1.5 ${style?.strip || 'bg-gray-600'}`} />

                                    <div className="p-4 pb-3 border-b border-dashed border-white/10">
                                        <div className="flex items-start justify-between gap-2">
                                            <div>
                                                <p className={`text-[11px] font-semibold uppercase tracking-wider ${style?.label || 'text-gray-400'}`}>
                                                    {style?.name || order.status}
                                                </p>
                                                <p className="text-xl font-bold tracking-tight">{order.order_number}</p>
                                            </div>
                                            <span className={`shrink-0 rounded-lg px-2 py-1 text-xs font-semibold ring-1 tabular ${ageClass}`}>
                                                {age < 1 ? 'Just now' : `${age} min`}
                                            </span>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-1.5 mt-2 text-xs">
                                            <span className="rounded-md bg-white/10 px-2 py-0.5 capitalize text-gray-200">{order.type === 'dine' ? 'Dine-in' : order.type}</span>
                                            {order.table && (
                                                <span className="rounded-md bg-white/10 px-2 py-0.5 text-gray-200">Table {order.table.table_number}</span>
                                            )}
                                            <span className="text-gray-500 ml-auto">
                                                {new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Items */}
                                    <div className="flex-1 p-4 space-y-2.5">
                                        {order.items?.map((item) => (
                                            <div key={item.id} className="flex items-start gap-3">
                                                <span className="min-w-[2.25rem] h-7 px-1.5 rounded-lg bg-white/10 flex items-center justify-center text-base font-bold tabular">
                                                    {item.qty}×
                                                </span>
                                                <div className="min-w-0 pt-0.5">
                                                    <p className="font-semibold leading-snug text-gray-100">{item.menu_item?.name}</p>
                                                    {item.special_instructions && (
                                                        <p className="mt-1 text-xs font-medium text-amber-300 bg-amber-500/10 rounded-md px-2 py-1">
                                                            Note: {item.special_instructions}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Action */}
                                    {!['completed', 'cancelled', 'served'].includes(order.status) && (
                                        <div className="p-3 pt-0">
                                            <button
                                                onClick={() => advanceMutation.mutate(order.id)}
                                                disabled={advanceMutation.isPending}
                                                className={`w-full py-3 rounded-xl font-bold text-white transition active:scale-[0.98] disabled:opacity-60 ${style?.button || 'bg-brand-600 hover:bg-brand-500'}`}
                                            >
                                                {order.status === 'placed' && 'Confirm'}
                                                {order.status === 'confirmed' && 'Start Preparing'}
                                                {order.status === 'preparing' && 'Mark Ready'}
                                                {order.status === 'ready' && 'Mark Served'}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </main>
        </div>
    );
}
