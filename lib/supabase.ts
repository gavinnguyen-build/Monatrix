import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'anon-key-not-needed-in-script'
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Public client — used in browser
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Admin client — server-side only (cron, API routes)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)
