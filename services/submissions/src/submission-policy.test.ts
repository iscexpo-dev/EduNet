import { describe, expect, it } from 'vitest';
import {
  applyLatePenalty,
  applyRubricScores,
  evaluateResubmission,
  evaluateSubmission,
  validateSubmissionContent,
} from './submission-policy';

const due = new Date('2026-01-10T12:00:00.000Z');
const before = new Date('2026-01-10T11:59:59.000Z');
const after = new Date('2026-01-10T12:00:01.000Z');

describe('validateSubmissionContent', () => {
  it('accepts normal content', () => {
    expect(validateSubmissionContent('My essay')).toBe(true);
  });

  it('rejects empty and whitespace-only content', () => {
    expect(validateSubmissionContent('')).toBe(false);
    expect(validateSubmissionContent('   \n\t ')).toBe(false);
  });

  it('rejects non-strings and oversized content', () => {
    expect(validateSubmissionContent(null)).toBe(false);
    expect(validateSubmissionContent(42)).toBe(false);
    expect(validateSubmissionContent('a'.repeat(50_001))).toBe(false);
    expect(validateSubmissionContent('a'.repeat(50_000))).toBe(true);
  });
});

describe('evaluateSubmission', () => {
  it('accepts on-time work under every policy', () => {
    for (const latePolicy of ['accept', 'penalized', 'locked'] as const) {
      expect(evaluateSubmission({ dueDate: due, latePolicy }, before)).toEqual({
        accepted: true,
        isLate: false,
      });
    }
  });

  it('accepts and flags late work under accept/penalized', () => {
    for (const latePolicy of ['accept', 'penalized'] as const) {
      expect(evaluateSubmission({ dueDate: due, latePolicy }, after)).toEqual({
        accepted: true,
        isLate: true,
      });
    }
  });

  it('rejects late work under locked', () => {
    const result = evaluateSubmission({ dueDate: due, latePolicy: 'locked' }, after);
    expect(result.accepted).toBe(false);
    expect(result.isLate).toBe(true);
    expect(result.rejectionCode).toMatch(/deadline/i);
  });

  it('rejects invalid dates', () => {
    expect(evaluateSubmission({ dueDate: new Date('nope'), latePolicy: 'accept' }, before).accepted).toBe(false);
    expect(evaluateSubmission({ dueDate: due, latePolicy: 'accept' }, new Date('nope')).accepted).toBe(false);
  });

  it('falls back to accept for an unknown policy', () => {
    expect(
      evaluateSubmission({ dueDate: due, latePolicy: 'nonsense' as never }, after).accepted,
    ).toBe(true);
  });
});

describe('evaluateResubmission', () => {
  const basePolicy = {
    allowResubmission: true,
    resubmissionDeadline: null,
    dueDate: due,
    latePolicy: 'accept' as const,
  };

  it('increments the attempt number', () => {
    expect(
      evaluateResubmission(basePolicy, { isGraded: false, attempts: 1 }, before),
    ).toEqual({ allowed: true, attemptNumber: 2 });
  });

  it('rejects when resubmission is disabled', () => {
    const decision = evaluateResubmission(
      { ...basePolicy, allowResubmission: false },
      { isGraded: false, attempts: 1 },
      before,
    );
    expect(decision.allowed).toBe(false);
  });

  it('rejects resubmission after grading', () => {
    const decision = evaluateResubmission(basePolicy, { isGraded: true, attempts: 1 }, before);
    expect(decision.allowed).toBe(false);
    expect(decision.rejectionCode).toMatch(/graded/i);
  });

  it('enforces the resubmission deadline', () => {
    const policy = {
      ...basePolicy,
      resubmissionDeadline: new Date('2026-01-11T12:00:00.000Z'),
    };
    expect(
      evaluateResubmission(policy, { isGraded: false, attempts: 1 }, new Date('2026-01-11T12:00:01.000Z'))
        .allowed,
    ).toBe(false);
  });

  it('honours a locked late policy after the due date', () => {
    const policy = { ...basePolicy, latePolicy: 'locked' as const };
    expect(
      evaluateResubmission(policy, { isGraded: false, attempts: 1 }, after).allowed,
    ).toBe(false);
  });
});

describe('applyLatePenalty', () => {
  it('returns the grade unchanged with zero penalty', () => {
    expect(applyLatePenalty(80, 0, 100)).toBe(80);
  });

  it('applies a percentage and rounds', () => {
    expect(applyLatePenalty(80, 10, 100)).toBe(72);
    expect(applyLatePenalty(85, 10, 100)).toBe(77);
  });

  it('clamps the penalty and the result', () => {
    expect(applyLatePenalty(80, 150, 100)).toBe(0);
    expect(applyLatePenalty(120, 0, 100)).toBe(100);
    expect(applyLatePenalty(-5, 0, 100)).toBe(0);
  });
});

describe('applyRubricScores', () => {
  const criteria = [
    { description: 'Thesis', maxPoints: 40 },
    { description: 'Evidence', maxPoints: 40 },
    { description: 'Style', maxPoints: 20 },
  ];

  it('totals valid scores', () => {
    expect(applyRubricScores(criteria, { Thesis: 35, Evidence: 30, Style: 18 })).toEqual({
      grade: 83,
    });
  });

  it('rejects missing criteria', () => {
    expect(applyRubricScores(criteria, { Thesis: 35, Evidence: 30 })).toHaveProperty('error');
  });

  it('rejects unknown criteria', () => {
    expect(
      applyRubricScores(criteria, {
        Thesis: 35,
        Evidence: 30,
        Style: 18,
        Bonus: 100,
      }),
    ).toHaveProperty('error');
  });

  it('rejects over-max, negative, fractional and non-numeric scores', () => {
    expect(
      applyRubricScores(criteria, { Thesis: 41, Evidence: 30, Style: 18 }),
    ).toHaveProperty('error');
    expect(
      applyRubricScores(criteria, { Thesis: -1, Evidence: 30, Style: 18 }),
    ).toHaveProperty('error');
    expect(
      applyRubricScores(criteria, { Thesis: 1.5, Evidence: 30, Style: 18 }),
    ).toHaveProperty('error');
    expect(
      applyRubricScores(criteria, {
        Thesis: '35' as never,
        Evidence: 30,
        Style: 18,
      }),
    ).toHaveProperty('error');
  });

  it('rejects when there is no rubric', () => {
    expect(applyRubricScores([], {})).toHaveProperty('error');
  });
});
