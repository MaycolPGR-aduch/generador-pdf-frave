import { DocumentDraftInput } from './types';

export interface ValidationIssue {
  path: string;
  message: string;
}

export function validateDocumentDraft(input: DocumentDraftInput): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!input.clientId.trim()) issues.push({ path: 'clientId', message: 'Selecciona un cliente' });
  if (!input.sellerId.trim()) issues.push({ path: 'sellerId', message: 'Selecciona un vendedor' });
  if (!input.paymentMethod.trim())
    issues.push({ path: 'paymentMethod', message: 'Indica la modalidad de pago' });
  if (!input.deliveryMethod.trim())
    issues.push({ path: 'deliveryMethod', message: 'Indica la modalidad de entrega' });
  if (input.currency === 'PEN') {
    if (
      !input.exchangeRatePenPerUsd ||
      !/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(input.exchangeRatePenPerUsd) ||
      Number(input.exchangeRatePenPerUsd) <= 0
    ) {
      issues.push({ path: 'exchangeRatePenPerUsd', message: 'Indica una tasa de cambio válida' });
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.validUntil)) {
    issues.push({ path: 'validUntil', message: 'La vigencia debe tener formato YYYY-MM-DD' });
  }
  if (input.items.length < 1)
    issues.push({ path: 'items', message: 'Agrega al menos un producto' });
  if (input.items.length > 100)
    issues.push({ path: 'items', message: 'El máximo es de 100 productos' });

  input.items.forEach((item, index) => {
    const path = `items.${index}`;
    if (!item.sku.trim()) issues.push({ path: `${path}.sku`, message: 'Falta la referencia' });
    if (!item.denomination.trim())
      issues.push({ path: `${path}.denomination`, message: 'Falta la denominación' });
    if (!item.category.trim())
      issues.push({ path: `${path}.category`, message: 'Falta la categoría' });
    if (!/^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/.test(item.unitPriceUsd)) {
      issues.push({ path: `${path}.unitPriceUsd`, message: 'Precio USD/kg inválido' });
    }
    if (
      input.type === 'proforma' &&
      (!item.quantityKg ||
        !/^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/.test(item.quantityKg) ||
        Number(item.quantityKg) <= 0)
    ) {
      issues.push({
        path: `${path}.quantityKg`,
        message: 'La confirmación de pedido requiere una cantidad en kg válida',
      });
    }
  });
  return issues;
}
