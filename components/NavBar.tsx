'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { WalletButton } from './WalletButton'
import { ThemeToggle } from './ThemeToggle'

const NAV_LINKS = [
  { href: '/',          label: 'Discover'  },
  { href: '/portfolio', label: 'Portfolio' },
]


export function NavBar() {
  const path = usePathname()

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--border)] bg-[var(--background)]/95 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">

        {/* Left: Logo + nav */}
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2.5 select-none group">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/monatrix-logo.png" alt="Monatrix" className="h-[50px] w-auto" />
            <span className="font-bold text-base tracking-[0.14em] text-white uppercase">
              Monatrix
            </span>
          </Link>
          <nav className="hidden sm:flex items-center">
            {NAV_LINKS.map(({ href, label }) => {
              const active = path === href
              return (
                <Link
                  key={href}
                  href={href}
                  className={`relative px-4 py-4 text-sm font-medium transition-colors ${
                    active ? 'text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {label}
                  {active && (
                    <span
                      className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3/4 h-[2px] rounded-full"
                      style={{ background: 'linear-gradient(90deg, #CC3BFF, #BFA2FF)' }}
                    />
                  )}
                </Link>
              )
            })}
          </nav>
        </div>

        {/* Right: theme toggle + wallet */}
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <WalletButton />
        </div>

      </div>
    </header>
  )
}
