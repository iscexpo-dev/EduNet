import { describe, it, expect } from 'vitest';
import {
  gradeAnswer,
  gradeAttempt,
  normalizeText,
  computePercentScore,
  didPass,
  type GradingQuestion,
} from './grading';

function mcq(id: string, correctIndex: number, points = 5): GradingQuestion {
  const options = ['A', 'B', 'C', 'D'].map((text, index) => ({ text, correct: index === correctIndex }));
  return { id, type: 'multiple_choice', points, options, correctAnswer: correctIndex };
}

describe('normalizeText', () => {
  it('NFC-normalises, casefolds and collapses whitespace', () => {
    expect(normalizeText('  ডাকাত   বাংলা  ')).toBe('ডাকাত বাংলা');
    expect(normalizeText('  Hello   World ')).toBe('hello world');
    // ä composed vs decomposed forms compare equal after NFC
    expect(normalizeText('\u0061\u0308')).toBe(normalizeText('\u00e4'));
  });
});

describe('gradeAnswer: multiple_choice', () => {
  it('accepts matching index answer', () => {
    const result = gradeAnswer(mcq('q1', 2), 2);
    expect(result.correct).toBe(true);
    expect(result.pointsEarned).toBe(5);
  });

  it('accepts matching option text', () => {
    const result = gradeAnswer(mcq('q1', 2), 'C');
    expect(result.correct).toBe(true);
  });

  it('rejects a wrong choice with zero points', () => {
    const result = gradeAnswer(mcq('q1', 2), 0);
    expect(result.correct).toBe(false);
    expect(result.pointsEarned).toBe(0);
  });

  it('rejects out-of-range indexes', () => {
    const result = gradeAnswer(mcq('q1', 2), 9);
    expect(result.pointsEarned).toBe(0);
  });
});

describe('gradeAnswer: true_false', () => {
  const tf: GradingQuestion = { id: 't1', type: 'true_false', points: 2, correctAnswer: true };

  it('accepts booleans and their string forms', () => {
    expect(gradeAnswer(tf, true).pointsEarned).toBe(2);
    expect(gradeAnswer(tf, 'true').pointsEarned).toBe(2);
    expect(gradeAnswer(tf, 1).pointsEarned).toBe(2);
  });

  it('rejects falsy-style answers that do not match', () => {
    expect(gradeAnswer(tf, false).correct).toBe(false);
    expect(gradeAnswer(tf, 'false').correct).toBe(false);
  });

  it('fails closed when canonical answer is missing', () => {
    const broken: GradingQuestion = { id: 't2', type: 'true_false', points: 2 };
    expect(gradeAnswer(broken, true).pendingManual).toBe(true);
  });
});

describe('gradeAnswer: multiple_select', () => {
  const ms: GradingQuestion = {
    id: 'm1',
    type: 'multiple_select',
    points: 4,
    options: [
      { text: 'A', correct: true },
      { text: 'B', correct: true },
      { text: 'C', correct: false },
      { text: 'D', correct: false },
    ],
    correctAnswer: [0, 1],
  };

  it('full credit for exact set', () => {
    const result = gradeAnswer(ms, [0, 1]);
    expect(result.correct).toBe(true);
    expect(result.pointsEarned).toBe(4);
  });

  it('partial credit for correct subset, no credit for wrong picks', () => {
    expect(gradeAnswer(ms, [0]).pointsEarned).toBe(2);
    const withWrong = gradeAnswer(ms, [0, 2]);
    expect(withWrong.pointsEarned).toBe(0);
    expect(withWrong.correct).toBe(false);
  });

  it('a duplicate or wrong order does not confuse grading', () => {
    expect(gradeAnswer(ms, [1, 0]).correct).toBe(true);
  });
});

describe('gradeAnswer: short_answer', () => {
  it('normalises case and whitespace', () => {
    const q: GradingQuestion = { id: 's1', type: 'short_answer', points: 3, correctAnswer: 'Dhaka' };
    expect(gradeAnswer(q, '   dhaka  ').correct).toBe(true);
    expect(gradeAnswer(q, 'Chittagong').correct).toBe(false);
  });

  it('supports alternative Bengali answers', () => {
    const q: GradingQuestion = {
      id: 's2',
      type: 'short_answer',
      points: 3,
      correctAnswer: ['ঢাকা', 'dha ka'],
    };
    expect(gradeAnswer(q, 'ঢাকা').correct).toBe(true);
    expect(gradeAnswer(q, 'ডাকা').correct).toBe(false);
  });

  it('empty Fighting blank answers earn nothing', () => {
    const q: GradingQuestion = { id: 's3', type: 'short_answer', points: 3, correctAnswer: 'a' };
    expect(gradeAnswer(q, '   ').pointsEarned).toBe(0);
  });
});

describe('gradeAnswer: fill_in_blank', () => {
  it('gives partial credit per blank', () => {
    const q: GradingQuestion = {
      id: 'f1',
      type: 'fill_in_blank',
      points: 3,
      correctAnswer: ['Dhaka', 'Chittagong'],
    };
    const half = gradeAnswer(q, ['Dhaka', '']);
    expect(half.pointsEarned).toBe(1.5);
    expect(half.correct).toBe(false);

    const full = gradeAnswer(q, [' dhaka ', 'chittagong']);
    expect(full.correct).toBe(true);
    expect(full.pointsEarned).toBe(3);
  });

  it('supports alternates per blank', () => {
    const q: GradingQuestion = {
      id: 'f2',
      type: 'fill_in_blank',
      points: 2,
      correctAnswer: [['ঢাকা', 'Dhaka']],
    };
    expect(gradeAnswer(q, ['Dhaka']).correct).toBe(true);
    expect(gradeAnswer(q, ['ঢাকা']).correct).toBe(true);
  });
});

describe('gradeAnswer: matching', () => {
  it('scores per-pair partial credit', () => {
    const q: GradingQuestion = {
      id: 'mt1',
      type: 'matching',
      points: 4,
      correctAnswer: { left1: 'right1', left2: 'right2' },
    };
    const all = gradeAnswer(q, { left1: 'right1', left2: 'right2' });
    expect(all.correct).toBe(true);
    expect(all.pointsEarned).toBe(4);

    const half = gradeAnswer(q, { left1: 'right1', left2: 'WRONG' });
    expect(half.pointsEarned).toBe(2);
  });
});

describe('gradeAnswer: essay + unknown types fail closed', () => {
  it('essays are always pending manual with zero auto points', () => {
    const q: GradingQuestion = { id: 'e1', type: 'essay', points: 10 };
    const result = gradeAnswer(q, 'A long Bengali essay about the Indian Ocean.');
    expect(result.pendingManual).toBe(true);
    expect(result.pointsEarned).toBe(0);
  });

  it('unsupported question types never auto-award points', () => {
    const q: GradingQuestion = { id: 'x1', type: 'experimental', points: 10, correctAnswer: 'anything' };
    const result = gradeAnswer(q, 'anything');
    expect(result.pendingManual).toBe(true);
    expect(result.pointsEarned).toBe(0);
  });
});

describe('gradeAttempt', () => {
  it('aggregates earned/total, detects manual needs and blank answers', () => {
    const questions: GradingQuestion[] = [
      mcq('q1', 1, 5),
      { id: 'e2', type: 'essay', points: 10 },
    ];
    const attempt = gradeAttempt(questions, { q1: 1, e2: 'student text' });
    expect(attempt.earnedPoints).toBe(5);
    expect(attempt.totalPoints).toBe(15);
    expect(attempt.requiresManualGrading).toBe(true);
    expect(attempt.answeredEverything).toBe(true);
  });

  it('flags unanswered questions', () => {
    const questions: GradingQuestion[] = [mcq('q1', 1, 5), mcq('q2', 2, 5)];
    const attempt = gradeAttempt(questions, { q1: 1 });
    expect(attempt.answeredEverything).toBe(false);
  });

  it('fulfils the guarantee: answers always survive JSON round-trip without resolvable score claims', () => {
    // A student CANNOT submit a score field to alter grading — only answers matter.
    const questions: GradingQuestion[] = [mcq('q1', 1, 5)];
    const attempt = gradeAttempt(questions, { q1: 'wrong', claims: { score: 100 } });
    expect(attempt.earnedPoints).toBe(0);
  });
});

describe('score computation', () => {
  it('computes percentage scores and pass thresholds', () => {
    expect(computePercentScore(7, 10)).toBe(70);
    expect(computePercentScore(0, 0)).toBe(0);
    expect(didPass(70, 70)).toBe(true);
    expect(didPass(69, 70)).toBe(false);
    expect(didPass(59, null)).toBe(false);
    expect(didPass(60, null)).toBe(true);
  });
});
