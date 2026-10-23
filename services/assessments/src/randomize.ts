/**
 * Deterministic question/option randomisation for quizzes.
 *
 * Uses a seeded small PRNG (mulberry32) with the attempt id as the seed so a
 * student refresh produces the same order, while different attempts of the
 * same quiz differ. Randomisation never touches grading: canonical answers
 * stay attached to their question ids.
 */

import type { GradingQuestion } from './grading';

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 32-bit seed from an arbitrary string (uuid attempt id). */
export function seedFromString(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Fisher–Yates using the seeded PRNG; non-mutating. */
export function seededShuffle<T>(items: T[], seed: number): T[] {
  const random = mulberry32(seed);
  const output = [...items];
  for (let index = output.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    const temp = output[index];
    output[index] = output[swap];
    output[swap] = temp;
  }
  return output;
}

export interface PresentationQuestion {
  questionId: string;
  /** Original question ids in the shuffled option order shown for choice types. */
  optionOrder?: number[];
}

/**
 * Builds a stable presentation plan: question order plus, for choice
 * questions, the display index permutation of options. Grading continues to
 * operate on original option indexes (client maps display back via
 * `optionOrder`).
 */
export function buildPresentation(
  questions: GradingQuestion[],
  seedSource: string,
  shuffleQuestions: boolean,
  shuffleOptions: boolean,
): PresentationQuestion[] {
  const seed = seedFromString(seedSource);
  const ordered = shuffleQuestions ? seededShuffle(questions, seed) : [...questions];

  return ordered.map((question, offset) => {
    const optionCount = Array.isArray(question.options) ? question.options.length : 0;
    const isChoice = question.type === 'multiple_choice' || question.type === 'multiple_select';
    const result: PresentationQuestion = { questionId: question.id };
    if (shuffleOptions && isChoice && optionCount > 1) {
      // Per-question seed mixes the base seed with question position.
      result.optionOrder = seededShuffle(
        Array.from({ length: optionCount }, (_, index) => index),
        seedFromString(seedSource + ':' + question.id) ^ (seed + offset),
      );
    }
    return result;
  });
}
