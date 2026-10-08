import React, { useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { kitchenAPI, authAPI } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import { useModuleStore } from '../../stores/moduleStore';
import StatusBadge from '../../components/ui/StatusBadge';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import toast from 'react-hot-toast';

const STATUS_COLORS = {
    placed: 'border-red-400 bg-red-50',
    confirmed: 'border-orange-400 bg-orange-50',
    preparing: 'border-yellow-400 bg-yellow-50',
    ready: 'border-green-400 bg-green-50',
};

export default function KitchenDisplayPage() {
    const queryClient = useQueryClient();
    const audioRef = useRef(null);
    const navigate = useNavigate();
    const { user, logout } = useAuthStore();
    const clearModules = useModuleStore((s) => s.clear);

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
        <div className="min-h-screen bg-gray-900 text-white p-4">
            {/* Hidden audio element for notification */}
            <audio ref={audioRef} preload="auto">
                <source src="data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==" type="audio/wav" />
            </audio>

            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3 text-sm text-gray-400">
                <span>Signed in as <span className="text-gray-200 font-medium">{user?.name}</span></span>
                <div className="flex gap-4">
                    {user?.role !== 'kitchen' && (
                        <Link to="/dashboard" className="hover:text-white">Dashboard</Link>
                    )}
                    <Link to="/dashboard/profile" className="hover:text-white">My Profile</Link>
                    <button onClick={handleLogout} className="text-red-400 hover:text-red-300">Logout</button>
                </div>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
                <h1 className="text-xl sm:text-2xl font-bold">Kitchen Display</h1>
                <div className="flex gap-2 sm:gap-4 text-xs sm:text-sm flex-wrap">
                    <span className="bg-red-600 px-2 sm:px-3 py-1 rounded-full">Pending: {stats?.pending || 0}</span>
                    <span className="bg-yellow-600 px-2 sm:px-3 py-1 rounded-full">Preparing: {stats?.preparing || 0}</span>
                    <span className="bg-green-600 px-2 sm:px-3 py-1 rounded-full">Ready: {stats?.ready || 0}</span>
                    <span className="bg-brand-600 px-2 sm:px-3 py-1 rounded-full">Today: {stats?.total_today || 0}</span>
                </div>
            </div>

            {/* Orders Grid */}
            {orders.length === 0 ? (
                <div className="flex items-center justify-center h-[60vh]">
                    <p className="text-3xl text-gray-500 font-bold">No Active Orders</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {orders.map((order) => (
                        <div key={order.id} className={`rounded-xl border-2 p-4 ${STATUS_COLORS[order.status] || 'border-gray-600 bg-gray-800'}`}>
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-lg font-bold text-gray-900">{order.order_number}</span>
                                <StatusBadge status={order.status} />
                            </div>

                            <div className="flex items-center gap-2 mb-3 text-sm text-gray-700">
                                <span className="capitalize">{order.type}</span>
                                {order.table && <span>&middot; Table {order.table.table_number}</span>}
                                <span>&middot; {new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>

                            {/* Items */}
                            <div className="space-y-2 mb-4">
                                {order.items?.map((item) => (
                                    <div key={item.id} className="flex justify-between items-start text-gray-900">
                                        <div>
                                            <span className="font-bold text-lg mr-2">{item.qty}x</span>
                                            <span className="font-medium">{item.menu_item?.name}</span>
                                            {item.special_instructions && (
                                                <p className="text-xs text-red-600 mt-0.5">Note: {item.special_instructions}</p>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Action */}
                            {!['completed', 'cancelled', 'served'].includes(order.status) && (
                                <button
                                    onClick={() => advanceMutation.mutate(order.id)}
                                    disabled={advanceMutation.isPending}
                                    className="w-full py-3 rounded-lg font-bold text-white bg-brand-600 hover:bg-brand-700 transition"
                                >
                                    {order.status === 'placed' && 'Confirm'}
                                    {order.status === 'confirmed' && 'Start Preparing'}
                                    {order.status === 'preparing' && 'Mark Ready'}
                                    {order.status === 'ready' && 'Mark Served'}
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
