import type { NextConfig } from "next";

const securityHeaders = [
  // Prevent clickjacking
  { key: 'X-Frame-Options', value: 'DENY' },
  // Prevent MIME sniffing
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Force HTTPS for 1 year
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  // Referrer policy
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Permissions policy — disable unnecessary browser features
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  // Content Security Policy
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      // Next.js needs unsafe-inline for styles; wagmi/viem needs eval for some wasm
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      // Allow images from our own domain + token/protocol logos
      "img-src 'self' data: blob:",
      // Allow connections to Monad RPC, Supabase, external APIs used by adapters
      [
        "connect-src 'self'",
        "https://*.supabase.co",
        "https://rpc.monad.xyz",
        "https://rpc1.monad.xyz",
        "https://rpc2.monad.xyz",
        "https://rpc3.monad.xyz",
        "https://api.morpho.org",
        "https://api.kuru.io",
        "https://api.geckoterminal.com",
        "https://yields.llama.fi",
        "https://monad.goldsky.com",
        "wss://*.walletconnect.com",
        "https://*.walletconnect.com",
        "wss://ws.kuru.io",
        "https://api.coingecko.com",
      ].join(' '),
      "font-src 'self'",
      "frame-src 'none'",
    ].join('; '),
  },
]

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ]
  },
}

export default nextConfig;
