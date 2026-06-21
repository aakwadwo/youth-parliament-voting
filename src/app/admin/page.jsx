'use client'

import { useEffect, useState } from 'react'
import Dashboard from '@/components/admin/Dashboard'
import Constituencies from '@/components/admin/Constituencies'
import Candidates from '@/components/admin/Candidates'
import Results from '@/components/admin/Results'
import Settings from '@/components/admin/Settings'
import { useRouter } from 'next/navigation'

const navItems = [
    { label: 'Dashboard', key: 'dashboard' },
    { label: 'Constituencies', key: 'constituencies' },
    { label: 'Candidates', key: 'candidates' },
    { label: 'Results', key: 'results' },
    { label: 'Settings', key: 'settings' },
]

const sections = {
    dashboard: Dashboard,
    constituencies: Constituencies,
    candidates: Candidates,
    results: Results,
    settings: Settings,
}

export default function AdminPage() {
    const [active, setActive] = useState('dashboard')
    const [isDesktop, setIsDesktop] = useState(
        () => typeof window !== 'undefined' && window.innerWidth >= 1024
    )
    const router = useRouter()

    const ActiveSection = sections[active]

    useEffect(() => {
        function check() {
            setIsDesktop(window.innerWidth >= 1024)
        }
        check()
        window.addEventListener('resize', check)
        return () => window.removeEventListener('resize', check)
    }, [])

    async function handleLogout() {
        await fetch('/api/admin/logout', { method: 'POST' })
        router.push('/admin/login')
    }

    if (!isDesktop) {
        return (
            <main className="min-h-screen bg-white flex flex-col items-center justify-center px-6 text-center space-y-4">
                <div className="flex justify-center">
                    <div className="h-1.5 w-10 bg-[#CF0A0A]" />
                    <div className="h-1.5 w-10 bg-[#FCD20F]" />
                    <div className="h-1.5 w-10 bg-[#006B3F]" />
                </div>
                <h1 className="text-xl font-semibold text-black">Desktop only</h1>
                <p className="text-zinc-500 text-sm leading-relaxed">
                    The admin portal is only accessible on laptops and desktops. Please switch to a larger screen.
                </p>
            </main>
        )
    }

    return (
        <div className="min-h-screen bg-zinc-50 flex">

            {/* Sidebar */}
            <aside className="w-56 bg-white border-r border-zinc-200 flex flex-col fixed top-0 left-0 h-full">
                <div className="p-6 border-b border-zinc-200">
                    <div className="flex gap-0 mb-3">
                        <div className="h-1 w-6 bg-[#CF0A0A]" />
                        <div className="h-1 w-6 bg-[#FCD20F]" />
                        <div className="h-1 w-6 bg-[#006B3F]" />
                    </div>
                    <p className="text-sm font-semibold text-black leading-tight">Youth Parliament</p>
                    <p className="text-xs text-zinc-500">Admin portal</p>
                </div>

                <nav className="flex-1 p-4 space-y-1">
                    {navItems.map(item => (
                        <button
                            key={item.key}
                            onClick={() => setActive(item.key)}
                            className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
                                active === item.key
                                    ? 'bg-black text-white font-medium'
                                    : 'text-zinc-600 hover:bg-zinc-100 hover:text-black'
                            }`}
                        >
                            {item.label}
                        </button>
                    ))}
                </nav>

                <div className="p-4 border-t border-zinc-200">
                    <button
                        onClick={handleLogout}
                        className="w-full px-3 py-2.5 rounded-lg text-sm text-zinc-500 hover:bg-zinc-100 hover:text-black transition-colors text-left"
                    >
                        Sign out
                    </button>
                </div>
            </aside>

            {/* Main content */}
            <main className="flex-1 ml-56 p-8 overflow-auto">
                <ActiveSection />
            </main>

        </div>
    )
}