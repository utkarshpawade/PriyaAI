'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input, Label, Select, Textarea } from '@/components/ui/field';
import { Panel, PanelBody, PanelHeader } from '@/components/ui/panel';
import { statusLabel } from '@/lib/format';

export interface EditableLeadData {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  location: string | null;
  configuration: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  timeline: string | null;
  status: string;
  notes: string | null;
}

const STATUSES = [
  'new_lead',
  'qualified',
  'unqualified',
  'callback_scheduled',
  'site_visit_scheduled',
  'do_not_call',
];

/** Lets a sales manager correct what the agent captured without a CRM. */
export function EditableLead({ lead }: { lead: EditableLeadData }) {
  const router = useRouter();
  const [draft, setDraft] = useState(lead);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const set = <K extends keyof EditableLeadData>(key: K, value: EditableLeadData[K]) =>
    setDraft((previous) => ({ ...previous, [key]: value }));

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: draft.name,
          phone: draft.phone,
          email: draft.email,
          location: draft.location,
          configuration: draft.configuration,
          budgetMin: draft.budgetMin,
          budgetMax: draft.budgetMax,
          status: draft.status,
          notes: draft.notes,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      setMessage(response.ok ? 'Saved.' : (payload.error ?? 'Could not save.'));
      if (response.ok) router.refresh();
    } catch {
      setMessage('Could not reach the server.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel>
      <PanelHeader title="Lead record" description="Editable — corrections write straight to Postgres." />
      <PanelBody className="space-y-3">
        <div>
          <Label htmlFor="lead-name">Name</Label>
          <Input
            id="lead-name"
            value={draft.name ?? ''}
            onChange={(event) => set('name', event.target.value || null)}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="lead-phone">Phone</Label>
            <Input
              id="lead-phone"
              value={draft.phone ?? ''}
              onChange={(event) => set('phone', event.target.value || null)}
            />
          </div>
          <div>
            <Label htmlFor="lead-config">Configuration</Label>
            <Input
              id="lead-config"
              value={draft.configuration ?? ''}
              onChange={(event) => set('configuration', event.target.value || null)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="lead-min">Budget min (₹)</Label>
            <Input
              id="lead-min"
              type="number"
              value={draft.budgetMin ?? ''}
              onChange={(event) =>
                set('budgetMin', event.target.value ? Number(event.target.value) : null)
              }
            />
          </div>
          <div>
            <Label htmlFor="lead-max">Budget max (₹)</Label>
            <Input
              id="lead-max"
              type="number"
              value={draft.budgetMax ?? ''}
              onChange={(event) =>
                set('budgetMax', event.target.value ? Number(event.target.value) : null)
              }
            />
          </div>
        </div>

        <div>
          <Label htmlFor="lead-location">Location</Label>
          <Input
            id="lead-location"
            value={draft.location ?? ''}
            onChange={(event) => set('location', event.target.value || null)}
          />
        </div>

        <div>
          <Label htmlFor="lead-status">Status</Label>
          <Select
            id="lead-status"
            value={draft.status}
            onChange={(event) => set('status', event.target.value)}
          >
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {statusLabel(status)}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <Label htmlFor="lead-notes">Notes</Label>
          <Textarea
            id="lead-notes"
            value={draft.notes ?? ''}
            onChange={(event) => set('notes', event.target.value || null)}
            placeholder="Internal notes for the sales team…"
          />
        </div>

        <div className="flex items-center gap-3 pt-1">
          <Button onClick={save} disabled={saving} size="sm">
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
          {message ? <span className="text-xs text-ink-muted">{message}</span> : null}
        </div>
      </PanelBody>
    </Panel>
  );
}
