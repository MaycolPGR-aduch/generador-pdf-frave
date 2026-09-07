import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type PublicSupabaseConfig = {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
};

function createConfiguredClient(config: PublicSupabaseConfig): SupabaseClient | null {
  const supabaseUrl = config.supabaseUrl?.trim();
  const supabaseAnonKey = config.supabaseAnonKey?.trim();
  return supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;
}

export let supabase: SupabaseClient | null = null;
export let isSupabaseConfigured = false;

/**
 * Cloudflare Pages exposes dashboard variables to Pages Functions at runtime.
 * Prefer Vite's build-time values for local development, then fall back to the
 * public runtime endpoint in production. Both values are intentionally public:
 * a Supabase publishable key is required by the browser client.
 */
export async function configureSupabase(): Promise<void> {
  supabase = createConfiguredClient({
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string | undefined,
    supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
  });

  if (!supabase) {
    try {
      const response = await window.fetch('/api/config', {
        headers: { Accept: 'application/json' },
      });
      if (response.ok) {
        const config = (await response.json()) as PublicSupabaseConfig;
        supabase = createConfiguredClient(config);
      }
    } catch {
      // The login screen presents a clear configuration message when the runtime endpoint is unavailable.
    }
  }

  isSupabaseConfigured = Boolean(supabase);
}
