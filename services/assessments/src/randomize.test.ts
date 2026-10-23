import { describe, it, expect } from 'vitest';
import { seededShuffle, seedFromString, buildPresentation } from './randomize';

describe('seeded shuffle', () => {
  it('is deterministic for the same seed', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(seededShuffle(items, 42)).toEqual(seededShuffle(items, 42));
  });

  it('differs across seeds (probabilistically certain for 8 items)', () => {
    const items = Array.from({ length: 24 }, (_, index) => index);
    expect(seededShuffle(items, 1)).not.toEqual(seededShuffle(items, 2));
  });

  it('is a permutation: same elements, no loss, no duplicates', () => {
    const items = Array.from({ length: 100 }, (_, index) => index);
    const shuffled = seededShuffle(items, 7);
    expect(shuffled.sort((a, b) => a - b)).toEqual(items);
  });

  it('does not mutate the input', () => {
    const items = [1, 2, 3];
    const copy = [...items];
    seededShuffle(items, 99);
    expect(items).toEqual(copy);
  });

  it('seedFromString hashes stable unique values', () => {
    expect(seedFromString('attempt-a')).toBe(seedFromString('attempt-a'));
    expect(seedFromString('attempt-a')).not.toBe(seedFromString('attempt-b'));
  });
});

describe('presentation planning', () => {
  const questions = [
    { id: 'q1', type: 'multiple_choice', points: 5, options: [{ text: 'a' }, { text: 'b' }, { text: 'c' }] },
    { id: 'q2', type: 'multiple_choice', points: 5, options: [{ text: 'a' }, { text: 'b' }] },
    { id: 'q3', type: 'essay', points: 10 },
  ];

  it('keeps stable order for the same attempt', () => {
    const first = buildPresentation(questions, 'attempt-1', true, false);
    const second = buildPresentation(questions, 'attempt-1', true, false);
    expect(first.map((p) => p.questionId)).toEqual(second.map((p) => p.questionId));
  });

  it('preserves canonical options when option shuffle is off', () => {
    const plan = buildPresentation(questions, 'attempt-2', false, false);
    expect(plan).toHaveLength(3);
    expect(plan.every((p) => p.optionOrder === undefined)).toBe(true);
  });

  it('shuffles option order only for choice questions', () => {
    const plan = buildPresentation(questions, 'attempt-3', true, true);
    const essay = plan.find((p) => p.questionId === 'q3');
    expect(essay?.optionOrder).toBeUndefined();
    const withOptions = plan.filter((p) => p.optionOrder !== undefined);
    // Both choice questions carry an option permutation.
    expect(withOptions).toHaveLength(2);
    // Permutations are valid index sets sized to that question's options.
    for (const entry of withOptions) {
      const expectedLength = entry.questionId === 'q1' ? 3 : 2;
      expect((entry.optionOrder ?? []).sort()).toEqual(
        Array.from({ length: expectedLength }, (_, index) => index),
      );
    }
  });

  it('option orders vary between attempts (randomisation effective)', () => {
    const perAttempt = new Set<string>();
    for (let attemptIndex = 0; attemptIndex < 20; attemptIndex += 1) {
      const plan = buildPresentation(questions, `attempt-${attemptIndex}`, false, true);
      const entry = plan.find((p) => p.questionId === 'q1');
      perAttempt.add(JSON.stringify(entry?.optionOrder));
    }
    // Randomisation must actually differentiate at least some attempts.
    expect(perAttempt.size).toBeGreaterThan(1);
  });

  it('grading keys remain question ids regardless of presentation order', () => {
    const plan = buildPresentation(questions, 'attempt-9', true, true);
    expect([...plan].sort((a, b) => a.questionId.localeCompare(b.questionId)).map((p) => p.questionId)).toEqual(
      [...questions].sort((a, b) => a.id.localeCompare(b.id)).map((question) => question.id),
    );
  });
});
