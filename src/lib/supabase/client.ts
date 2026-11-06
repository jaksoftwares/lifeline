import { createBrowserClient } from '@supabase/ssr';

/** Supabase client for client components: reads data (through RLS) and subscribes to Realtime. */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
