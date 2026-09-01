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
        <header className="border-b border-neutral-200">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
            <Link href="/" className="text-lg font-bold tracking-tight">
              Follow the Money
            </Link>
            <nav className="flex gap-4 text-sm text-neutral-600">
              <Link href="/" className="hover:text-neutral-900">
                Live Feed
              </Link>
              <Link href="/transparency" className="hover:text-neutral-900">
                Transparency
              </Link>
              <Link href="/admin/review" className="hover:text-neutral-900">
                Admin
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
        <footer className="mt-16 border-t border-neutral-200 bg-neutral-50">
          <div className="mx-auto max-w-6xl px-4 py-6 text-xs leading-relaxed text-neutral-500">
            {FOOTER_DISCLAIMER}
          </div>
        </footer>
      </body>
    </html>
  );
}
