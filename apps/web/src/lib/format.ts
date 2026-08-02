import { LANGUAGE_LABELS, formatBudgetRange, type Language } from '@rvagent/shared';

export { formatBudgetRange, formatInrCompact } from '@rvagent/shared';

export function languageLabel(language: string | null | undefined): string {
  if (!language) return '—';
  return LANGUAGE_LABELS[language as Language] ?? language;
}

const OUTCOME_LABELS: Record<string, string> = {
  qualified: 'Qualified',
  not_interested: 'Not interested',
  callback_requested: 'Callback',
  wrong_number: 'Wrong number',
  abandoned: 'Abandoned',
  in_progress: 'In progress',
};

export function outcomeLabel(outcome: string): string {
  return OUTCOME_LABELS[outcome] ?? outcome;
}

const STATUS_LABELS: Record<string, string> = {
  new_lead: 'New',
  qualified: 'Qualified',
  unqualified: 'Unqualified',
  callback_scheduled: 'Callback scheduled',
  site_visit_scheduled: 'Site visit booked',
  do_not_call: 'Do not call',
  closed_lost: 'Closed lost',
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

const SLOT_LABELS: Record<string, string> = {
  intent: 'Intent',
  configuration: 'Configuration',
  propertyType: 'Property type',
  location: 'Location',
  budget: 'Budget',
  budgetMin: 'Budget (min)',
  budgetMax: 'Budget (max)',
  purpose: 'Purpose',
  timeline: 'Timeline',
  financing: 'Financing',
  name: 'Name',
  phone: 'Phone',
  email: 'Email',
  preferredCallbackTime: 'Callback time',
};

export function slotLabel(slot: string): string {
  return SLOT_LABELS[slot] ?? slot;
}

export function humanise(value: string | null | undefined): string {
  if (!value) return '—';
  return value.replace(/_/g, ' ').replace(/^\w/, (character) => character.toUpperCase());
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return '—';
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes > 0 ? `${minutes}m ${rest}s` : `${rest}s`;
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function formatRelative(value: Date | string | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  const minutes = Math.round((Date.now() - date.getTime()) / 60_000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function formatMs(value: number | null | undefined): string {
  if (value == null) return '—';
  return value >= 1000 ? `${(value / 1000).toFixed(2)}s` : `${Math.round(value)}ms`;
}

export function budgetLabel(min: number | null | undefined, max: number | null | undefined): string {
  return formatBudgetRange(min, max);
}

/** RFC 4180 quoting so a comma or a Devanagari quote cannot corrupt a column. */
export function toCsv(rows: ReadonlyArray<Record<string, unknown>>, columns: readonly string[]): string {
  const escape = (value: unknown): string => {
    if (value == null) return '';
    const text = Array.isArray(value) ? value.join('; ') : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  return [
    columns.join(','),
    ...rows.map((row) => columns.map((column) => escape(row[column])).join(',')),
  ].join('\n');
}
