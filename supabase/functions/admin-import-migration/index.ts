import { errorResponse, handleOptions, json } from '../_shared/http.ts';
import { authenticatedUser, isAdmin, serviceClient } from '../_shared/supabase.ts';

type MigrationProduct = {
  sku?: string;
  name?: string;
  category?: string;
  unitPriceUsd?: string;
  variants?: string[];
};

type MigrationClient = { taxId?: string; legalName?: string; tradeName?: string };
type MigrationRecord = {
  sourceKey?: string;
  sourceHash?: string;
  sourceType?: string;
};
type LegacyDocument = {
  sourceKey?: string;
  sourceHash?: string;
  type?: 'proposal' | 'proforma';
  legacyNumber?: string;
  generatedAt?: string;
  taxId?: string;
  clientName?: string;
  fileName?: string;
  driveUrl?: string;
};
type MigrationReport = {
  products?: MigrationProduct[];
  clients?: MigrationClient[];
  conflicts?: unknown[];
  migrationRecords?: MigrationRecord[];
  legacyDocuments?: LegacyDocument[];
};

const clean = (value: unknown) => (value == null ? '' : String(value).trim());

async function authenticateMigration(request: Request, admin: ReturnType<typeof serviceClient>) {
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  const configuredToken = Deno.env.get('MIGRATION_TOKEN');
  if (configuredToken && token === configuredToken) return null;
  if (!token) throw new Error('Autenticación requerida');
  const actor = await authenticatedUser(request, admin);
  if (!(await isAdmin(admin, actor.id))) throw new Error('Solo administradores');
  return actor.id;
}

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    if (request.method !== 'POST') return errorResponse('Método no permitido', 405);
    const contentLength = Number(request.headers.get('content-length') ?? 0);
    if (contentLength > 5_000_000) return errorResponse('Reporte demasiado grande', 413);
    const admin = serviceClient();
    const actorId = await authenticateMigration(request, admin);
    const report = (await request.json()) as MigrationReport;
    const products = Array.isArray(report.products) ? report.products.slice(0, 10_000) : [];
    const clients = Array.isArray(report.clients) ? report.clients.slice(0, 10_000) : [];
    const records = Array.isArray(report.migrationRecords)
      ? report.migrationRecords.slice(0, 50_000)
      : [];
    const legacyDocuments = Array.isArray(report.legacyDocuments)
      ? report.legacyDocuments.slice(0, 50_000)
      : [];
    let categoryCount = 0;
    let productCount = 0;
    let variantCount = 0;
    let clientCount = 0;
    let skippedRecords = 0;
    let legacyDocumentCount = 0;
    const { data: fallbackProfile } = await admin
      .from('profiles')
      .select('id')
      .eq('role', 'admin')
      .eq('active', true)
      .limit(1)
      .maybeSingle();
    const ownerId = actorId ?? fallbackProfile?.id;
    if (legacyDocuments.length && !ownerId)
      throw new Error('No existe un administrador para asignar históricos');

    for (const source of products) {
      const sku = clean(source.sku);
      const name = clean(source.name);
      const category = clean(source.category) || 'Sin categoría';
      const price = clean(source.unitPriceUsd);
      if (!sku || !name || !price) continue;
      let { data: categoryRow } = await admin
        .from('product_categories')
        .select('id')
        .eq('normalized_name', category.toLowerCase())
        .maybeSingle();
      if (!categoryRow) {
        const result = await admin
          .from('product_categories')
          .insert({ name: category })
          .select('id')
          .single();
        if (result.error || !result.data)
          throw result.error ?? new Error('No se pudo crear la categoría');
        categoryRow = result.data;
        categoryCount += 1;
      }
      const existing = await admin.from('products').select('id').ilike('sku', sku).maybeSingle();
      if (existing.error) throw existing.error;
      let productId = existing.data?.id;
      if (!productId) {
        const result = await admin
          .from('products')
          .insert({
            sku,
            name,
            category_id: categoryRow.id,
            unit_price_usd: price,
            legacy_source: 'xlsx',
          })
          .select('id')
          .single();
        if (result.error || !result.data)
          throw result.error ?? new Error('No se pudo crear el producto');
        productId = result.data.id;
        productCount += 1;
      }
      const variants = Array.isArray(source.variants)
        ? [...new Set(source.variants.map(clean).filter(Boolean))]
        : [];
      for (const name of variants) {
        const existingVariant = await admin
          .from('product_variants')
          .select('id')
          .eq('product_id', productId)
          .ilike('name', name)
          .maybeSingle();
        if (existingVariant.error) throw existingVariant.error;
        if (existingVariant.data) continue;
        const result = await admin
          .from('product_variants')
          .insert({ product_id: productId, name, active: true });
        if (result.error) throw result.error;
        variantCount += 1;
      }
    }

    for (const source of clients) {
      const taxId = clean(source.taxId);
      const legalName = clean(source.legalName) || `Cliente ${taxId || 'histórico'}`;
      if (!taxId) continue;
      const existing = await admin.from('clients').select('id').eq('tax_id', taxId).maybeSingle();
      if (existing.error) throw existing.error;
      if (existing.data) continue;
      const result = await admin
        .from('clients')
        .insert({
          tax_id: taxId,
          legal_name: legalName,
          trade_name: clean(source.tradeName) || null,
          legacy_source: 'xlsx',
        })
        .select('id')
        .single();
      if (result.error || !result.data)
        throw result.error ?? new Error('No se pudo crear el cliente');
      clientCount += 1;
    }

    for (const source of legacyDocuments) {
      const sourceKey = clean(source.sourceKey);
      const sourceHash = clean(source.sourceHash);
      const legacyNumber = clean(source.legacyNumber);
      if (!sourceKey || !sourceHash || !legacyNumber || !ownerId) continue;
      const existingRecord = await admin
        .from('migration_records')
        .select('id, target_id, source_hash')
        .eq('source_key', sourceKey)
        .maybeSingle();
      if (existingRecord.error) throw existingRecord.error;
      if (existingRecord.data && existingRecord.data.source_hash !== sourceHash) {
        await admin
          .from('migration_records')
          .update({ status: 'review', issue: 'Cambió el hash de origen' })
          .eq('id', existingRecord.data.id);
        skippedRecords += 1;
        continue;
      }
      if (existingRecord.data?.target_id) {
        skippedRecords += 1;
        continue;
      }
      const existingClient = await admin
        .from('clients')
        .select('id')
        .eq('tax_id', clean(source.taxId))
        .maybeSingle();
      if (existingClient.error) throw existingClient.error;
      let clientId = existingClient.data?.id;
      if (!clientId) {
        const insertedClient = await admin
          .from('clients')
          .insert({
            tax_id: clean(source.taxId) || `LEGACY-${sourceKey}`,
            legal_name: clean(source.clientName) || 'Cliente histórico pendiente de revisión',
            legacy_source: 'xlsx',
          })
          .select('id')
          .single();
        if (insertedClient.error || !insertedClient.data)
          throw insertedClient.error ?? new Error('No se pudo crear cliente histórico');
        clientId = insertedClient.data.id;
        clientCount += 1;
      }
      if (!clientId) continue;
      const generatedAt = new Date(source.generatedAt ?? '');
      const date = Number.isNaN(generatedAt.getTime()) ? new Date() : generatedAt;
      const result = await admin
        .from('documents')
        .insert({
          type: source.type === 'proforma' ? 'proforma' : 'proposal',
          status: 'generated',
          legacy_number: legacyNumber,
          legacy_file_name: clean(source.fileName) || null,
          legacy_drive_url: clean(source.driveUrl) || null,
          legacy_source_hash: sourceHash,
          client_id: clientId,
          created_by: ownerId,
          seller_id: ownerId,
          payment_method: 'Importado del historial',
          delivery_method: 'Importado del historial',
          valid_until: date.toISOString().slice(0, 10),
          considerations: ['Documento histórico; el PDF permanece en Google Drive.'],
          template_version: 'legacy-google-drive',
          created_at: date.toISOString(),
        })
        .select('id')
        .single();
      if (result.error || !result.data)
        throw result.error ?? new Error('No se pudo crear el documento histórico');
      const migrationResult = existingRecord.data
        ? await admin
            .from('migration_records')
            .update({ target_id: result.data.id, status: 'imported', issue: null })
            .eq('id', existingRecord.data.id)
        : await admin.from('migration_records').insert({
            source_key: sourceKey,
            source_hash: sourceHash,
            source_type: 'xlsx-history',
            target_id: result.data.id,
            status: 'imported',
          });
      if (migrationResult.error) throw migrationResult.error;
      legacyDocumentCount += 1;
    }

    for (const source of records) {
      const sourceKey = clean(source.sourceKey);
      const sourceHash = clean(source.sourceHash);
      if (!sourceKey || !sourceHash) continue;
      const existing = await admin
        .from('migration_records')
        .select('id, source_hash')
        .eq('source_key', sourceKey)
        .maybeSingle();
      if (existing.error) throw existing.error;
      if (existing.data) {
        if (existing.data.source_hash !== sourceHash) {
          await admin
            .from('migration_records')
            .update({ status: 'review', issue: 'Cambió el hash de origen' })
            .eq('id', existing.data.id);
        }
        skippedRecords += 1;
        continue;
      }
      const result = await admin.from('migration_records').insert({
        source_key: sourceKey,
        source_hash: sourceHash,
        source_type: clean(source.sourceType) || 'xlsx',
        status: 'imported',
      });
      if (result.error) throw result.error;
    }

    await admin.from('audit_logs').insert({
      actor_id: actorId,
      action: 'import_migration',
      entity_type: 'migration',
      result: 'success',
      metadata: {
        products: productCount,
        categories: categoryCount,
        variants: variantCount,
        clients: clientCount,
        records: records.length,
        skippedRecords,
        conflicts: Array.isArray(report.conflicts) ? report.conflicts.length : 0,
        historicalDocuments: legacyDocumentCount,
      },
    });
    return json({
      status: 'imported',
      products: productCount,
      categories: categoryCount,
      variants: variantCount,
      clients: clientCount,
      records: records.length,
      skippedRecords,
      historicalDocuments: legacyDocumentCount,
      note: 'Los PDFs históricos permanecen en Google Drive; FRAVE conserva su número, fecha, archivo y enlace.',
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : 'No se pudo importar el reporte',
      400,
    );
  }
});
