'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@edunet/auth';
import { Button, Card, CardContent, CardHeader, EmptyState } from '@edunet/ui';
import { apiUrl } from '@/lib/api-url';
import { readApiError } from '@/lib/api-error';

interface Bookmark {
  id: string;
  lessonId: string;
  lessonTitle: string;
  courseId: string;
  createdAt: string;
}

interface LessonNote {
  id: string;
  lessonId: string;
  lessonTitle: string;
  courseId: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
}

export default function LibraryPage() {
  const { user, token, isLoading } = useAuth();
  const isStudent = user?.role === 'student';
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [notes, setNotes] = useState<LessonNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!token || !isStudent) return;
    let cancelled = false;

    const loadLibrary = async () => {
      try {
        const headers = { Authorization: `Bearer ${token}` };
        const [bookmarksResponse, notesResponse] = await Promise.all([
          fetch(apiUrl('/api/content/bookmarks'), { headers }),
          fetch(apiUrl('/api/content/notes'), { headers }),
        ]);
        if (!bookmarksResponse.ok) throw new Error(await readApiError(bookmarksResponse));
        if (!notesResponse.ok) throw new Error(await readApiError(notesResponse));

        const [bookmarkData, noteData] = await Promise.all([
          bookmarksResponse.json() as Promise<Bookmark[]>,
          notesResponse.json() as Promise<LessonNote[]>,
        ]);
        if (cancelled) return;
        setBookmarks(bookmarkData);
        setNotes(noteData);
        setError('');
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unable to load your library.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadLibrary();
    return () => {
      cancelled = true;
    };
  }, [token, isStudent, reloadKey]);

  const search = query.trim().toLowerCase();
  const filteredBookmarks = useMemo(
    () =>
      search
        ? bookmarks.filter((bookmark) => bookmark.lessonTitle.toLowerCase().includes(search))
        : bookmarks,
    [bookmarks, search],
  );
  const filteredNotes = useMemo(
    () =>
      search
        ? notes.filter(
            (note) =>
              note.lessonTitle.toLowerCase().includes(search) ||
              note.content.toLowerCase().includes(search),
          )
        : notes,
    [notes, search],
  );

  async function removeBookmark(bookmark: Bookmark) {
    if (!token) return;
    setDeleting(`bookmark:${bookmark.lessonId}`);
    setError('');
    setMessage('');
    try {
      const response = await fetch(
        apiUrl(`/api/content/bookmarks/${encodeURIComponent(bookmark.lessonId)}`),
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
      );
      if (!response.ok) throw new Error(await readApiError(response));
      setBookmarks((current) => current.filter((item) => item.id !== bookmark.id));
      setMessage(`Removed bookmark for “${bookmark.lessonTitle}”.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to remove the bookmark.');
    } finally {
      setDeleting(null);
    }
  }

  async function removeNote(note: LessonNote) {
    if (!token) return;
    if (!window.confirm('Delete this note? This cannot be undone.')) return;
    setDeleting(`note:${note.lessonId}`);
    setError('');
    setMessage('');
    try {
      const response = await fetch(
        apiUrl(`/api/content/lessons/${encodeURIComponent(note.lessonId)}/note`),
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
      );
      if (!response.ok) throw new Error(await readApiError(response));
      setNotes((current) => current.filter((item) => item.id !== note.id));
      setMessage(`Deleted note for “${note.lessonTitle}”.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete the note.');
    } finally {
      setDeleting(null);
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-600">Loading…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-gray-700">Please log in to view your library.</p>
        <Link href="/login">
          <Button>Go to login</Button>
        </Link>
      </div>
    );
  }

  if (!isStudent) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
        <EmptyState
          title="Student access only"
          description="Bookmarks and private lesson notes are available to student accounts."
          action={
            <Link href="/dashboard">
              <Button variant="secondary">Back to dashboard</Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <nav className="border-b bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">My library</h1>
          <div className="flex items-center gap-2">
            <Link href="/my-courses">
              <Button variant="secondary" size="sm">
                My courses
              </Button>
            </Link>
            <Link href="/attendance">
              <Button variant="secondary" size="sm">
                Attendance
              </Button>
            </Link>
            <Link href="/dashboard">
              <Button variant="secondary" size="sm">
                Dashboard
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card>
            <CardContent>
              <p className="text-sm text-gray-500">Bookmarks</p>
              <p className="text-2xl font-semibold">{bookmarks.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <p className="text-sm text-gray-500">Notes</p>
              <p className="text-2xl font-semibold">{notes.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <label htmlFor="library-search" className="text-sm text-gray-500">
                Search
              </label>
              <input
                id="library-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search titles or notes"
                className="mt-1 w-full rounded border px-3 py-2 text-sm dark:bg-gray-900"
              />
            </CardContent>
          </Card>
        </div>

        {error && (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>{error}</span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setLoading(true);
                  setError('');
                  setReloadKey((key) => key + 1);
                }}
              >
                Try again
              </Button>
            </div>
          </div>
        )}
        {message && (
          <div
            role="status"
            className="rounded-lg border border-green-200 bg-green-50 p-4 text-green-700"
          >
            {message}
          </div>
        )}

        {loading ? (
          <Card>
            <CardContent>
              <p className="text-gray-600 dark:text-gray-300">Loading your library…</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <h2 className="text-lg font-semibold">Bookmarked lessons</h2>
              </CardHeader>
              <CardContent>
                {bookmarks.length === 0 ? (
                  <EmptyState
                    title="No bookmarks yet"
                    description="Bookmark a lesson while learning to find it here."
                    action={
                      <Link href="/my-courses">
                        <Button variant="secondary">Go to my courses</Button>
                      </Link>
                    }
                  />
                ) : filteredBookmarks.length === 0 ? (
                  <p className="text-sm text-gray-500">No bookmarks match “{query}”.</p>
                ) : (
                  <ul className="divide-y dark:divide-gray-800">
                    {filteredBookmarks.map((bookmark) => (
                      <li
                        key={bookmark.id}
                        className="flex flex-wrap items-start justify-between gap-3 py-4"
                      >
                        <div>
                          <p className="font-medium text-gray-900 dark:text-gray-100">
                            {bookmark.lessonTitle}
                          </p>
                          <p className="text-xs text-gray-500">
                            Bookmarked {formatDate(bookmark.createdAt)}
                          </p>
                          <Link
                            href={`/my-courses/${bookmark.courseId}`}
                            className="mt-1 inline-block text-sm font-medium text-primary-600 hover:underline"
                          >
                            Open course
                          </Link>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void removeBookmark(bookmark)}
                          isLoading={deleting === `bookmark:${bookmark.lessonId}`}
                          disabled={deleting !== null}
                        >
                          Remove
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <h2 className="text-lg font-semibold">Private notes</h2>
              </CardHeader>
              <CardContent>
                {notes.length === 0 ? (
                  <EmptyState
                    title="No notes yet"
                    description="Notes you write while learning are private and appear here."
                    action={
                      <Link href="/my-courses">
                        <Button variant="secondary">Go to my courses</Button>
                      </Link>
                    }
                  />
                ) : filteredNotes.length === 0 ? (
                  <p className="text-sm text-gray-500">No notes match “{query}”.</p>
                ) : (
                  <ul className="divide-y dark:divide-gray-800">
                    {filteredNotes.map((note) => (
                      <li key={note.id} className="space-y-2 py-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-medium text-gray-900 dark:text-gray-100">
                              {note.lessonTitle}
                            </p>
                            <p className="text-xs text-gray-500">
                              Updated {formatDate(note.updatedAt)}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void removeNote(note)}
                            isLoading={deleting === `note:${note.lessonId}`}
                            disabled={deleting !== null}
                          >
                            Delete
                          </Button>
                        </div>
                        <p className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-gray-50 p-3 text-sm text-gray-700 dark:bg-gray-900 dark:text-gray-200">
                          {note.content}
                        </p>
                        <Link
                          href={`/my-courses/${note.courseId}`}
                          className="inline-block text-sm font-medium text-primary-600 hover:underline"
                        >
                          Open course
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
