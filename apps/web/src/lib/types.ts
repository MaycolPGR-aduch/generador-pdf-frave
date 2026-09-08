import type { DocumentStatus, DocumentType, UserRole } from '@frave/domain';

export type Profile = {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  phone: string | null;
  area: string | null;
  active: boolean;
};

export type Client = {
  id: string;
  client_code: string;
  legal_name: string;
  trade_name: string | null;
  tax_id: string;
  active: boolean;
};

export type ClientContact = {
  id: string;
  client_id: string;
  full_name: string;
  salutation: string | null;
  email: string | null;
  phone: string | null;
  active: boolean;
};

export type ClientAddress = {
  id: string;
  client_id: string;
  label: string;
  address: string;
  district: string | null;
  city: string | null;
  active: boolean;
};

export type Product = {
  id: string;
  sku: string;
  name: string;
  category_id: string;
  unit_price_usd: string;
  stock_kg: string;
  active: boolean;
  product_categories?: Array<{ name: string }> | null;
};

export type ProductCategory = { id: string; name: string; active: boolean };
export type CompanySettings = {
  id: boolean;
  display_name: string;
  legal_name: string;
  tax_id: string;
  tax_rate: string;
  default_validity_days: number;
  low_stock_threshold_kg: string;
  primary_address: string;
  footer_address: string;
  location: string;
  district: string;
  country: string;
  brand_color: string;
  logo_path: string | null;
};

export type BankAccount = {
  id: string;
  currency: 'PEN' | 'USD';
  bank_name: string;
  account_type: string;
  account_number: string;
  cci: string | null;
  display_order: number;
  active: boolean;
};

export type ProductVariant = {
  id: string;
  product_id: string;
  name: string;
  price_override_usd: string | null;
  active: boolean;
};

export type CommercialOptionType = 'payment' | 'delivery' | 'consideration';
export type CommercialOption = {
  id: string;
  option_type: CommercialOptionType;
  label: string;
  active: boolean;
  display_order: number;
};

export type DocumentRow = {
  id: string;
  type: DocumentType;
  status: DocumentStatus;
  number: string | null;
  legacy_number: string | null;
  legacy_file_name: string | null;
  legacy_drive_url: string | null;
  legacy_source_hash: string | null;
  source_quote_id: string | null;
  client_id: string;
  created_by: string;
  seller_id: string;
  contact_id: string | null;
  address_id: string | null;
  payment_method: string;
  delivery_method: string;
  valid_until: string;
  considerations: string[];
  apply_igv: boolean;
  currency: 'USD' | 'PEN';
  exchange_rate_pen_per_usd: string | null;
  exchange_rate_source: string | null;
  exchange_rate_observed_at: string | null;
  subtotal_usd: string | null;
  tax_usd: string | null;
  total_usd: string | null;
  subtotal_document: string | null;
  tax_document: string | null;
  total_document: string | null;
  created_at: string;
  updated_at: string;
  clients?: Pick<Client, 'legal_name' | 'trade_name' | 'tax_id'> | null;
  document_files?:
    | Pick<DocumentFile, 'id' | 'deleted_at' | 'file_size_bytes'>
    | Pick<DocumentFile, 'id' | 'deleted_at' | 'file_size_bytes'>[]
    | null;
};

export type DocumentFile = {
  id: string;
  document_id: string;
  storage_path: string;
  sha256: string;
  file_size_bytes: number;
  template_version: string;
  created_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
  deletion_reason: string | null;
};

export type InventoryMovement = {
  id: string;
  product_id: string;
  document_id: string | null;
  movement_type: 'opening_balance' | 'adjustment' | 'confirmation_issue' | 'confirmation_void';
  quantity_delta_kg: string;
  stock_before_kg: string;
  stock_after_kg: string;
  reason: string;
  created_at: string;
  products?: Pick<Product, 'sku' | 'name'> | null;
  documents?: Pick<DocumentRow, 'number'> | null;
};

export type DocumentItemRow = {
  id: string;
  document_id: string;
  position: number;
  product_id: string;
  variant_id: string | null;
  source_quote_item_id: string | null;
  quantity_kg: string | null;
  observation: string | null;
  sku_snapshot: string | null;
  denomination_snapshot: string | null;
  category_snapshot: string | null;
  unit_price_usd: string | null;
  subtotal_usd: string | null;
  tax_usd: string | null;
  total_usd: string | null;
  unit_price_document: string | null;
  subtotal_document: string | null;
  tax_document: string | null;
  total_document: string | null;
};

export type ClientDocumentExport = Pick<
  DocumentRow,
  | 'id'
  | 'type'
  | 'status'
  | 'number'
  | 'legacy_number'
  | 'payment_method'
  | 'delivery_method'
  | 'valid_until'
  | 'apply_igv'
  | 'currency'
  | 'exchange_rate_pen_per_usd'
  | 'subtotal_usd'
  | 'tax_usd'
  | 'total_usd'
  | 'subtotal_document'
  | 'tax_document'
  | 'total_document'
  | 'created_at'
> & {
  sent_at: string | null;
  voided_at: string | null;
  void_reason: string | null;
  document_items: DocumentItemRow[];
};
