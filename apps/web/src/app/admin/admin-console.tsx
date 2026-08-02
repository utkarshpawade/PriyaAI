'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowDown, ArrowUp, PhoneOutgoing, RotateCcw, Save } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, Input, Label, Textarea } from '@/components/ui/field';
import { Panel, PanelBody, PanelHeader } from '@/components/ui/panel';
import { VOICE_HTTP_URL } from '@/lib/env';
import { formatRelative, slotLabel } from '@/lib/format';

export interface AdminDraft {
  label: string;
  greetingHinglish: string;
  greetingHindi: string;
  greetingEnglish: string;
  persona: string;
  guardrails: string[];
  slotOrder: string[];
  kbOverrides: string;
}

interface VersionRow {
  id: number;
  label: string;
  isActive: boolean;
  createdAt: string;
  createdBy: string;
}

interface ProjectRow {
  slug: string;
  name: string;
  possession: string;
  locality: string;
}

export function AdminConsole({
  initial,
  activeVersion,
  versions,
  projects,
}: {
  initial: AdminDraft;
  activeVersion: { id: number; label: string } | null;
  versions: VersionRow[];
  projects: ProjectRow[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<AdminDraft>(initial);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const set = <K extends keyof AdminDraft>(key: K, value: AdminDraft[K]) =>
    setDraft((previous) => ({ ...previous, [key]: value }));

  const moveSlot = (index: number, direction: -1 | 1) => {
    const next = [...draft.slotOrder];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    set('slotOrder', next);
  };

  const save = async () => {
    setSaving(true);
    setResult(null);

    let kbOverrides: Record<string, unknown> | null = null;
    try {
      const trimmed = draft.kbOverrides.trim();
      kbOverrides = trimmed.length === 0 ? null : (JSON.parse(trimmed) as Record<string, unknown>);
    } catch {
      setSaving(false);
      setResult({ ok: false, message: 'Knowledge base overrides are not valid JSON.' });
      return;
    }

    try {
      const response = await fetch('/api/admin/config', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...draft,
          label: draft.label.trim() || `Edit ${new Date().toLocaleTimeString('en-IN')}`,
          guardrails: draft.guardrails.filter((line) => line.trim().length > 0),
          kbOverrides,
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
        detail?: string;
        version?: number;
        voiceServerReloaded?: boolean;
        voiceServerMessage?: string;
      };

      if (!response.ok) {
        setResult({ ok: false, message: payload.detail ?? payload.error ?? 'Save failed.' });
        return;
      }

      setResult({
        ok: true,
        message: `Saved as version #${payload.version}. ${payload.voiceServerMessage ?? ''}`.trim(),
      });
      router.refresh();
    } catch {
      setResult({ ok: false, message: 'Could not reach the server.' });
    } finally {
      setSaving(false);
    }
  };

  const rollback = async (version: number) => {
    setResult(null);
    const response = await fetch('/api/admin/config', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ version }),
    });
    const payload = (await response.json()) as { voiceServerMessage?: string; error?: string };
    setResult({
      ok: response.ok,
      message: response.ok
        ? `Activated version #${version}. ${payload.voiceServerMessage ?? ''}`.trim()
        : (payload.error ?? 'Could not activate that version.'),
    });
    router.refresh();
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-5">
        <Panel>
          <PanelHeader
            title="Persona and greeting"
            description="The greeting is spoken verbatim; the persona is injected into the system prompt."
            actions={
              activeVersion ? (
                <Badge tone="accent">
                  active #{activeVersion.id} · {activeVersion.label}
                </Badge>
              ) : (
                <Badge tone="mock">built-in defaults</Badge>
              )
            }
          />
          <PanelBody className="space-y-4">
            <Field label="Version label" hint="Shown in the version history so a rollback is obvious.">
              <Input
                value={draft.label}
                onChange={(event) => set('label', event.target.value)}
                placeholder="e.g. shorter greeting, ask budget first"
              />
            </Field>

            <Field label="Persona">
              <Textarea value={draft.persona} onChange={(event) => set('persona', event.target.value)} />
            </Field>

            <div className="grid gap-4">
              <Field label="Greeting — Hinglish (default opener)">
                <Textarea
                  value={draft.greetingHinglish}
                  onChange={(event) => set('greetingHinglish', event.target.value)}
                  className="min-h-16"
                />
              </Field>
              <Field label="Greeting — Hindi (Devanagari)">
                <Textarea
                  value={draft.greetingHindi}
                  onChange={(event) => set('greetingHindi', event.target.value)}
                  className="devanagari min-h-16"
                />
              </Field>
              <Field label="Greeting — English">
                <Textarea
                  value={draft.greetingEnglish}
                  onChange={(event) => set('greetingEnglish', event.target.value)}
                  className="min-h-16"
                />
              </Field>
            </div>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader
            title="Question order"
            description="The slot state machine asks in exactly this order, skipping anything already answered or declined."
          />
          <PanelBody>
            <ul className="space-y-1.5">
              {draft.slotOrder.map((slot, index) => (
                <li
                  key={slot}
                  className="flex items-center gap-2 rounded-lg border border-line bg-canvas px-3 py-2"
                >
                  <span className="tabular w-5 text-xs text-ink-faint">{index + 1}</span>
                  <span className="flex-1 text-sm">{slotLabel(slot)}</span>
                  <button
                    type="button"
                    onClick={() => moveSlot(index, -1)}
                    disabled={index === 0}
                    className="rounded p-1 text-ink-muted hover:bg-surface-raised hover:text-ink disabled:opacity-30"
                    aria-label={`Move ${slotLabel(slot)} earlier`}
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveSlot(index, 1)}
                    disabled={index === draft.slotOrder.length - 1}
                    className="rounded p-1 text-ink-muted hover:bg-surface-raised hover:text-ink disabled:opacity-30"
                    aria-label={`Move ${slotLabel(slot)} later`}
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader
            title="Extra guardrails"
            description="Appended to the prompt's rules section. One instruction per line."
          />
          <PanelBody>
            <Textarea
              value={draft.guardrails.join('\n')}
              onChange={(event) => set('guardrails', event.target.value.split('\n'))}
              placeholder={'Never mention competitor projects by name.\nAlways offer a site visit before closing.'}
            />
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader
            title="Knowledge base overrides"
            description="Sparse JSON merged over the compiled KB and re-validated. An invalid patch is rejected before it is saved."
          />
          <PanelBody className="space-y-3">
            <Textarea
              value={draft.kbOverrides}
              onChange={(event) => set('kbOverrides', event.target.value)}
              className="min-h-40 font-mono text-xs"
              spellCheck={false}
            />
            <div className="rounded-lg border border-line bg-canvas p-3">
              <p className="mb-2 text-[11px] tracking-wider text-ink-faint uppercase">
                Editable projects
              </p>
              <ul className="space-y-1 text-xs text-ink-muted">
                {projects.map((project) => (
                  <li key={project.slug}>
                    <code className="font-mono text-accent">{project.slug}</code> — {project.name},{' '}
                    {project.locality}, possession {project.possession}
                  </li>
                ))}
              </ul>
              <p className="mt-2.5 text-[11px] leading-relaxed text-ink-faint">
                Example: <code className="font-mono">{'{"aureva-skyline":{"possession":{"expectedDate":"March 2028"}}}'}</code>
              </p>
            </div>
          </PanelBody>
        </Panel>

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={save} disabled={saving}>
            <Save className="h-4 w-4" />
            {saving ? 'Saving…' : 'Save and activate'}
          </Button>
          <Button variant="ghost" onClick={() => setDraft(initial)} disabled={saving}>
            <RotateCcw className="h-3.5 w-3.5" />
            Reset form
          </Button>
          {result ? (
            <span className={result.ok ? 'text-xs text-positive' : 'text-xs text-negative'} role="status">
              {result.message}
            </span>
          ) : null}
        </div>
      </div>

      <div className="space-y-5">
        <Panel>
          <PanelHeader title="Version history" description="Every save is a new row — rollback is one click." />
          <PanelBody className="space-y-2">
            {versions.length === 0 ? (
              <p className="text-xs text-ink-faint">No saved versions yet.</p>
            ) : (
              versions.map((version) => (
                <div
                  key={version.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-ink">
                      #{version.id} {version.label}
                    </p>
                    <p className="text-[11px] text-ink-faint">
                      {formatRelative(version.createdAt)} · {version.createdBy}
                    </p>
                  </div>
                  {version.isActive ? (
                    <Badge tone="accent">active</Badge>
                  ) : (
                    <Button variant="ghost" size="sm" onClick={() => rollback(version.id)}>
                      Activate
                    </Button>
                  )}
                </div>
              ))
            )}
          </PanelBody>
        </Panel>

        <OutboundCallCard />
      </div>
    </div>
  );
}

/** Triggers a real Twilio call when credentials exist; explains itself when not. */
function OutboundCallCard() {
  const [phone, setPhone] = useState('');
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [placing, setPlacing] = useState(false);

  const place = async () => {
    setPlacing(true);
    setStatus(null);
    try {
      const response = await fetch(`${VOICE_HTTP_URL}/internal/outbound-call`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ to: phone, languageMode: 'auto' }),
      });
      const payload = (await response.json()) as { message?: string; error?: string; sid?: string };
      setStatus({
        ok: response.ok,
        message: response.ok
          ? `Call placed (${payload.sid}).`
          : (payload.message ?? payload.error ?? 'Could not place the call.'),
      });
    } catch {
      setStatus({ ok: false, message: 'Voice server unreachable.' });
    } finally {
      setPlacing(false);
    }
  };

  return (
    <Panel>
      <PanelHeader
        title="Outbound call"
        description="Same agent core over Twilio Media Streams."
        actions={<Badge tone="mock">not provisioned</Badge>}
      />
      <PanelBody className="space-y-3">
        <div>
          <Label htmlFor="outbound-phone">Phone number</Label>
          <Input
            id="outbound-phone"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="+91 98765 43210"
          />
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={place}
          disabled={placing || phone.trim().length < 8}
        >
          <PhoneOutgoing className="h-3.5 w-3.5" />
          {placing ? 'Placing…' : 'Place call'}
        </Button>
        {status ? (
          <p className={status.ok ? 'text-xs text-positive' : 'text-xs text-warm'}>{status.message}</p>
        ) : null}
        <p className="text-[11px] leading-relaxed text-ink-faint">
          The Twilio path is implemented end to end but the number is not provisioned — Indian
          numbers need a regulatory bundle and DLT registration. See{' '}
          <code className="font-mono">docs/LIMITATIONS.md</code>.
        </p>
      </PanelBody>
    </Panel>
  );
}
