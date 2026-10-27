import { Request, Response } from 'express';
import { assignmentSchema, assignmentUpdateSchema } from '@edunet/validation';
import {
  findCourseById,
  findAssignmentById,
  isStudentEnrolled,
  listAssignmentsByCourse,
  createAssignment,
  updateAssignment,
  deleteAssignment,
  getAssignmentSubmissionCount,
} from './db';

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

export async function createAssignmentHandler(req: AuthRequest, res: Response) {
  try {
    const organizationId = requireOrganizationId(req, res);
    if (!organizationId) return;

    const data = assignmentSchema.parse(req.body);
    const course = await findCourseById(data.courseId, organizationId);
    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }
    if (req.user?.role !== 'admin' && course.teacherId !== req.user?.id) {
      return res
        .status(403)
        .json({ error: 'You can only create assignments for your own courses' });
    }

    const assignment = await createAssignment({
      ...data,
      organizationId,
      teacherId: course.teacherId,
      dueDate: new Date(data.dueDate),
      resubmissionDeadline: data.resubmissionDeadline
        ? new Date(data.resubmissionDeadline)
        : null,
    });
    res.status(201).json(assignment);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

export async function getAssignmentHandler(req: AuthRequest, res: Response) {
  try {
    const organizationId = requireOrganizationId(req, res);
    if (!organizationId) return;

    const { id } = req.params;
    const assignment = await findAssignmentById(id, organizationId);

    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    const course = await findCourseById(assignment.courseId, organizationId);
    if (!course) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    if (req.user?.role === 'student') {
      if (
        !assignment.isActive ||
        !(await isStudentEnrolled(req.user.id, assignment.courseId, organizationId))
      ) {
        return res.status(403).json({ error: 'You must be enrolled in this course' });
      }
      return res.json(assignment);
    }
    if (req.user?.role === 'teacher' && course.teacherId !== req.user.id) {
      return res.status(403).json({ error: 'You can only view assignments for your own courses' });
    }
    if (req.user?.role !== 'teacher' && req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const submissionCount = await getAssignmentSubmissionCount(id, organizationId);
    res.json({ ...assignment, submissionCount });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

export async function listAssignmentsHandler(req: AuthRequest, res: Response) {
  try {
    const organizationId = requireOrganizationId(req, res);
    if (!organizationId) return;

    const { courseId } = req.query;
    const { limit, offset } = parsePagination(req.query);

    if (!courseId || typeof courseId !== 'string') {
      return res.status(400).json({ error: 'courseId is required' });
    }

    const course = await findCourseById(courseId, organizationId);
    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    if (req.user?.role === 'student') {
      if (!(await isStudentEnrolled(req.user.id, courseId, organizationId))) {
        return res.status(403).json({ error: 'You must be enrolled in this course' });
      }
    } else if (req.user?.role === 'teacher' && course.teacherId !== req.user.id) {
      return res.status(403).json({ error: 'You can only view assignments for your own courses' });
    } else if (req.user?.role !== 'teacher' && req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const assignments = await listAssignmentsByCourse(
      courseId,
      organizationId,
      limit,
      offset,
      req.user?.role === 'student',
    );
    res.json(assignments);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

export async function updateAssignmentHandler(req: AuthRequest, res: Response) {
  try {
    const organizationId = requireOrganizationId(req, res);
    if (!organizationId) return;

    const { id } = req.params;
    const data = assignmentUpdateSchema.parse(req.body);

    const existing = await findAssignmentById(id, organizationId);
    if (!existing) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    const course = await findCourseById(existing.courseId, organizationId);
    if (req.user?.role !== 'admin' && course?.teacherId !== req.user?.id) {
      return res.status(403).json({ error: 'You can only edit assignments for your own courses' });
    }

    const assignment = await updateAssignment(id, organizationId, {
      ...data,
      dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
      resubmissionDeadline: data.resubmissionDeadline
        ? new Date(data.resubmissionDeadline)
        : data.resubmissionDeadline === null
          ? null
          : undefined,
    });
    res.json(assignment);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

export async function deleteAssignmentHandler(req: AuthRequest, res: Response) {
  try {
    const organizationId = requireOrganizationId(req, res);
    if (!organizationId) return;

    const { id } = req.params;

    const existing = await findAssignmentById(id, organizationId);
    if (!existing) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    const course = await findCourseById(existing.courseId, organizationId);
    if (req.user?.role !== 'admin' && course?.teacherId !== req.user?.id) {
      return res
        .status(403)
        .json({ error: 'You can only delete assignments for your own courses' });
    }

    const assignment = await deleteAssignment(id, organizationId);
    res.json(assignment);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}
