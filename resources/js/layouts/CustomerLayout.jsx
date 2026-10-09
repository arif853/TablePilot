import React, { useEffect, useRef, useState } from 'react';
import { Outlet, useParams, useSearchParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { customerAPI } from '../services/api';
import { useCartStore } from '../stores/cartStore';
import { useBrandingStore } from '../stores/brandingStore';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import PoweredBy from '../components/ui/PoweredBy';
import CustomerChatWidget from '../components/ai/CustomerChatWidget';
import { restaurantColor, restaurantInkColor, restaurantThemeStyle } from '../utils/restaurantTheme';
import { HiOutlineClock, HiOutlineChevronRight } from 'react-icons/hi';

// Get recent orders from localStorage
function getRecentOrders(slug) {
    try {
        const key = `recent_orders_${slug}`;
        return JSON.parse(localStorage.getItem(key) || '[]');
    } catch { return []; }
}

export default function CustomerLayout() {
    const { slug } = useParams();
    const [searchParams] = useSearchParams();
    const { setTenantId, setTableId, setOrderType } = useCartStore();
    const { branding } = useBrandingStore();
    const prevTitle = useRef(document.title);
    const prevFavicon = useRef(document.querySelector("link[rel~='icon']")?.href);
    const [showRecentOrders, setShowRecentOrders] = useState(false);

    const tableId = searchParams.get('table');
    const orderType = searchParams.get('type') || (tableId ? 'dine' : 'parcel');

    const recentOrders = getRecentOrders(slug);

    React.useEffect(() => {
        if (tableId) setTableId(parseInt(tableId));
        setOrderType(orderType);
    }, [slug, tableId, orderType]);

    const { data: restaurant, isLoading, error } = useQuery({
        queryKey: ['restaurant', slug],
        queryFn: () => customerAPI.restaurant(slug).then((r) => r.data.data),
    });

    // Fetch actual table info to get table_number
    const { data: tableInfo } = useQuery({
        queryKey: ['table-info', slug, tableId],
        queryFn: () => customerAPI.table(slug, tableId).then((r) => r.data.data),
        enabled: !!tableId && !!slug,
    });
    const tableNumber = tableInfo?.table_number || tableId;

    const primaryColor = restaurantColor(restaurant?.primary_color);
    const inkColor = restaurantInkColor(primaryColor);

    // Set document title and favicon to restaurant's branding
    useEffect(() => {
        if (restaurant) {
            if (restaurant.name) {
                document.title = restaurant.name;
            }
            if (restaurant.favicon) {
                let link = document.querySelector("link[rel~='icon']");
                if (!link) {
                    link = document.createElement('link');
                    link.rel = 'icon';
                    document.head.appendChild(link);
                }
                link.href = '/storage/' + restaurant.favicon;
            }
        }
        return () => {
            document.title = prevTitle.current || branding.platform_name || 'TablePilot';
            const link = document.querySelector("link[rel~='icon']");
            if (link && prevFavicon.current) {
                link.href = prevFavicon.current;
            }
        };
    }, [restaurant]);

    if (isLoading) return <LoadingSpinner fullScreen />;

    if (error) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50 px-4">
                <div className="text-center max-w-xs">
                    <div className="w-20 h-20 mx-auto mb-5 rounded-full bg-white shadow-sm ring-1 ring-gray-200 flex items-center justify-center text-4xl">🍽️</div>
                    <h2 className="text-xl font-bold tracking-tight text-gray-900 mb-1.5">Restaurant unavailable</h2>
                    <p className="text-gray-500 text-sm">This restaurant isn't accepting orders right now. Please check back a little later.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col" style={restaurantThemeStyle(primaryColor)}>
            {/* Header */}
            <header className="bg-white/90 backdrop-blur-md shadow-[0_1px_0_rgba(0,0,0,0.04)] sticky top-0 z-40" style={{ borderBottom: `3px solid ${primaryColor}` }}>
                <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center min-w-0 gap-3">
                        {restaurant?.logo ? (
                            <img src={`/storage/${restaurant.logo}`} alt="" className="w-9 h-9 rounded-xl object-cover flex-shrink-0 ring-1 ring-gray-200" />
                        ) : (
                            <span className="w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center text-sm font-bold text-on-restaurant" style={{ backgroundColor: primaryColor }}>
                                {restaurant?.name?.[0]?.toUpperCase()}
                            </span>
                        )}
                        <div className="min-w-0">
                            <h1 className="text-base font-bold tracking-tight text-gray-900 truncate leading-tight">{restaurant?.name}</h1>
                            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-500">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                {tableId ? <>Table <span className="font-semibold text-gray-700">{tableNumber}</span> &middot; Dine-in</> : 'Takeaway order'}
                            </p>
                        </div>
                    </div>
                    {/* Recent Orders Button */}
                    {recentOrders.length > 0 && (
                        <div className="relative">
                            <button
                                onClick={() => setShowRecentOrders(!showRecentOrders)}
                                className="p-2 rounded-xl bg-gray-100/80 hover:bg-gray-200/80 transition relative"
                                title="Recent orders"
                            >
                                <HiOutlineClock className="w-5 h-5 text-gray-600" />
                                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-white" style={{ backgroundColor: primaryColor }}></span>
                            </button>

                            {/* Dropdown */}
                            {showRecentOrders && (
                                <>
                                    <div className="fixed inset-0 z-40" onClick={() => setShowRecentOrders(false)} />
                                    <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-2xl shadow-xl ring-1 ring-gray-900/5 z-50 overflow-hidden">
                                        <div className="px-4 py-3 border-b border-gray-100">
                                            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Your recent orders</p>
                                        </div>
                                        <div className="max-h-64 overflow-y-auto">
                                            {recentOrders.slice(0, 5).map((order, i) => (
                                                <Link
                                                    key={i}
                                                    to={order.accessToken
                                                        ? `/order/${order.orderNumber}?access_token=${encodeURIComponent(order.accessToken)}`
                                                        : `/order/${order.orderNumber}`}
                                                    onClick={() => setShowRecentOrders(false)}
                                                    className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition"
                                                >
                                                    <div>
                                                        <p className="text-sm font-medium text-gray-800">#{order.orderNumber}</p>
                                                        <p className="text-[11px] text-gray-400">
                                                            {new Date(order.placedAt).toLocaleDateString()} {new Date(order.placedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </p>
                                                    </div>
                                                    <span className="flex items-center gap-0.5 text-xs font-semibold" style={{ color: inkColor }}>Track <HiOutlineChevronRight className="w-3.5 h-3.5" /></span>
                                                </Link>
                                            ))}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </header>

            {/* Banner Image */}
            {restaurant?.banner_image && (
                <div className="max-w-lg mx-auto w-full px-3 pt-3">
                    <img src={`/storage/${restaurant.banner_image}`} alt="" className="w-full h-36 object-cover rounded-2xl shadow-sm" />
                </div>
            )}

            {/* Content */}
            <div className="max-w-lg mx-auto flex-1 w-full">
                <Outlet context={{ restaurant, slug, tableId, orderType }} />
            </div>

            {/* Footer Branding */}
            <footer className="py-6 text-center">
                <PoweredBy />
            </footer>

            {/* AI Chat Assistant */}
            <CustomerChatWidget tenantSlug={slug} primaryColor={primaryColor} />
        </div>
    );
}
