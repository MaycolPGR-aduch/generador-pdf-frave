import type { DocumentDraftInput } from '@frave/domain';
import { supabase } from './supabase';
import type {
  Client,
  DocumentItemRow,
  DocumentRow,
  Product,
  ProductCategory,
  Profile,
  ProductVariant,
  CompanySettings,
  BankAccount,
  ClientAddress,
  ClientContact,
} from './types';

function requireSupabase() {
  if (!supabase)
    throw new Error('Supabase no está configurado. Copia apps/web/.env.example a .env.local.');
  return supabase;
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const client = requireSupabase();
  const { data, error } = await client.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) throw error;
  return data as Profile | null;
}

export async function listDocuments(): Promise<DocumentRow[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('documents')
    .select('*, clients(legal_name, trade_name, tax_id)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as DocumentRow[];
}

export async function listClients(): Promise<Client[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('clients')
    .select('id, legal_name, trade_name, tax_id, active')
    .eq('active', true)
    .order('legal_name');
  if (error) throw error;
  return (data ?? []) as Client[];
}

export async function listProducts(): Promise<Product[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('products')
    .select('id, sku, name, category_id, unit_price_usd, active, product_categories(name)')
    .eq('active', true)
    .order('name');
  if (error) throw error;
  return (data ?? []).map((product) => ({
    ...product,
    unit_price_usd: String(product.unit_price_usd),
  })) as Product[];
}

export async function listCategories(): Promise<ProductCategory[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('product_categories')
    .select('id, name, active')
    .eq('active', true)
    .order('name');
  if (error) throw error;
  return (data ?? []) as ProductCategory[];
}

export async function createCategory(name: string): Promise<ProductCategory> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('product_categories')
    .insert({ name: name.trim() })
    .select('id, name, active')
    .single();
  if (error) throw error;
  return data as ProductCategory;
}

export async function createProduct(input: {
  sku: string;
  name: string;
  categoryId: string;
  unitPriceUsd: string;
}): Promise<Product> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('products')
    .insert({
      sku: input.sku.trim(),
      name: input.name.trim(),
      category_id: input.categoryId,
      unit_price_usd: input.unitPriceUsd,
    })
    .select('*, product_categories(name)')
    .single();
  if (error) throw error;
  return { ...data, unit_price_usd: String(data.unit_price_usd) } as Product;
}

export async function createVariant(input: {
  productId: string;
  name: string;
  priceOverrideUsd?: string;
}): Promise<ProductVariant> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('product_variants')
    .insert({
      product_id: input.productId,
      name: input.name.trim(),
      price_override_usd: input.priceOverrideUsd?.trim() || null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as ProductVariant;
}

export async function createClient(input: {
  legalName: string;
  tradeName?: string;
  taxId: string;
}): Promise<Client> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('clients')
    .insert({
      legal_name: input.legalName.trim(),
      trade_name: input.tradeName?.trim() || null,
      tax_id: input.taxId.trim(),
    })
    .select('id, legal_name, trade_name, tax_id, active')
    .single();
  if (error) throw error;
  return data as Client;
}

export async function listClientContacts(clientId: string): Promise<ClientContact[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('client_contacts')
    .select('*')
    .eq('client_id', clientId)
    .eq('active', true)
    .order('full_name');
  if (error) throw error;
  return (data ?? []) as ClientContact[];
}

export async function listClientAddresses(clientId: string): Promise<ClientAddress[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('client_addresses')
    .select('*')
    .eq('client_id', clientId)
    .eq('active', true)
    .order('label');
  if (error) throw error;
  return (data ?? []) as ClientAddress[];
}

export async function createClientContact(input: {
  clientId: string;
  fullName: string;
  salutation?: string;
  email?: string;
  phone?: string;
}): Promise<ClientContact> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('client_contacts')
    .insert({
      client_id: input.clientId,
      full_name: input.fullName.trim(),
      salutation: input.salutation?.trim() || null,
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as ClientContact;
}

export async function createClientAddress(input: {
  clientId: string;
  label: string;
  address: string;
  district?: string;
  city?: string;
}): Promise<ClientAddress> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('client_addresses')
    .insert({
      client_id: input.clientId,
      label: input.label.trim(),
      address: input.address.trim(),
      district: input.district?.trim() || null,
      city: input.city?.trim() || null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as ClientAddress;
}

export async function loadCompanySettings(): Promise<CompanySettings> {
  const client = requireSupabase();
  const { data, error } = await client.from('company_settings').select('*').eq('id', true).single();
  if (error) throw error;
  return data as CompanySettings;
}

export async function updateCompanySettings(input: {
  displayName: string;
  legalName: string;
  taxId: string;
  taxRate: string;
  defaultValidityDays: number;
  primaryAddress: string;
  footerAddress: string;
  location?: string;
  district?: string;
  country?: string;
  brandColor?: string;
}): Promise<void> {
  const client = requireSupabase();
  const { error } = await client
    .from('company_settings')
    .update({
      display_name: input.displayName,
      legal_name: input.legalName,
      tax_id: input.taxId,
      tax_rate: input.taxRate,
      default_validity_days: input.defaultValidityDays,
      primary_address: input.primaryAddress,
      footer_address: input.footerAddress,
      location: input.location,
      district: input.district,
      country: input.country,
      brand_color: input.brandColor,
    })
    .eq('id', true);
  if (error) throw error;
}

export async function listBankAccounts(): Promise<BankAccount[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('bank_accounts')
    .select('*')
    .eq('active', true)
    .order('display_order')
    .order('bank_name');
  if (error) throw error;
  return (data ?? []) as BankAccount[];
}

export async function createBankAccount(input: {
  currency: 'PEN' | 'USD';
  bankName: string;
  accountType: string;
  accountNumber: string;
  cci?: string;
}): Promise<BankAccount> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('bank_accounts')
    .insert({
      currency: input.currency,
      bank_name: input.bankName.trim(),
      account_type: input.accountType.trim(),
      account_number: input.accountNumber.trim(),
      cci: input.cci?.trim() || null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as BankAccount;
}

export async function inviteUser(input: {
  email: string;
  fullName: string;
  role: 'admin' | 'seller';
}): Promise<{ userId: string; status: string }> {
  return invokePdfFunction('admin-invite-user', input);
}

export async function listVariants(productIds?: string[]): Promise<ProductVariant[]> {
  const client = requireSupabase();
  let query = client.from('product_variants').select('*').eq('active', true).order('name');
  if (productIds?.length) query = query.in('product_id', productIds);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((variant) => ({
    ...variant,
    price_override_usd:
      variant.price_override_usd == null ? null : String(variant.price_override_usd),
  })) as ProductVariant[];
}

export async function createDraft(input: DocumentDraftInput, userId: string): Promise<DocumentRow> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('documents')
    .insert({
      type: input.type,
      client_id: input.clientId,
      created_by: userId,
      seller_id: userId,
      contact_id: input.contactId ?? null,
      address_id: input.addressId ?? null,
      payment_method: input.paymentMethod,
      delivery_method: input.deliveryMethod,
      valid_until: input.validUntil,
      considerations: input.considerations,
    })
    .select('*, clients(legal_name, trade_name, tax_id)')
    .single();
  if (error) throw error;
  const document = data as DocumentRow;
  const itemRows = input.items.map((item, index) => ({
    document_id: document.id,
    position: index + 1,
    product_id: item.productId,
    variant_id: item.variantId ?? null,
    quantity_kg: item.quantityKg ?? null,
    observation: item.observation ?? null,
  }));
  const itemResult = await client.from('document_items').insert(itemRows);
  if (itemResult.error) {
    await client.from('documents').delete().eq('id', document.id);
    throw itemResult.error;
  }
  return document;
}

export async function updateDraft(
  documentId: string,
  input: DocumentDraftInput,
): Promise<DocumentRow> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('documents')
    .update({
      type: input.type,
      client_id: input.clientId,
      payment_method: input.paymentMethod,
      delivery_method: input.deliveryMethod,
      valid_until: input.validUntil,
      considerations: input.considerations,
    })
    .eq('id', documentId)
    .eq('status', 'draft')
    .select('*, clients(legal_name, trade_name, tax_id)')
    .single();
  if (error) throw error;
  const itemResult = await client.rpc('replace_draft_items', {
    p_document_id: documentId,
    p_items: input.items.map((item) => ({
      productId: item.productId,
      variantId: item.variantId ?? null,
      quantityKg: item.quantityKg ?? null,
      observation: item.observation ?? null,
    })),
  });
  if (itemResult.error) throw itemResult.error;
  return data as DocumentRow;
}

export async function loadDocument(
  id: string,
): Promise<{ document: DocumentRow; items: DocumentItemRow[] }> {
  const client = requireSupabase();
  const [documentResult, itemsResult] = await Promise.all([
    client
      .from('documents')
      .select('*, clients(legal_name, trade_name, tax_id)')
      .eq('id', id)
      .single(),
    client.from('document_items').select('*').eq('document_id', id).order('position'),
  ]);
  if (documentResult.error) throw documentResult.error;
  if (itemsResult.error) throw itemsResult.error;
  return {
    document: documentResult.data as DocumentRow,
    items: (itemsResult.data ?? []) as DocumentItemRow[],
  };
}

export async function invokePdfFunction<T>(
  name: string,
  body: Record<string, unknown>,
): Promise<T> {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke(name, { body });
  if (error) throw error;
  return data as T;
}

export async function previewDocument(documentId: string): Promise<void> {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke('preview-document', {
    body: { documentId },
  });
  if (error) throw error;
  const blob = data instanceof Blob ? data : new Blob([data], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener,noreferrer');
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function generateDocument(
  documentId: string,
): Promise<{ documentId: string; number: string; status: string; downloadUrl: string }> {
  return invokePdfFunction('generate-document', {
    documentId,
    idempotencyKey: crypto.randomUUID(),
  });
}

export async function createShareLink(
  documentId: string,
): Promise<{ url: string; expiresAt: string }> {
  return invokePdfFunction('create-share-link', { documentId });
}

export async function downloadDocument(documentId: string): Promise<void> {
  const { url } = await createShareLink(documentId);
  window.open(url, '_blank', 'noopener,noreferrer');
}

export async function duplicateDocument(sourceDocumentId: string): Promise<string> {
  const client = requireSupabase();
  const { data, error } = await client.rpc('duplicate_document', { p_source_id: sourceDocumentId });
  if (error) throw error;
  return data as string;
}

export async function markDocumentSent(documentId: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.rpc('mark_document_sent', { p_document_id: documentId });
  if (error) throw error;
}

export async function voidDocument(documentId: string, reason: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.rpc('void_document', {
    p_document_id: documentId,
    p_reason: reason,
  });
  if (error) throw error;
}
