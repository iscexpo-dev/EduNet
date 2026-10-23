/**
 * Submission policy: pure, dependency-free rules for lateness, resubmission,
 * late penalties and rubric scoring.
 *
 * All decisions are made server-side. Handlers persist the outcome; nothing in
 * this module trusts client-supplied scores or timestamps.
 */

export type LatePolicy = 'accept' | 'penalized' | 'locked';

export const LATE_POLICIES: readonly LatePolicy[] = ['accept', 'penalized', 'locked'];

export const MAX_SUBMISSION_LENGTH = 50_000;

export interface AssignmentTimingPolicy {
  dueDate: Date;
  latePolicy: LatePolicy;
}

export interface SubmissionDecision {
  accepted: boolean;
  isLate: boolean;
  rejectionCode?: string;
}

export interface ResubmissionPolicy {
  allowResubmission: boolean;
  resubmissionDeadline: Date | null;
  dueDate: Date;
  latePolicy: LatePolicy;
}

export interface ExistingSubmissionState {
  isGraded: boolean;
  attempts: number;
}

export interface ResubmissionDecision {
  allowed: boolean;
  attemptNumber: number;
  rejectionCode?: string;
}

export function isLatePolicy(value: unknown): value is LatePolicy {
  return typeof value === 'string' && (LATE_POLICIES as readonly string[]).includes(value);
}

/**
 * Validates free-text submission content. Surrounding whitespace is ignored so
 * an all-whitespace body is rejected, but the stored content is not trimmed by
 * this predicate — callers decide what to persist.
 */
export function validateSubmissionContent(content: unknown): boolean {
  if (typeof content !== 'string') return false;
  if (content.trim().length === 0) return false;
  return content.length <= MAX_SUBMISSION_LENGTH;
}

/**
 * Decides whether a first submission may be accepted at `now`.
 *
 * - `accept`: late work is stored, flagged late, and graded normally.
 * - `penalized`: identical acceptance; the penalty is applied at grading time.
 * - `locked`: anything after the deadline is rejected.
 */
export function evaluateSubmission(
  policy: AssignmentTimingPolicy,
  now: Date,
): SubmissionDecision {
  const due = new Date(policy.dueDate);
  if (Number.isNaN(due.getTime())) {
    return { accepted: false, isLate: false, rejectionCode: 'Assignment has an invalid due date' };
  }
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    return { accepted: false, isLate: false, rejectionCode: 'Invalid submission time' };
  }

  const late = now.getTime() > due.getTime();
  if (!late) {
    return { accepted: true, isLate: false };
  }

  const latePolicy: LatePolicy = isLatePolicy(policy.latePolicy) ? policy.latePolicy : 'accept';
  if (latePolicy === 'locked') {
    return {
      accepted: false,
      isLate: true,
      rejectionCode: 'The deadline has passed and late submissions are not accepted',
    };
  }
  return { accepted: true, isLate: true };
}

/**
 * Decides whether an already-submitted assignment may be resubmitted.
 *
 * Rules (all server-enforced):
 * - resubmission must be enabled on the assignment;
 * - a graded submission is final unless the assignment explicitly allows
 *   resubmission (teachers can still regrade);
 * - the resubmission deadline, when set, is a hard cut-off;
 * - the assignment late policy still applies.
 */
export function evaluateResubmission(
  policy: ResubmissionPolicy,
  existing: ExistingSubmissionState,
  now: Date,
): ResubmissionDecision {
  const nextAttempt = Math.max(1, existing.attempts) + 1;

  if (!policy.allowResubmission) {
    return {
      allowed: false,
      attemptNumber: nextAttempt,
      rejectionCode: 'Resubmission is not allowed for this assignment',
    };
  }

  if (existing.isGraded) {
    return {
      allowed: false,
      attemptNumber: nextAttempt,
      rejectionCode: 'This submission has already been graded',
    };
  }

  if (policy.resubmissionDeadline) {
    const deadline = new Date(policy.resubmissionDeadline);
    if (Number.isNaN(deadline.getTime())) {
      return {
        allowed: false,
        attemptNumber: nextAttempt,
        rejectionCode: 'Assignment has an invalid resubmission deadline',
      };
    }
    if (now.getTime() > deadline.getTime()) {
      return {
        allowed: false,
        attemptNumber: nextAttempt,
        rejectionCode: 'The resubmission deadline has passed',
      };
    }
  }

  const latePolicy: LatePolicy = isLatePolicy(policy.latePolicy) ? policy.latePolicy : 'accept';
  if (latePolicy === 'locked' && now.getTime() > new Date(policy.dueDate).getTime()) {
    return {
      allowed: false,
      attemptNumber: nextAttempt,
      rejectionCode: 'The deadline has passed and late submissions are not accepted',
    };
  }

  return { allowed: true, attemptNumber: nextAttempt };
}

/**
 * Applies a percentage late penalty, rounded to the nearest whole point and
 * clamped to [0, maxPoints].
 */
export function applyLatePenalty(
  grade: number,
  penaltyPercent: number,
  maxPoints: number,
): number {
  const safeGrade = Number.isFinite(grade) ? grade : 0;
  const safePercent = Number.isFinite(penaltyPercent)
    ? Math.min(100, Math.max(0, penaltyPercent))
    : 0;
  const penalised = Math.round(safeGrade * (1 - safePercent / 100));
  return Math.min(Math.max(0, penalised), Math.max(0, maxPoints));
}

export interface RubricCriterionInput {
  description: string;
  maxPoints: number;
}

export type RubricScoreResult = { grade: number } | { error: string };

/**
 * Validates and totals per-criterion rubric scores.
 *
 * Scores are keyed by criterion description (the stable identifier exposed to
 * clients). Unknown criteria, negative scores and scores above the criterion
 * maximum are rejected — a client cannot inflate a grade.
 */
export function applyRubricScores(
  criteria: readonly RubricCriterionInput[],
  scores: Record<string, number>,
): RubricScoreResult {
  if (criteria.length === 0) {
    return { error: 'Assignment has no rubric configured' };
  }
  if (typeof scores !== 'object' || scores === null || Array.isArray(scores)) {
    return { error: 'Rubric scores must be an object keyed by criterion' };
  }

  const known = new Set(criteria.map((criterion) => criterion.description));
  for (const key of Object.keys(scores)) {
    if (!known.has(key)) {
      return { error: `Unknown rubric criterion: ${key}` };
    }
  }

  let total = 0;
  for (const criterion of criteria) {
    const raw = scores[criterion.description];
    if (raw === undefined) {
      return { error: `Missing score for rubric criterion: ${criterion.description}` };
    }
    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
      return { error: `Score for "${criterion.description}" must be a number` };
    }
    if (!Number.isInteger(raw)) {
      return { error: `Score for "${criterion.description}" must be a whole number` };
    }
    if (raw < 0) {
      return { error: `Score for "${criterion.description}" cannot be negative` };
    }
    if (raw > criterion.maxPoints) {
      return {
        error: `Score for "${criterion.description}" cannot exceed ${criterion.maxPoints}`,
      };
    }
    total += raw;
  }

  return { grade: total };
}
