type PublicRuntimeEnv = {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
};

type PagesContext = {
  env: PublicRuntimeEnv;
};

/**
 * Exposes only Supabase's browser-safe configuration at runtime. Never add
 * service-role keys or any other privileged value to this endpoint.
 */
export const onRequestGet = ({ env }: PagesContext): Response =>
  Response.json(
    {
      supabaseUrl: env.VITE_SUPABASE_URL,
      supabaseAnonKey: env.VITE_SUPABASE_ANON_KEY,
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=300',
      },
    },
  );
