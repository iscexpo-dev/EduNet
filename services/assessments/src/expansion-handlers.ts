import { Request, Response } from 'express';

/**
 * Assessment expansion handlers: question banks, presentation randomisation,
 * manual grading with revision history, and the recheck workflow.
 *
 * Security invariants:
 * - Only server-side grading assigns scores; manual grading entries are
 *   always written as revisions with the grader's identity recorded.
 * - Students can read their own attempts and open recheck requests; teachers
 *   and admins decide them; nobody reads another org's data.
 */

import type { AuthRequest } from './extension-types';
import {
  createQuestionBank,
  findQuestionBankById,
  listQuestionBanks,
  updateQuestionBank,
  attachQuestionsToBank,
  recordGradeRevision,
  listGradeRevisions,
  createRecheckRequest,
  findRecheckRequestById,
  decideRecheckRequest,
  listRecheckRequests,
  findQuizAttemptById,
  findQuizById,
  listQuestionsByQuiz,
  updateQuizAttempt,
} from './db';
import { gradeAttempt, computePercentScore, didPass, type GradingQuestion } from './grading';
import { buildPresentation } from './randomize';

/**
 * Extra validation schemas for the expansion endpoints.
 */
import { z } from 'zod';

const bankCreateSchema = z.object({
  name: z.string().min(1).max(200),
  subject: z.string().max(100).optional(),
});

const bankUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  subject: z.string().max(100).optional(),
  isActive: z.enum(['true', 'false']).optional(),
});

const attachQuestionsSchema = z.object({
  bankId: z.string().uuid(),
  questionIds: z.array(z.string().uuid()).min(1).max(200),
});

const manualGradeSchema = z.object({
  adjustments: z
    .array(
      z.object({
        questionId: z.string().uuid(),
        pointsEarned: z.number().min(0),
        note: z.string().max(2000).optional(),
      }),
    )
    .min(1),
  reason: z.string().min(1).max(500),
});

const recheckCreateSchema = z.object({
  questionId: z.string().uuid().optional(),
  reason: z.string().min(1).max(2000),
});

const recheckDecisionSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  decisionNote: z.string().max(2000).optional(),
});

function requireOrganizationId(req: AuthRequest, res: Response): string | null {
  const organizationId = req.user?.organizationId;
  if (!organizationId) {
    res.status(400).json({ error: 'Organization context required' });
    return null;
  }
  return organizationId;
}

function requireIdentity(req: AuthRequest, res: Response): { organizationId: string; userId: string; role: string } | null {
  const user = req.user;
  if (!user?.organizationId || !user.id) {
    res.status(401).json({ error: 'Not authenticated' });
    return null;
  }
  return { organizationId: user.organizationId, userId: user.id, role: user.role };
}

// ---------------------------------------------------------------------------
// Question banks
// ---------------------------------------------------------------------------

export async function createBankHandler(req: AuthRequest, res: Response) {
  try {
    const identity = requireIdentity(req, res);
    if (!identity) return;
    const data = bankCreateSchema.parse(req.body);
    const bank = await createQuestionBank({
      organizationId: identity.organizationId,
      name: data.name,
      subject: data.subject,
      createdBy: identity.userId,
    });
    res.status(201).json(bank);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

export async function listBankHandler(req: AuthRequest, res: Response) {
  try {
    const organizationId = requireOrganizationId(req, res);
    if (!organizationId) return;
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : 50;
    const offset = typeof req.query.offset === 'string' ? Number(req.query.offset) : 0;
    const banks = await listQuestionBanks(organizationId, limit, offset);
    res.json(banks);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

export async function updateBankHandler(req: AuthRequest, res: Response) {
  try {
    const organizationId = requireOrganizationId(req, res);
    if (!organizationId) return;
    const data = bankUpdateSchema.parse(req.body);
    const bank = await updateQuestionBank(req.params.id, organizationId, data);
    if (!bank) {
      return res.status(404).json({ error: 'Question bank not found' });
    }
    res.json(bank);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

export async function attachQuestionsHandler(req: AuthRequest, res: Response) {
  try {
    const organizationId = requireOrganizationId(req, res);
    if (!organizationId) return;
    const data = attachQuestionsSchema.parse(req.body);
    const bank = await findQuestionBankById(data.bankId, organizationId);
    if (!bank) {
      return res.status(404).json({ error: 'Question bank not found' });
    }
    const updated = await attachQuestionsToBank(data.questionIds, data.bankId, organizationId);
    res.json(updated);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

// ---------------------------------------------------------------------------
// Presentation (randomization)
// ---------------------------------------------------------------------------

export async function presentationHandler(req: AuthRequest, res: Response) {
  try {
    const organizationId = requireOrganizationId(req, res);
    if (!organizationId) return;
    const attempt = await findQuizAttemptById(req.params.id, organizationId);
    if (!attempt) {
      return res.status(404).json({ error: 'Quiz attempt not found' });
    }
    // Students may fetch only their own attempt's plan; teachers/admins may
    // inspect any attempt within the org for review.
    if (req.user?.role === 'student' && attempt.studentId !== req.user.id) {
      return res.status(403).json({ error: 'You can only view your own attempts' });
    }
    const quiz = await findQuizById(attempt.quizId, organizationId);
    if (!quiz) {
      return res.status(404).json({ error: 'Quiz not found' });
    }
    const rows = await listQuestionsByQuiz(attempt.quizId, organizationId, 500, 0);
    const questions: GradingQuestion[] = rows.map((row) => ({
      id: row.id,
      type: row.type as string,
      points: Number(row.points as string) || 0,
      options: row.options,
      correctAnswer: undefined,
    }));
    const presentation = buildPresentation(
      questions,
      attempt.id,
      quiz.shuffleQuestions === 'true',
      true,
    );
    res.json(presentation);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

// ---------------------------------------------------------------------------
// Manual grading + grade revisions
// ---------------------------------------------------------------------------

export async function manualGradeHandler(req: AuthRequest, res: Response) {
  try {
    const organizationId = requireOrganizationId(req, res);
    if (!organizationId) return;
    const attempt = await findQuizAttemptById(req.params.id, organizationId);
    if (!attempt) {
      return res.status(404).json({ error: 'Quiz attempt not found' });
    }
    if (!attempt.submittedAt) {
      return res.status(400).json({ error: 'Attempt must be submitted before manual grading' });
    }

    const data = manualGradeSchema.parse(req.body);
    // Grader must belong to the same organization (role gate upstream).
    const quiz = await findQuizById(attempt.quizId, organizationId);
    if (!quiz) {
      return res.status(404).json({ error: 'Quiz not found' });
    }
    const rows = await listQuestionsByQuiz(attempt.quizId, organizationId, 500, 0);
    const questionsById = new Map(rows.map((row) => [row.id, row]));

    const existingFeedback =
      typeof attempt.feedback === 'string' && attempt.feedback.length > 0
        ? (JSON.parse(attempt.feedback) as Record<string, Record<string, unknown>>)
        : {};

    // Server-side grade validation: clamps adjustments to each question's
    // maximum points and rejects adjustments for unknown questions.
    for (const adjustment of data.adjustments) {
      const question = questionsById.get(adjustment.questionId);
      if (!question) {
        return res
          .status(400)
          .json({ error: `Unknown question ${adjustment.questionId}` });
      }
      const maxPoints = Number(question.points as string) || 0;
      if (adjustment.pointsEarned > maxPoints) {
        return res.status(400).json({
          error: `Adjustment for ${adjustment.questionId} exceeds maximum of ${maxPoints}`,
        });
      }
    }

    // Recompute the final earned score from per-question feedback.
    let totalPoints = 0;
    let earnedPoints = 0;
    const newFeedback: Record<string, Record<string, unknown>> = { ...existingFeedback };
    for (const question of rows) {
      const maxPoints = Number(question.points as string) || 0;
      totalPoints += maxPoints;
      const adjustment = data.adjustments.find((entry) => entry.questionId === question.id);
      const prior = existingFeedback[question.id] ?? {};
      const priorPoints = Number(prior.points ?? 0) || (prior.pending ? 0 : 0);
      const applied = adjustment ? adjustment.pointsEarned : priorPoints;
      if (adjustment) {
        newFeedback[question.id] = {
          ...prior,
          correct: applied === maxPoints && maxPoints > 0,
          points: applied,
          pending: false,
          manualNote: adjustment.note ?? null,
        };
      }
      earnedPoints += applied;
    }

    const previousScorePercent =
      typeof attempt.score === 'string' && attempt.score.endsWith('%')
        ? Number.parseInt(attempt.score.slice(0, -1), 10)
        : null;
    const percent = computePercentScore(earnedPoints, totalPoints);
    const passingScoreNum = quiz.passingScore ? Number.parseInt(quiz.passingScore as string, 10) : null;

    const updated = await updateQuizAttempt(req.params.id, organizationId, {
      feedback: JSON.stringify(newFeedback),
      score: `${percent}%`,
      passed: didPass(percent, passingScoreNum) ? 'true' : 'false',
    });

    await recordGradeRevision({
      attemptId: req.params.id,
      adjustedBy: req.user?.id as string,
      previousScorePercent,
      newScorePercent: percent,
      prevEarnedPoints: null,
      newEarnedPoints: String(earnedPoints),
      reason: data.reason,
      source: 'manual_grade',
    });

    res.json(updated);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

export async function gradeHistoryHandler(req: AuthRequest, res: Response) {
  try {
    const organizationId = requireOrganizationId(req, res);
    if (!organizationId) return;
    // Students may see their own history; teachers/admins any attempt in org.
    const attempt = await findQuizAttemptById(req.params.id, organizationId);
    if (!attempt) {
      return res.status(404).json({ error: 'Quiz attempt not found' });
    }
    if (req.user?.role === 'student' && attempt.studentId !== req.user.id) {
      return res.status(403).json({ error: 'You can only view your own grade history' });
    }
    const revisions = await listGradeRevisions(req.params.id, organizationId);
    res.json(revisions);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

// ---------------------------------------------------------------------------
// Recheck workflow
// ---------------------------------------------------------------------------

export async function createRecheckHandler(req: AuthRequest, res: Response) {
  try {
    const organizationId = requireOrganizationId(req, res);
    if (!organizationId) return;
    const data = recheckCreateSchema.parse(req.body);
    const attempt = await findQuizAttemptById(req.params.id, organizationId);
    if (!attempt) {
      return res.status(404).json({ error: 'Quiz attempt not found' });
    }
    if (attempt.studentId !== req.user?.id) {
      return res.status(403).json({ error: 'Students can only request rechecks for their own attempts' });
    }
    if (!attempt.submittedAt) {
      return res.status(400).json({ error: 'Attempt must be submitted before a recheck request' });
    }
    const request = await createRecheckRequest({
      attemptId: req.params.id,
      studentId: req.user.id as string,
      questionId: data.questionId,
      reason: data.reason,
    });
    res.status(201).json(request);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

export async function listRecheckHandler(req: AuthRequest, res: Response) {
  try {
    const organizationId = requireOrganizationId(req, res);
    if (!organizationId) return;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    if (status && !['pending', 'approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status filter' });
    }
    const requests = await listRecheckRequests(organizationId, status);
    res.json(requests);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

export async function decideRecheckHandler(req: AuthRequest, res: Response) {
  try {
    const organizationId = requireOrganizationId(req, res);
    if (!organizationId) return;
    const data = recheckDecisionSchema.parse(req.body);
    const request = await findRecheckRequestById(req.params.id, organizationId);
    if (!request) {
      return res.status(404).json({ error: 'Recheck request not found' });
    }
    if (request.status !== 'pending') {
      return res.status(400).json({ error: 'Recheck request has already been decided' });
    }
    const decided = await decideRecheckRequest({
      id: request.id,
      decidedBy: req.user?.id as string,
      status: data.status,
      decisionNote: data.decisionNote,
    });
    res.json(decided);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

