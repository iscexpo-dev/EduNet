/**
 * Platform administration rules: attendance, grading, feature flags, consent,
 * privacy request lifecycle and tamper-evident audit hashing. No database
 * imports so policies can be unit tested and reused by jobs.
 */
import { createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------------

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';

export const ATTENDANCE_WEIGHT: Record<AttendanceStatus, number> = {
  present: 1,
  late: 1,
  excused: 1,
  absent: 0,
};

export interface AttendanceRecordLike {
  studentId: string;
  status: AttendanceStatus;
}

export interface AttendanceSummary {
  studentId: string;
  present: number;
  absent: number;
  late: number;
  excused: number;
  total: number;
  rate: number;
}

/** Attendance rate counts present, late and excused as attending. */
export function summariseAttendance(records: readonly AttendanceRecordLike[]): AttendanceSummary[] {
  const byStudent = new Map<string, AttendanceSummary>();
  for (const record of records) {
    const summary =
      byStudent.get(record.studentId) ??
      { studentId: record.studentId, present: 0, absent: 0, late: 0, excused: 0, total: 0, rate: 0 };
    summary[record.status] += 1;
    summary.total += 1;
    byStudent.set(record.studentId, summary);
  }
  return [...byStudent.values()].map((summary) => ({
    ...summary,
    rate: summary.total ? Math.round(((summary.total - summary.absent) / summary.total) * 10000) / 100 : 0,
  }));
}

export function isAttendanceAtRisk(summary: Pick<AttendanceSummary, 'rate'>, threshold = 75): boolean {
  return summary.rate < threshold;
}

// ---------------------------------------------------------------------------
// Grading
// ---------------------------------------------------------------------------

export interface GradeItem {
  score: number;
  maxScore: number;
  weight: number;
}

/**
 * Weighted percentage across graded items. Items with zero max score are
 * ignored; weights are renormalised so missing categories do not silently
 * drag a student's grade to zero.
 */
export function calculateWeightedGrade(items: readonly GradeItem[]): number {
  const valid = items.filter((item) => item.maxScore > 0 && item.weight > 0);
  if (!valid.length) return 0;
  const totalWeight = valid.reduce((sum, item) => sum + item.weight, 0);
  const weighted = valid.reduce(
    (sum, item) => sum + (Math.min(item.score, item.maxScore) / item.maxScore) * item.weight,
    0,
  );
  return Math.round((weighted / totalWeight) * 10000) / 100;
}

export function letterGrade(percent: number): string {
  if (percent >= 90) return 'A+';
  if (percent >= 80) return 'A';
  if (percent >= 70) return 'B';
  if (percent >= 60) return 'C';
  if (percent >= 50) return 'D';
  return 'F';
}

export function isPassing(percent: number, passMark = 50): boolean {
  return percent >= passMark;
}

// ---------------------------------------------------------------------------
// Academic calendar
// ---------------------------------------------------------------------------

export function isValidAcademicYear(input: { startsOn: Date; endsOn: Date }): boolean {
  return input.endsOn.getTime() > input.startsOn.getTime();
}

export function termWithinYear(
  term: { startsOn: Date; endsOn: Date },
  year: { startsOn: Date; endsOn: Date },
): boolean {
  return (
    isValidAcademicYear(term) &&
    term.startsOn.getTime() >= year.startsOn.getTime() &&
    term.endsOn.getTime() <= year.endsOn.getTime()
  );
}

export function activeTerm<T extends { startsOn: Date; endsOn: Date }>(terms: readonly T[], now = new Date()): T | null {
  return (
    terms.find(
      (term) => term.startsOn.getTime() <= now.getTime() && term.endsOn.getTime() >= now.getTime(),
    ) ?? null
  );
}

// ---------------------------------------------------------------------------
// Feature flags
// ---------------------------------------------------------------------------

export interface FeatureFlagLike {
  key: string;
  isEnabled: boolean;
  rolloutPercentage: number;
  enabledOrganizationIds?: string[] | null;
  enabledUserIds?: string[] | null;
}

export function stableBucket(key: string, subjectId: string): number {
  const digest = createHash('sha256').update(`${key}:${subjectId}`).digest();
  return digest.readUInt32BE(0) % 100;
}

export function evaluateFeatureFlag(
  flag: FeatureFlagLike,
  context: { organizationId: string; userId?: string },
): boolean {
  if (!flag.isEnabled) return false;
  if (flag.enabledOrganizationIds?.length) {
    if (!flag.enabledOrganizationIds.includes(context.organizationId)) return false;
  }
  if (flag.enabledUserIds?.length && context.userId) {
    return flag.enabledUserIds.includes(context.userId);
  }
  if (flag.rolloutPercentage >= 100) return true;
  if (flag.rolloutPercentage <= 0) return false;
  const subject = context.userId ?? context.organizationId;
  return stableBucket(flag.key, subject) < flag.rolloutPercentage;
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export type SettingsValue = string | number | boolean | null | SettingsValue[] | { [key: string]: SettingsValue };

/** Shallow merge of organization overrides onto defaults, keyed by setting key. */
export function mergeSettings<T extends Record<string, SettingsValue>>(
  defaults: T,
  overrides: Partial<T>,
): T {
  return { ...defaults, ...overrides };
}

// ---------------------------------------------------------------------------
// Privacy and consent
// ---------------------------------------------------------------------------

export type DataRequestStatus = 'received' | 'verifying' | 'processing' | 'completed' | 'rejected';
export type DataRequestType = 'access' | 'erasure' | 'rectification' | 'portability' | 'restriction';

const DATA_REQUEST_TRANSITIONS: Record<DataRequestStatus, readonly DataRequestStatus[]> = {
  received: ['verifying', 'rejected'],
  verifying: ['processing', 'rejected'],
  processing: ['completed', 'rejected'],
  completed: [],
  rejected: [],
};

export function canTransitionDataRequest(from: DataRequestStatus, to: DataRequestStatus): boolean {
  return DATA_REQUEST_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Statutory response deadline (30 days by default) from receipt. */
export function dataRequestDueAt(receivedAt: Date, days = 30): Date {
  return new Date(receivedAt.getTime() + days * 24 * 60 * 60 * 1000);
}

export function isDataRequestOverdue(
  request: { dueAt: Date; status: DataRequestStatus },
  now = new Date(),
): boolean {
  if (request.status === 'completed' || request.status === 'rejected') return false;
  return now.getTime() > request.dueAt.getTime();
}

export interface ConsentLike {
  purpose: string;
  granted: boolean;
  expiresAt?: Date | null;
  withdrawnAt?: Date | null;
}

export function hasActiveConsent(
  consents: readonly ConsentLike[],
  purpose: string,
  now = new Date(),
): boolean {
  const consent = consents.find((entry) => entry.purpose === purpose);
  if (!consent || !consent.granted) return false;
  if (consent.withdrawnAt) return false;
  if (consent.expiresAt && consent.expiresAt.getTime() <= now.getTime()) return false;
  return true;
}

export function missingConsents(
  consents: readonly ConsentLike[],
  requiredPurposes: readonly string[],
  now = new Date(),
): string[] {
  return requiredPurposes.filter((purpose) => !hasActiveConsent(consents, purpose, now));
}

// ---------------------------------------------------------------------------
// Audit trail
// ---------------------------------------------------------------------------

export interface AuditEventInput {
  organizationId: string | null;
  actorId: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: Date;
}

export interface AuditEvent extends AuditEventInput {
  hash: string;
  previousHash: string | null;
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(',')}}`;
}

export function computeAuditHash(event: AuditEventInput, previousHash: string | null): string {
  const payload = canonical({
    organizationId: event.organizationId,
    actorId: event.actorId,
    action: event.action,
    resourceType: event.resourceType,
    resourceId: event.resourceId ?? null,
    metadata: event.metadata ?? null,
    createdAt: (event.createdAt ?? new Date()).toISOString(),
    previousHash,
  });
  return createHash('sha256').update(payload).digest('hex');
}

/** Appends an event and links it to the previous hash in the chain. */
export function appendAuditEvent(
  previous: AuditEvent | null,
  input: AuditEventInput,
): AuditEvent {
  const previousHash = previous?.hash ?? null;
  return { ...input, previousHash, hash: computeAuditHash(input, previousHash) };
}

export function verifyAuditChain(events: readonly AuditEvent[]): { valid: boolean; brokenAt: number | null } {
  let previousHash: string | null = null;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index]!;
    if (event.previousHash !== previousHash) return { valid: false, brokenAt: index };
    if (computeAuditHash(event, previousHash) !== event.hash) return { valid: false, brokenAt: index };
    previousHash = event.hash;
  }
  return { valid: true, brokenAt: null };
}
