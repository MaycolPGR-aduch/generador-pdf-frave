import { createFravePdf, TEMPLATE_VERSION } from '../_shared/pdf.ts';
import { errorResponse, handleOptions, json } from '../_shared/http.ts';
import { authenticatedUser, serviceClient, isAdmin } from '../_shared/supabase.ts';
import { loadPdfData } from '../_shared/document.ts';

async function sha256Hex(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  let admin: ReturnType<typeof serviceClient> | undefined;
  let documentId = '';
  try {
    if (request.method !== 'POST') return errorResponse('Método no permitido', 405);
    admin = serviceClient();
    const user = await authenticatedUser(request, admin);
    const body = (await request.json()) as { documentId?: string; idempotencyKey?: string };
    documentId = body.documentId ?? '';
    const key = body.idempotencyKey ?? crypto.randomUUID();
    if (!documentId) return errorResponse('Falta documentId');
    const { data: source } = await admin
      .from('documents')
      .select('created_by')
      .eq('id', documentId)
      .single();
    if (!source || (source.created_by !== user.id && !(await isAdmin(admin, user.id))))
      return errorResponse('No autorizado', 403);
    const { data: finalized, error: finalizeError } = await admin.rpc('finalize_document', {
      p_document_id: documentId,
      p_idempotency_key: key,
    });
    if (finalizeError) throw finalizeError;
    const pdfData = await loadPdfData(admin, documentId);
    const bytes = await createFravePdf(pdfData);
    const hash = await sha256Hex(bytes);
    const year = Number(finalized?.sequence_year ?? new Date().getUTCFullYear());
    const typePath = pdfData.type;
    const number = pdfData.number ?? `draft-${documentId}`;
    const storagePath = `documents/${year}/${typePath}/${documentId}/${number}.pdf`;
    const { error: uploadError } = await admin.storage
      .from('documents')
      .upload(storagePath, bytes, { contentType: 'application/pdf', upsert: false });
    if (uploadError && !uploadError.message.toLowerCase().includes('already exists'))
      throw uploadError;
    const { error: fileError } = await admin.from('document_files').upsert(
      {
        document_id: documentId,
        storage_path: storagePath,
        sha256: hash,
        file_size_bytes: bytes.byteLength,
        template_version: TEMPLATE_VERSION,
      },
      { onConflict: 'document_id' },
    );
    if (fileError) throw fileError;
    const { error: updateError } = await admin
      .from('documents')
      .update({ status: 'generated', template_version: TEMPLATE_VERSION, generation_error: null })
      .eq('id', documentId);
    if (updateError) throw updateError;
    const { data: signed, error: signedError } = await admin.storage
      .from('documents')
      .createSignedUrl(storagePath, 60 * 60 * 24 * 7);
    if (signedError) throw signedError;
    await admin.from('audit_logs').insert({
      actor_id: user.id,
      action: 'generate_document',
      entity_type: 'document',
      entity_id: documentId,
      result: 'success',
      metadata: { number, templateVersion: TEMPLATE_VERSION },
    });
    return json({
      documentId,
      number,
      status: finalized?.status === 'generating' ? 'generated' : finalized?.status,
      downloadUrl: signed?.signedUrl,
      templateVersion: TEMPLATE_VERSION,
    });
  } catch (error) {
    if (admin && documentId) {
      await admin
        .from('documents')
        .update({
          status: 'generation_failed',
          generation_error: error instanceof Error ? error.message : 'Error de generación',
        })
        .eq('id', documentId)
        .in('status', ['generating', 'generation_failed']);
    }
    return errorResponse(
      error instanceof Error ? error.message : 'No se pudo generar el documento',
      400,
    );
  }
});
