/** Indian numbering helpers. Budgets are stored as absolute rupees everywhere. */

export const LAKH = 100_000;
export const CRORE = 10_000_000;

/** `8_500_000` -> `"₹85 L"`, `15_000_000` -> `"₹1.5 Cr"`. */
export function formatInrCompact(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return '—';
  if (amount >= CRORE) {
    const crores = amount / CRORE;
    return `₹${trimTrailingZero(crores.toFixed(2))} Cr`;
  }
  if (amount >= LAKH) {
    const lakhs = amount / LAKH;
    return `₹${trimTrailingZero(lakhs.toFixed(2))} L`;
  }
  return `₹${amount.toLocaleString('en-IN')}`;
}

/** Full Indian-grouped rupees: `8_500_000` -> `"₹85,00,000"`. */
export function formatInrFull(amount: number): string {
  if (!Number.isFinite(amount)) return '—';
  return `₹${Math.round(amount).toLocaleString('en-IN')}`;
}

export function formatBudgetRange(min?: number | null, max?: number | null): string {
  if (min != null && max != null) {
    return min === max ? formatInrCompact(min) : `${formatInrCompact(min)} – ${formatInrCompact(max)}`;
  }
  if (max != null) return `up to ${formatInrCompact(max)}`;
  if (min != null) return `${formatInrCompact(min)}+`;
  return '—';
}

function trimTrailingZero(value: string): string {
  return value.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

/**
 * Overlap test used by inventory matching. A budget with only one bound is
 * treated as open on the other side rather than as a point value, because
 * callers who say "1 crore tak" mean a ceiling, not a target.
 */
export function isWithinBudget(
  price: number,
  budgetMin?: number | null,
  budgetMax?: number | null,
): boolean {
  if (budgetMin != null && price < budgetMin) return false;
  if (budgetMax != null && price > budgetMax) return false;
  return true;
}

/** How far outside the budget a price sits, as a fraction of the nearest bound. */
export function budgetOvershoot(
  price: number,
  budgetMin?: number | null,
  budgetMax?: number | null,
): number {
  if (budgetMax != null && price > budgetMax) return (price - budgetMax) / budgetMax;
  if (budgetMin != null && price < budgetMin) return (budgetMin - price) / budgetMin;
  return 0;
}
