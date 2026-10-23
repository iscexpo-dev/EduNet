/**
 * Server-side grading engine for the EduNet assessment system.
 *
 * Rules:
 * - ALL objective grading happens here, on the server. Client-submitted
 *   scores are never trusted (they only submit answers).
 * - Partial credit is supported for multiple-select and fill-in-the-blank.
 * - Subjective types (essay short-answer-freeform) return `pendingManual`
 *   and are finalized by a teacher via the manual grading workflow.
 * - Text normalization covers English and Bengali answers: NFC Unicode
 *   normalization, casefold, whitespace collapse.
 */

export type QuestionType =
  | 'multiple_choice'
  | 'multiple_select'
  | 'true_false'
  | 'short_answer'
  | 'essay'
  | 'matching'
  | 'fill_in_blank';

export interface GradingQuestion {
  id: string;
  type: string; // loose: unknown types fail closed (pending manual)
  points: number;
  options?: unknown; // multiple choice/select options [{text, correct}]
  correctAnswer?: unknown; // canonical answer, shape depends on type
}

export interface GradingResult {
  questionId: string;
  pointsPossible: number;
  pointsEarned: number;
  correct: boolean;
  /** Subjective answer awaiting teacher grading. Excluded from auto score. */
  pendingManual?: boolean;
}

export interface AttemptGrading {
  results: GradingResult[];
  totalPoints: number;
  earnedPoints: number;
  /** True when at least one answer needs manual grading. */
  requiresManualGrading: boolean;
  /** False when the student left an answer blank. */
  answeredEverything: boolean;
}

export function normalizeText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ');
}

function optionText(option: unknown): string {
  if (typeof option === 'string') return option;
  if (option && typeof option === 'object' && 'text' in (option as Record<string, unknown>)) {
    const text = (option as Record<string, unknown>).text;
    if (typeof text === 'string') return text;
  }
  return '';
}

/** Canonical correct option indices from turns title/options into a set. */
function correctOptionIndices(question: GradingQuestion, options: unknown[]): Set<number> {
  const correct = new Set<number>();
  options.forEach((option, index) => {
    if (option && typeof option === 'object' && 'correct' in option) {
      if ((option as Record<string, unknown>).correct === true) correct.add(index);
    }
  });
  return correct;
}

/**
 * Grades one answer. Unknown types and any missing canonical answer fail
 * closed: pending manual, zero points, no client-trustable fallback.
 */
export function gradeAnswer(question: GradingQuestion, answer: unknown): GradingResult {
  const base: GradingResult = {
    questionId: question.id,
    pointsPossible: question.points,
    pointsEarned: 0,
    correct: false,
  };
  const normalizeWeaker = (v: unknown) =>
    Array.isArray(v) ? v.map(normalizeOptionShaped) : normalizeOptionShaped(v);

  const normalizedAnswer = normalizeWeaker(answer);

  switch (question.type) {
    case 'multiple_choice':
    case 'true_false': {
      const options = Array.isArray(question.options) ? question.options : null;
      if (question.type === 'multiple_choice') {
        if (!options || !(question.correctAnswer !== null && question.correctAnswer !== undefined)) {
          return { ...base, pendingManual: true };
        }
        // Accept index or option text as answer; index preferred by clients.
        const index = resolveChoiceIndex(normalizedAnswer, options);
        return gradeChoiceIndices(question, new Set(index === null ? [] : [index]), correctOptionIndices(question, options), [index === null ? -1 : index].length === 1 ? 1 : 1, base);
      }
      // true_false stores canonical boolean/string answer.
      const canonical = normalizeOptionShaped(question.correctAnswer);
      if (typeof canonical !== 'boolean') return { ...base, pendingManual: true };
      const answerBool = toBool(normalizedAnswer);
      if (answerBool === null) return base;
      return {
        ...base,
        pointsEarned: answerBool === canonical ? question.points : 0,
        correct: answerBool === canonical,
      };
    }

    case 'multiple_select': {
      const options = Array.isArray(question.options) ? question.options : null;
      if (!options || !Array.isArray(question.correctAnswer)) return { ...base, pendingManual: true };
      const chosen = new Set<number>();
      if (Array.isArray(answer)) {
        answer.forEach((value) => {
          const index = resolveChoiceIndex(normalizeOptionShaped(value), options);
          if (index !== null) chosen.add(index);
        });
      } else if (normalizedAnswer !== undefined && normalizedAnswer !== null) {
        const index = resolveChoiceIndex(normalizedAnswer, options);
        if (index !== null) chosen.add(index);
      }
      return gradeChoiceIndices(question, chosen, correctOptionIndices(question, options), correctOptionIndices(question, options).size || 1, base);
    }

    case 'short_answer': {
      const response = normalizeText(answer);
      // Accept alternative correct texts delivered as an array too.
      if (Array.isArray(question.correctAnswer)) {
        const ok = question.correctAnswer.some((alt) => normalizeText(alt) === response);
        return { ...base, pointsEarned: ok && response ? question.points : 0, correct: ok && Boolean(response) };
      }
      if (typeof question.correctAnswer !== 'string') return { ...base, pendingManual: true };
      const ok = response === normalizeText(question.correctAnswer);
      return { ...base, pointsEarned: ok ? question.points : 0, correct: ok };
    }

    case 'fill_in_blank': {
      if (Array.isArray(question.correctAnswer)) {
        const gaps = question.correctAnswer;
        const response = Array.isArray(answer) ? answer : [answer];
        let earned = 0;
        let filled = 0;
        gaps.forEach((gapValue, index) => {
          const acceptedValues = Array.isArray(gapValue) ? gapValue : [gapValue];
          if (acceptedValues.every((value) => normalizeText(value) === '')) return;
          filled += 1;
          const accepted = acceptedValues.some(
            (alt) => normalizeText(alt) === normalizeText(response[index]),
          );
          if (accepted && normalizeText(response[index]) !== '') earned += 1;
        });
        // Evenly distribute the question's points across blanks; partial credit.
        const perBlank = gaps.length > 0 ? question.points / gaps.length : 0;
        const pts = Math.round(earned * perBlank * 100) / 100;
        return { ...base, pointsEarned: pts, correct: earned === filled && earned > 0 };
      }
      return { ...base, pendingManual: true };
    }

    case 'matching': {
      // canonical: { left1: right1, left2: right2 } or array [{left,right}]
      const canonical = asPairMap(question.correctAnswer);
      if (!canonical) return { ...base, pendingManual: true };
      const response = asPairMap(answer);
      if (!response) return base;
      const keys = Object.keys(canonical);
      let matched = 0;
      keys.forEach((key) => {
        if (normalizeText(response[key]) !== '' && normalizeText(response[key]) === normalizeText(canonical[key])) {
          matched += 1;
        }
      });
      const perPair = keys.length > 0 ? question.points / keys.length : 0;
      const pts = Math.round(matched * perPair * 100) / 100;
      return { ...base, pointsEarned: pts, correct: matched === keys.length };
    }

    case 'essay':
      // Always teacher-graded; auto score earns nothing.
      return { ...base, pendingManual: normalizeOptionShaped(answer) !== undefined && normalizeOptionShaped(answer) !== '' };

    default:
      return { ...base, pendingManual: true };
  }
}

function gradeChoiceIndices(
  question: GradingQuestion,
  chosen: Set<number>,
  correct: Set<number>,
  _totalSelections: number,
  base: GradingResult,
): GradingResult {
  if (correct.size === 0) return { ...base, pendingManual: true };

  if (question.type === 'multiple_choice') {
    const sameSize = chosen.size === 1 && correct.size === 1;
    const selected = Array.from(chosen)[0];
    const isCorrect = sameSize && correct.has(selected);
    return {
      ...base,
      pointsEarned: isCorrect ? question.points : 0,
      correct: isCorrect,
    };
  }

  // multiple_select: exact-set match earns full; partial overlap earns
  // proportional credit minus possible penalty-free blanks.
  const chosenArr = Array.from(chosen);
  const correctArr = Array.from(correct);
  const correctPicked = chosenArr.filter((index) => correct.has(index)).length;
  const wrongPicked = chosenArr.filter((index) => !correct.has(index)).length;
  const missing = correctArr.filter((index) => !chosen.has(index)).length;

  if (chosenArr.length === 0) return base;
  if (wrongPicked === 0 && missing === 0) {
    return { ...base, pointsEarned: question.points, correct: true };
  }
  if (wrongPicked === 0) {
    // Pure partial: n of the expected m selected.
    const pts =
      Math.round((correctPicked / correctArr.length) * question.points * 100) / 100;
    return { ...base, pointsEarned: pts, correct: false };
  }
  return base;
}

function resolveChoiceIndex(answer: unknown, options: unknown[]): number | null {
  if (typeof answer === 'number' && Number.isInteger(answer)) {
    return answer >= 0 && answer < options.length ? answer : null;
  }
  if (typeof answer === 'string') {
    const asIndex = Number.parseInt(answer, 10);
    if (String(asIndex) === answer && asIndex >= 0 && asIndex < options.length) return asIndex;
    return options.findIndex((option) => normalizeText(optionText(option)) === normalizeText(answer));
  }
  return null;
}

function normalizeOptionShaped(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return normalizeText(value) === '' ? '' : value;
  if (typeof value === 'number') return value;
  return value;
}

function toBool(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === 'correct') return true;
  if (value === 'false' || value === 'incorrect') return false;
  if (value === 1) return true;
  if (value === 0) return false;
  return null;
}

function asPairMap(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const map: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    map[key] = typeof entry === 'string' ? entry : String(entry ?? '');
  }
  return map;
}

/**
 * Grades a whole attempt. `answers` maps question id → student answer; the
 * submission must be a plain object defensively typed over anything client
 * sends (never accepting scores).
 */
export function gradeAttempt(
  questions: GradingQuestion[],
  answers: Record<string, unknown> | null | undefined,
): AttemptGrading {
  const results = questions.map((question) => gradeAnswer(question, answers?.[question.id]));
  const requiresManualGrading = results.some((result) => result.pendingManual);
  const answeredEverything = questions.every((question) => {
    const answer = answers?.[question.id];
    if (answer === undefined || answer === null) return false;
    if (typeof answer === 'string' && answer.trim() === '') return false;
    if (Array.isArray(answer)) {
      return answer.some((value) => value !== undefined && value !== null);
    }
    return true;
  });
  return {
    results,
    totalPoints: questions.reduce((sum, question) => sum + question.points, 0),
    earnedPoints: results.reduce((sum, result) => sum + result.pointsEarned, 0),
    requiresManualGrading,
    answeredEverything,
  };
}

export interface ScorePolicyInput {
  earned: number;
  total: number;
  passingPercent: number | null;
}

/** Percentage score; 0 when total is 0 (defensive against empty quizzes). */
export function computePercentScore(earned: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((earned / total) * 100);
}

export function didPass(percentScore: number, passingPercent: number | null): boolean {
  if (passingPercent !== null) {
    return percentScore >= passingPercent;
  }
  return percentScore >= 60;
}
