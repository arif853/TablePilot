import React, { useState } from 'react';
import { useParams, useOutletContext, Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { customerAPI } from '../../services/api';
import { restaurantColor, restaurantTheme } from '../../utils/restaurantTheme';
import { useCartStore } from '../../stores/cartStore';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import RecommendationCarousel from '../../components/ai/RecommendationCarousel';
import toast from 'react-hot-toast';
import { HiOutlineSearch, HiOutlineShoppingCart, HiOutlineX, HiPlus, HiOutlineChevronRight } from 'react-icons/hi';

export default function CustomerMenuPage() {
    const { slug } = useParams();
    const [searchParams] = useSearchParams();
    const { restaurant } = useOutletContext() || {};
    const [selectedCategory, setSelectedCategory] = useState(null);
    const [searchText, setSearchText] = useState('');
    const { addItem, updateQty, items: cartItems } = useCartStore();

    const primaryColor = restaurantColor(restaurant?.primary_color);
    const { on: onColor, ink: inkColor } = restaurantTheme(primaryColor);

    const { data: menu, isLoading } = useQuery({
        queryKey: ['customer-menu', slug],
        queryFn: () => customerAPI.menu(slug).then((r) => r.data.data),
    });

    const handleAdd = (item) => {
        const existing = cartItems.find((c) => c.menu_item_id === item.id);
        if (existing) {
            updateQty(item.id, existing.qty + 1);
        } else {
            addItem(item);
        }
        toast.success(`${item.name} added`, { duration: 1200, icon: '🛒', style: { fontSize: '14px' } });
    };

    if (isLoading) return <LoadingSpinner />;

    const categories = menu?.categories || [];
    const allItems = categories.flatMap((c) => c.menu_items || []);

    const filteredItems = selectedCategory
        ? categories.find((c) => c.id === selectedCategory)?.menu_items || []
        : allItems;

    const displayItems = searchText
        ? filteredItems.filter((i) => i.name.toLowerCase().includes(searchText.toLowerCase()))
        : filteredItems;

    const cartCount = cartItems.reduce((s, i) => s + i.qty, 0);
    const cartTotal = useCartStore.getState().getSubtotal();

    return (
        <div className="pb-28">
            {/* Search bar */}
            <div className="sticky top-[60px] z-30 bg-gray-50 px-3 pt-3 pb-2">
                <div className="relative">
                    <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                        type="text"
                        className="w-full pl-10 pr-10 py-3 rounded-2xl border border-gray-200 bg-white focus:border-restaurant focus:ring-4 focus:ring-restaurant/15 outline-none text-sm shadow-sm placeholder:text-gray-400"
                        placeholder="Search menu items..."
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                    />
                    {searchText && (
                        <button onClick={() => setSearchText('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                            <HiOutlineX className="w-5 h-5" />
                        </button>
                    )}
                </div>
            </div>

            {/* Category Tabs - horizontal scroll */}
            <div className="sticky top-[120px] z-20 bg-gray-50 px-3 pb-2">
                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1">
                    <button
                        onClick={() => setSelectedCategory(null)}
                        className={`px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${!selectedCategory ? 'shadow-md' : 'bg-white text-gray-600 ring-1 ring-gray-200 hover:ring-gray-300'}`}
                        style={!selectedCategory ? { backgroundColor: primaryColor, color: onColor } : undefined}
                    >
                        All <span className="opacity-60">{allItems.length}</span>
                    </button>
                    {categories.map((cat) => (
                        <button
                            key={cat.id}
                            onClick={() => setSelectedCategory(cat.id)}
                            className={`px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${selectedCategory === cat.id ? 'shadow-md' : 'bg-white text-gray-600 ring-1 ring-gray-200 hover:ring-gray-300'}`}
                            style={selectedCategory === cat.id ? { backgroundColor: primaryColor, color: onColor } : undefined}
                        >
                            {cat.name} <span className="opacity-60">{cat.menu_items?.length || 0}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* AI Recommendations */}
            {!searchText && !selectedCategory && (
                <RecommendationCarousel tenantSlug={slug} primaryColor={primaryColor} />
            )}

            {/* Items count when searching */}
            {searchText && (
                <div className="px-3 pt-1 pb-2">
                    <p className="text-xs text-gray-500">{displayItems.length} items found for "{searchText}"</p>
                </div>
            )}

            {/* Items Grid - always 2 columns on mobile */}
            <div className="px-3 pt-1">
                {displayItems.length === 0 ? (
                    <div className="text-center py-16">
                        <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-white ring-1 ring-gray-200 flex items-center justify-center">
                            <HiOutlineSearch className="w-7 h-7 text-gray-300" />
                        </div>
                        <p className="text-gray-700 font-semibold">No items found</p>
                        <p className="text-gray-400 text-sm mt-1">Try a different search or category</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-3">
                        {displayItems.map((item) => {
                            const inCart = cartItems.find((c) => c.menu_item_id === item.id);
                            const imgSrc = item.image_url || (item.image ? `/storage/${item.image}` : null);
                            return (
                                <div key={item.id} className={`bg-white rounded-2xl shadow-sm overflow-hidden flex flex-col transition-all active:scale-[0.98] ring-1 ${inCart ? 'ring-restaurant/50' : 'ring-gray-200/70'}`}>
                                    {imgSrc ? (
                                        <div className="w-full aspect-[4/3] bg-gray-100 relative overflow-hidden">
                                            <img src={imgSrc} alt={item.name} className="w-full h-full object-cover transition-transform duration-300 hover:scale-105" loading="lazy" />
                                            {inCart && (
                                                <div className="absolute top-2 right-2 w-6 h-6 rounded-full text-on-restaurant text-xs font-bold flex items-center justify-center shadow-md" style={{ backgroundColor: primaryColor }}>
                                                    {inCart.qty}
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="w-full aspect-[4/3] bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center relative">
                                            <span className="text-3xl">🍽️</span>
                                            {inCart && (
                                                <div className="absolute top-2 right-2 w-6 h-6 rounded-full text-on-restaurant text-xs font-bold flex items-center justify-center shadow-md" style={{ backgroundColor: primaryColor }}>
                                                    {inCart.qty}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    <div className="p-3 flex flex-col flex-1">
                                        <h3 className="font-semibold text-gray-900 text-sm leading-tight line-clamp-2">{item.name}</h3>
                                        {item.description && (
                                            <p className="text-xs text-gray-400 mt-1 line-clamp-1">{item.description}</p>
                                        )}
                                        <div className="mt-auto pt-2 flex items-center justify-between">
                                            <p className="text-base font-bold tabular" style={{ color: inkColor }}>৳{parseFloat(item.price).toFixed(0)}</p>
                                            <button
                                                onClick={() => handleAdd(item)}
                                                className="w-9 h-9 rounded-xl text-on-restaurant flex items-center justify-center shadow-md transition-all active:scale-90 hover:shadow-lg"
                                                style={{ backgroundColor: primaryColor }}
                                                aria-label={`Add ${item.name} to cart`}
                                            >
                                                <HiPlus className="w-5 h-5" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Floating Cart Bar */}
            {cartCount > 0 && (
                <div className="fixed bottom-4 left-3 right-3 max-w-lg mx-auto z-50">
                    <Link
                        to={`/restaurant/${slug}/cart?${searchParams.toString()}`}
                        className="flex items-center justify-between gap-3 rounded-2xl py-3 pl-3 pr-4 shadow-2xl text-on-restaurant transition-all active:scale-[0.98]"
                        style={{ backgroundColor: primaryColor, boxShadow: `0 12px 30px -8px ${primaryColor}99` }}
                    >
                        <div className="flex items-center gap-3">
                            <div className="relative w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                                <HiOutlineShoppingCart className="w-5 h-5" />
                                <span className="absolute -top-1.5 -right-1.5 min-w-[1.25rem] h-5 px-1 bg-white rounded-full text-[11px] font-bold flex items-center justify-center shadow" style={{ color: inkColor }}>
                                    {cartCount}
                                </span>
                            </div>
                            <div className="leading-tight">
                                <p className="font-bold text-sm">View cart</p>
                                <p className="text-xs opacity-80">{cartCount} {cartCount === 1 ? 'item' : 'items'}</p>
                            </div>
                        </div>
                        <span className="flex items-center gap-1 font-bold text-base tabular">
                            ৳{cartTotal.toFixed(0)}
                            <HiOutlineChevronRight className="w-5 h-5" />
                        </span>
                    </Link>
                </div>
            )}
        </div>
    );
}
