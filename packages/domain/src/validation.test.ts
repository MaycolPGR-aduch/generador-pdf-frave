import { describe, expect, it } from 'vitest';
import type { DocumentDraftInput } from './types';
import { validateDocumentDraft } from './validation';

const draft = (type: 'proposal' | 'proforma', quantityKg?: string): DocumentDraftInput => ({
  type,
  applyIgv: true,
  currency: 'USD',
  clientId: 'client-id',
  sellerId: 'seller-id',
  paymentMethod: 'Contra entrega',
  deliveryMethod: 'Recojo en almacén',
  validUntil: '2026-09-30',
  considerations: [],
  items: [
    {
      productId: 'product-id',
      sku: 'FR-001',
      denomination: 'Producto de prueba',
      category: 'Pruebas',
      quantityKg,
      unitPriceUsd: '10.0000',
    },
  ],
});

describe('document draft validation', () => {
  it('allows a quotation without a quantity', () => {
    expect(validateDocumentDraft(draft('proposal'))).toEqual([]);
  });

  it('requires every confirmation item to have a kg quantity', () => {
    expect(validateDocumentDraft(draft('proforma'))).toContainEqual(
      expect.objectContaining({ path: 'items.0.quantityKg' }),
    );
  });
});
