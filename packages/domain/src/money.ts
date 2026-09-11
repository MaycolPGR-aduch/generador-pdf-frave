import type { DocumentItemInput, DocumentTotals } from './types';

const QUANTITY_SCALE = 1_000;
const PRICE_SCALE = 10_000;
// quantity is stored at 3 decimals and price at 4 decimals. The product
// therefore has a 1e7 scale; multiplying by 100 converts USD to cents.
const PRODUCT_TO_CENTS_DIVISOR = 100_000;
const TAX_SCALE = 10_000;

function assertDecimal(value: string, field: string): void {
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) {
    throw new Error(`${field} debe ser un decimal positivo sin notación científica`);
  }
}

function parseScaled(value: string, scale: number, field: string): number {
  assertDecimal(value, field);
  const [whole, fraction = ''] = value.split('.');
  const normalized = fraction.padEnd(Math.round(Math.log10(scale)), '0');
  if (fraction.length > Math.round(Math.log10(scale))) {
    throw new Error(`${field} excede la precisión permitida`);
  }
  const parsed = Number(whole) * scale + Number(normalized || 0);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${field} excede el rango permitido`);
  }
  return parsed;
}

function roundHalfUp(numerator: number, denominator: number): number {
  return Math.floor((numerator + denominator / 2) / denominator);
}

export function calculateLineAmounts(
  quantityKg: string,
  unitPriceUsd: string,
  taxRate: string,
): { subtotalCents: number; taxCents: number; totalCents: number } {
  const quantityMilli = parseScaled(quantityKg, QUANTITY_SCALE, 'quantityKg');
  const priceTenThousand = parseScaled(unitPriceUsd, PRICE_SCALE, 'unitPriceUsd');
  const taxBasisPoints = parseScaled(taxRate, TAX_SCALE, 'taxRate');
  if (quantityMilli < 0 || priceTenThousand < 0 || taxBasisPoints < 0) {
    throw new Error('Los importes no pueden ser negativos');
  }
  const subtotalCents = roundHalfUp(quantityMilli * priceTenThousand, PRODUCT_TO_CENTS_DIVISOR);
  const taxCents = roundHalfUp(subtotalCents * taxBasisPoints, TAX_SCALE);
  return { subtotalCents, taxCents, totalCents: subtotalCents + taxCents };
}

export function centsToMoney(cents: number): string {
  if (!Number.isSafeInteger(cents)) throw new Error('Importe fuera de rango');
  return `${Math.trunc(cents / 100)}.${String(Math.abs(cents % 100)).padStart(2, '0')}`;
}

export function formatDecimal(value: string | number, fractionDigits = 2): string {
  const decimal = typeof value === 'number' ? String(value) : value;
  assertDecimal(decimal, 'value');
  const [whole, fraction = ''] = decimal.split('.');
  return `${whole}.${fraction.padEnd(fractionDigits, '0').slice(0, fractionDigits)}`;
}

/** Formats a monetary amount to two decimals using exact decimal half-up rounding. */
export function formatCurrencyAmount(value: string | number): string {
  const decimal = typeof value === 'number' ? String(value) : value;
  assertDecimal(decimal, 'value');

  const [whole, fraction = ''] = decimal.split('.');
  let cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0').slice(0, 2));
  if (Number(fraction[2] ?? '0') >= 5) cents += 1n;

  return `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
}

export function calculateDocumentTotals(
  items: Array<Pick<DocumentItemInput, 'quantityKg' | 'unitPriceUsd'>>,
  taxRate: string,
): {
  lines: Array<{ subtotalUsd: string; taxUsd: string; totalUsd: string }>;
  totals: DocumentTotals;
} {
  const lines = items.map((item) => {
    if (!item.quantityKg)
      throw new Error('Cada ítem debe tener cantidad para calcular los totales');
    const amounts = calculateLineAmounts(item.quantityKg, item.unitPriceUsd, taxRate);
    return {
      subtotalUsd: centsToMoney(amounts.subtotalCents),
      taxUsd: centsToMoney(amounts.taxCents),
      totalUsd: centsToMoney(amounts.totalCents),
    };
  });
  const totals = lines.reduce(
    (acc, line) => ({
      subtotalCents: acc.subtotalCents + Number(line.subtotalUsd.replace('.', '')),
      taxCents: acc.taxCents + Number(line.taxUsd.replace('.', '')),
      totalCents: acc.totalCents + Number(line.totalUsd.replace('.', '')),
    }),
    { subtotalCents: 0, taxCents: 0, totalCents: 0 },
  );
  return {
    lines,
    totals: {
      subtotalUsd: centsToMoney(totals.subtotalCents),
      taxUsd: centsToMoney(totals.taxCents),
      totalUsd: centsToMoney(totals.totalCents),
    },
  };
}
