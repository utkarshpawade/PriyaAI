import type { Metadata } from 'next';
import { DemoConsole } from '@/components/demo/demo-console';
import { SectionHeading } from '@/components/ui/panel';

export const metadata: Metadata = {
  title: 'Live demo — Priya',
};

export default function DemoPage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-5 py-10">
      <SectionHeading
        eyebrow="Live demo"
        title="Talk to Priya"
        description="Start the call and speak in Hindi, Hinglish or English. Interrupt her mid-sentence, change your requirement halfway, or force a language from the selector — the panels on the right update as she understands."
      />
      <div className="mt-8">
        <DemoConsole />
      </div>
    </div>
  );
}
