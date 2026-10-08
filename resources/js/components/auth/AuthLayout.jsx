import React from 'react';
import { Link } from 'react-router-dom';
import { HiOutlineQrcode, HiOutlineDesktopComputer, HiOutlineSparkles, HiCheck } from 'react-icons/hi';
import { useBrandingStore } from '../../stores/brandingStore';

const HIGHLIGHTS = [
    { icon: HiOutlineQrcode, title: 'QR table ordering', text: 'Guests scan, browse the menu and order from their table.' },
    { icon: HiOutlineDesktopComputer, title: 'POS & kitchen display', text: 'Orders flow straight from the floor to the kitchen.' },
    { icon: HiOutlineSparkles, title: 'AI insights', text: 'Sales forecasts and recommendations that help you grow.' },
];

/** The restaurant sign-up journey, shown on the register and email-verification pages. */
export const SIGNUP_STEPS = [
    { title: 'Apply', text: 'Tell us about your restaurant and pick a plan.' },
    { title: 'Verify your email', text: 'Enter the 6-digit code we email you.' },
    { title: 'Get approved', text: 'Our team reviews your application, then you’re in.' },
];

function Highlights() {
    return (
        <ul className="mt-10 space-y-5">
            {HIGHLIGHTS.map(({ icon: Icon, title, text }) => (
                <li key={title} className="flex gap-4">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15">
                        <Icon className="h-6 w-6" />
                    </span>
                    <span>
                        <span className="block font-semibold">{title}</span>
                        <span className="block text-sm text-white/80">{text}</span>
                    </span>
                </li>
            ))}
        </ul>
    );
}

function Steps({ current }) {
    return (
        <ol className="mt-10 space-y-6">
            {SIGNUP_STEPS.map(({ title, text }, i) => {
                const state = i < current ? 'done' : i === current ? 'current' : 'upcoming';
                return (
                    <li key={title} className={`flex gap-4 ${state === 'upcoming' ? 'opacity-60' : ''}`} aria-current={state === 'current' ? 'step' : undefined}>
                        <span
                            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                                state === 'current' ? 'bg-white text-brand-700' : state === 'done' ? 'bg-white/25' : 'ring-2 ring-white/40'
                            }`}
                        >
                            {state === 'done' ? <HiCheck className="h-5 w-5" /> : i + 1}
                        </span>
                        <span className="pt-1.5">
                            <span className="block font-semibold">{title}</span>
                            <span className="block text-sm text-white/80">{text}</span>
                        </span>
                    </li>
                );
            })}
        </ol>
    );
}

/**
 * Two-column shell for the auth pages: brand panel on large screens, just the form on phones.
 * - `step` (0-2) swaps the product highlights for the sign-up steps
 * - `wide` gives long forms (registration) more room
 */
export default function AuthLayout({ title, subtitle, children, footer, step, wide = false }) {
    const { branding } = useBrandingStore();
    const platformName = branding.platform_name || 'TablePilot';
    const logoSrc = branding.platform_logo ? `/storage/${branding.platform_logo}` : null;
    const showSteps = typeof step === 'number';

    return (
        <div className="min-h-screen flex bg-white">
            {/* Brand panel (sticky so it stays put beside long forms) */}
            <aside
                className={`hidden lg:block bg-gradient-to-br from-brand-500 via-brand-600 to-brand-800 text-white ${
                    wide ? 'lg:w-[40%] xl:w-[42%]' : 'lg:w-[46%] xl:w-1/2'
                }`}
            >
                {/* Sticky needs a non-clipping parent, so the clipping and decoration live on this element */}
                <div className="sticky top-0 h-screen overflow-hidden">
                    <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-white/10" aria-hidden="true" />
                    <div className="absolute -bottom-32 -left-20 w-[28rem] h-[28rem] rounded-full bg-black/10" aria-hidden="true" />

                    <div className="relative z-10 flex h-full flex-col justify-between p-12 xl:p-16">
                        <Link to="/" className="flex items-center gap-3 w-fit">
                            <img src="/assets/images/tablepilot-mark.svg" alt="" className="h-10 w-10 rounded-xl ring-2 ring-white/30" />
                            <span className="text-2xl font-bold tracking-tight">{platformName}</span>
                        </Link>

                        <div className="max-w-md">
                            <h2 className="text-4xl xl:text-5xl font-extrabold leading-tight">
                                {showSteps ? 'Bring your restaurant online.' : 'Run your restaurant smarter, not harder.'}
                            </h2>
                            <p className="mt-4 text-lg text-white/85">
                                {showSteps ? 'Three steps to QR ordering, POS and AI insights.' : 'The AI-powered restaurant platform.'}
                            </p>
                            {showSteps ? <Steps current={step} /> : <Highlights />}
                        </div>

                        <p className="text-sm text-white/70">
                            {branding.footer_text || `© ${new Date().getFullYear()} ${platformName}. All rights reserved.`}
                        </p>
                    </div>
                </div>
            </aside>

            {/* Form side */}
            <main className="flex-1 flex items-center justify-center px-4 py-10 sm:px-8 bg-gray-50 lg:bg-white">
                <div className={`w-full ${wide ? 'max-w-2xl' : 'max-w-md'}`}>
                    <Link to="/" className="flex justify-center mb-8" aria-label={`${platformName} home`}>
                        {logoSrc ? (
                            <img src={logoSrc} alt={platformName} className="h-11" />
                        ) : (
                            <span className="text-3xl font-bold text-brand-700">{platformName}</span>
                        )}
                    </Link>

                    {/* Phones don't see the brand panel, so show where they are in sign-up */}
                    {showSteps && (
                        <p className="lg:hidden mb-4 text-center text-xs font-semibold uppercase tracking-wider text-brand-700">
                            Step {step + 1} of {SIGNUP_STEPS.length} · {SIGNUP_STEPS[step].title}
                        </p>
                    )}

                    <div className="bg-white rounded-2xl shadow-sm ring-1 ring-gray-200 lg:ring-0 lg:shadow-none p-6 sm:p-8 lg:p-0">
                        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
                        {subtitle && <p className="mt-1.5 text-sm text-gray-500">{subtitle}</p>}
                        <div className="mt-7">{children}</div>
                    </div>

                    {footer && <div className="mt-6 text-center text-sm text-gray-500">{footer}</div>}
                </div>
            </main>
        </div>
    );
}

/** Inline message under the form title. `tone` is 'error' | 'info' | 'success'. */
export function AuthAlert({ tone = 'error', children }) {
    const styles = {
        error: 'bg-red-50 text-red-700 ring-red-200',
        info: 'bg-amber-50 text-amber-800 ring-amber-200',
        success: 'bg-green-50 text-green-700 ring-green-200',
    };

    return (
        <div role={tone === 'error' ? 'alert' : 'status'} className={`mb-5 rounded-lg px-4 py-3 text-sm ring-1 ${styles[tone]}`}>
            {children}
        </div>
    );
}
