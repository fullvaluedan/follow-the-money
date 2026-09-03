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
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen antialiased">
        <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[#0b0f0e]/85 backdrop-blur-lg">
          <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
            <Link href="/" className="flex items-center gap-2 text-[15px] font-bold tracking-tight">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-green text-sm font-black text-black">
                $
              </span>
              Follow the Money
            </Link>
            <nav className="flex items-center gap-1 text-sm font-medium text-dim">
              <NavLink href="/">Feed</NavLink>
              <NavLink href="/sectors">Sectors</NavLink>
              <NavLink href="/transparency">Scorecard</NavLink>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
        <footer className="mt-12 border-t border-[var(--border)]">
          <div className="mx-auto max-w-5xl px-4 py-6 text-[11px] leading-relaxed text-dim opacity-70">
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
      className="rounded-lg px-3 py-1.5 transition-colors hover:bg-[var(--bg-hover)] hover:text-white"
    >
      {children}
    </Link>
  );
}
