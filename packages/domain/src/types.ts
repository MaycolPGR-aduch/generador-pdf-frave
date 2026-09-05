export const documentTypes = ['proposal', 'proforma'] as const;
export type DocumentType = (typeof documentTypes)[number];

export const documentStatuses = [
  'draft',
  'generating',
  'generated',
  'generation_failed',
  'sent',
  'void',
] as const;
export type DocumentStatus = (typeof documentStatuses)[number];

export const userRoles = ['admin', 'seller'] as const;
export type UserRole = (typeof userRoles)[number];

export interface DocumentItemInput {
  productId?: string;
  variantId?: string;
  sku: string;
  denomination: string;
  category: string;
  quantityKg?: string;
  unitPriceUsd: string;
  observation?: string;
}

export interface CalculatedLine extends DocumentItemInput {
  subtotalUsd: string;
  taxUsd: string;
  totalUsd: string;
}

export interface DocumentTotals {
  subtotalUsd: string;
  taxUsd: string;
  totalUsd: string;
}

export interface CommercialSettings {
  taxRate: string;
  defaultValidityDays: number;
  companyName: string;
  legalName: string;
  taxId: string;
  primaryAddress: string;
  footerAddress: string;
  location: string;
  district: string;
  country: string;
  brandColor: string;
}

export interface DocumentDraftInput {
  type: DocumentType;
  /** Cotizaciones may omit IGV; confirmations always calculate it server-side. */
  applyIgv: boolean;
  clientId: string;
  sellerId: string;
  contactId?: string;
  addressId?: string;
  paymentMethod: string;
  deliveryMethod: string;
  validUntil: string;
  considerations: string[];
  items: DocumentItemInput[];
}

export interface DocumentSnapshot {
  type: DocumentType;
  number: string;
  issuedAt: string;
  validUntil: string;
  clientName: string;
  clientTaxId: string;
  contactName?: string;
  shippingAddress?: string;
  paymentMethod: string;
  deliveryMethod: string;
  sellerName: string;
  sellerPhone?: string;
  sellerArea?: string;
  sellerEmail?: string;
  considerations: string[];
  items: CalculatedLine[];
  totals: DocumentTotals;
  settings: CommercialSettings;
  templateVersion: string;
}
