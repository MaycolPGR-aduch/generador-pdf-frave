import { errorResponse, handleOptions, json } from '../_shared/http.ts';
import { authenticatedUser, isAdmin, serviceClient } from '../_shared/supabase.ts';

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;

  try {
    if (request.method !== 'POST') return errorResponse('Método no permitido', 405);

    const admin = serviceClient();
    const user = await authenticatedUser(request, admin);
    if (!(await isAdmin(admin, user.id))) return errorResponse('Solo un administrador puede eliminar PDFs', 403);

    const body = (await request.json()) as { documentId?: string; reason?: string };
    const documentId = body.documentId?.trim();
    const reason = body.reason?.trim();
    if (!documentId) return errorResponse('Falta documentId');
    if (!reason) return errorResponse('Indica el motivo de eliminación');

    const { data: document, error: documentError } = await admin
      .from('documents')
      .select('id, number, status')
      .eq('id', documentId)
      .single();
    if (documentError || !document) return errorResponse('Documento no encontrado', 404);
    if (!['generated', 'sent', 'void'].includes(document.status))
      return errorResponse('Solo se puede eliminar el PDF de un documento emitido');

    const { data: file, error: fileError } = await admin
      .from('document_files')
      .select('id, storage_path, file_size_bytes, deleted_at')
      .eq('document_id', documentId)
      .single();
    if (fileError || !file) return errorResponse('El documento no tiene un PDF almacenado', 404);
    if (file.deleted_at) return errorResponse('El PDF ya fue eliminado', 409);

    const { error: storageError } = await admin.storage.from('documents').remove([file.storage_path]);
    if (storageError) throw storageError;

    const deletedAt = new Date().toISOString();
    const { error: updateError } = await admin
      .from('document_files')
      .update({
        deleted_at: deletedAt,
        deleted_by: user.id,
        deletion_reason: reason,
      })
      .eq('id', file.id)
      .is('deleted_at', null);
    if (updateError) throw updateError;

    await admin.from('audit_logs').insert({
      actor_id: user.id,
      action: 'delete_document_pdf',
      entity_type: 'document',
      entity_id: documentId,
      result: 'success',
      metadata: {
        documentNumber: document.number,
        fileSizeBytes: file.file_size_bytes,
        reason,
      },
    });

    return json({ documentId, deletedAt });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : 'No se pudo eliminar el PDF',
      400,
    );
  }
});
