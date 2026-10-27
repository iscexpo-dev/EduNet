import Link from 'next/link';
import type { ReactNode } from 'react';

const navigation = [
  { href: '/directory', label: 'Directory' },
  { href: '/courses', label: 'Courses' },
  { href: '/about', label: 'About' },
  { href: '/help', label: 'Help' },
];

export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-950 dark:bg-slate-950 dark:text-slate-50">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-3 focus:font-semibold focus:text-indigo-700 focus:shadow-lg"
      >
        Skip to content
      </a>
      <header className="border-b border-slate-200/80 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-3 px-5 py-4 lg:px-8">
          <Link href="/" className="flex items-center gap-3 font-semibold tracking-tight" aria-label="EduNet home">
            <span className="grid size-10 place-items-center rounded-xl bg-indigo-600 text-lg text-white" aria-hidden="true">E</span>
            <span>EduNet</span>
          </Link>
          <nav aria-label="Primary navigation" className="order-3 flex w-full items-center gap-5 overflow-x-auto border-t border-slate-100 pt-3 text-sm font-medium md:order-2 md:w-auto md:border-0 md:pt-0">
            {navigation.map((item) => (
              <Link key={item.href} href={item.href} className="whitespace-nowrap text-slate-600 hover:text-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:text-slate-300">
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="order-2 flex items-center gap-2 md:order-3">
            <Link href="/login" className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:text-slate-200 dark:hover:bg-slate-900">Log in</Link>
            <Link href="/register" className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">Join EduNet</Link>
          </div>
        </div>
      </header>
      <div id="main-content">{children}</div>
      <footer className="border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-8 text-sm text-slate-500 md:flex-row md:items-center md:justify-between lg:px-8">
          <p>Learning is stronger when it is shared.</p>
          <div className="flex flex-wrap gap-4"><Link href="/about">About</Link><Link href="/contact">Contact</Link><Link href="/help">Help center</Link></div>
        </div>
      </footer>
    </div>
  );
}
