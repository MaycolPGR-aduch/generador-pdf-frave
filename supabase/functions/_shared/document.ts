import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { PdfData } from './pdf.ts';

type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue =>
  value && typeof value === 'object' ? (value as RecordValue) : {};
const str = (value: unknown, fallback = '') => (value == null ? fallback : String(value));

export async function loadPdfData(admin: SupabaseClient, documentId: string): Promise<PdfData> {
  const { data: document, error: documentError } = await admin
    .from('documents')
    .select('*')
    .eq('id', documentId)
    .single();
  if (documentError || !document) throw new Error('Documento no encontrado');
  const [
    { data: items, error: itemsError },
    { data: client },
    { data: seller },
    { data: settings },
    { data: banks },
  ] = await Promise.all([
    admin.from('document_items').select('*').eq('document_id', documentId).order('position'),
    admin
      .from('clients')
      .select('legal_name, trade_name, tax_id')
      .eq('id', document.client_id)
      .single(),
    admin
      .from('profiles')
      .select('full_name, email, phone, area')
      .eq('id', document.seller_id)
      .single(),
    admin.from('company_settings').select('*').eq('id', true).single(),
    admin.from('bank_accounts').select('*').eq('active', true).order('display_order'),
  ]);
  if (itemsError) throw itemsError;
  const clientSnapshot = record(document.client_snapshot);
  const sellerSnapshot = record(document.seller_snapshot);
  const settingsSnapshot = record(document.settings_snapshot);
  const selectedClient = Object.keys(clientSnapshot).length
    ? clientSnapshot
    : { legalName: client?.legal_name, tradeName: client?.trade_name, taxId: client?.tax_id };
  const selectedSeller = Object.keys(sellerSnapshot).length
    ? sellerSnapshot
    : {
        fullName: seller?.full_name,
        email: seller?.email,
        phone: seller?.phone,
        area: seller?.area,
      };
  const selectedSettings = Object.keys(settingsSnapshot).length
    ? settingsSnapshot
    : (settings ?? {});
  const snapshotBanks = selectedSettings.bankAccounts;
  const selectedBanks = Array.isArray(snapshotBanks) ? snapshotBanks : (banks ?? []);
  return {
    type: document.type,
    number: document.number,
    validUntil: document.valid_until,
    client: {
      legalName: selectedClient.legalName ?? selectedClient.legal_name,
      tradeName: selectedClient.tradeName ?? selectedClient.trade_name,
      taxId: selectedClient.taxId ?? selectedClient.tax_id,
      contact: selectedClient.contact,
      address: selectedClient.address,
    },
    seller: {
      fullName: selectedSeller.fullName ?? selectedSeller.full_name,
      email: selectedSeller.email,
      phone: selectedSeller.phone,
      area: selectedSeller.area,
    },
    settings: selectedSettings,
    paymentMethod: document.payment_method,
    deliveryMethod: document.delivery_method,
    considerations: Array.isArray(document.considerations)
      ? document.considerations.map(String).filter(Boolean)
      : [],
    items: (items ?? []).map((item) => ({
      sku: str(item.sku_snapshot),
      denomination: str(item.denomination_snapshot),
      category: str(item.category_snapshot),
      quantityKg: item.quantity_kg == null ? null : str(item.quantity_kg),
      unitPriceUsd: str(item.unit_price_usd, '0'),
      taxUsd: item.tax_usd == null ? null : str(item.tax_usd),
      totalUsd: item.total_usd == null ? null : str(item.total_usd),
      observation: item.observation,
    })),
    subtotalUsd: document.subtotal_usd == null ? null : str(document.subtotal_usd),
    taxUsd: document.tax_usd == null ? null : str(document.tax_usd),
    totalUsd: document.total_usd == null ? null : str(document.total_usd),
    banks: selectedBanks as Array<RecordValue>,
  };
}
