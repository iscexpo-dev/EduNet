import Link from 'next/link';
import { PublicShell } from '@/components/PublicShell';

const discoverySteps = [
  ['Search', 'Find verified institutions and learning communities when directory search is available.'],
  ['Compare', 'Review the information EduNet can verify before choosing where to learn.'],
  ['Connect', 'Move into supported courses and services from one trusted starting point.'],
];

export default function DirectoryPage() {
  return (
    <PublicShell>
      <main className="mx-auto max-w-6xl px-5 py-14 lg:px-8 lg:py-20">
        <section className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-600">Education directory</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">Find your learning community.</h1>
          <p className="mt-5 text-lg leading-8 text-slate-600 dark:text-slate-300">A clearer way to discover institutions and programs across Bangladesh, built around information that can be verified.</p>
        </section>
        <section className="mt-10 rounded-3xl border border-indigo-100 bg-white p-6 shadow-sm dark:border-indigo-950 dark:bg-slate-900 sm:p-8" aria-labelledby="directory-status">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-teal-600">Coming online in stages</p>
              <h2 id="directory-status" className="mt-2 text-2xl font-semibold">Directory search is being connected</h2>
              <p className="mt-3 max-w-2xl leading-7 text-slate-600 dark:text-slate-300">The search service will provide verified, filterable institution results here. We are not showing placeholder listings or unverified records.</p>
            </div>
            <Link href="/courses" className="shrink-0 rounded-xl bg-indigo-600 px-4 py-3 text-center font-semibold text-white hover:bg-indigo-700">Browse courses</Link>
          </div>
        </section>
        <section className="mt-14 grid gap-5 md:grid-cols-3" aria-label="How directory discovery works">
          {discoverySteps.map(([title, body], index) => (
            <article key={title} className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
              <p className="text-sm font-semibold text-teal-600">0{index + 1}</p>
              <h2 className="mt-3 text-xl font-semibold">{title}</h2>
              <p className="mt-2 leading-7 text-slate-600 dark:text-slate-300">{body}</p>
            </article>
          ))}
        </section>
      </main>
    </PublicShell>
  );
}
