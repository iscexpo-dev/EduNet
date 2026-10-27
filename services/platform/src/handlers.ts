import { Request, Response } from 'express';
import { z } from 'zod';
import { hasPermission } from '@edunet/rbac';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  analyticsSummary,
  appendAuditLog,
  assignSubject,
  attendanceSummary,
  closeDb,
  createAcademicYear,
  createClass,
  createDataSubjectRequest,
  createSection,
  createSubject,
  createTerm,
  createWebhookEndpoint,
  enrollStudent,
  ingestAnalyticsEvents,
  isFeatureEnabled,
  listAcademicYears,
  getLinkedAttendanceChildIds,
  getTeacherAttendanceClassIds,
  listAttendance,
  listAuditLogs,
  listClassEnrollments,
  listClasses,
  listClassesForTeacher,
  listClassSubjects,
  listConsents,
  listDataSubjectRequests,
  listFeatureFlags,
  listIntegrations,
  listNotificationTemplates,
  listSections,
  listSettings,
  listSubjects,
  listTerms,
  listWebhookEndpoints,
  recordConsent,
  updateAcademicYear,
  updateClass,
  updateDataSubjectRequest,
  updateEnrollment,
  upsertAttendance,
  upsertFeatureFlag,
  upsertIntegration,
  upsertNotificationTemplate,
  upsertSetting,
  verifyAuditLogs,
} from './db';
import {
  calculateWeightedGrade,
  canAccessAttendanceClass,
  letterGrade,
  resolveAttendanceStudentScope,
  resolveAttendanceViewer,
  type AttendanceViewer,
} from './logic';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    role: string;
    organizationId?: string;
  };
}

function fail(res: Response, error: unknown) {
  if (error instanceof z.ZodError) {
    return res.status(400).json({ error: 'Invalid request', details: error.flatten() });
  }
  if (error instanceof NotFoundError) return res.status(404).json({ error: error.message });
  if (error instanceof ForbiddenError) return res.status(403).json({ error: error.message });
  if (error instanceof ConflictError) return res.status(409).json({ error: error.message });
  throw error;
}

function context(req: AuthRequest, res: Response) {
  const organizationId = req.user?.organizationId;
  if (!organizationId || !req.user) {
    res.status(403).json({ error: 'Organization context required' });
    return null;
  }
  return { organizationId, user: req.user };
}

function requirePermission(res: Response, role: string, permission: Parameters<typeof hasPermission>[1]) {
  if (!hasPermission(role, permission)) {
    res.status(403).json({ error: 'Forbidden' });
    return false;
  }
  return true;
}

const yearSchema = z.object({
  name: z.string().min(1).max(100),
  startsOn: z.coerce.date(),
  endsOn: z.coerce.date(),
  isActive: z.boolean().optional(),
});

export async function listYearsHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    return res.json(await listAcademicYears(ctx.organizationId));
  } catch (error) {
    return fail(res, error);
  }
}

export async function createYearHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    if (!requirePermission(res, ctx.user.role, 'academics:write')) return;
    const input = yearSchema.parse(req.body);
    return res.status(201).json(
      await createAcademicYear({ ...input, organizationId: ctx.organizationId }),
    );
  } catch (error) {
    return fail(res, error);
  }
}

export async function updateYearHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    if (!requirePermission(res, ctx.user.role, 'academics:write')) return;
    const input = yearSchema.partial().parse(req.body);
    const row = await updateAcademicYear(req.params.id!, ctx.organizationId, input);
    if (!row) return res.status(404).json({ error: 'Academic year not found' });
    return res.json(row);
  } catch (error) {
    return fail(res, error);
  }
}

export async function listTermsHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    const { academicYearId } = z
      .object({ academicYearId: z.string().uuid().optional() })
      .parse(req.query);
    return res.json(await listTerms(ctx.organizationId, academicYearId));
  } catch (error) {
    return fail(res, error);
  }
}

export async function createTermHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    if (!requirePermission(res, ctx.user.role, 'academics:write')) return;
    const input = z
      .object({
        academicYearId: z.string().uuid(),
        name: z.string().min(1).max(100),
        startsOn: z.coerce.date(),
        endsOn: z.coerce.date(),
        isActive: z.boolean().optional(),
      })
      .parse(req.body);
    return res.status(201).json(
      await createTerm({ ...input, organizationId: ctx.organizationId }),
    );
  } catch (error) {
    return fail(res, error);
  }
}

export async function listClassesHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    const { academicYearId, mine } = z
      .object({
        academicYearId: z.string().uuid().optional(),
        mine: z.enum(['true', 'false']).optional(),
      })
      .parse(req.query);
    if (mine === 'true' && resolveAttendanceViewer(ctx.user.role) === 'teacher') {
      return res.json(
        await listClassesForTeacher(ctx.organizationId, ctx.user.id, academicYearId),
      );
    }
    return res.json(await listClasses(ctx.organizationId, academicYearId));
  } catch (error) {
    return fail(res, error);
  }
}

export async function createClassHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    if (!requirePermission(res, ctx.user.role, 'academics:write')) return;
    const input = z
      .object({
        academicYearId: z.string().uuid(),
        name: z.string().min(1).max(100),
        gradeLevel: z.string().max(20).optional(),
        homeroomTeacherId: z.string().uuid().optional(),
        capacity: z.number().int().min(1).max(500).optional(),
        isActive: z.boolean().optional(),
      })
      .parse(req.body);
    return res.status(201).json(
      await createClass({ ...input, organizationId: ctx.organizationId }),
    );
  } catch (error) {
    return fail(res, error);
  }
}

export async function updateClassHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    if (!requirePermission(res, ctx.user.role, 'academics:write')) return;
    const input = z
      .object({
        name: z.string().min(1).max(100).optional(),
        gradeLevel: z.string().max(20).optional(),
        homeroomTeacherId: z.string().uuid().nullable().optional(),
        capacity: z.number().int().min(1).max(500).optional(),
        isActive: z.boolean().optional(),
      })
      .parse(req.body);
    const row = await updateClass(req.params.id!, ctx.organizationId, input);
    if (!row) return res.status(404).json({ error: 'Class not found' });
    return res.json(row);
  } catch (error) {
    return fail(res, error);
  }
}

export async function listSectionsHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    return res.json(await listSections(ctx.organizationId, req.params.classId!));
  } catch (error) {
    return fail(res, error);
  }
}

export async function createSectionHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    if (!requirePermission(res, ctx.user.role, 'academics:write')) return;
    const input = z
      .object({
        classId: z.string().uuid(),
        name: z.string().min(1).max(50),
        capacity: z.number().int().min(1).max(500).optional(),
      })
      .parse(req.body);
    return res.status(201).json(
      await createSection({ ...input, organizationId: ctx.organizationId }),
    );
  } catch (error) {
    return fail(res, error);
  }
}

export async function listSubjectsHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    return res.json(await listSubjects(ctx.organizationId));
  } catch (error) {
    return fail(res, error);
  }
}

export async function createSubjectHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    if (!requirePermission(res, ctx.user.role, 'academics:write')) return;
    const input = z
      .object({
        name: z.string().min(1).max(120),
        code: z.string().min(1).max(30),
        description: z.string().max(2000).optional(),
      })
      .parse(req.body);
    return res.status(201).json(
      await createSubject({ ...input, organizationId: ctx.organizationId }),
    );
  } catch (error) {
    return fail(res, error);
  }
}

export async function listClassSubjectsHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    return res.json(await listClassSubjects(ctx.organizationId, req.params.classId!));
  } catch (error) {
    return fail(res, error);
  }
}

export async function assignSubjectHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    if (!requirePermission(res, ctx.user.role, 'academics:write')) return;
    const input = z
      .object({
        classId: z.string().uuid(),
        subjectId: z.string().uuid(),
        teacherId: z.string().uuid().optional(),
      })
      .parse(req.body);
    return res.status(201).json(
      await assignSubject({ ...input, organizationId: ctx.organizationId }),
    );
  } catch (error) {
    return fail(res, error);
  }
}

export async function listEnrollmentsHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    if (!requirePermission(res, ctx.user.role, 'enrollment:read')) return;
    const viewer = resolveAttendanceViewer(ctx.user.role);
    if (viewer !== 'admin' && viewer !== 'teacher') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const classId = z.string().uuid().parse(req.params.classId);
    if (viewer === 'teacher') {
      const allowed = await getTeacherAttendanceClassIds(ctx.organizationId, ctx.user.id);
      if (!canAccessAttendanceClass(viewer, classId, allowed)) {
        return res.status(403).json({ error: 'You can only view rosters for your own classes' });
      }
    }
    return res.json(await listClassEnrollments(ctx.organizationId, classId));
  } catch (error) {
    return fail(res, error);
  }
}

export async function enrollStudentHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    if (!requirePermission(res, ctx.user.role, 'academics:write')) return;
    const input = z
      .object({
        classId: z.string().uuid(),
        studentId: z.string().uuid(),
        sectionId: z.string().uuid().optional(),
      })
      .parse(req.body);
    return res.status(201).json(
      await enrollStudent({ ...input, organizationId: ctx.organizationId }),
    );
  } catch (error) {
    return fail(res, error);
  }
}

export async function updateEnrollmentHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    if (!requirePermission(res, ctx.user.role, 'academics:write')) return;
    const input = z
      .object({
        status: z.enum(['active', 'transferred', 'graduated', 'withdrawn']).optional(),
        sectionId: z.string().uuid().nullable().optional(),
        leftAt: z.coerce.date().nullable().optional(),
      })
      .parse(req.body);
    const row = await updateEnrollment(req.params.id!, ctx.organizationId, input);
    if (!row) return res.status(404).json({ error: 'Enrollment not found' });
    return res.json(row);
  } catch (error) {
    return fail(res, error);
  }
}

interface AttendanceAccess {
  viewer: AttendanceViewer;
  classIds?: string[];
  studentIds?: string[];
}

async function resolveAttendanceAccess(
  ctx: { organizationId: string; user: { id: string; role: string } },
  res: Response,
  requested: { classId?: string; studentId?: string },
): Promise<AttendanceAccess | null> {
  const viewer = resolveAttendanceViewer(ctx.user.role);
  if (viewer === 'denied') {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }

  let linkedChildren: string[] = [];
  if (viewer === 'parent') {
    linkedChildren = await getLinkedAttendanceChildIds(ctx.organizationId, ctx.user.id);
  }

  const studentScope = resolveAttendanceStudentScope(
    viewer,
    ctx.user.id,
    linkedChildren,
    requested.studentId,
  );
  if (!studentScope.allowed) {
    res.status(403).json({ error: 'You cannot view attendance for that student' });
    return null;
  }

  let classIds: string[] | undefined;
  if (viewer === 'teacher') {
    const allowedClassIds = await getTeacherAttendanceClassIds(
      ctx.organizationId,
      ctx.user.id,
    );
    if (requested.classId) {
      if (!canAccessAttendanceClass(viewer, requested.classId, allowedClassIds)) {
        res.status(403).json({ error: 'You can only view attendance for your own classes' });
        return null;
      }
      classIds = [requested.classId];
    } else {
      classIds = allowedClassIds;
    }
  }

  return {
    viewer,
    classIds,
    studentIds: studentScope.studentIds ?? undefined,
  };
}

export async function listAttendanceHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    if (!requirePermission(res, ctx.user.role, 'attendance:read')) return;
    const query = z
      .object({
        classId: z.string().uuid().optional(),
        studentId: z.string().uuid().optional(),
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
      })
      .parse(req.query);
    const access = await resolveAttendanceAccess(ctx, res, query);
    if (!access) return;
    return res.json(
      await listAttendance(ctx.organizationId, {
        ...query,
        classIds: access.classIds,
        studentIds: access.studentIds,
      }),
    );
  } catch (error) {
    return fail(res, error);
  }
}

export async function markAttendanceHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    if (!requirePermission(res, ctx.user.role, 'attendance:write')) return;
    const input = z
      .object({
        classId: z.string().uuid(),
        date: z.coerce.date(),
        records: z
          .array(
            z.object({
              studentId: z.string().uuid(),
              status: z.enum(['present', 'absent', 'late', 'excused']),
              sectionId: z.string().uuid().optional(),
              notes: z.string().max(1000).optional(),
            }),
          )
          .min(1)
          .max(500),
      })
      .parse(req.body);
    const access = await resolveAttendanceAccess(ctx, res, { classId: input.classId });
    if (!access) return;
    if (access.viewer !== 'admin' && access.viewer !== 'teacher') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    return res.json(
      await upsertAttendance({
        ...input,
        organizationId: ctx.organizationId,
        markedBy: ctx.user.id,
      }),
    );
  } catch (error) {
    return fail(res, error);
  }
}

export async function attendanceSummaryHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    if (!requirePermission(res, ctx.user.role, 'attendance:read')) return;
    const query = z
      .object({
        classId: z.string().uuid().optional(),
        studentId: z.string().uuid().optional(),
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
      })
      .parse(req.query);
    const access = await resolveAttendanceAccess(ctx, res, query);
    if (!access) return;
    return res.json(
      await attendanceSummary(ctx.organizationId, {
        ...query,
        classIds: access.classIds,
        studentIds: access.studentIds,
      }),
    );
  } catch (error) {
    return fail(res, error);
  }
}

export async function ingestAnalyticsHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    const input = z
      .object({
        events: z
          .array(
            z.object({
              name: z.string().min(1).max(80),
              entityType: z.string().max(60).optional(),
              entityId: z.string().uuid().optional(),
              properties: z.record(z.string(), z.unknown()).optional(),
              occurredAt: z.coerce.date().optional(),
            }),
          )
          .min(1)
          .max(100),
      })
      .parse(req.body);
    return res.status(202).json(
      await ingestAnalyticsEvents(ctx.organizationId, ctx.user.id, input.events),
    );
  } catch (error) {
    return fail(res, error);
  }
}

export async function analyticsSummaryHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    if (!requirePermission(res, ctx.user.role, 'analytics:read')) return;
    const query = z
      .object({
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
        name: z.string().max(80).optional(),
      })
      .parse(req.query);
    return res.json(await analyticsSummary(ctx.organizationId, query));
  } catch (error) {
    return fail(res, error);
  }
}

export async function listFlagsHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    return res.json(await listFeatureFlags(ctx.organizationId));
  } catch (error) {
    return fail(res, error);
  }
}

export async function upsertFlagHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    if (!requirePermission(res, ctx.user.role, 'admin:write')) return;
    const input = z
      .object({
        key: z.string().min(1).max(80),
        description: z.string().max(1000).optional(),
        isEnabled: z.boolean().optional(),
        rolloutPercentage: z.number().int().min(0).max(100).optional(),
      })
      .parse(req.body);
    return res.json(
      await upsertFeatureFlag({ ...input, organizationId: ctx.organizationId, updatedBy: ctx.user.id }),
    );
  } catch (error) {
    return fail(res, error);
  }
}

export async function checkFlagHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    return res.json({
      key: req.params.key!,
      enabled: await isFeatureEnabled(ctx.organizationId, req.params.key!, ctx.user.id),
    });
  } catch (error) {
    return fail(res, error);
  }
}

export async function listSettingsHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    if (!requirePermission(res, ctx.user.role, 'admin:read')) return;
    return res.json(await listSettings(ctx.organizationId));
  } catch (error) {
    return fail(res, error);
  }
}

export async function upsertSettingHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    if (!requirePermission(res, ctx.user.role, 'admin:write')) return;
    const input = z
      .object({ key: z.string().min(1).max(100), value: z.unknown() })
      .parse(req.body);
    return res.json(
      await upsertSetting({
        organizationId: ctx.organizationId,
        key: input.key,
        value: input.value as never,
        updatedBy: ctx.user.id,
      }),
    );
  } catch (error) {
    return fail(res, error);
  }
}

export async function listAuditHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    if (!requirePermission(res, ctx.user.role, 'audit:read')) return;
    const query = z
      .object({
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
        action: z.string().max(80).optional(),
        actorId: z.string().uuid().optional(),
      })
      .parse(req.query);
    return res.json(await listAuditLogs(ctx.organizationId, query));
  } catch (error) {
    return fail(res, error);
  }
}

export async function verifyAuditHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    if (!requirePermission(res, ctx.user.role, 'audit:read')) return;
    return res.json(await verifyAuditLogs(ctx.organizationId));
  } catch (error) {
    return fail(res, error);
  }
}

export async function appendAuditHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    if (!requirePermission(res, ctx.user.role, 'audit:read')) return;
    const input = z
      .object({
        action: z.string().min(1).max(80),
        entityType: z.string().max(60).optional(),
        entityId: z.string().uuid().optional(),
        after: z.record(z.string(), z.unknown()).optional(),
      })
      .parse(req.body);
    return res.status(201).json(
      await appendAuditLog({
        ...input,
        organizationId: ctx.organizationId,
        actorId: ctx.user.id,
      }),
    );
  } catch (error) {
    return fail(res, error);
  }
}

export async function recordConsentHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    const input = z
      .object({
        type: z.enum(['terms', 'privacy', 'media', 'counselling', 'data_sharing', 'ai_processing']),
        version: z.string().min(1).max(30),
        granted: z.boolean(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      })
      .parse(req.body);
    return res.status(201).json(
      await recordConsent({ ...input, organizationId: ctx.organizationId, userId: ctx.user.id }),
    );
  } catch (error) {
    return fail(res, error);
  }
}

export async function listConsentsHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    return res.json(await listConsents(ctx.organizationId, ctx.user.id));
  } catch (error) {
    return fail(res, error);
  }
}

export async function createDataRequestHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    const input = z
      .object({
        type: z.enum(['export', 'deletion', 'access', 'correction']),
        notes: z.string().max(5000).optional(),
        userId: z.string().uuid().optional(),
      })
      .parse(req.body);
    const isStaff = hasPermission(ctx.user.role, 'admin:write');
    const targetUserId = isStaff && input.userId ? input.userId : ctx.user.id;
    return res.status(201).json(
      await createDataSubjectRequest({
        organizationId: ctx.organizationId,
        userId: targetUserId,
        requestedBy: ctx.user.id,
        type: input.type,
        notes: input.notes,
      }),
    );
  } catch (error) {
    return fail(res, error);
  }
}

export async function listDataRequestsHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    if (!requirePermission(res, ctx.user.role, 'admin:read')) return;
    return res.json(await listDataSubjectRequests(ctx.organizationId));
  } catch (error) {
    return fail(res, error);
  }
}

export async function updateDataRequestHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    if (!requirePermission(res, ctx.user.role, 'admin:write')) return;
    const input = z
      .object({
        status: z.enum(['received', 'verifying', 'processing', 'completed', 'rejected']),
        notes: z.string().max(5000).optional(),
      })
      .parse(req.body);
    return res.json(
      await updateDataSubjectRequest(ctx.organizationId, req.params.id!, input.status, input.notes),
    );
  } catch (error) {
    return fail(res, error);
  }
}

export async function listIntegrationsHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    if (!requirePermission(res, ctx.user.role, 'admin:read')) return;
    return res.json(await listIntegrations(ctx.organizationId));
  } catch (error) {
    return fail(res, error);
  }
}

export async function upsertIntegrationHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    if (!requirePermission(res, ctx.user.role, 'admin:write')) return;
    const input = z
      .object({
        provider: z.string().min(1).max(60),
        type: z.enum(['video', 'sms', 'email', 'sis', 'sso', 'lti', 'scorm', 'payment', 'analytics']),
        config: z.record(z.string(), z.unknown()).optional(),
        secretRef: z.string().max(120).optional(),
        isActive: z.boolean().optional(),
      })
      .parse(req.body);
    return res.json(
      await upsertIntegration({
        ...input,
        config: input.config ?? {},
        organizationId: ctx.organizationId,
      }),
    );
  } catch (error) {
    return fail(res, error);
  }
}

export async function listWebhooksHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    if (!requirePermission(res, ctx.user.role, 'admin:read')) return;
    return res.json(await listWebhookEndpoints(ctx.organizationId));
  } catch (error) {
    return fail(res, error);
  }
}

export async function createWebhookHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    if (!requirePermission(res, ctx.user.role, 'admin:write')) return;
    const input = z
      .object({
        url: z.string().url(),
        secretHash: z.string().length(64),
        events: z.array(z.string().max(80)).min(1).max(50),
      })
      .parse(req.body);
    return res.status(201).json(
      await createWebhookEndpoint({ ...input, organizationId: ctx.organizationId }),
    );
  } catch (error) {
    return fail(res, error);
  }
}

export async function listTemplatesHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    if (!requirePermission(res, ctx.user.role, 'admin:read')) return;
    return res.json(await listNotificationTemplates());
  } catch (error) {
    return fail(res, error);
  }
}

export async function upsertTemplateHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    if (!requirePermission(res, ctx.user.role, 'admin:write')) return;
    const input = z
      .object({
        key: z.string().min(1).max(80),
        locale: z.string().max(10).optional(),
        channel: z.enum(['in_app', 'email', 'sms', 'push']).optional(),
        subject: z.string().max(200).optional(),
        body: z.string().min(1).max(20000),
        isActive: z.boolean().optional(),
      })
      .parse(req.body);
    return res.json(await upsertNotificationTemplate(input));
  } catch (error) {
    return fail(res, error);
  }
}

export async function calculateGradeHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    const input = z
      .object({
        items: z
          .array(
            z.object({
              score: z.number().min(0),
              maxScore: z.number().positive(),
              weight: z.number().positive(),
            }),
          )
          .min(1)
          .max(100),
        passMark: z.number().min(0).max(100).optional(),
      })
      .parse(req.body);
    const percent = calculateWeightedGrade(input.items);
    return res.json({
      percent,
      letter: letterGrade(percent),
      passing: percent >= (input.passMark ?? 50),
    });
  } catch (error) {
    return fail(res, error);
  }
}

export { closeDb };
