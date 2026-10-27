import Link from 'next/link';
import type { ReactNode } from 'react';

export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-950 dark:bg-slate-950 dark:text-slate-50">
      <header className="border-b border-slate-200/80 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 lg:px-8">
          <Link href="/" className="flex items-center gap-3 font-semibold tracking-tight">
            <span className="grid size-10 place-items-center rounded-xl bg-indigo-600 text-lg text-white">E</span>
            <span>EduNet</span>
          </Link>
          <nav aria-label="Primary navigation" className="hidden items-center gap-6 text-sm font-medium md:flex">
            <Link href="/directory" className="text-slate-600 hover:text-indigo-600 dark:text-slate-300">Directory</Link>
            <Link href="/courses" className="text-slate-600 hover:text-indigo-600 dark:text-slate-300">Courses</Link>
            <Link href="/help" className="text-slate-600 hover:text-indigo-600 dark:text-slate-300">Help</Link>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login" className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-900">Log in</Link>
            <Link href="/register" className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700">Join EduNet</Link>
          </div>
        </div>
      </header>
      {children}
      <footer className="border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-8 text-sm text-slate-500 md:flex-row md:items-center md:justify-between lg:px-8">
          <p>Learning is stronger when it is shared.</p>
          <div className="flex gap-4"><Link href="/about">About</Link><Link href="/contact">Contact</Link><Link href="/help">Help center</Link></div>
        </div>
      </footer>
    </div>
  );
}
