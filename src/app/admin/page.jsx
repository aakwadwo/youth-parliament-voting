'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
    LayoutDashboard,
    MapPin,
    Users,
    BarChart3,
    FileDown,
    Settings as SettingsIcon,
    Menu,
    LogOut,
    X,
} from 'lucide-react'

import Dashboard from '@/components/admin/Dashboard'
import Constituencies from '@/components/admin/Constituencies'
import Candidates from '@/components/admin/Candidates'
import Results from '@/components/admin/Results'
import Reports from '@/components/admin/Reports'
import Settings from '@/components/admin/Settings'
import { Button } from '@/components/ui/button'
import { BrandMark, TricolourRule } from '@/components/brand/BrandMark'
import { Skeleton } from '@/components/ui/feedback'
import { cn } from '@/lib/utils'
import { ORGANISATION_SHORT_NAME } from '@/lib/election'

const SECTIONS = [
    { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, Component: Dashboard },
    { key: 'constituencies', label: 'Constituencies', icon: MapPin, Component: Constituencies },
    { key: 'candidates', label: 'Candidates', icon: Users, Component: Candidates },
    { key: 'results', label: 'Results', icon: BarChart3, Component: Results },
    { key: 'reports', label: 'Reports', icon: FileDown, Component: Reports },
    { key: 'settings', label: 'Settings', icon: SettingsIcon, Component: Settings },
]

const DEFAULT_SECTION = 'dashboard'

function AdminPortal() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const [navOpen, setNavOpen] = useState(false)
    const [signingOut, setSigningOut] = useState(false)

    // Section lives in the URL rather than component state, so an administrator
    // can bookmark or share "the results tab", and a page refresh does not throw
    // them back to the dashboard mid-count.
    const requested = searchParams.get('section')
    const active = SECTIONS.some((s) => s.key === requested) ? requested : DEFAULT_SECTION
    const ActiveSection = SECTIONS.find((s) => s.key === active).Component

    const selectSection = useCallback(
        (key) => {
            router.replace(key === DEFAULT_SECTION ? '/admin' : `/admin?section=${key}`, {
                scroll: false,
            })
            setNavOpen(false)
        },
        [router]
    )

    // Escape closes the mobile drawer, matching every other dismissible surface.
    useEffect(() => {
        if (!navOpen) return
        const onKey = (e) => e.key === 'Escape' && setNavOpen(false)
        window.addEventListener('keydown', onKey)
        // Stops the page behind the drawer scrolling under it on iOS.
        document.body.style.overflow = 'hidden'
        return () => {
            window.removeEventListener('keydown', onKey)
            document.body.style.overflow = ''
        }
    }, [navOpen])

    async function handleSignOut() {
        setSigningOut(true)
        try {
            await fetch('/api/admin/logout', { method: 'POST' })
        } finally {
            router.push('/admin/login')
        }
    }

    const navItems = (
        <nav aria-label="Admin sections" className="flex flex-1 flex-col gap-1 p-3">
            {SECTIONS.map((item) => {
                const isActive = active === item.key
                return (
                    <button
                        key={item.key}
                        type="button"
                        onClick={() => selectSection(item.key)}
                        aria-current={isActive ? 'page' : undefined}
                        className={cn(
                            'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                            isActive
                                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                        )}
                    >
                        <item.icon aria-hidden="true" className="size-[1.125rem] shrink-0" />
                        {item.label}
                    </button>
                )
            })}
        </nav>
    )

    const signOutButton = (
        <div className="border-t border-sidebar-border p-3">
            <Button
                variant="ghost"
                className="w-full justify-start text-muted-foreground"
                onClick={handleSignOut}
                disabled={signingOut}
            >
                <LogOut aria-hidden="true" />
                {signingOut ? 'Signing out…' : 'Sign out'}
            </Button>
        </div>
    )

    return (
        <div className="min-h-dvh bg-surface">
            {/* Desktop sidebar */}
            <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
                <TricolourRule />
                <div className="flex items-center gap-2.5 border-b border-sidebar-border p-4">
                    <BrandMark height={32} priority />
                    <div className="min-w-0 leading-tight">
                        <p className="truncate text-sm font-semibold">{ORGANISATION_SHORT_NAME}</p>
                        <p className="text-xs text-muted-foreground">Admin portal</p>
                    </div>
                </div>
                {navItems}
                {signOutButton}
            </aside>

            {/* Mobile / tablet header.

                The portal used to refuse to render below 1024px entirely, telling
                administrators to "switch to a larger screen" — unusable for a
                returning officer checking turnout from a constituency on a phone.
                Everything is now reachable at every width. */}
            <header className="sticky top-0 z-30 border-b border-border bg-background lg:hidden">
                <TricolourRule />
                <div className="flex h-14 items-center justify-between gap-3 px-4">
                    <div className="flex min-w-0 items-center gap-2.5">
                        <BrandMark height={28} priority />
                        <div className="min-w-0 leading-tight">
                            <p className="truncate text-sm font-semibold">{ORGANISATION_SHORT_NAME}</p>
                            <p className="text-xs text-muted-foreground">
                                {SECTIONS.find((s) => s.key === active).label}
                            </p>
                        </div>
                    </div>
                    <Button
                        variant="outline"
                        size="icon"
                        aria-label="Open navigation menu"
                        aria-expanded={navOpen}
                        aria-controls="admin-mobile-nav"
                        onClick={() => setNavOpen(true)}
                    >
                        <Menu aria-hidden="true" />
                    </Button>
                </div>
            </header>

            {/* Mobile drawer */}
            {navOpen ? (
                <div className="fixed inset-0 z-50 lg:hidden">
                    <button
                        type="button"
                        aria-label="Close navigation menu"
                        className="absolute inset-0 bg-black/40"
                        onClick={() => setNavOpen(false)}
                    />
                    <div
                        id="admin-mobile-nav"
                        role="dialog"
                        aria-modal="true"
                        aria-label="Admin navigation"
                        className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-sidebar shadow-lg motion-safe:animate-in motion-safe:slide-in-from-left"
                    >
                        <div className="flex items-center justify-between gap-3 border-b border-sidebar-border p-4">
                            <div className="flex min-w-0 items-center gap-2.5">
                                <BrandMark height={30} />
                                <div className="min-w-0 leading-tight">
                                    <p className="truncate text-sm font-semibold">
                                        {ORGANISATION_SHORT_NAME}
                                    </p>
                                    <p className="text-xs text-muted-foreground">Admin portal</p>
                                </div>
                            </div>
                            <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label="Close navigation menu"
                                onClick={() => setNavOpen(false)}
                            >
                                <X aria-hidden="true" />
                            </Button>
                        </div>
                        {navItems}
                        {signOutButton}
                    </div>
                </div>
            ) : null}

            <main id="main" className="px-4 py-6 sm:px-6 sm:py-8 lg:ml-60 lg:px-8">
                <div className="mx-auto w-full max-w-6xl">
                    <ActiveSection />
                </div>
            </main>
        </div>
    )
}

export default function AdminPage() {
    // useSearchParams needs a Suspense boundary so the shell can stream.
    return (
        <Suspense
            fallback={
                <div className="min-h-dvh bg-surface p-6">
                    <Skeleton className="h-8 w-48" />
                    <Skeleton className="mt-6 h-64 w-full" />
                </div>
            }
        >
            <AdminPortal />
        </Suspense>
    )
}
