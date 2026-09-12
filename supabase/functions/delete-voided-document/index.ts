import { errorResponse, handleOptions, json } from '../_shared/http.ts';
import { authenticatedUser, isAdmin, serviceClient } from '../_shared/supabase.ts';

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;

  try {
    if (request.method !== 'POST') return errorResponse('Método no permitido', 405);

    const admin = serviceClient();
    const user = await authenticatedUser(request, admin);
    if (!(await isAdmin(admin, user.id)))
      return errorResponse('Solo un administrador puede eliminar documentos anulados', 403);

    const body = (await request.json()) as { documentId?: string; reason?: string };
    const documentId = body.documentId?.trim();
    const reason = body.reason?.trim();
    if (!documentId) return errorResponse('Falta documentId');
    if (!reason) return errorResponse('Indica el motivo de eliminación');

    const { data: document, error: documentError } = await admin
      .from('documents')
      .select('id, number, legacy_number, status')
      .eq('id', documentId)
      .single();
    if (documentError || !document) return errorResponse('Documento no encontrado', 404);
    if (document.status !== 'void')
      return errorResponse('Solo se pueden eliminar documentos anulados', 409);

    const [
      { count: inventoryMovementCount, error: inventoryError },
      { count: referenceCount, error: referenceError },
    ] = await Promise.all([
      admin
        .from('inventory_movements')
        .select('id', { count: 'exact', head: true })
        .eq('document_id', documentId),
      admin
        .from('documents')
        .select('id', { count: 'exact', head: true })
        .or(`source_quote_id.eq.${documentId},supersedes_document_id.eq.${documentId}`),
    ]);
    if (inventoryError || referenceError) throw inventoryError ?? referenceError;
    if (inventoryMovementCount)
      return errorResponse(
        'No se puede eliminar este documento porque conserva movimientos de inventario auditables',
        409,
      );
    if (referenceCount)
      return errorResponse(
        'No se puede eliminar un documento usado como origen de otro documento',
        409,
      );

    const { data: file, error: fileError } = await admin
      .from('document_files')
      .select('id, storage_path, deleted_at')
      .eq('document_id', documentId)
      .maybeSingle();
    if (fileError) throw fileError;

    if (file && !file.deleted_at) {
      const { error: storageError } = await admin.storage
        .from('documents')
        .remove([file.storage_path]);
      if (storageError) throw storageError;
    }
    if (file) {
      const { error: fileDeleteError } = await admin
        .from('document_files')
        .delete()
        .eq('id', file.id);
      if (fileDeleteError) throw fileDeleteError;
    }

    const { error: deleteError } = await admin.from('documents').delete().eq('id', documentId);
    if (deleteError) throw deleteError;

    await admin.from('audit_logs').insert({
      actor_id: user.id,
      action: 'delete_voided_document',
      entity_type: 'document',
      entity_id: documentId,
      result: 'success',
      metadata: {
        documentNumber: document.number ?? document.legacy_number,
        removedPdf: Boolean(file && !file.deleted_at),
        reason,
      },
    });

    return json({ documentId, removedPdf: Boolean(file && !file.deleted_at) });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : 'No se pudo eliminar el documento anulado',
      400,
    );
  }
});
