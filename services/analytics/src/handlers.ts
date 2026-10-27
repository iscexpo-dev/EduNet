import { Request, Response } from 'express';
import {
  findCourseForAnalytics,
  getCourseAnalytics,
  getStudentPerformance,
  getAssignmentPerformance,
  getCourseEngagement,
} from './db';
import {
  canViewCourseAnalytics,
  isUuid,
  parseEngagementDays,
} from './policy';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    role: string;
    organizationId?: string;
  };
}

interface CourseAccess {
  courseId: string;
  organizationId: string;
}

/**
 * Resolves the course and verifies tenant + ownership before any analytics
 * query runs. Sends the error response itself so handlers can simply return.
 */
async function resolveCourseAccess(
  req: AuthRequest,
  res: Response,
): Promise<CourseAccess | null> {
  const organizationId = req.user?.organizationId;
  const userId = req.user?.id;
  if (!organizationId || !userId) {
    res.status(403).json({ error: 'Organization context required' });
    return null;
  }

  const courseId = req.params.courseId;
  if (!isUuid(courseId)) {
    res.status(400).json({ error: 'Invalid course id' });
    return null;
  }

  const course = await findCourseForAnalytics(courseId, organizationId);
  if (!course) {
    res.status(404).json({ error: 'Course not found' });
    return null;
  }

  if (!canViewCourseAnalytics(req.user?.role, userId, course.teacherId)) {
    res.status(403).json({ error: 'You can only view analytics for your own courses' });
    return null;
  }

  return { courseId, organizationId };
}

export async function getCourseAnalyticsHandler(req: AuthRequest, res: Response) {
  try {
    const access = await resolveCourseAccess(req, res);
    if (!access) return;

    res.json(await getCourseAnalytics(access.courseId, access.organizationId));
  } catch {
    res.status(500).json({ error: 'Unable to load course analytics' });
  }
}

export async function getStudentPerformanceHandler(req: AuthRequest, res: Response) {
  try {
    const access = await resolveCourseAccess(req, res);
    if (!access) return;

    res.json(await getStudentPerformance(access.courseId, access.organizationId));
  } catch {
    res.status(500).json({ error: 'Unable to load student performance' });
  }
}

export async function getAssignmentPerformanceHandler(req: AuthRequest, res: Response) {
  try {
    const access = await resolveCourseAccess(req, res);
    if (!access) return;

    res.json(await getAssignmentPerformance(access.courseId, access.organizationId));
  } catch {
    res.status(500).json({ error: 'Unable to load assignment performance' });
  }
}

export async function getCourseEngagementHandler(req: AuthRequest, res: Response) {
  let days: number;
  try {
    days = parseEngagementDays(req.query.days);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid days';
    return res.status(400).json({ error: message });
  }

  try {
    const access = await resolveCourseAccess(req, res);
    if (!access) return;

    res.json(
      await getCourseEngagement(access.courseId, access.organizationId, days),
    );
  } catch {
    res.status(500).json({ error: 'Unable to load course engagement' });
  }
}
