import { errorResponse, handleOptions, json } from '../_shared/http.ts';
import { authenticatedUser, isAdmin, serviceClient } from '../_shared/supabase.ts';

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    if (request.method !== 'POST') return errorResponse('Método no permitido', 405);
    const admin = serviceClient();
    const actor = await authenticatedUser(request, admin);
    if (!(await isAdmin(admin, actor.id))) return errorResponse('Solo administradores', 403);
    const body = (await request.json()) as {
      email?: string;
      fullName?: string;
      role?: 'admin' | 'seller';
    };
    const email = body.email?.trim().toLowerCase();
    const fullName = body.fullName?.trim();
    const role = body.role ?? 'seller';
    if (!email || !fullName || !['admin', 'seller'].includes(role))
      return errorResponse('email, fullName y role son obligatorios');
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName },
    });
    if (error || !data.user) throw error ?? new Error('No se pudo invitar al usuario');
    const { error: profileError } = await admin
      .from('profiles')
      .update({ full_name: fullName, role, active: true })
      .eq('id', data.user.id);
    if (profileError) throw profileError;
    await admin.from('audit_logs').insert({
      actor_id: actor.id,
      action: 'invite_user',
      entity_type: 'profile',
      entity_id: data.user.id,
      result: 'success',
      metadata: { email, role },
    });
    return json({ userId: data.user.id, status: 'invited' });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : 'No se pudo invitar al usuario',
      400,
    );
  }
});
