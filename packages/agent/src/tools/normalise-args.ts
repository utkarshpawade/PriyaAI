import { CRORE, LAKH } from '@rvagent/shared';

/**
 * Coerces live-LLM tool arguments into the exact vocabulary the zod schemas
 * accept, before validation runs.
 *
 * This exists because of what real models actually emit. Against Groq's
 * `gpt-oss` family on Hinglish input, `update_requirements` came back with
 * `configuration: "2 BHK"` (the enum is `"2BHK"`) and, on the 120b variant,
 * `budgetMax: 75` for "75 lakh" — a plain unit error. Both would fail zod, and a
 * rejected tool call means a silently dropped slot, which is the most expensive
 * failure mode in this product.
 *
 * The rules are deliberately narrow: they fix formatting and obvious unit
 * mistakes, and never invent a value that was not there.
 */

const CONFIGURATION_ALIASES: ReadonlyArray<readonly [RegExp, string]> = [
  [/^(?:4|5|6)\s*\+?\s*bhk\s*\+?$/i, '4BHK+'],
  [/^(?:penthouse|duplex)$/i, '4BHK+'],
  [/^(?:2\.5|3)\s*bhk$/i, '3BHK'],
  [/^2\s*bhk$/i, '2BHK'],
  [/^1\s*bhk$/i, '1BHK'],
  [/^studio$/i, '1BHK'],
  [/^(?:plot|land)$/i, 'plot'],
  [/^(?:office|office\s*space)$/i, 'office'],
  [/^(?:retail|shop|showroom)$/i, 'retail'],
];

/** Any residential figure below this is a unit mistake, not a rupee amount. */
const IMPLAUSIBLE_RUPEES = 100_000;

export function normaliseToolArgs(
  toolName: string,
  args: Record<string, unknown>,
): Record<string, unknown> {
  if (toolName !== 'update_requirements' && toolName !== 'check_matching_units') return args;

  const out: Record<string, unknown> = { ...args };

  if (typeof out.configuration === 'string') {
    out.configuration = normaliseConfiguration(out.configuration);
  }
  for (const key of ['intent', 'purpose', 'timeline', 'financing', 'propertyType'] as const) {
    if (typeof out[key] === 'string') out[key] = snakeCase(out[key]);
  }
  for (const key of ['budgetMin', 'budgetMax'] as const) {
    const coerced = normaliseRupees(out[key]);
    if (coerced !== undefined) out[key] = coerced;
  }
  if (typeof out.location === 'string') out.location = out.location.trim();

  return out;
}

function normaliseConfiguration(value: string): string {
  const trimmed = value.trim();
  for (const [pattern, canonical] of CONFIGURATION_ALIASES) {
    if (pattern.test(trimmed)) return canonical;
  }
  // Fall back to removing the space a model habitually inserts: "3 BHK" → "3BHK".
  return trimmed.replace(/\s+/g, '').toUpperCase().replace(/BHK\+?$/i, (match) => match.toUpperCase());
}

/** `"self use"`, `"Self-Use"`, `"3 months"` → `self_use`, `3_months`. */
function snakeCase(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

/**
 * Repairs the unit error models make with Indian denominations. A budget of 75
 * means 75 lakh; a budget of 1.2 means 1.2 crore. Anything already above a lakh
 * is left exactly as it is.
 */
function normaliseRupees(value: unknown): number | undefined {
  const numeric =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value.replace(/[^\d.]/g, ''))
        : NaN;

  if (!Number.isFinite(numeric) || numeric <= 0) return undefined;
  if (numeric >= IMPLAUSIBLE_RUPEES) return Math.round(numeric);
  if (numeric >= 5) return Math.round(numeric * LAKH);
  return Math.round(numeric * CRORE);
}
