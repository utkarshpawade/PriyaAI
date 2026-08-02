import type { Metadata } from 'next';
import { defaultAgentConfig } from '@rvagent/agent';
import { getActiveAgentConfig, listAgentConfigs } from '@rvagent/db';
import { SectionHeading } from '@/components/ui/panel';
import { AdminConsole } from './admin-console';

export const metadata: Metadata = { title: 'Admin — Priya' };
export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const [active, versions] = await Promise.all([getActiveAgentConfig(), listAgentConfigs()]);
  const defaults = defaultAgentConfig();

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-10">
      <SectionHeading
        eyebrow="Agent configuration"
        title="Change the conversation without a redeploy"
        description="Saving appends a new version, activates it, and pushes a reload to the voice server. The next call uses it immediately; a call already in progress keeps the version it started with."
      />

      <div className="mt-8">
        <AdminConsole
          initial={{
            label: '',
            greetingHinglish: active?.greetingHinglish ?? defaults.greeting['hi-en'],
            greetingHindi: active?.greetingHindi ?? defaults.greeting.hi,
            greetingEnglish: active?.greetingEnglish ?? defaults.greeting.en,
            persona: active?.persona ?? defaults.persona,
            guardrails: active?.guardrails ?? [],
            slotOrder: active?.slotOrder?.length ? active.slotOrder : defaults.slotOrder,
            kbOverrides: JSON.stringify(active?.kbOverrides ?? {}, null, 2),
          }}
          activeVersion={active ? { id: active.id, label: active.label } : null}
          versions={versions.map((version) => ({
            id: version.id,
            label: version.label,
            isActive: version.isActive,
            createdAt: version.createdAt.toISOString(),
            createdBy: version.createdBy,
          }))}
          projects={defaults.projects.map((project) => ({
            slug: project.slug,
            name: project.name,
            possession: project.possession.expectedDate,
            locality: project.location.locality,
          }))}
        />
      </div>
    </div>
  );
}
