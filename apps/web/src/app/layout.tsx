import type { Metadata } from 'next';
import Link from 'next/link';
import { FOOTER_DISCLAIMER } from '@/lib/db';
import './globals.css';

export const metadata: Metadata = {
  title: 'Follow the Money',
  description:
    'Educational aggregation of U.S. congressional STOCK Act Periodic Transaction Reports.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-neutral-900 antialiased">
        <header className="sticky top-0 z-40 border-b border-neutral-100 bg-white/90 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
            <Link href="/" className="flex items-center gap-2 font-bold tracking-tight">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500 text-sm text-white">
                $
              </span>
              Follow the Money
            </Link>
            <nav className="flex items-center gap-1 text-sm font-medium text-neutral-500">
              <NavLink href="/">Feed</NavLink>
              <NavLink href="/transparency">Scorecard</NavLink>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
        <footer className="mt-12 border-t border-neutral-100 bg-neutral-50">
          <div className="mx-auto max-w-5xl px-4 py-6 text-[11px] leading-relaxed text-neutral-400">
            {FOOTER_DISCLAIMER}
          </div>
        </footer>
      </body>
    </html>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-lg px-3 py-1.5 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
    >
      {children}
    </Link>
  );
}
