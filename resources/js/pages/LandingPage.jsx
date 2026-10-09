import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useBrandingStore } from '../stores/brandingStore';
import { contactAPI, plansAPI } from '../services/api';
import toast from 'react-hot-toast';
import {
    HiOutlineDevicePhoneMobile,
    HiOutlineQrCode,
    HiOutlineChartBarSquare,
    HiOutlineBuildingStorefront,
    HiOutlineComputerDesktop,
    HiOutlineBellAlert,
    HiOutlineUserGroup,
    HiOutlineCreditCard,
    HiOutlineCheckCircle,
    HiOutlineArrowRight,
    HiOutlinePaperAirplane,
    HiOutlineCog6Tooth,
    HiOutlineClipboardDocumentList,
    HiOutlineShieldCheck,
    HiOutlineReceiptPercent,
    HiOutlineCurrencyDollar,
    HiOutlineRocketLaunch,
    HiOutlineSparkles,
    HiOutlineCheckBadge,
    HiOutlineGlobeAlt,
    HiOutlinePaintBrush,
    HiOutlineChatBubbleLeftRight,
    HiOutlineWrenchScrewdriver,
    HiOutlineLightBulb,
    HiOutlineHandThumbUp,
    HiOutlineSquares2X2,
    HiOutlineCalendarDays,
} from 'react-icons/hi2';
import BrandLogo from '../components/ui/BrandLogo';

const PRIMARY_COLOR = '#ED802A';

// ── Core Features ──
const coreFeatures = [
    {
        icon: HiOutlineQrCode,
        title: 'QR Code Ordering',
        description: 'Customers scan a QR code at their table, browse your menu, and place orders straight from their phone — no app download needed.',
    },
    {
        icon: HiOutlineComputerDesktop,
        title: 'POS Terminal',
        description: 'Take counter orders at lightning speed. Supports cash, card, and mobile banking with instant receipt printing.',
    },
    {
        icon: HiOutlineBellAlert,
        title: 'Kitchen Display System',
        description: 'New orders appear in the kitchen in real-time. Staff tap to advance status so front-of-house always knows what\'s ready.',
    },
    {
        icon: HiOutlineClipboardDocumentList,
        title: 'Order Management',
        description: 'Track every order from placement to completion. Real-time status updates keep your entire operation in sync.',
    },
    {
        icon: HiOutlineCreditCard,
        title: 'Flexible Payments',
        description: 'Accept cash, card, online (SSLCommerz), and "Pay Later" for dine-in. Every payment is tracked automatically.',
    },
    {
        icon: HiOutlineReceiptPercent,
        title: 'VAT & Tax Handling',
        description: 'Automatic VAT calculation with inclusive/exclusive modes, compliant invoices, and downloadable tax reports.',
    },
    {
        icon: HiOutlineChartBarSquare,
        title: 'Reports & Analytics',
        description: 'Sales trends, top-selling items, revenue comparisons, daily breakdowns — all the numbers you need in one place.',
    },
    {
        icon: HiOutlineDevicePhoneMobile,
        title: 'Mobile-First Experience',
        description: 'Your entire digital menu and ordering experience is beautifully optimized for phones, tablets, and desktops.',
    },
];

// ── Extra Benefits ──
const extraBenefits = [
    {
        icon: HiOutlinePaintBrush,
        title: 'Your Brand, Your Look',
        description: 'Custom logo, colors, banner image, and favicon. Customers see your brand — not ours.',
    },
    {
        icon: HiOutlineUserGroup,
        title: 'Staff & Role Management',
        description: 'Create accounts for managers, cashiers, and kitchen staff with role-based access control.',
    },
    {
        icon: HiOutlineSquares2X2,
        title: 'Menu & Category Builder',
        description: 'Organize items by category, set prices, upload images, toggle availability — all from one dashboard.',
    },
    {
        icon: HiOutlineChatBubbleLeftRight,
        title: 'AI Menu Assistant',
        description: 'A smart chatbot on your digital menu helps customers find dishes, get recommendations, and ask about ingredients.',
    },
    {
        icon: HiOutlineGlobeAlt,
        title: 'Online Ordering Link',
        description: 'Share a single link on social media or Google — customers can order takeaway without visiting your restaurant.',
    },
    {
        icon: HiOutlineCurrencyDollar,
        title: 'Vouchers & Discounts',
        description: 'Create percentage or flat-amount voucher codes. Validate automatically at checkout.',
    },
    {
        icon: HiOutlineCalendarDays,
        title: 'Daily & Monthly Reports',
        description: 'Download sales, VAT, and revenue reports by day, week, or month for your accountant.',
    },
    {
        icon: HiOutlineShieldCheck,
        title: 'Secure & Reliable',
        description: '99.9 % uptime, automatic backups, and encrypted payments so you can focus on food — not tech.',
    },
];

// ── How it works ──
const steps = [
    { number: '01', title: 'Sign Up', description: 'Create your restaurant account in under a minute — no credit card required.' },
    { number: '02', title: 'Set Up Your Menu', description: 'Add categories, items, prices, and images. Customize your branding and tables.' },
    { number: '03', title: 'Start Taking Orders', description: 'Print QR codes, place them on tables, and let customers order instantly.' },
];

// ── Social proof ──
const stats = [
    { value: '500+', label: 'Restaurants' },
    { value: '2M+', label: 'Orders Served' },
    { value: '99.9%', label: 'Uptime' },
    { value: '24/7', label: 'Support' },
];

// ── Testimonials ──
const testimonials = [
    {
        quote: 'Our table turnover improved by 30 % after switching to QR-based ordering. Customers love it.',
        author: 'Fahad Rahman',
        role: 'Owner, Spice Garden',
    },
    {
        quote: 'The POS and kitchen display keep everything in sync. We haven\'t lost a single order ticket since day one.',
        author: 'Nusrat Jahan',
        role: 'Manager, Urban Bites',
    },
    {
        quote: 'Finally, a system that handles VAT properly and gives me reports I can actually send to my accountant.',
        author: 'Taufiq Ahmed',
        role: 'Owner, Taufiq\'s Kitchen',
    },
];

export default function LandingPage() {
    const { branding } = useBrandingStore();
    const logoSrc = branding.platform_logo ? `/storage/${branding.platform_logo}` : null;
    const platformName = branding.platform_name || 'TablePilot';

    const [form, setForm] = useState({ name: '', email: '', phone: '', restaurant_name: '', message: '' });
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    const { data: plans } = useQuery({
        queryKey: ['public-plans'],
        queryFn: () => plansAPI.list().then((r) => r.data.data),
    });

    const formatPrice = (price) => {
        return Number(price).toLocaleString('en-BD');
    };

    const getDurationLabel = (days) => {
        if (days === 30 || days === 31) return '/month';
        if (days === 365 || days === 366) return '/year';
        return `/${days} days`;
    };

    const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            await contactAPI.submit(form);
            toast.success('Your enquiry has been sent!');
            setSubmitted(true);
            setForm({ name: '', email: '', phone: '', restaurant_name: '', message: '' });
        } catch (err) {
            const errors = err.response?.data?.errors;
            if (errors) {
                Object.values(errors).flat().forEach((msg) => toast.error(msg));
            } else {
                toast.error('Something went wrong. Please try again.');
            }
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-white">
            {/* ─── Navbar ─── */}
            <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-gray-100">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
                    <Link to="/" className="flex items-center gap-2">
                        <BrandLogo
                            src={logoSrc}
                            alt={platformName}
                            className="h-10"
                            fallback={<span className="text-2xl font-bold" style={{ color: PRIMARY_COLOR }}>{platformName}</span>}
                        />
                    </Link>
                    <div className="flex items-center gap-1 sm:gap-3">
                        <a href="#features" className="hidden md:inline text-sm text-gray-600 hover:text-gray-900 px-3 py-2">Features</a>
                        <a href="#how-it-works" className="hidden md:inline text-sm text-gray-600 hover:text-gray-900 px-3 py-2">How It Works</a>
                        <a href="#pricing" className="hidden md:inline text-sm text-gray-600 hover:text-gray-900 px-3 py-2">Pricing</a>
                        <a href="#contact" className="hidden md:inline text-sm text-gray-600 hover:text-gray-900 px-3 py-2">Contact</a>
                        <Link to="/login" className="text-sm font-medium px-5 py-2.5 rounded-xl text-white transition-all hover:opacity-90" style={{ backgroundColor: PRIMARY_COLOR }}>
                            Login
                        </Link>
                    </div>
                </div>
            </nav>

            {/* ─── Hero ─── */}
            <section className="relative overflow-hidden" style={{ background: `linear-gradient(135deg, #FFF7ED 0%, #FFFFFF 50%, #FEF3C7 100%)` }}>
                <div className="absolute top-20 right-10 w-72 h-72 rounded-full blur-3xl opacity-30" style={{ backgroundColor: PRIMARY_COLOR }} />
                <div className="absolute bottom-10 left-10 w-96 h-96 rounded-full blur-3xl opacity-20" style={{ backgroundColor: '#FBBF24' }} />

                <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28 lg:py-36">
                    <div className="text-center max-w-4xl mx-auto">
                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium mb-6" style={{ backgroundColor: `${PRIMARY_COLOR}15`, color: PRIMARY_COLOR }}>
                            <HiOutlineSparkles className="w-4 h-4" />
                            The AI-Powered Restaurant Platform
                        </div>
                        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-gray-900 leading-tight tracking-tight">
                            Run Your Restaurant <br className="hidden sm:block" />
                            <span style={{ color: PRIMARY_COLOR }}>Smarter, Not Harder</span>
                        </h1>
                        <p className="mt-6 max-w-2xl mx-auto text-lg sm:text-xl text-gray-600 leading-relaxed">
                            QR code ordering, a powerful POS, real-time kitchen display, and beautiful reports —
                            everything you need to delight customers and grow revenue, from a single dashboard.
                        </p>
                        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
                            <a
                                href="#contact"
                                className="text-base px-8 py-3.5 rounded-xl text-white font-semibold shadow-lg flex items-center gap-2 transition-all hover:opacity-90"
                                style={{ backgroundColor: PRIMARY_COLOR, boxShadow: `0 10px 40px -10px ${PRIMARY_COLOR}80` }}
                            >
                                Get Started Free <HiOutlineRocketLaunch className="w-5 h-5" />
                            </a>
                            <a href="#features" className="text-base font-medium text-gray-700 hover:text-gray-900 transition-colors px-6 py-3.5 rounded-xl border border-gray-200 bg-white hover:border-gray-300">
                                See All Features
                            </a>
                        </div>
                    </div>
                </div>

                {/* Stats Banner */}
                <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
                    <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-6 sm:p-8">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
                            {stats.map((stat, i) => (
                                <div key={i}>
                                    <p className="text-3xl sm:text-4xl font-bold" style={{ color: PRIMARY_COLOR }}>{stat.value}</p>
                                    <p className="text-sm text-gray-500 mt-1">{stat.label}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            {/* ─── Core Features ─── */}
            <section id="features" className="py-20 sm:py-28 bg-white">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="text-center max-w-2xl mx-auto mb-16">
                        <p className="text-sm font-semibold tracking-wider uppercase mb-3" style={{ color: PRIMARY_COLOR }}>Core Features</p>
                        <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">Everything Your Restaurant Needs</h2>
                        <p className="mt-4 text-gray-500 text-lg">From taking orders to tracking sales — one platform covers it all.</p>
                    </div>

                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
                        {coreFeatures.map((f, i) => (
                            <div
                                key={i}
                                className="group relative rounded-2xl border border-gray-100 p-6 hover:shadow-xl hover:border-orange-100 transition-all duration-300 bg-white"
                            >
                                <div
                                    className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-4 transition-colors"
                                    style={{ backgroundColor: `${PRIMARY_COLOR}15`, color: PRIMARY_COLOR }}
                                >
                                    <f.icon className="w-6 h-6" />
                                </div>
                                <h3 className="text-lg font-semibold text-gray-900 mb-2">{f.title}</h3>
                                <p className="text-sm text-gray-500 leading-relaxed">{f.description}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ─── Extra Benefits ─── */}
            <section className="py-20 sm:py-28" style={{ backgroundColor: '#FFFBF5' }}>
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="text-center max-w-2xl mx-auto mb-16">
                        <p className="text-sm font-semibold tracking-wider uppercase mb-3" style={{ color: PRIMARY_COLOR }}>More to Love</p>
                        <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">Built for the Way You Work</h2>
                        <p className="mt-4 text-gray-500 text-lg">Thoughtful extras that make day-to-day restaurant management easier.</p>
                    </div>

                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
                        {extraBenefits.map((f, i) => (
                            <div
                                key={i}
                                className="group relative rounded-2xl border border-orange-100 p-6 hover:shadow-xl transition-all duration-300 bg-white"
                            >
                                <div
                                    className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-4 text-white transition-colors"
                                    style={{ backgroundColor: PRIMARY_COLOR }}
                                >
                                    <f.icon className="w-6 h-6" />
                                </div>
                                <h3 className="text-lg font-semibold text-gray-900 mb-2">{f.title}</h3>
                                <p className="text-sm text-gray-500 leading-relaxed">{f.description}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ─── How It Works ─── */}
            <section id="how-it-works" className="py-20 sm:py-28 bg-white">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="text-center max-w-2xl mx-auto mb-16">
                        <p className="text-sm font-semibold tracking-wider uppercase mb-3" style={{ color: PRIMARY_COLOR }}>How It Works</p>
                        <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">Up and Running in Minutes</h2>
                        <p className="mt-4 text-gray-500 text-lg">Three simple steps to digitize your restaurant.</p>
                    </div>

                    <div className="grid sm:grid-cols-3 gap-10">
                        {steps.map((s, i) => (
                            <div key={i} className="text-center relative">
                                {i < steps.length - 1 && (
                                    <div className="hidden sm:block absolute top-8 left-[60%] w-[80%] h-0.5 bg-gradient-to-r from-orange-200 to-transparent" />
                                )}
                                <div
                                    className="inline-flex items-center justify-center w-16 h-16 rounded-full text-white text-xl font-bold mb-5 shadow-lg relative z-10"
                                    style={{ backgroundColor: PRIMARY_COLOR, boxShadow: `0 10px 30px -10px ${PRIMARY_COLOR}80` }}
                                >
                                    {s.number}
                                </div>
                                <h3 className="text-xl font-semibold text-gray-900 mb-2">{s.title}</h3>
                                <p className="text-gray-500">{s.description}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ─── Testimonials ─── */}
            <section className="py-20 sm:py-28 bg-gray-50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="text-center max-w-2xl mx-auto mb-16">
                        <p className="text-sm font-semibold tracking-wider uppercase mb-3" style={{ color: PRIMARY_COLOR }}>Testimonials</p>
                        <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">Loved by Restaurant Owners</h2>
                    </div>

                    <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
                        {testimonials.map((t, i) => (
                            <div key={i} className="bg-white rounded-2xl p-8 shadow-lg border border-gray-100 flex flex-col">
                                <HiOutlineLightBulb className="w-8 h-8 mb-4 flex-shrink-0" style={{ color: PRIMARY_COLOR }} />
                                <p className="text-gray-600 italic flex-1 leading-relaxed">"{t.quote}"</p>
                                <div className="mt-6 pt-4 border-t border-gray-100">
                                    <p className="font-semibold text-gray-900 text-sm">{t.author}</p>
                                    <p className="text-xs text-gray-400">{t.role}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ─── Pricing ─── */}
            <section id="pricing" className="py-20 sm:py-28 bg-white">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="text-center max-w-2xl mx-auto mb-16">
                        <p className="text-sm font-semibold tracking-wider uppercase mb-3" style={{ color: PRIMARY_COLOR }}>Pricing</p>
                        <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">Simple, Transparent Pricing</h2>
                        <p className="mt-4 text-gray-500 text-lg">No hidden fees. Pick a plan, start today, upgrade anytime.</p>
                        {plans?.some(p => p.trial_days > 0) && (
                            <p className="mt-2 text-sm font-medium" style={{ color: PRIMARY_COLOR }}>
                                Free trial available — no credit card required
                            </p>
                        )}
                    </div>
                    <div className={`grid gap-8 max-w-5xl mx-auto ${plans?.length === 1 ? 'md:grid-cols-1 max-w-md' : plans?.length === 2 ? 'md:grid-cols-2 max-w-3xl' : 'md:grid-cols-3'}`}>
                        {plans?.map((plan, i) => {
                            const isMiddle = plans.length >= 3 && i === Math.floor(plans.length / 2);
                            const features = plan.features || [];
                            return (
                                <div
                                    key={plan.id}
                                    className={`rounded-2xl p-8 ${isMiddle ? 'bg-white shadow-2xl border-2 scale-105 relative' : 'bg-white shadow-lg border border-gray-100'}`}
                                    style={{ borderColor: isMiddle ? PRIMARY_COLOR : undefined }}
                                >
                                    {isMiddle && (
                                        <div
                                            className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-white text-sm font-medium"
                                            style={{ backgroundColor: PRIMARY_COLOR }}
                                        >
                                            Most Popular
                                        </div>
                                    )}
                                    <h3 className="text-xl font-bold text-gray-900 mb-2">{plan.name}</h3>
                                    <p className="text-gray-500 text-sm mb-4">Up to {plan.max_users} staff accounts</p>
                                    <div className="mb-6">
                                        <span className="text-4xl font-bold text-gray-900">৳{formatPrice(plan.price)}</span>
                                        <span className="text-gray-500">{getDurationLabel(plan.duration_days)}</span>
                                        {plan.annual_price && (
                                            <p className="text-sm text-gray-500 mt-2">
                                                Annual billing: ৳{formatPrice(plan.annual_price)}/year
                                            </p>
                                        )}
                                        {plan.trial_days > 0 && (
                                            <p className="text-sm font-semibold mt-2" style={{ color: PRIMARY_COLOR }}>
                                                {plan.trial_days}-day free trial
                                            </p>
                                        )}
                                    </div>
                                    {features.length > 0 && (
                                        <ul className="space-y-3 mb-8">
                                            {features.map((feature, j) => (
                                                <li key={j} className="flex items-center gap-3 text-sm text-gray-600">
                                                    <HiOutlineCheckBadge className="w-5 h-5 flex-shrink-0" style={{ color: PRIMARY_COLOR }} />
                                                    {feature}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                    <a
                                        href="/register"
                                        className={`block text-center py-3 rounded-xl font-semibold transition-all ${isMiddle ? 'text-white hover:opacity-90' : 'text-gray-700 border border-gray-200 hover:border-gray-300'}`}
                                        style={{ backgroundColor: isMiddle ? PRIMARY_COLOR : 'white' }}
                                    >
                                        {plan.trial_days > 0 ? `Start Free ${plan.trial_days}-Day Trial` : 'Get Started'}
                                    </a>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* ─── CTA Banner ─── */}
            <section className="py-20" style={{ backgroundColor: PRIMARY_COLOR }}>
                <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                    <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">Ready to Modernize Your Restaurant?</h2>
                    <p className="text-orange-100 text-lg mb-8 max-w-xl mx-auto">
                        Join hundreds of restaurant owners who are saving time, reducing errors, and boosting revenue every day.
                    </p>
                    <a
                        href="#contact"
                        className="inline-flex items-center gap-2 bg-white font-semibold px-8 py-3.5 rounded-xl hover:bg-orange-50 transition-colors shadow-lg"
                        style={{ color: PRIMARY_COLOR }}
                    >
                        Request a Free Demo <HiOutlineArrowRight className="w-5 h-5" />
                    </a>
                </div>
            </section>

            {/* ─── Contact Form ─── */}
            <section id="contact" className="py-20 sm:py-28 bg-white">
                <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="text-center mb-12">
                        <p className="text-sm font-semibold tracking-wider uppercase mb-3" style={{ color: PRIMARY_COLOR }}>Contact Us</p>
                        <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">Let's Get Your Restaurant Online</h2>
                        <p className="mt-4 text-gray-500 text-lg">Fill out the form and our team will reach out to set you up.</p>
                    </div>

                    {submitted ? (
                        <div className="text-center py-16 rounded-2xl border border-green-100 bg-green-50">
                            <HiOutlineCheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                            <h3 className="text-2xl font-semibold text-gray-900 mb-2">Thank You!</h3>
                            <p className="text-gray-600 mb-6">We've received your enquiry and will be in touch soon.</p>
                            <button
                                onClick={() => setSubmitted(false)}
                                className="font-medium hover:underline"
                                style={{ color: PRIMARY_COLOR }}
                            >
                                Send another message
                            </button>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-6 rounded-2xl p-8 sm:p-10 border border-gray-100 shadow-lg bg-white">
                            <div className="grid sm:grid-cols-2 gap-6">
                                <div>
                                    <label className="label">Full Name <span className="text-red-500">*</span></label>
                                    <input
                                        type="text"
                                        name="name"
                                        value={form.name}
                                        onChange={handleChange}
                                        className="input"
                                        placeholder="John Doe"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="label">Email Address <span className="text-red-500">*</span></label>
                                    <input
                                        type="email"
                                        name="email"
                                        value={form.email}
                                        onChange={handleChange}
                                        className="input"
                                        placeholder="you@example.com"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="grid sm:grid-cols-2 gap-6">
                                <div>
                                    <label className="label">Phone Number</label>
                                    <input
                                        type="text"
                                        name="phone"
                                        value={form.phone}
                                        onChange={handleChange}
                                        className="input"
                                        placeholder="+880 1XXX-XXXXXX"
                                    />
                                </div>
                                <div>
                                    <label className="label">Restaurant Name</label>
                                    <input
                                        type="text"
                                        name="restaurant_name"
                                        value={form.restaurant_name}
                                        onChange={handleChange}
                                        className="input"
                                        placeholder="My Restaurant"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="label">Message <span className="text-red-500">*</span></label>
                                <textarea
                                    name="message"
                                    value={form.message}
                                    onChange={handleChange}
                                    className="input min-h-[120px] resize-y"
                                    placeholder="Tell us about your restaurant and what you're looking for…"
                                    rows={5}
                                    required
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={submitting}
                                className="w-full sm:w-auto px-8 py-3.5 rounded-xl text-white font-semibold flex items-center justify-center gap-2 transition-all hover:opacity-90"
                                style={{ backgroundColor: PRIMARY_COLOR }}
                            >
                                {submitting ? (
                                    'Sending…'
                                ) : (
                                    <>
                                        Send Enquiry <HiOutlinePaperAirplane className="w-5 h-5" />
                                    </>
                                )}
                            </button>
                        </form>
                    )}
                </div>
            </section>

            {/* ─── Footer ─── */}
            <footer className="bg-gray-900 text-gray-400 py-16">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="grid md:grid-cols-4 gap-10 mb-12">
                        <div className="md:col-span-2">
                            <Link to="/" className="inline-block mb-4">
                                <BrandLogo
                                    src={branding.platform_logo_dark ? `/storage/${branding.platform_logo_dark}` : logoSrc}
                                    alt={platformName}
                                    className="h-10"
                                    fallback={<span className="text-2xl font-bold" style={{ color: PRIMARY_COLOR }}>{platformName}</span>}
                                />
                            </Link>
                            <p className="text-gray-500 max-w-md">
                                The complete restaurant management system — from QR ordering and POS to kitchen displays and analytics.
                                We help restaurants of every size serve better and grow faster.
                            </p>
                        </div>

                        <div>
                            <h4 className="text-white font-semibold mb-4">Quick Links</h4>
                            <ul className="space-y-2 text-sm">
                                <li><a href="#features" className="hover:text-white transition-colors">Features</a></li>
                                <li><a href="#how-it-works" className="hover:text-white transition-colors">How It Works</a></li>
                                <li><a href="#pricing" className="hover:text-white transition-colors">Pricing</a></li>
                                <li><a href="#contact" className="hover:text-white transition-colors">Contact</a></li>
                            </ul>
                        </div>

                        <div>
                            <h4 className="text-white font-semibold mb-4">Account</h4>
                            <ul className="space-y-2 text-sm">
                                <li><Link to="/login" className="hover:text-white transition-colors">Login</Link></li>
                                <li><a href="#contact" className="hover:text-white transition-colors">Request Demo</a></li>
                            </ul>
                        </div>
                    </div>

                    <div className="pt-8 border-t border-gray-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm">
                        <p>{branding.footer_text || `© ${new Date().getFullYear()} ${platformName}. All rights reserved.`}</p>
                        <div className="flex items-center gap-4">
                            <a href="#" className="hover:text-white transition-colors">Privacy Policy</a>
                            <a href="#" className="hover:text-white transition-colors">Terms of Service</a>
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    );
}
