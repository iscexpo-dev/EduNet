import { Request, Response } from 'express';
import { z } from 'zod';
import { submissionSchema } from '@edunet/validation';
import {
  findCourseById,
  findAssignmentById,
  findSubmissionById,
  findSubmission,
  isStudentEnrolled,
  listSubmissionsByAssignment,
  listSubmissionsByStudent,
  createSubmission,
  applyResubmission,
  autosaveSubmission,
  gradeSubmission,
  deleteSubmission,
  listRubricCriteria,
  replaceRubricCriteria,
  recordSubmissionRevision,
  listSubmissionRevisions,
  recordSubmissionEvent,
  listSubmissionEvents,
  recordGradeRevision,
  listGradeRevisions,
} from './db';
import {
  evaluateSubmission,
  applyLatePenalty,
  evaluateResubmission,
  applyRubricScores,
  validateSubmissionContent,
  type LatePolicy,
} from './submission-policy';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    role: string;
    organizationId?: string;
  };
}

function requireOrganizationId(req: AuthRequest, res: Response): string | null {
  const organizationId = req.user?.organizationId;
  if (!organizationId) {
    res.status(403).json({ error: 'An organization-scoped account is required' });
    return null;
  }
  return organizationId;
}

function parsePagination(query: Request['query']) {
  const rawLimit = Number.parseInt(String(query.limit ?? ''), 10);
  const rawOffset = Number.parseInt(String(query.offset ?? ''), 10);
  return {
    limit: Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 200) : 50,
    offset: Number.isFinite(rawOffset) ? Math.max(rawOffset, 0) : 0,
  };
}

async function canStaffAccessSubmission(
  req: AuthRequest,
  submission: { studentId: string; assignmentId: string },
  organizationId: string,
) {
  if (req.user?.role === 'admin') return true;
  if (req.user?.role === 'student') return submission.studentId === req.user.id;
  if (req.user?.role !== 'teacher') return false;

  const assignment = await findAssignmentById(submission.assignmentId, organizationId);
  if (!assignment) return false;
  const course = await findCourseById(assignment.courseId, organizationId);
  return course?.teacherId === req.user.id;
}

const rubricSchema = z.object({
  criteria: z
    .array(
      z.object({
        description: z.string().min(1).max(300),
        maxPoints: z.number().int().min(0),
      }),
    )
    .max(50),
});

const regradeSchema = z.object({
  grade: z.number().int().min(0),
  feedback: z.string().max(5000).optional(),
  reason: z.string().min(1).max(300),
});

export async function createSubmissionHandler(req: AuthRequest, res: Response) {
  try {
    const organizationId = requireOrganizationId(req, res);
    if (!organizationId) return;

    const parsed = submissionSchema.parse(req.body);
    const content = parsed.content;
    const assignmentId = parsed.assignmentId;

    if (!req.user?.id || (req.body.studentId && req.user.id !== req.body.studentId)) {
      return res.status(403).json({ error: 'Students can only submit their own work' });
    }
    if (!validateSubmissionContent(content)) {
      return res.status(400).json({ error: 'Submission content must be 1-50000 characters' });
    }

    const assignment = await findAssignmentById(assignmentId, organizationId);
    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }
    if (!assignment.isActive) {
      return res.status(409).json({ error: 'This assignment is no longer accepting submissions' });
    }
    if (!(await isStudentEnrolled(req.user.id, assignment.courseId, organizationId))) {
      return res.status(403).json({ error: 'You must be enrolled in this course to submit' });
    }

    const now = new Date();
    const existing = await findSubmission(assignmentId, req.user.id, organizationId);

    if (existing) {
      // Resubmission path.
      const decision = evaluateResubmission(
        {
          allowResubmission: assignment.allowResubmission,
          resubmissionDeadline: assignment.resubmissionDeadline ?? null,
          dueDate: new Date(assignment.dueDate),
          latePolicy: assignment.latePolicy as LatePolicy,
        },
        { isGraded: existing.grade !== null, attempts: existing.attemptNumber },
        now,
      );
      if (!decision.allowed) {
        return res.status(409).json({ error: decision.rejectionCode ?? 'Resubmission not allowed' });
      }
      const lateCheck = evaluateSubmission(
        { dueDate: new Date(assignment.dueDate), latePolicy: assignment.latePolicy as LatePolicy },
        now,
      );
      if (!lateCheck.accepted) {
        return res.status(400).json({ error: lateCheck.rejectionCode });
      }

      await recordSubmissionRevision({
        submissionId: existing.id,
        previousContent: existing.content,
        newContent: content,
        attemptNumber: decision.attemptNumber,
        reason: 'resubmission',
      });
      await recordSubmissionEvent({
        submissionId: existing.id,
        actorId: req.user.id,
        action: 'resubmitted',
        metadata: { attempt: decision.attemptNumber },
      });
      const submission = await applyResubmission(
        existing.id,
        organizationId,
        { content, isLate: lateCheck.isLate },
        decision.attemptNumber,
      );
      return res.json(submission);
    }

    const lateCheck = evaluateSubmission(
      { dueDate: new Date(assignment.dueDate), latePolicy: assignment.latePolicy as LatePolicy },
      now,
    );
    if (!lateCheck.accepted) {
      return res.status(400).json({ error: lateCheck.rejectionCode });
    }

    // Attachment ids: uuid-format media references; count-capped.
    const attachmentIds = Array.isArray(req.body.attachmentIds) ? req.body.attachmentIds : [];
    if (attachmentIds.length > 10 || attachmentIds.some((id: unknown) => typeof id !== 'string')) {
      return res.status(400).json({ error: 'Up to 10 attachment ids are allowed' });
    }

    const submission = await createSubmission({
      assignmentId,
      studentId: req.user.id,
      organizationId,
      content,
      isLate: lateCheck.isLate,
      attachmentIds,
    });

    await recordSubmissionRevision({
      submissionId: submission.id,
      previousContent: null,
      newContent: content,
      attemptNumber: 1,
      reason: 'create',
    });
    await recordSubmissionEvent({
      submissionId: submission.id,
      actorId: req.user.id,
      action: 'submitted',
      metadata: { isLate: lateCheck.isLate },
    });
    res.status(201).json(submission);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

export async function autosaveHandler(req: AuthRequest, res: Response) {
  try {
    const organizationId = requireOrganizationId(req, res);
    if (!organizationId) return;

    const content = typeof req.body?.content === 'string' ? req.body.content : '';
    if (!validateSubmissionContent(content)) {
      return res.status(400).json({ error: 'Autosaved content must be 1-50000 characters' });
    }
    const submission = await findSubmissionById(req.params.id, organizationId);
    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }
    if (submission.studentId !== req.user?.id) {
      return res.status(403).json({ error: 'Only the submitting student can autosave' });
    }
    if (submission.grade !== null) {
      return res.status(400).json({ error: 'Graded submissions can no longer be edited' });
    }

    const previous = await findSubmissionById(req.params.id, organizationId);
    const updated = await autosaveSubmission(req.params.id, organizationId, content);
    if (updated && previous && previous.content !== content) {
      await recordSubmissionRevision({
        submissionId: updated.id,
        previousContent: previous.content,
        newContent: content,
        attemptNumber: updated.attemptNumber,
        reason: 'autosave',
      });
      await recordSubmissionEvent({
        submissionId: updated.id,
        actorId: req.user?.id ?? null,
        action: 'autosaved',
      });
    }
    res.json(updated);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

export async function historyHandler(req: AuthRequest, res: Response) {
  try {
    const organizationId = requireOrganizationId(req, res);
    if (!organizationId) return;

    const submission = await findSubmissionById(req.params.id, organizationId);
    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }
    if (!(await canStaffAccessSubmission(req, submission, organizationId))) {
      return res.status(403).json({ error: 'You are not authorized to view this submission history' });
    }

    const [revisions, events, gradeRevisions] = await Promise.all([
      listSubmissionRevisions(submission.id, organizationId),
      listSubmissionEvents(submission.id, organizationId),
      listGradeRevisions(submission.id, organizationId),
    ]);

    const rubric = await listRubricCriteria(submission.assignmentId, organizationId);
    res.json({
      submissionId: submission.id,
      attemptNumber: submission.attemptNumber,
      isLate: submission.isLate,
      rubric,
      contentRevisions: revisions,
      gradeRevisions,
      events,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

export async function rubricHandler(req: AuthRequest, res: Response) {
  try {
    const organizationId = requireOrganizationId(req, res);
    if (!organizationId) return;

    const assignment = await findAssignmentById(req.params.assignmentId, organizationId);
    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }
    const course = await findCourseById(assignment.courseId, organizationId);
    if (req.user?.role !== 'admin' && course?.teacherId !== req.user?.id) {
      return res.status(403).json({ error: 'You can only manage rubrics for your own courses' });
    }

    const { criteria } = rubricSchema.parse(req.body);
    const totalCriterionPoints = criteria.reduce((sum, criterion) => sum + criterion.maxPoints, 0);
    if (totalCriterionPoints !== assignment.maxPoints) {
      return res.status(400).json({
        error: `Rubric total (${totalCriterionPoints}) must equal the assignment maximum (${assignment.maxPoints})`,
      });
    }
    const replaced = await replaceRubricCriteria(
      req.params.assignmentId,
      organizationId,
      criteria.map((criterion, index) => ({
        description: criterion.description,
        maxPoints: criterion.maxPoints,
        order: index,
      })),
    );
    res.json(replaced);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

export async function getRubricHandler(req: AuthRequest, res: Response) {
  try {
    const organizationId = requireOrganizationId(req, res);
    if (!organizationId) return;
    const assignment = await findAssignmentById(req.params.assignmentId, organizationId);
    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }
    res.json(await listRubricCriteria(req.params.assignmentId, organizationId));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

export async function getSubmissionHandler(req: AuthRequest, res: Response) {
  try {
    const organizationId = requireOrganizationId(req, res);
    if (!organizationId) return;

    const { id } = req.params;
    const submission = await findSubmissionById(id, organizationId);

    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }
    if (!(await canStaffAccessSubmission(req, submission, organizationId))) {
      return res.status(403).json({ error: 'You are not authorized to view this submission' });
    }
    res.json(submission);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

export async function listSubmissionsHandler(req: AuthRequest, res: Response) {
  try {
    const organizationId = requireOrganizationId(req, res);
    if (!organizationId) return;

    const { assignmentId, studentId } = req.query as { assignmentId?: string; studentId?: string };
    const { limit, offset } = parsePagination(req.query);

    if (req.user?.role === 'student') {
      // Students list their own submissions only.
      const submissions = await listSubmissionsByStudent(req.user.id, organizationId, limit, offset);
      return res.json(submissions);
    }
    if (req.user?.role === 'teacher') {
      if (assignmentId) {
        const assignment = await findAssignmentById(assignmentId, organizationId);
        const course = assignment ? await findCourseById(assignment.courseId, organizationId) : null;
        if (!assignment || !course || course.teacherId !== req.user.id) {
          return res.status(403).json({ error: 'You can only list submissions for your own courses' });
        }
        return res.json(await listSubmissionsByAssignment(assignmentId, organizationId, limit, offset));
      }
      return res.status(400).json({ error: 'assignmentId is required for teachers' });
    }
    if (req.user?.role === 'admin') {
      if (assignmentId) {
        return res.json(await listSubmissionsByAssignment(assignmentId, organizationId, limit, offset));
      }
      if (studentId) {
        return res.json(await listSubmissionsByStudent(studentId, organizationId, limit, offset));
      }
      return res.status(400).json({ error: 'assignmentId or studentId is required' });
    }
    return res.status(403).json({ error: 'Insufficient permissions' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

export async function gradeSubmissionHandler(req: AuthRequest, res: Response) {
  try {
    const organizationId = requireOrganizationId(req, res);
    if (!organizationId) return;

    const { id } = req.params;
    const existing = await findSubmissionById(id, organizationId);
    if (!existing) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    const assignment = await findAssignmentById(existing.assignmentId, organizationId);
    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }
    const course = await findCourseById(assignment.courseId, organizationId);
    if (req.user?.role !== 'admin' && course?.teacherId !== req.user?.id) {
      return res.status(403).json({ error: 'You can only grade submissions for your own courses' });
    }

    // Two grading modes:
    // 1) rubric scores (validated server-side against persisted criteria), or
    // 2) direct grade.
    if (typeof req.body?.rubricScores === 'object' && req.body.rubricScores !== null) {
      const criteria = await listRubricCriteria(existing.assignmentId, organizationId);
      if (criteria.length === 0) {
        return res.status(400).json({ error: 'Assignment has no rubric configured' });
      }
      const applied = applyRubricScores(
        criteria.map((criterion) => ({
          description: criterion.description,
          maxPoints: criterion.maxPoints,
        })),
        req.body.rubricScores as Record<string, number>,
      );
      if ('error' in applied) {
        return res.status(400).json({ error: applied.error });
      }
      const capped = applyLatePenalty(applied.grade, existing.isLate ? assignment.latePenaltyPercent : 0, assignment.maxPoints);
      req.body.grade = capped;
    } else {
      const grade = req.body?.grade;
      if (!Number.isSafeInteger(grade) || grade < 0) {
        return res.status(400).json({ error: 'grade must be a non-negative whole number' });
      }
      // Cap the grade to the maximum; auto-adjust late penalties unless the
      // grader explicitly overrides (then the audit trail keeps the reason).
      if (req.body.applyLatePenalty === true && existing.isLate && assignment.latePenaltyPercent > 0) {
        req.body.grade = applyLatePenalty(grade, assignment.latePenaltyPercent, assignment.maxPoints);
      }
    }

    if (req.body.grade > assignment.maxPoints) {
      return res.status(400).json({ error: 'Grade cannot exceed the assignment maximum points' });
    }
    const feedback = req.body?.feedback;
    if (feedback !== undefined && (typeof feedback !== 'string' || feedback.length > 5000)) {
      return res.status(400).json({ error: 'feedback must be at most 5000 characters' });
    }

    const isRegrade = existing.grade !== null;
    let regradeReason: string | undefined;
    if (isRegrade) {
      // Validate the audit reason before writing so a rejected regrade cannot
      // leave the grade updated without a corresponding revision record.
      const regrade = regradeSchema.safeParse({ ...req.body, reason: req.body?.reason });
      if (!regrade.success) {
        return res.status(400).json({ error: 'Regrading requires a reason of 1-300 characters' });
      }
      regradeReason = regrade.data.reason;
    }

    const submission = await gradeSubmission(id, organizationId, req.body.grade, req.user!.id as string, feedback);

    if (isRegrade) {
      await recordGradeRevision({
        submissionId: id,
        adjustedBy: req.user?.id ?? null,
        previousGrade: existing.grade as number,
        newGrade: req.body.grade,
        reason: regradeReason as string,
      });
      await recordSubmissionEvent({
        submissionId: id,
        actorId: req.user?.id ?? null,
        action: 'regraded',
        metadata: { previousGrade: existing.grade, newGrade: req.body.grade },
      });
    } else {
      await recordSubmissionEvent({
        submissionId: id,
        actorId: req.user?.id ?? null,
        action: 'graded',
        metadata: { grade: req.body.grade },
      });
    }

    res.json(submission);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

export async function deleteSubmissionHandler(req: AuthRequest, res: Response) {
  try {
    const organizationId = requireOrganizationId(req, res);
    if (!organizationId) return;

    const { id } = req.params;

    const existing = await findSubmissionById(id, organizationId);
    if (!existing) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    if (req.user?.role === 'student' && existing.studentId !== req.user.id) {
      return res.status(403).json({ error: 'You can only delete your own submissions' });
    }
    if (req.user?.role === 'student' && existing.grade !== null) {
      return res.status(409).json({ error: 'Graded submissions cannot be deleted' });
    }

    const submission = await deleteSubmission(id, organizationId);
    res.json(submission);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}
