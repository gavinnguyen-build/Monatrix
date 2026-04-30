import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { Providers } from '@/components/Providers'
import { NavBar } from '@/components/NavBar'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Monatrix — Yield & LP Aggregator on Monad',
  description: 'Discover and compare every yield opportunity across Monad DeFi in one place.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full bg-[#0b0f1a] text-[#e2e8f0] flex flex-col">
        <Providers>
          <NavBar />
          <main className="flex-1">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  )
}
