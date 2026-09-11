import { describe, expect, it } from 'vitest';
import {
  calculateDocumentTotals,
  calculateLineAmounts,
  centsToMoney,
  formatCurrencyAmount,
  formatDecimal,
} from './money';

describe('money calculations', () => {
  it('calculates a document line using integer cents', () => {
    expect(calculateLineAmounts('2', '17.4', '0.18')).toEqual({
      subtotalCents: 3480,
      taxCents: 626,
      totalCents: 4106,
    });
  });

  it('rounds each line before accumulating totals', () => {
    const result = calculateDocumentTotals(
      [
        { quantityKg: '2', unitPriceUsd: '17.4' },
        { quantityKg: '1', unitPriceUsd: '20' },
      ],
      '0.18',
    );
    expect(result.totals).toEqual({ subtotalUsd: '54.80', taxUsd: '9.86', totalUsd: '64.66' });
  });

  it('formats cents with two decimals', () => {
    expect(centsToMoney(0)).toBe('0.00');
    expect(centsToMoney(14520)).toBe('145.20');
  });

  it('formats numeric values returned by Postgres numeric columns', () => {
    expect(formatDecimal(17.4, 2)).toBe('17.40');
    expect(formatDecimal('17.4', 4)).toBe('17.4000');
  });

  it('rounds monetary values to two decimals for display', () => {
    expect(formatCurrencyAmount('58.835')).toBe('58.84');
    expect(formatCurrencyAmount('61.1884')).toBe('61.19');
  });
});
