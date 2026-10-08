import React, { useEffect, useState } from 'react';
import { recommendationAPI } from '../../services/api';
import { useCartStore } from '../../stores/cartStore';
import toast from 'react-hot-toast';
import { Sparkles, Plus, Star, Clock, Users, Loader2 } from 'lucide-react';
import { restaurantInkColor } from '../../utils/restaurantTheme';

const typeIcons = {
    popular: Star,
    time_based: Clock,
    complementary: Users,
    ai: Sparkles,
    fbt: Users,
    category: Star,
    random: Sparkles,
};

const RecommendationCarousel = ({ tenantSlug, primaryColor = '#ED802A' }) => {
    const inkColor = restaurantInkColor(primaryColor);
    const [recommendations, setRecommendations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [context, setContext] = useState({});
    const { items: cartItems, addItem, updateQty } = useCartStore();

    useEffect(() => {
        loadRecommendations();
    }, [tenantSlug, cartItems.length]);

    const loadRecommendations = async () => {
        try {
            setLoading(true);
            const cartPayload = cartItems.map((item) => ({
                menu_item_id: item.menu_item_id,
            }));

            const response = await recommendationAPI.get(tenantSlug, cartPayload, 6);

            if (response.data.success) {
                setRecommendations(response.data.recommendations || []);
                setContext(response.data.context || {});
            }
        } catch (error) {
            console.error('Failed to load recommendations:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleAddItem = (item) => {
        const existing = cartItems.find((c) => c.menu_item_id === item.id);
        if (existing) {
            updateQty(item.id, existing.qty + 1);
        } else {
            addItem({
                id: item.id,
                name: item.name,
                price: item.price,
                image: item.image,
            });
        }
        toast.success(`${item.name} added`, {
            duration: 1200,
            icon: '🛒',
            style: { fontSize: '14px' },
        });
    };

    if (loading) {
        return (
            <div className="px-4 py-6">
                <div className="flex items-center gap-2 mb-4">
                    <Sparkles className="w-5 h-5" style={{ color: inkColor }} />
                    <h3 className="font-semibold text-gray-800">Recommended for You</h3>
                </div>
                <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                    {[1, 2, 3].map((i) => (
                        <div
                            key={i}
                            className="flex-shrink-0 w-36 bg-gray-100 rounded-xl animate-pulse"
                        >
                            <div className="h-24 bg-gray-200 rounded-t-xl"></div>
                            <div className="p-3 space-y-2">
                                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                                <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    if (recommendations.length === 0) {
        return null;
    }

    const title = context.has_cart
        ? 'Complete Your Order'
        : context.time_of_day === 'breakfast'
        ? 'Breakfast Picks'
        : context.time_of_day === 'lunch'
        ? 'Lunch Favorites'
        : context.time_of_day === 'dinner'
        ? 'Dinner Specials'
        : 'Recommended for You';

    return (
        <div className="py-4">
            {/* Header */}
            <div className="px-4 flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <div
                        className="p-1.5 rounded-lg"
                        style={{ backgroundColor: `${primaryColor}15` }}
                    >
                        <Sparkles className="w-4 h-4" style={{ color: inkColor }} />
                    </div>
                    <h3 className="font-semibold text-gray-800 text-sm">{title}</h3>
                </div>
                {context.has_cart && (
                    <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full">
                        AI picks
                    </span>
                )}
            </div>

            {/* Carousel */}
            <div className="flex gap-3 overflow-x-auto pb-2 px-4 scrollbar-hide">
                {recommendations.map((item) => {
                    const IconComponent = typeIcons[item.recommendation_type] || Sparkles;

                    return (
                        <div
                            key={item.id}
                            className="flex-shrink-0 w-36 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow"
                        >
                            {/* Image */}
                            <div className="relative h-24 bg-gray-100">
                                {item.image ? (
                                    <img
                                        src={`/storage/${item.image}`}
                                        alt={item.name}
                                        className="w-full h-full object-cover"
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-3xl">
                                        🍽️
                                    </div>
                                )}

                                {/* Recommendation badge */}
                                <div
                                    className="absolute top-2 left-2 flex items-center gap-1 px-1.5 py-0.5 rounded-full text-on-restaurant text-[10px] font-medium"
                                    style={{ backgroundColor: primaryColor }}
                                >
                                    <IconComponent className="w-3 h-3" />
                                </div>

                                {/* Add button */}
                                <button
                                    onClick={() => handleAddItem(item)}
                                    className="absolute bottom-2 right-2 w-7 h-7 rounded-full text-on-restaurant flex items-center justify-center shadow-lg transition-transform hover:scale-110 active:scale-95"
                                    style={{ backgroundColor: primaryColor }}
                                >
                                    <Plus className="w-4 h-4" />
                                </button>
                            </div>

                            {/* Content */}
                            <div className="p-2.5">
                                <h4 className="font-medium text-gray-800 text-sm truncate">
                                    {item.name}
                                </h4>
                                <p className="text-xs text-gray-400 truncate mt-0.5">
                                    {item.recommendation_reason}
                                </p>
                                <p
                                    className="text-sm font-bold mt-1"
                                    style={{ color: inkColor }}
                                >
                                    ৳{item.price}
                                </p>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default RecommendationCarousel;
