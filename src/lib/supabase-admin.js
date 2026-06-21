import { createClient } from '@supabase/supabase-js'

// Server-only client using the service role key. This intentionally bypasses
// Row Level Security: there is no Supabase Auth session anywhere in this app
// (voters/admins are plain tables, not auth.users), so the anon key would
// carry no useful identity context. All trust decisions are enforced in the
// API route handlers instead. Never import this file from client components.
export function createAdminClient() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
            },
        }
    )
}
