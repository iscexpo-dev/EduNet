import Link from 'next/link';
import { PublicShell } from '@/components/PublicShell';

const audiences = [
  ['Students', 'Find courses, keep momentum, and see your next step.', '/courses'],
  ['Teachers', 'Build thoughtful learning experiences and support every learner.', '/teacher'],
  ['Parents', 'Stay connected to progress with relationship-scoped insights.', '/parent'],
  ['Tutors', 'Make meaningful connections when the right opportunity appears.', '/help'],
];

export default function Home() {
  return <PublicShell><main>
    <section className="mx-auto grid max-w-6xl gap-12 px-5 py-16 lg:grid-cols-[1.1fr_.9fr] lg:items-center lg:px-8 lg:py-24">
      <div>
        <p className="mb-5 text-sm font-semibold uppercase tracking-[0.2em] text-indigo-600">Learning, connected</p>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-slate-950 sm:text-6xl dark:text-white">A clearer path from curiosity to confidence.</h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600 dark:text-slate-300">EduNet brings courses, teachers, families, and useful progress signals together in one welcoming education network.</p>
        <div className="mt-8 flex flex-wrap gap-3"><Link href="/courses" className="rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white hover:bg-indigo-700">Explore courses</Link><Link href="/directory" className="rounded-xl border border-slate-300 bg-white px-5 py-3 font-semibold text-slate-800 hover:border-indigo-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white">Find an institution</Link></div>
        <p className="mt-5 text-sm text-slate-500">বাংলায়ও পাওয়া যায় · Designed for mobile and low-bandwidth access</p>
      </div>
      <div className="rounded-3xl bg-indigo-950 p-6 text-white shadow-xl shadow-indigo-950/20 sm:p-8"><div className="flex items-center justify-between"><span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold">Your learning space</span><span className="text-sm text-indigo-200">Today</span></div><div className="mt-12"><p className="text-sm text-indigo-200">Continue where you left off</p><h2 className="mt-2 text-2xl font-semibold">Introduction to digital literacy</h2><div className="mt-6 h-2 rounded-full bg-white/15"><div className="h-2 w-2/3 rounded-full bg-teal-300" /></div><div className="mt-3 flex justify-between text-sm text-indigo-200"><span>6 of 9 lessons</span><span>67%</span></div></div><div className="mt-12 rounded-2xl bg-white/10 p-4"><p className="text-sm font-medium">Next up</p><p className="mt-1 text-sm text-indigo-200">Practice: spotting reliable sources</p></div></div>
    </section>
    <section className="border-y border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"><div className="mx-auto max-w-6xl px-5 py-12 lg:px-8"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{audiences.map(([title, body, href]) => <Link key={title} href={href} className="rounded-2xl border border-slate-200 p-5 transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-lg dark:border-slate-700"><h2 className="font-semibold">{title}</h2><p className="mt-2 text-sm leading-6 text-slate-500">{body}</p><span className="mt-5 inline-block text-sm font-semibold text-indigo-600">Learn more →</span></Link>)}</div></div></section>
    <section className="mx-auto max-w-6xl px-5 py-16 lg:px-8"><div className="grid gap-8 md:grid-cols-3"><div><p className="text-sm font-semibold text-teal-600">01</p><h2 className="mt-3 text-xl font-semibold">Discover</h2><p className="mt-2 text-slate-600 dark:text-slate-300">Browse learning opportunities and institutions that fit your goals.</p></div><div><p className="text-sm font-semibold text-teal-600">02</p><h2 className="mt-3 text-xl font-semibold">Learn</h2><p className="mt-2 text-slate-600 dark:text-slate-300">Move through lessons, practice, and assessments at your pace.</p></div><div><p className="text-sm font-semibold text-teal-600">03</p><h2 className="mt-3 text-xl font-semibold">Grow</h2><p className="mt-2 text-slate-600 dark:text-slate-300">Use progress signals to choose the next useful step.</p></div></div></section>
  </main></PublicShell>;
}
