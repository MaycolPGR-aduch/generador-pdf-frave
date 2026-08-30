import { errorResponse, handleOptions, json } from '../_shared/http.ts';
import { authenticatedUser, serviceClient } from '../_shared/supabase.ts';

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    if (request.method !== 'POST') return errorResponse('Método no permitido', 405);
    const admin = serviceClient();
    const user = await authenticatedUser(request, admin);
    const body = (await request.json()) as { documentId?: string };
    if (!body.documentId) return errorResponse('Falta documentId');
    const { data: document } = await admin
      .from('documents')
      .select('id, status, created_by')
      .eq('id', body.documentId)
      .single();
    if (!document || !['generated', 'sent'].includes(document.status))
      return errorResponse('El documento aún no tiene un PDF emitido');
    const { data: profile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    if (document.created_by !== user.id && profile?.role !== 'admin')
      return errorResponse('No autorizado', 403);
    const { data: file, error: fileError } = await admin
      .from('document_files')
      .select('storage_path')
      .eq('document_id', body.documentId)
      .single();
    if (fileError || !file) return errorResponse('Archivo no encontrado', 404);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const { data: signed, error } = await admin.storage
      .from('documents')
      .createSignedUrl(file.storage_path, 7 * 24 * 60 * 60);
    if (error) throw error;
    await admin.from('audit_logs').insert({
      actor_id: user.id,
      action: 'create_share_link',
      entity_type: 'document',
      entity_id: body.documentId,
      result: 'success',
      metadata: { expiresAt: expiresAt.toISOString() },
    });
    return json({ url: signed.signedUrl, expiresAt: expiresAt.toISOString() });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : 'No se pudo crear el enlace',
      400,
    );
  }
});
