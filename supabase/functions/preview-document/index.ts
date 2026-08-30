import { createFravePdf } from '../_shared/pdf.ts';
import { errorResponse, handleOptions, corsHeaders } from '../_shared/http.ts';
import { authenticatedUser, serviceClient } from '../_shared/supabase.ts';
import { loadPdfData } from '../_shared/document.ts';

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
    if (
      !document ||
      (document.created_by !== user.id &&
        !(await (async () => {
          const { data } = await admin.from('profiles').select('role').eq('id', user.id).single();
          return data?.role === 'admin';
        })()))
    )
      return errorResponse('No autorizado', 403);
    const pdfData = await loadPdfData(admin, body.documentId);
    const bytes = await createFravePdf(pdfData, true);
    return new Response(bytes, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="frave-borrador.pdf"',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : 'No se pudo generar la vista previa',
      400,
    );
  }
});
