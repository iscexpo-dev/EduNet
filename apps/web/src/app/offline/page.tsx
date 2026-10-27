import Link from 'next/link';

export const metadata = { title: 'Offline — EduNet' };

export default function OfflinePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-3xl font-bold">You are offline</h1>
      <p className="max-w-md text-gray-600 dark:text-gray-300">
        EduNet works without a connection. Saved lessons remain available and your changes will sync
        automatically when you reconnect.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/my-courses"
          className="rounded-lg bg-primary-600 px-5 py-2.5 font-medium text-white hover:bg-primary-700"
        >
          Go to my courses
        </Link>
        <Link
          href="/offline/queue"
          className="rounded-lg border-2 border-primary-600 px-5 py-2.5 font-medium text-primary-600 hover:bg-primary-50"
        >
          Review pending changes
        </Link>
      </div>
    </main>
  );
}
