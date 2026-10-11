import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { kitchenAPI, authAPI } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import { useModuleStore } from '../../stores/moduleStore';
import {
    HiOutlineLogout, HiOutlineUser, HiOutlineViewGrid, HiOutlineVolumeUp, HiOutlineVolumeOff,
    HiOutlineChevronDown, HiOutlineClock, HiOutlineBadgeCheck, HiOutlineExclamation, HiOutlineTrendingUp,
} from 'react-icons/hi';
import { GiChefToque } from 'react-icons/gi';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import TicketCard from '../../components/kitchen/TicketCard';
import OrderDetailPanel from '../../components/kitchen/OrderDetailPanel';
import { buildStations, shortNumber } from '../../components/kitchen/stations';
import toast from 'react-hot-toast';

const SOUND_KEY = 'kitchen-sound';
const DEFAULT_TARGET = 20;

const ADVANCED_MESSAGE = {
    confirmed: 'is cooking',
    preparing: 'is ready',
    ready: 'was served',
};

// Two short tones; created lazily because browsers only allow audio after a user gesture
function playChime() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        [880, 1175].forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.frequency.value = freq;
            osc.connect(gain);
            gain.connect(ctx.destination);
            const start = ctx.currentTime + i * 0.18;
            gain.gain.setValueAtTime(0.0001, start);
            gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
            osc.start(start);
            osc.stop(start + 0.18);
        });
        setTimeout(() => ctx.close(), 600);
    } catch {
        // No audio available; the toast still shows
    }
}

function useMediaQuery(query) {
    const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
    useEffect(() => {
        const mql = window.matchMedia(query);
        const onChange = () => setMatches(mql.matches);
        mql.addEventListener('change', onChange);
        return () => mql.removeEventListener('change', onChange);
    }, [query]);
    return matches;
}

function StationColumn({ station, renderTicket }) {
    const [showReady, setShowReady] = useState(false);
    const Icon = station.icon;
    const cooking = station.tickets.filter((t) => t.order.status !== 'ready');
    const ready = station.tickets.filter((t) => t.order.status === 'ready');

    return (
        <section className={`snap-start shrink-0 w-[85vw] sm:w-72 flex flex-col rounded-2xl border ${station.tone.ring} bg-gray-50/80 lg:max-h-full`}>
            <header className={`flex items-center gap-2.5 px-3.5 py-3 rounded-t-2xl ${station.tone.head}`}>
                <Icon className={`w-6 h-6 ${station.tone.icon}`} />
                <h3 className="flex-1 min-w-0 font-semibold text-gray-900 truncate">{station.name}</h3>
                <span className={`min-w-[1.5rem] h-6 px-1.5 rounded-full text-xs font-bold flex items-center justify-center ${station.tone.badge}`}>
                    {cooking.length}
                </span>
            </header>

            <div className="flex-1 min-h-0 overflow-y-auto p-2.5 space-y-2.5">
                {cooking.length === 0 && (
                    <p className="py-6 text-center text-sm text-gray-400">All clear</p>
                )}
                {cooking.map((t) => renderTicket(t))}
            </div>

            {ready.length > 0 && (
                <div className="border-t border-gray-200/80 p-2.5">
                    <button
                        type="button"
                        onClick={() => setShowReady((v) => !v)}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 text-emerald-800 text-sm font-medium hover:bg-emerald-100 transition"
                        aria-expanded={showReady}
                    >
                        <HiOutlineBadgeCheck className="w-4 h-4" />
                        Ready to serve
                        <span className="ml-auto tabular-nums">{ready.length}</span>
                        <HiOutlineChevronDown className={`w-4 h-4 transition ${showReady ? 'rotate-180' : ''}`} />
                    </button>
                    {showReady && <div className="mt-2.5 space-y-2.5 max-h-72 overflow-y-auto">{ready.map((t) => renderTicket(t, true))}</div>}
                </div>
            )}
        </section>
    );
}

function Metric({ icon: Icon, label, value, tone = 'text-gray-900', iconTone = 'bg-gray-100 text-gray-500' }) {
    return (
        <div className="flex items-center gap-3 min-w-0">
            <span className={`w-9 h-9 shrink-0 rounded-full flex items-center justify-center ${iconTone}`}>
                <Icon className="w-5 h-5" />
            </span>
            <div className="min-w-0">
                <p className="text-xs text-gray-500 truncate">{label}</p>
                <p className={`text-base font-bold tabular-nums ${tone}`}>{value}</p>
            </div>
        </div>
    );
}

export default function KitchenDisplayPage() {
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const { user, logout } = useAuthStore();
    const clearModules = useModuleStore((s) => s.clear);
    const [now, setNow] = useState(() => Date.now());
    const [activeStation, setActiveStation] = useState('all');
    const [selectedId, setSelectedId] = useState(null);
    const [soundOn, setSoundOn] = useState(() => {
        try { return localStorage.getItem(SOUND_KEY) !== 'off'; } catch { return true; }
    });
    const isWide = useMediaQuery('(min-width: 1280px)');

    // Tick so ticket ages and the clock stay current between refetches
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 15000);
        return () => clearInterval(timer);
    }, []);

    const toggleSound = () => {
        const next = !soundOn;
        setSoundOn(next);
        try { localStorage.setItem(SOUND_KEY, next ? 'on' : 'off'); } catch { /* per-device preference only */ }
        if (next) playChime();
    };

    const handleLogout = () => {
        authAPI.logout().catch(() => {});
        logout();
        clearModules();
        navigate('/login');
    };

    const { data, isLoading, isError } = useQuery({
        queryKey: ['kitchen-orders'],
        queryFn: () => kitchenAPI.activeOrders().then((r) => r.data.data),
        refetchInterval: 5000,
    });

    const { data: stats } = useQuery({
        queryKey: ['kitchen-stats'],
        queryFn: () => kitchenAPI.stats().then((r) => r.data.data),
        refetchInterval: 15000,
    });

    const advanceMutation = useMutation({
        mutationFn: (order) => kitchenAPI.advanceOrder(order.id),
        onSuccess: (_, order) => {
            queryClient.invalidateQueries({ queryKey: ['kitchen-orders'] });
            queryClient.invalidateQueries({ queryKey: ['kitchen-stats'] });
            toast.success(`${shortNumber(order.order_number)} ${ADVANCED_MESSAGE[order.status] ?? 'updated'}`);
        },
        onError: (err) => toast.error(err.response?.data?.message || 'Could not update the order'),
    });

    // Chime and toast for tickets that weren't on the board at the last refresh
    const seenRef = useRef(null);
    useEffect(() => {
        if (!data) return;
        const ids = new Set(data.map((o) => o.id));
        if (seenRef.current) {
            const fresh = data.filter((o) => !seenRef.current.has(o.id) && o.status === 'confirmed');
            if (fresh.length) {
                if (soundOn) playChime();
                toast(`New order ${fresh.map((o) => shortNumber(o.order_number)).join(', ')}`, { icon: '🔔' });
            }
        }
        seenRef.current = ids;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data]);

    const orders = useMemo(() => data ?? [], [data]);
    const stations = useMemo(() => buildStations(orders), [orders]);
    const target = stats?.target_minutes ?? DEFAULT_TARGET;
    const cookingCount = orders.filter((o) => o.status !== 'ready').length;
    const selected = orders.find((o) => o.id === selectedId) ?? null;
    const shownStation = stations.find((s) => s.key === activeStation);

    if (isLoading) return <LoadingSpinner fullScreen />;

    const renderTicket = ({ order, items }, compact = false) => (
        <TicketCard
            key={order.id}
            order={order}
            items={items}
            now={now}
            target={target}
            compact={compact}
            selected={order.id === selectedId}
            onSelect={(o) => setSelectedId(o.id)}
            onAdvance={(o) => advanceMutation.mutate(o)}
            advancing={advanceMutation.isPending && advanceMutation.variables?.id === order.id}
        />
    );

    const panel = (
        <OrderDetailPanel
            order={selected}
            now={now}
            target={target}
            onAdvance={(o) => advanceMutation.mutate(o)}
            advancing={advanceMutation.isPending && advanceMutation.variables?.id === selected?.id}
            onClose={isWide ? null : () => setSelectedId(null)}
        />
    );

    return (
        <div className="min-h-screen lg:h-screen flex flex-col bg-gray-50 text-gray-800">
            {/* Header */}
            <header className="shrink-0 bg-white border-b border-gray-200/70">
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-3">
                    <div className="flex items-center gap-3">
                        <span className="w-11 h-11 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center">
                            <GiChefToque className="w-7 h-7" />
                        </span>
                        <div>
                            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 leading-tight">Kitchen Orders</h1>
                            <p className="text-xs sm:text-sm text-gray-500">Track and manage every kitchen ticket in real time</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-1.5 sm:gap-2">
                        <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1
                                ${isError ? 'bg-red-50 text-red-700 ring-red-200' : 'bg-emerald-50 text-emerald-700 ring-emerald-200'}`}
                        >
                            <span className="relative flex w-2 h-2">
                                {!isError && <span className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-60" />}
                                <span className={`relative w-2 h-2 rounded-full ${isError ? 'bg-red-500' : 'bg-emerald-500'}`} />
                            </span>
                            {isError ? 'Offline' : 'Live'}
                        </span>
                        <span className="hidden md:block text-right text-xs leading-tight text-gray-500 px-2 border-l border-gray-200">
                            {new Date(now).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}
                            <span className="block text-sm font-semibold text-gray-900 tabular-nums">
                                {new Date(now).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                            </span>
                        </span>
                        <button
                            type="button"
                            onClick={toggleSound}
                            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                            aria-label={soundOn ? 'Mute new-order sound' : 'Turn on new-order sound'}
                            title={soundOn ? 'Sound on' : 'Sound off'}
                        >
                            {soundOn ? <HiOutlineVolumeUp className="w-5 h-5" /> : <HiOutlineVolumeOff className="w-5 h-5" />}
                        </button>
                        {user?.role !== 'kitchen' && (
                            <Link to="/dashboard" className="btn-ghost px-2.5" title="Dashboard">
                                <HiOutlineViewGrid className="w-4 h-4" /><span className="hidden sm:inline">Dashboard</span>
                            </Link>
                        )}
                        <Link to="/dashboard/profile" className="btn-ghost px-2.5" title={user?.name}>
                            <HiOutlineUser className="w-4 h-4" /><span className="hidden sm:inline max-w-[8rem] truncate">{user?.name ?? 'Profile'}</span>
                        </Link>
                        <button type="button" onClick={handleLogout} className="btn-ghost px-2.5 text-red-600 hover:text-red-700 hover:bg-red-50" title="Logout">
                            <HiOutlineLogout className="w-4 h-4" /><span className="hidden sm:inline">Logout</span>
                        </button>
                    </div>
                </div>
            </header>

            <div className="flex-1 min-h-0 flex gap-4 p-3 sm:p-4">
                <div className="flex-1 min-w-0 min-h-0 flex flex-col gap-3 sm:gap-4">
                    {/* Station tabs */}
                    <nav className="shrink-0 flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Stations">
                        {[{ key: 'all', name: 'All stations', icon: GiChefToque, count: cookingCount }, ...stations.map((s) => ({
                            ...s, count: s.tickets.filter((t) => t.order.status !== 'ready').length,
                        }))].map((tab) => {
                            const active = (shownStation?.key ?? 'all') === tab.key;
                            const Icon = tab.icon;
                            return (
                                <button
                                    key={tab.key}
                                    type="button"
                                    onClick={() => setActiveStation(tab.key)}
                                    aria-pressed={active}
                                    className={`shrink-0 inline-flex items-center gap-2 pl-3 pr-2 py-2 rounded-xl border text-sm font-medium transition
                                        ${active ? 'bg-brand-500 border-brand-500 text-white shadow-sm shadow-brand-500/30' : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'}`}
                                >
                                    <Icon className={`w-5 h-5 ${active ? 'text-white' : tab.tone?.icon ?? 'text-brand-500'}`} />
                                    {tab.name}
                                    <span className={`min-w-[1.5rem] h-6 px-1.5 rounded-full text-xs font-bold flex items-center justify-center ${active ? 'bg-white/25 text-white' : 'bg-gray-100 text-gray-600'}`}>
                                        {tab.count}
                                    </span>
                                </button>
                            );
                        })}
                    </nav>

                    {/* Board */}
                    <div className="flex-1 min-h-0">
                        {orders.length === 0 ? (
                            <div className="h-full min-h-[50vh] card flex flex-col items-center justify-center text-center">
                                <span className="w-20 h-20 rounded-full bg-brand-50 text-brand-400 flex items-center justify-center mb-4">
                                    <GiChefToque className="w-10 h-10" />
                                </span>
                                <p className="text-2xl font-bold text-gray-700">No active orders</p>
                                <p className="mt-1 text-sm text-gray-500">New tickets appear here automatically.</p>
                            </div>
                        ) : shownStation ? (
                            <div className="h-full overflow-y-auto">
                                <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-3 gap-3">
                                    {shownStation.tickets.filter((t) => t.order.status !== 'ready').map((t) => renderTicket(t))}
                                </div>
                                {shownStation.tickets.some((t) => t.order.status === 'ready') && (
                                    <>
                                        <h3 className="mt-6 mb-3 flex items-center gap-2 text-sm font-semibold text-emerald-800">
                                            <HiOutlineBadgeCheck className="w-4 h-4" /> Ready to serve
                                        </h3>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-3 gap-3">
                                            {shownStation.tickets.filter((t) => t.order.status === 'ready').map((t) => renderTicket(t, true))}
                                        </div>
                                    </>
                                )}
                            </div>
                        ) : (
                            <div className="h-full flex gap-3 overflow-x-auto snap-x pb-1">
                                {stations.map((station) => (
                                    <StationColumn key={station.key} station={station} renderTicket={renderTicket} />
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Kitchen performance */}
                    <div className="shrink-0 card p-3 sm:p-4 grid grid-cols-2 md:grid-cols-[auto_repeat(4,minmax(0,1fr))] gap-3 md:gap-5 items-center">
                        <div className="col-span-2 md:col-span-1 flex items-center gap-2.5 md:pr-5 md:border-r border-gray-100">
                            <span className="w-10 h-10 rounded-full bg-brand-500 text-white flex items-center justify-center">
                                <GiChefToque className="w-6 h-6" />
                            </span>
                            <div className="leading-tight">
                                <p className="font-semibold text-gray-900">Kitchen<br className="hidden md:block" /> performance</p>
                                {user?.role === 'restaurant_admin' && (
                                    <Link to="/dashboard/settings?tab=kitchen" className="text-xs text-brand-700 hover:underline">
                                        Target {target} min · change
                                    </Link>
                                )}
                            </div>
                        </div>
                        <Metric
                            icon={HiOutlineClock}
                            label="Avg. prep time"
                            value={stats?.avg_prep_minutes != null ? `${Math.round(stats.avg_prep_minutes)} min` : '—'}
                            iconTone="bg-brand-50 text-brand-600"
                        />
                        <Metric
                            icon={HiOutlineBadgeCheck}
                            label={`On time (≤ ${target} min)`}
                            value={stats?.on_time_rate != null ? `${stats.on_time_rate}%` : '—'}
                            iconTone="bg-emerald-50 text-emerald-600"
                        />
                        <Metric
                            icon={HiOutlineExclamation}
                            label="Delayed now"
                            value={stats?.delayed ?? 0}
                            tone={stats?.delayed ? 'text-red-600' : 'text-gray-900'}
                            iconTone={stats?.delayed ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-500'}
                        />
                        <Metric
                            icon={HiOutlineTrendingUp}
                            label="Finished today"
                            value={`${stats?.ready_today ?? 0} / ${stats?.total_today ?? 0}`}
                            iconTone="bg-sky-50 text-sky-600"
                        />
                    </div>
                </div>

                {/* Selected order: side panel on wide screens */}
                {isWide && (
                    <aside className="w-[360px] shrink-0 card p-0 sm:p-0 overflow-hidden flex flex-col">
                        {panel}
                    </aside>
                )}
            </div>

            {/* Selected order: bottom sheet on smaller screens */}
            {!isWide && selected && (
                <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center">
                    <div className="absolute inset-0 bg-gray-900/50 backdrop-blur-sm" onClick={() => setSelectedId(null)} />
                    <div className="relative w-full sm:max-w-md max-h-[90vh] bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col">
                        {panel}
                    </div>
                </div>
            )}
        </div>
    );
}
