'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@edunet/auth';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  EmptyState,
} from '@edunet/ui';
import type { OfflineAction } from '@edunet/offline';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import {
  readOfflineQueue,
  removeOfflineAction,
  retryOfflineActions,
} from '@/lib/offline-queue';

const TYPE_LABELS: Record<OfflineAction['type'], string> = {
  lesson_progress: 'Lesson progress',
  assignment_autosave: 'Assignment draft',
  assignment_submit: 'Assignment submission',
  assessment_answer: 'Assessment answer',
  note: 'Lesson note',
  bookmark: 'Bookmark',
};

function isConflict(action: OfflineAction): boolean {
  return action.lastStatus === 409 || action.lastStatus === 412;
}

function formatTime(value: number): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

function stateVariant(state: OfflineAction['state']): 'success' | 'warning' | 'error' | 'info' {
  if (state === 'syncing') return 'info';
  if (state === 'failed') return 'error';
  return 'warning';
}

export default function OfflineQueuePage() {
  const { user, token, isLoading } = useAuth();
  const { flush } = useOfflineSync();
  const [queue, setQueue] = useState<OfflineAction[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const refresh = () => setQueue(readOfflineQueue());
    refresh();
    const onStorage = () => refresh();
    window.addEventListener('edunet:queue-changed', onStorage);
    window.addEventListener('storage', onStorage);
    window.addEventListener('online', onStorage);
    return () => {
      window.removeEventListener('edunet:queue-changed', onStorage);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('online', onStorage);
    };
  }, []);

  const failed = queue.filter((action) => action.state === 'failed');
  const conflicts = failed.filter(isConflict);
  const pending = queue.filter((action) => action.state !== 'failed');

  async function retryActions(ids?: string[]) {
    setBusy(ids?.[0] ?? 'all');
    setMessage('');
    setError('');
    try {
      retryOfflineActions(ids);
      setQueue(readOfflineQueue());
      if (!token) {
        setError('Sign in to sync queued changes.');
        return;
      }
      const result = await flush();
      setQueue(readOfflineQueue());
      if (result.synced.length === 0 && result.failed.length === 0) {
        setMessage('Nothing is ready to sync yet.');
      } else {
        setMessage(
          `Synced ${result.synced.length} change${result.synced.length === 1 ? '' : 's'}; ${result.failed.length} still need attention.`
        );
      }
    } catch (err) {
      setQueue(readOfflineQueue());
      setError(err instanceof Error ? err.message : 'Unable to sync queued changes.');
    } finally {
      setBusy(null);
    }
  }

  function discardAction(action: OfflineAction) {
    if (!window.confirm('Discard this queued change? It will not be sent to the server.')) return;
    setQueue(removeOfflineAction(action.id));
    setMessage(`Discarded ${TYPE_LABELS[action.type] ?? action.type}.`);
    setError('');
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-600">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <nav className="border-b bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Pending changes</h1>
          <div className="flex items-center gap-2">
            <Link href="/offline">
              <Button variant="secondary" size="sm">
                Offline help
              </Button>
            </Link>
            <Link href={user ? '/dashboard' : '/login'}>
              <Button variant="secondary" size="sm">
                {user ? 'Back to dashboard' : 'Sign in'}
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card>
            <CardContent>
              <p className="text-sm text-gray-500">Queued</p>
              <p className="text-2xl font-semibold">{queue.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <p className="text-sm text-gray-500">Pending</p>
              <p className="text-2xl font-semibold">{pending.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <p className="text-sm text-gray-500">Needs attention</p>
              <p className="text-2xl font-semibold">{failed.length}</p>
            </CardContent>
          </Card>
        </div>

        {!token && (
          <Alert variant="info" title="Sign in to sync">
            Your queued work is stored in this browser. <Link href="/login">Sign in</Link> to send it
            when you reconnect.
          </Alert>
        )}

        {conflicts.length > 0 && (
          <Alert variant="warning" title={`${conflicts.length} conflict${conflicts.length === 1 ? '' : 's'} to review`}>
            The server rejected these changes because its copy is newer (HTTP 409/412). Retry to
            reapply your version, or discard the change to keep the server copy.
          </Alert>
        )}

        {error && (
          <Alert variant="error" urgent>
            {error}
          </Alert>
        )}
        {message && <Alert variant="success">{message}</Alert>}

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Queue</h2>
              <Button
                size="sm"
                onClick={() => void retryActions()}
                isLoading={busy === 'all'}
                disabled={busy !== null || queue.length === 0 || !token}
              >
                Retry all
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {queue.length === 0 ? (
              <EmptyState
                title="No pending changes"
                description="Everything saved while offline has been synced."
                action={
                  <Link href={user ? '/my-courses' : '/login'}>
                    <Button variant="secondary">{user ? 'Go to my courses' : 'Sign in'}</Button>
                  </Link>
                }
              />
            ) : (
              <ul className="divide-y dark:divide-gray-800">
                {queue.map((action) => {
                  const conflict = isConflict(action);
                  return (
                    <li key={action.id} className="space-y-3 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium text-gray-900 dark:text-gray-100">
                              {TYPE_LABELS[action.type] ?? action.type}
                            </p>
                            <Badge variant={stateVariant(action.state)}>{action.state}</Badge>
                            {conflict && <Badge variant="warning">conflict</Badge>}
                          </div>
                          <p className="mt-1 break-all font-mono text-xs text-gray-500">
                            {action.method} {action.endpoint}
                          </p>
                          <p className="mt-1 text-xs text-gray-500">
                            Updated {formatTime(action.updatedAt)} · {action.attempts} attempt
                            {action.attempts === 1 ? '' : 's'}
                            {action.state === 'failed'
                              ? ` · next retry ${formatTime(action.nextAttemptAt)}`
                              : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void retryActions([action.id])}
                            isLoading={busy === action.id}
                            disabled={busy !== null || !token}
                          >
                            Retry
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => discardAction(action)}
                            disabled={busy !== null}
                          >
                            Discard
                          </Button>
                        </div>
                      </div>

                      {conflict ? (
                        <Alert variant="warning">
                          This change conflicts with newer server data
                          {action.lastError ? `: ${action.lastError}` : '.'} Retry to reapply your
                          version, or discard it to keep the server copy.
                        </Alert>
                      ) : action.state === 'failed' && action.lastError ? (
                        <Alert variant="error">
                          {action.lastError}
                          {action.lastStatus ? ` (HTTP ${action.lastStatus})` : ''}
                        </Alert>
                      ) : null}

                      <details className="rounded-lg border border-gray-200 p-3 text-sm dark:border-gray-800">
                        <summary className="cursor-pointer font-medium text-gray-700 dark:text-gray-200">
                          Review queued change
                        </summary>
                        <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-gray-50 p-3 text-xs text-gray-700 dark:bg-gray-900 dark:text-gray-200">
                          {JSON.stringify(action.body, null, 2) ?? 'No payload'}
                        </pre>
                      </details>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
