import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2';

export function serviceClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function authenticatedUser(request: Request, admin: SupabaseClient): Promise<User> {
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('Autenticación requerida');
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new Error('Sesión inválida');
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('active')
    .eq('id', data.user.id)
    .single();
  if (profileError || !profile?.active) throw new Error('Usuario inactivo');
  return data.user;
}

export async function isAdmin(admin: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await admin.from('profiles').select('role, active').eq('id', userId).single();
  return data?.active === true && data.role === 'admin';
}
