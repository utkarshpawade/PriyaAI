import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'Priya — AI Voice Sales Agent',
  description:
    'A live AI voice-calling agent for Indian real estate. Speaks Hindi, Hinglish and English, qualifies leads, and grounds every answer in a knowledge base.',
};

const NAV = [
  { href: '/', label: 'Overview' },
  { href: '/demo', label: 'Live demo' },
  { href: '/leads', label: 'Leads' },
  { href: '/admin', label: 'Admin' },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">
        <div className="flex min-h-dvh flex-col">
          <header className="sticky top-0 z-40 border-b border-line bg-canvas/85 backdrop-blur-md">
            <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-6 px-5">
              <Link href="/" className="flex items-center gap-2.5 shrink-0">
                <span className="grid h-7 w-7 place-items-center rounded-md bg-accent text-sm font-bold text-canvas">
                  P
                </span>
                <span className="text-sm font-semibold tracking-tight">Priya</span>
                <span className="hidden text-xs text-ink-faint sm:inline">/ Meridian Group</span>
              </Link>

              <nav className="flex items-center gap-1 overflow-x-auto">
                {NAV.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="rounded-md px-3 py-1.5 text-sm text-ink-muted transition-colors hover:bg-surface-raised hover:text-ink"
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>

              <span className="ml-auto hidden rounded-full border border-dashed border-ink-faint/50 px-2.5 py-0.5 text-[11px] text-ink-faint md:inline">
                Demo · fictional project data
              </span>
            </div>
          </header>

          <main className="flex-1">{children}</main>

          <footer className="border-t border-line px-5 py-6">
            <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 text-xs text-ink-faint">
              <p>
                Built for a technical assignment. Aureva Skyline and Meridian Verde are fictional
                projects; no unit can be booked.
              </p>
              <p>Hindi · Hinglish · English</p>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
