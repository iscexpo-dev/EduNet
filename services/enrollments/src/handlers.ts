import { Request, Response } from 'express';
import {
  findCourseById,
  findEnrollmentById,
  findEnrollment,
  listEnrollmentsByStudent,
  listEnrollmentsByCourse,
  createEnrollment,
  updateEnrollmentStatus,
  deleteEnrollment,
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

export async function createEnrollmentHandler(req: AuthRequest, res: Response) {
  try {
    const organizationId = requireOrganizationId(req, res);
    if (!organizationId) return;

    const { studentId, courseId } = req.body;

    if (!studentId || !courseId) {
      return res.status(400).json({ error: 'studentId and courseId are required' });
    }

    if (req.user?.role === 'student' && req.user.id !== studentId) {
      return res.status(403).json({ error: 'Students can only enroll themselves' });
    }

    const course = await findCourseById(courseId, organizationId);
    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }
    if (req.user?.role === 'student' && !course.isActive) {
      return res.status(409).json({ error: 'This course is not open for enrollment' });
    }

    const existing = await findEnrollment(studentId, courseId, organizationId);
    if (existing) {
      return res.status(409).json({ error: 'Already enrolled in this course' });
    }

    const enrollment = await createEnrollment({ studentId, courseId, organizationId });
    res.status(201).json(enrollment);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

export async function getEnrollmentHandler(req: AuthRequest, res: Response) {
  try {
    const organizationId = requireOrganizationId(req, res);
    if (!organizationId) return;

    const { id } = req.params;
    const enrollment = await findEnrollmentById(id, organizationId);

    if (!enrollment) {
      return res.status(404).json({ error: 'Enrollment not found' });
    }

    if (req.user?.role === 'student' && enrollment.studentId !== req.user.id) {
      return res.status(403).json({ error: 'You can only view your own enrollments' });
    }
    if (req.user?.role === 'teacher') {
      const course = await findCourseById(enrollment.courseId, organizationId);
      if (!course || course.teacherId !== req.user.id) {
        return res.status(403).json({ error: 'You can only view enrollments for your own courses' });
      }
    }
    if (req.user?.role !== 'student' && req.user?.role !== 'teacher' && req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    res.json(enrollment);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

export async function listEnrollmentsHandler(req: AuthRequest, res: Response) {
  try {
    const organizationId = requireOrganizationId(req, res);
    if (!organizationId) return;

    const { studentId, courseId } = req.query;
    const rawLimit = Number.parseInt(String(req.query.limit ?? ''), 10);
    const rawOffset = Number.parseInt(String(req.query.offset ?? ''), 10);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 200) : 50;
    const offset = Number.isFinite(rawOffset) ? Math.max(rawOffset, 0) : 0;

    let result;
    if (req.user?.role === 'student') {
      if (studentId && typeof studentId === 'string' && req.user.id !== studentId) {
        return res.status(403).json({ error: 'You can only view your own enrollments' });
      }
      if (courseId && typeof courseId === 'string') {
        const enrollment = await findEnrollment(req.user.id, courseId, organizationId);
        result = enrollment ? [enrollment] : [];
      } else {
        result = await listEnrollmentsByStudent(req.user.id, organizationId, limit, offset);
      }
    } else if (studentId && typeof studentId === 'string') {
      if (req.user?.role !== 'admin') {
        return res.status(403).json({ error: 'Only administrators can view another student\'s enrollments' });
      }
      result = await listEnrollmentsByStudent(studentId, organizationId, limit, offset);
    } else if (courseId && typeof courseId === 'string') {
      const course = await findCourseById(courseId, organizationId);
      if (!course) {
        return res.status(404).json({ error: 'Course not found' });
      }
      if (req.user?.role === 'teacher' && course.teacherId !== req.user.id) {
        return res.status(403).json({ error: 'You can only view rosters for your own courses' });
      }
      if (req.user?.role !== 'teacher' && req.user?.role !== 'admin') {
        return res.status(403).json({ error: 'Teacher access is required to view a course roster' });
      }
      result = await listEnrollmentsByCourse(courseId, organizationId, limit, offset);
    } else {
      return res.status(400).json({ error: 'studentId or courseId is required' });
    }

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

export async function updateEnrollmentHandler(req: AuthRequest, res: Response) {
  try {
    const organizationId = requireOrganizationId(req, res);
    if (!organizationId) return;

    const { id } = req.params;
    const { status } = req.body;

    if (!status || !['active', 'completed', 'dropped'].includes(status)) {
      return res
        .status(400)
        .json({ error: 'Invalid status. Must be active, completed, or dropped' });
    }

    const existing = await findEnrollmentById(id, organizationId);
    if (!existing) {
      return res.status(404).json({ error: 'Enrollment not found' });
    }

    const course = await findCourseById(existing.courseId, organizationId);
    if (!course) {
      return res.status(404).json({ error: 'Enrollment not found' });
    }
    if (req.user?.role !== 'admin' && course.teacherId !== req.user?.id) {
      return res
        .status(403)
        .json({ error: 'You can only update enrollments for your own courses' });
    }

    const enrollment = await updateEnrollmentStatus(id, organizationId, status);
    res.json(enrollment);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

export async function deleteEnrollmentHandler(req: AuthRequest, res: Response) {
  try {
    const organizationId = requireOrganizationId(req, res);
    if (!organizationId) return;

    const { id } = req.params;

    const existing = await findEnrollmentById(id, organizationId);
    if (!existing) {
      return res.status(404).json({ error: 'Enrollment not found' });
    }

    if (req.user?.role === 'student' && existing.studentId !== req.user.id) {
      return res.status(403).json({ error: 'You can only delete your own enrollments' });
    }

    const enrollment = await deleteEnrollment(id, organizationId);
    res.json(enrollment);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}
