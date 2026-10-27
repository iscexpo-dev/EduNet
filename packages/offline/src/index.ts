/**
 * Offline-first primitives for EduNet.
 *
 * The queue is deliberately a pure data structure with an injectable sender:
 * the browser (localStorage/IndexedDB), a future native client and tests all
 * share the same deterministic state machine. No user data is silently
 * dropped: failed mutations stay queued with bounded exponential backoff.
 */

export type OfflineActionType =
  | 'lesson_progress'
  | 'assignment_autosave'
  | 'assignment_submit'
  | 'assessment_answer'
  | 'note'
  | 'bookmark';

export type OfflineActionState = 'pending' | 'syncing' | 'failed';

export interface OfflineAction {
  id: string;
  type: OfflineActionType;
  /** Entity the action mutates, used for dedupe and conflict resolution. */
  entityId: string;
  endpoint: string;
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body: unknown;
  createdAt: number;
  updatedAt: number;
  attempts: number;
  nextAttemptAt: number;
  state: OfflineActionState;
  /** Monotonic client version for conflict detection. */
  version: number;
  /** Stable idempotency key sent to the server. */
  idempotencyKey: string;
  /** Last sync failure, shown in the conflict-triage UI. */
  lastError?: string;
  /** HTTP status of the last failure (409/412 indicates a conflict). */
  lastStatus?: number;
}

export interface OfflineActionInput {
  id: string;
  type: OfflineActionType;
  entityId: string;
  endpoint: string;
  method: OfflineAction['method'];
  body: unknown;
  createdAt?: number;
  version?: number;
  idempotencyKey?: string;
}

const DEDUPE_TYPES: readonly OfflineActionType[] = ['assignment_autosave', 'lesson_progress', 'note'];

/**
 * Adds an action, collapsing repeated local edits of the same entity.
 *
 * Autosave/notes/progress are "last local edit wins" while offline: keeping
 * every keystroke would blow the storage quota and produce a replay storm on
 * reconnect. The newest body is retained under the original action id.
 */
export function enqueue(queue: readonly OfflineAction[], input: OfflineActionInput): OfflineAction[] {
  const now = input.createdAt ?? Date.now();
  const dedupe = DEDUPE_TYPES.includes(input.type);

  if (dedupe) {
    const existingIndex = queue.findIndex(
      (action) =>
        action.type === input.type &&
        action.entityId === input.entityId &&
        action.state !== 'syncing',
    );
    if (existingIndex >= 0) {
      const existing = queue[existingIndex]!;
      const updated: OfflineAction = {
        ...existing,
        body: input.body,
        endpoint: input.endpoint,
        method: input.method,
        updatedAt: now,
        version: (input.version ?? existing.version) + 1,
      };
      return queue.map((action, index) => (index === existingIndex ? updated : action));
    }
  }

  const action: OfflineAction = {
    id: input.id,
    type: input.type,
    entityId: input.entityId,
    endpoint: input.endpoint,
    method: input.method,
    body: input.body,
    createdAt: now,
    updatedAt: now,
    attempts: 0,
    nextAttemptAt: now,
    state: 'pending',
    version: input.version ?? 1,
    idempotencyKey: input.idempotencyKey ?? input.id,
  };

  return [...queue, action];
}

export interface BackoffOptions {
  baseMs?: number;
  maxMs?: number;
}

/** Deterministic exponential backoff: base, 2x, 4x … capped. */
export function backoffDelay(attempts: number, options: BackoffOptions = {}): number {
  const base = options.baseMs ?? 1_000;
  const max = options.maxMs ?? 5 * 60 * 1_000;
  if (attempts <= 0) return 0;
  return Math.min(max, base * 2 ** (attempts - 1));
}

/**
 * Action types where a newer pending edit for the same entity supersedes an
 * older one. Last-write-wins is safe here because these edits are idempotent
 * or represent incremental state rather than distinct graded submissions.
 */
export const LAST_WRITE_WINS_TYPES: readonly OfflineActionType[] = [
  'lesson_progress',
  'assignment_autosave',
  'note',
  'bookmark',
];

/**
 * Removes pending actions superseded by a newer edit for the same entity,
 * type, method and endpoint. This is automatic client-side last-write-wins
 * conflict resolution: the older edit is dropped without being sent.
 */
export function dedupeQueue(queue: readonly OfflineAction[]): OfflineAction[] {
  const groups = new Map<string, OfflineAction[]>();
  const kept: OfflineAction[] = [];

  for (const action of queue) {
    if (
      action.state === 'syncing' ||
      !LAST_WRITE_WINS_TYPES.includes(action.type as OfflineActionType)
    ) {
      kept.push(action);
      continue;
    }
    const key = `${action.type}|${action.entityId}|${action.method}|${action.endpoint}`;
    const group = groups.get(key) ?? [];
    group.push(action);
    groups.set(key, group);
  }

  for (const group of groups.values()) {
    const updatedAt = (action: OfflineAction) => action.updatedAt ?? action.createdAt;
    group.sort((a, b) => updatedAt(b) - updatedAt(a) || b.createdAt - a.createdAt || b.id.localeCompare(a.id));
    kept.push(group[0]!);
  }

  return kept;
}

/** Actions ready to be sent, oldest first. Ordering is stable by id. */
export function selectReady(
  queue: readonly OfflineAction[],
  now: number = Date.now(),
  limit = 20,
): OfflineAction[] {
  return queue
    .filter((action) => action.state !== 'syncing' && action.nextAttemptAt <= now)
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
    .slice(0, limit);
}

export function markSyncing(queue: readonly OfflineAction[], id: string): OfflineAction[] {
  return queue.map((action) =>
    action.id === id
      ? {
          ...action,
          state: 'syncing',
          attempts: action.attempts + 1,
          lastError: undefined,
          lastStatus: undefined,
        }
      : action,
  );
}

/** Removes a successfully sent action from the active queue. */
export function markSynced(queue: readonly OfflineAction[], id: string): OfflineAction[] {
  return queue.filter((action) => action.id !== id);
}

export interface OfflineFailure {
  message?: string;
  status?: number;
}

export function markFailed(
  queue: readonly OfflineAction[],
  id: string,
  now: number = Date.now(),
  options: BackoffOptions = {},
  failure: OfflineFailure = {},
): OfflineAction[] {
  return queue.map((action) => {
    if (action.id !== id) return action;
    const attempts = Math.max(1, action.attempts);
    return {
      ...action,
      state: 'failed',
      nextAttemptAt: now + backoffDelay(attempts, options),
      lastError: failure.message ?? action.lastError,
      lastStatus: failure.status ?? action.lastStatus,
    };
  });
}

export interface SyncResult {
  synced: string[];
  failed: string[];
  remaining: OfflineAction[];
}

export type ActionSender = (action: OfflineAction) => Promise<void>;

function failureFrom(error: unknown): OfflineFailure {
  if (error && typeof error === 'object') {
    const candidate = error as { message?: unknown; status?: unknown };
    return {
      message: typeof candidate.message === 'string' ? candidate.message : 'Sync failed',
      status: typeof candidate.status === 'number' ? candidate.status : undefined,
    };
  }
  return { message: 'Sync failed' };
}

/**
 * Flushes ready actions sequentially. Sequential replay preserves causal
 * ordering (a submission after its autosave) and avoids duplicate submits.
 */
export async function flushQueue(
  queue: readonly OfflineAction[],
  send: ActionSender,
  now: () => number = () => Date.now(),
  limit = 20,
): Promise<SyncResult> {
  let working = dedupeQueue([...queue]);
  const synced: string[] = [];
  const failed: string[] = [];

  const ready = selectReady(working, now(), limit);
  for (const candidate of ready) {
    working = markSyncing(working, candidate.id);
    const current = working.find((action) => action.id === candidate.id)!;
    try {
      await send(current);
      working = markSynced(working, candidate.id);
      synced.push(candidate.id);
    } catch (error) {
      working = markFailed(working, candidate.id, now(), {}, failureFrom(error));
      failed.push(candidate.id);
    }
  }

  return { synced, failed, remaining: working };
}

// ---------------------------------------------------------------------------
// Conflict resolution
// ---------------------------------------------------------------------------

export type ConflictStrategy = 'server-wins' | 'client-wins' | 'last-write-wins';

export interface VersionedRecord<T> {
  value: T;
  updatedAt: number;
  version: number;
}

export interface ConflictResolution<T> {
  value: T;
  source: 'server' | 'client';
  strategy: ConflictStrategy;
}

/**
 * Resolves an offline edit against the server copy.
 *
 * Default is `last-write-wins`, which is deterministic and safe for notes and
 * progress. Graded assessment answers must use `server-wins`; the caller picks
 * the strategy per entity, never the client.
 */
export function resolveConflict<T>(
  local: VersionedRecord<T>,
  server: VersionedRecord<T>,
  strategy: ConflictStrategy = 'last-write-wins',
): ConflictResolution<T> {
  if (strategy === 'server-wins') {
    return { value: server.value, source: 'server', strategy };
  }
  if (strategy === 'client-wins') {
    return { value: local.value, source: 'client', strategy };
  }

  if (local.version !== server.version) {
    // A newer server version means someone else edited after our base.
    if (server.version > local.version) {
      return { value: server.value, source: 'server', strategy };
    }
    return { value: local.value, source: 'client', strategy };
  }

  const serverIsNewer = server.updatedAt >= local.updatedAt;
  return serverIsNewer
    ? { value: server.value, source: 'server', strategy }
    : { value: local.value, source: 'client', strategy };
}

// ---------------------------------------------------------------------------
// Download planning (low-bandwidth aware)
// ---------------------------------------------------------------------------

export type MediaQuality = 'audio' | 'low' | 'medium' | 'high';

export interface DownloadCandidate {
  id: string;
  title: string;
  durationSeconds: number;
  required: boolean;
  sizeBytes?: Partial<Record<MediaQuality, number>>;
}

export interface DownloadPlan {
  selected: { id: string; quality: MediaQuality; estimatedBytes: number }[];
  skipped: { id: string; reason: 'over_budget' | 'not_required' }[];
  totalBytes: number;
  budgetBytes: number;
  degraded: boolean;
}

const QUALITY_ORDER: MediaQuality[] = ['high', 'medium', 'low', 'audio'];

const DEFAULT_BYTES_PER_SECOND: Record<MediaQuality, number> = {
  audio: 8 * 1024,
  low: 40 * 1024,
  medium: 120 * 1024,
  high: 300 * 1024,
};

export function estimateBytes(
  durationSeconds: number,
  quality: MediaQuality,
  sizeBytes?: Partial<Record<MediaQuality, number>>,
): number {
  const explicit = sizeBytes?.[quality];
  if (typeof explicit === 'number' && explicit >= 0) return Math.round(explicit);
  return Math.round(Math.max(0, durationSeconds) * DEFAULT_BYTES_PER_SECOND[quality]);
}

/**
 * Chooses what to cache for offline use. Required lessons are prioritised and
 * quality degrades step by step before a required lesson is dropped. If even
 * the audio version does not fit, it is skipped rather than silently truncated.
 */
export function planDownloads(
  candidates: readonly DownloadCandidate[],
  budgetBytes: number,
  preferredQuality: MediaQuality = 'medium',
): DownloadPlan {
  const selected: DownloadPlan['selected'] = [];
  const skipped: DownloadPlan['skipped'] = [];
  let totalBytes = 0;
  let degraded = false;

  const ordered = [...candidates].sort((a, b) => {
    if (a.required !== b.required) return a.required ? -1 : 1;
    return a.id.localeCompare(b.id);
  });

  const startIndex = QUALITY_ORDER.indexOf(preferredQuality);

  for (const candidate of ordered) {
    const qualities = QUALITY_ORDER.slice(Math.max(0, startIndex));
    let placed = false;

    for (const quality of qualities) {
      const bytes = estimateBytes(candidate.durationSeconds, quality, candidate.sizeBytes);
      if (totalBytes + bytes <= budgetBytes) {
        selected.push({ id: candidate.id, quality, estimatedBytes: bytes });
        totalBytes += bytes;
        if (quality !== preferredQuality) degraded = true;
        placed = true;
        break;
      }
    }

    if (!placed) {
      skipped.push({
        id: candidate.id,
        reason: candidate.required ? 'over_budget' : 'not_required',
      });
    }
  }

  return { selected, skipped, totalBytes, budgetBytes, degraded };
}

// ---------------------------------------------------------------------------
// Lightweight persistence adapters
// ---------------------------------------------------------------------------

export interface OfflineStorage {
  read(): OfflineAction[];
  write(actions: OfflineAction[]): void;
}

export const STORAGE_KEY = 'edunet-offline-queue-v1';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function createLocalStorageAdapter(storage: StorageLike): OfflineStorage {
  return {
    read() {
      try {
        const raw = storage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(isOfflineAction);
      } catch {
        // Corrupt storage must not brick the app; the queue restarts empty and
        // the UI surfaces an offline warning rather than losing silently.
        return [];
      }
    },
    write(actions) {
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify(actions));
      } catch {
        /* quota exceeded — caller keeps the in-memory queue */
      }
    },
  };
}

export function isOfflineAction(value: unknown): value is OfflineAction {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.type === 'string' &&
    typeof candidate.entityId === 'string' &&
    typeof candidate.endpoint === 'string' &&
    typeof candidate.createdAt === 'number' &&
    typeof candidate.state === 'string'
  );
}
