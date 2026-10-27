import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { and, asc, desc, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import {
  academicYears,
  analyticsEvents,
  attendanceRecords,
  auditLogs,
  classEnrollments,
  classSubjects,
  consentRecords,
  dataSubjectRequests,
  featureFlags,
  integrationConfigs,
  notificationTemplates,
  parentChildRelationships,
  schoolClasses,
  sections,
  subjects,
  systemSettings,
  terms,
  users,
  webhookEndpoints,
} from '@edunet/database';
import {
  appendAuditEvent,
  calculateWeightedGrade,
  canTransitionDataRequest,
  dataRequestDueAt,
  evaluateFeatureFlag,
  isDataRequestOverdue,
  summariseAttendance,
  termWithinYear,
  verifyAuditChain,
  type AuditEvent,
  type DataRequestStatus,
  type DataRequestType,
  type SettingsValue,
} from './logic';

let client: postgres.Sql | null = null;
let db: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (!db) {
    const connectionString =
      process.env.DATABASE_URL ||
      `postgres://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`;
    client = postgres(connectionString);
    db = drizzle(client);
  }
  return db;
}

export async function closeDb(): Promise<void> {
  if (client) {
    const active = client;
    client = null;
    db = null;
    await active.end();
  }
}

export class NotFoundError extends Error {
  constructor(message = 'Not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ForbiddenError extends Error {
  constructor(message = 'Forbidden') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export class ConflictError extends Error {
  constructor(message = 'Conflict') {
    super(message);
    this.name = 'ConflictError';
  }
}

// ---------------------------------------------------------------------------
// Academic structure
// ---------------------------------------------------------------------------

export async function listAcademicYears(organizationId: string) {
  const db = getDb();
  return db
    .select()
    .from(academicYears)
    .where(eq(academicYears.organizationId, organizationId))
    .orderBy(desc(academicYears.startsOn));
}

export async function createAcademicYear(data: typeof academicYears.$inferInsert) {
  if (data.endsOn.getTime() <= data.startsOn.getTime()) throw new ConflictError('Invalid academic year');
  const db = getDb();
  const [row] = await db.insert(academicYears).values(data).returning();
  return row!;
}

export async function updateAcademicYear(
  id: string,
  organizationId: string,
  data: Partial<typeof academicYears.$inferInsert>,
) {
  const db = getDb();
  const [row] = await db
    .update(academicYears)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(academicYears.id, id), eq(academicYears.organizationId, organizationId)))
    .returning();
  return row ?? null;
}

export async function listTerms(organizationId: string, academicYearId?: string) {
  const db = getDb();
  const conditions = [eq(terms.organizationId, organizationId)];
  if (academicYearId) conditions.push(eq(terms.academicYearId, academicYearId));
  return db.select().from(terms).where(and(...conditions)).orderBy(asc(terms.startsOn));
}

export async function createTerm(data: typeof terms.$inferInsert) {
  const db = getDb();
  const [year] = await db
    .select()
    .from(academicYears)
    .where(and(eq(academicYears.id, data.academicYearId), eq(academicYears.organizationId, data.organizationId)))
    .limit(1);
  if (!year) throw new NotFoundError('Academic year not found');
  if (!termWithinYear(data, year)) throw new ConflictError('Term must fall within the academic year');
  const [row] = await db.insert(terms).values(data).returning();
  return row!;
}

export async function listClasses(organizationId: string, academicYearId?: string) {
  const db = getDb();
  const conditions = [eq(schoolClasses.organizationId, organizationId)];
  if (academicYearId) conditions.push(eq(schoolClasses.academicYearId, academicYearId));
  return db
    .select()
    .from(schoolClasses)
    .where(and(...conditions))
    .orderBy(asc(schoolClasses.name));
}

export async function listClassesForTeacher(
  organizationId: string,
  teacherId: string,
  academicYearId?: string,
) {
  const classIds = await getTeacherAttendanceClassIds(organizationId, teacherId);
  if (!classIds.length) return [];
  const conditions = [
    eq(schoolClasses.organizationId, organizationId),
    eq(schoolClasses.isActive, true),
    inArray(schoolClasses.id, classIds),
  ];
  if (academicYearId) conditions.push(eq(schoolClasses.academicYearId, academicYearId));
  return getDb()
    .select()
    .from(schoolClasses)
    .where(and(...conditions))
    .orderBy(asc(schoolClasses.name));
}

export async function createClass(data: typeof schoolClasses.$inferInsert) {
  const db = getDb();
  const [year] = await db
    .select()
    .from(academicYears)
    .where(and(eq(academicYears.id, data.academicYearId), eq(academicYears.organizationId, data.organizationId)))
    .limit(1);
  if (!year) throw new NotFoundError('Academic year not found');
  const [row] = await db.insert(schoolClasses).values(data).returning();
  return row!;
}

export async function updateClass(
  id: string,
  organizationId: string,
  data: Partial<typeof schoolClasses.$inferInsert>,
) {
  const db = getDb();
  const [row] = await db
    .update(schoolClasses)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(schoolClasses.id, id), eq(schoolClasses.organizationId, organizationId)))
    .returning();
  return row ?? null;
}

export async function listSections(organizationId: string, classId: string) {
  const db = getDb();
  return db
    .select()
    .from(sections)
    .where(and(eq(sections.organizationId, organizationId), eq(sections.classId, classId)))
    .orderBy(asc(sections.name));
}

export async function createSection(data: typeof sections.$inferInsert) {
  const db = getDb();
  const [row] = await db.insert(sections).values(data).returning();
  return row!;
}

export async function listSubjects(organizationId: string) {
  const db = getDb();
  return db
    .select()
    .from(subjects)
    .where(eq(subjects.organizationId, organizationId))
    .orderBy(asc(subjects.name));
}

export async function createSubject(data: typeof subjects.$inferInsert) {
  const db = getDb();
  const [row] = await db.insert(subjects).values(data).returning();
  return row!;
}

export async function listClassSubjects(organizationId: string, classId: string) {
  const db = getDb();
  return db
    .select({
      id: classSubjects.id,
      classId: classSubjects.classId,
      subjectId: classSubjects.subjectId,
      teacherId: classSubjects.teacherId,
      name: subjects.name,
      code: subjects.code,
    })
    .from(classSubjects)
    .innerJoin(subjects, eq(subjects.id, classSubjects.subjectId))
    .where(and(eq(classSubjects.organizationId, organizationId), eq(classSubjects.classId, classId)));
}

export async function assignSubject(data: typeof classSubjects.$inferInsert) {
  const db = getDb();
  const [row] = await db
    .insert(classSubjects)
    .values(data)
    .onConflictDoUpdate({
      target: [classSubjects.classId, classSubjects.subjectId],
      set: { teacherId: data.teacherId },
    })
    .returning();
  return row!;
}

export async function listClassEnrollments(organizationId: string, classId: string) {
  const db = getDb();
  return db
    .select({
      id: classEnrollments.id,
      studentId: classEnrollments.studentId,
      sectionId: classEnrollments.sectionId,
      status: classEnrollments.status,
      joinedAt: classEnrollments.joinedAt,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
    })
    .from(classEnrollments)
    .innerJoin(users, eq(users.id, classEnrollments.studentId))
    .where(and(eq(classEnrollments.organizationId, organizationId), eq(classEnrollments.classId, classId)))
    .orderBy(asc(users.lastName), asc(users.firstName));
}

export async function enrollStudent(input: {
  organizationId: string;
  classId: string;
  studentId: string;
  sectionId?: string;
}) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [klass] = await tx
      .select()
      .from(schoolClasses)
      .where(
        and(
          eq(schoolClasses.id, input.classId),
          eq(schoolClasses.organizationId, input.organizationId),
        ),
      )
      .for('update')
      .limit(1);
    if (!klass) throw new NotFoundError('Class not found');

    const [student] = await tx
      .select({ id: users.id, organizationId: users.organizationId })
      .from(users)
      .where(eq(users.id, input.studentId))
      .limit(1);
    if (!student || student.organizationId !== input.organizationId) {
      throw new NotFoundError('Student not found in organization');
    }

    const [{ count }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(classEnrollments)
      .where(
        and(
          eq(classEnrollments.classId, input.classId),
          eq(classEnrollments.status, 'active'),
        ),
      );
    if (count >= klass.capacity) throw new ConflictError('Class is at capacity');

    const [row] = await tx
      .insert(classEnrollments)
      .values({
        organizationId: input.organizationId,
        classId: input.classId,
        studentId: input.studentId,
        sectionId: input.sectionId,
      })
      .onConflictDoUpdate({
        target: [classEnrollments.classId, classEnrollments.studentId],
        set: { status: 'active', sectionId: input.sectionId, leftAt: null },
      })
      .returning();
    return row!;
  });
}

export async function updateEnrollment(
  id: string,
  organizationId: string,
  data: Partial<typeof classEnrollments.$inferInsert>,
) {
  const db = getDb();
  const [row] = await db
    .update(classEnrollments)
    .set(data)
    .where(and(eq(classEnrollments.id, id), eq(classEnrollments.organizationId, organizationId)))
    .returning();
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------------

export async function getTeacherAttendanceClassIds(
  organizationId: string,
  teacherId: string,
): Promise<string[]> {
  const db = getDb();
  const homeroom = await db
    .select({ id: schoolClasses.id })
    .from(schoolClasses)
    .where(
      and(
        eq(schoolClasses.organizationId, organizationId),
        eq(schoolClasses.homeroomTeacherId, teacherId),
        eq(schoolClasses.isActive, true),
      ),
    );
  const taught = await db
    .select({ classId: classSubjects.classId })
    .from(classSubjects)
    .innerJoin(schoolClasses, eq(classSubjects.classId, schoolClasses.id))
    .where(
      and(
        eq(classSubjects.teacherId, teacherId),
        eq(schoolClasses.organizationId, organizationId),
        eq(schoolClasses.isActive, true),
      ),
    );
  return [...new Set([...homeroom.map((row) => row.id), ...taught.map((row) => row.classId)])];
}

export async function getLinkedAttendanceChildIds(
  organizationId: string,
  parentId: string,
): Promise<string[]> {
  const rows = await getDb()
    .select({ childId: parentChildRelationships.childId })
    .from(parentChildRelationships)
    .innerJoin(users, eq(parentChildRelationships.childId, users.id))
    .where(
      and(
        eq(parentChildRelationships.parentId, parentId),
        eq(users.organizationId, organizationId),
        eq(parentChildRelationships.canViewAttendance, true),
        isNull(parentChildRelationships.deletedAt),
      ),
    );
  return [...new Set(rows.map((row) => row.childId))];
}

export async function classExistsInOrganization(
  organizationId: string,
  classId: string,
): Promise<boolean> {
  const [row] = await getDb()
    .select({ id: schoolClasses.id })
    .from(schoolClasses)
    .where(
      and(
        eq(schoolClasses.id, classId),
        eq(schoolClasses.organizationId, organizationId),
        eq(schoolClasses.isActive, true),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export async function upsertAttendance(input: {
  organizationId: string;
  classId: string;
  markedBy: string;
  date: Date;
  records: { studentId: string; status: string; sectionId?: string; notes?: string }[];
}) {
  const db = getDb();
  if (!input.records.length) return [];
  const allowed = new Set(['present', 'absent', 'late', 'excused']);
  if (input.records.some((record) => !allowed.has(record.status))) {
    throw new ConflictError('Invalid attendance status');
  }
  const studentIds = input.records.map((record) => record.studentId);
  if (new Set(studentIds).size !== studentIds.length) {
    throw new ConflictError('Duplicate student in attendance records');
  }
  if (!(await classExistsInOrganization(input.organizationId, input.classId))) {
    throw new NotFoundError('Class not found');
  }

  const sectionIds = [
    ...new Set(
      input.records
        .map((record) => record.sectionId)
        .filter((sectionId): sectionId is string => Boolean(sectionId)),
    ),
  ];
  if (sectionIds.length) {
    const validSections = await db
      .select({ id: sections.id })
      .from(sections)
      .where(
        and(
          eq(sections.organizationId, input.organizationId),
          eq(sections.classId, input.classId),
          inArray(sections.id, sectionIds),
        ),
      );
    if (validSections.length !== sectionIds.length) {
      throw new ConflictError('Some sections do not belong to this class');
    }
  }

  const enrolled = await db
    .select({ studentId: classEnrollments.studentId })
    .from(classEnrollments)
    .where(
      and(
        eq(classEnrollments.classId, input.classId),
        eq(classEnrollments.organizationId, input.organizationId),
        inArray(classEnrollments.studentId, studentIds),
        eq(classEnrollments.status, 'active'),
      ),
    );
  const enrolledIds = new Set(enrolled.map((row) => row.studentId));
  const outsiders = studentIds.filter((id) => !enrolledIds.has(id));
  if (outsiders.length) throw new ConflictError('Some students are not enrolled in this class');

  return db.transaction(async (tx) =>
    Promise.all(
      input.records.map(async (record) => {
        const [row] = await tx
          .insert(attendanceRecords)
          .values({
            organizationId: input.organizationId,
            classId: input.classId,
            studentId: record.studentId,
            sectionId: record.sectionId,
            date: input.date,
            status: record.status,
            markedBy: input.markedBy,
            notes: record.notes,
          })
          .onConflictDoUpdate({
            target: [attendanceRecords.studentId, attendanceRecords.classId, attendanceRecords.date],
            set: {
              status: record.status,
              markedBy: input.markedBy,
              notes: record.notes,
              updatedAt: new Date(),
            },
          })
          .returning();
        return row!;
      }),
    ),
  );
}

export interface AttendanceQuery {
  classId?: string;
  studentId?: string;
  classIds?: string[];
  studentIds?: string[];
  from?: Date;
  to?: Date;
}

export async function listAttendance(
  organizationId: string,
  options: AttendanceQuery,
) {
  const db = getDb();
  if (options.classIds && options.classIds.length === 0) return [];
  if (options.studentIds && options.studentIds.length === 0) return [];

  const conditions = [eq(attendanceRecords.organizationId, organizationId)];
  if (options.classId) conditions.push(eq(attendanceRecords.classId, options.classId));
  if (options.classIds) conditions.push(inArray(attendanceRecords.classId, options.classIds));
  if (options.studentId) conditions.push(eq(attendanceRecords.studentId, options.studentId));
  if (options.studentIds) conditions.push(inArray(attendanceRecords.studentId, options.studentIds));
  if (options.from) conditions.push(gte(attendanceRecords.date, options.from));
  if (options.to) conditions.push(lte(attendanceRecords.date, options.to));
  return db
    .select()
    .from(attendanceRecords)
    .where(and(...conditions))
    .orderBy(desc(attendanceRecords.date))
    .limit(2000);
}

export async function attendanceSummary(
  organizationId: string,
  options: AttendanceQuery,
) {
  const rows = await listAttendance(organizationId, options);
  return summariseAttendance(
    rows.map((row) => ({ studentId: row.studentId, status: row.status as 'present' | 'absent' | 'late' | 'excused' })),
  );
}

export async function studentAttendanceRate(
  organizationId: string,
  studentId: string,
  options: { from?: Date; to?: Date } = {},
) {
  const summary = await attendanceSummary(organizationId, { studentId, ...options });
  return summary[0]?.rate ?? null;
}

// ---------------------------------------------------------------------------
// Analytics ingestion
// ---------------------------------------------------------------------------

const PRIVATE_PROPERTY_KEYS = new Set(['password', 'token', 'secret', 'email', 'phone', 'notes', 'answer', 'message']);

export function sanitiseProperties(properties: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!properties) return {};
  return Object.fromEntries(
    Object.entries(properties)
      .filter(([key]) => !PRIVATE_PROPERTY_KEYS.has(key.toLowerCase()))
      .slice(0, 30),
  );
}

export async function ingestAnalyticsEvents(
  organizationId: string,
  userId: string | null,
  events: { name: string; entityType?: string; entityId?: string; properties?: Record<string, unknown>; occurredAt?: Date }[],
) {
  const db = getDb();
  if (!events.length) return [];
  return db
    .insert(analyticsEvents)
    .values(
      events.slice(0, 100).map((event) => ({
        organizationId,
        userId,
        name: event.name.slice(0, 80),
        entityType: event.entityType?.slice(0, 60),
        entityId: event.entityId,
        properties: sanitiseProperties(event.properties),
        occurredAt: event.occurredAt ?? new Date(),
      })),
    )
    .returning();
}

export async function analyticsSummary(
  organizationId: string,
  options: { from?: Date; to?: Date; name?: string } = {},
) {
  const db = getDb();
  const conditions = [eq(analyticsEvents.organizationId, organizationId)];
  if (options.from) conditions.push(gte(analyticsEvents.occurredAt, options.from));
  if (options.to) conditions.push(lte(analyticsEvents.occurredAt, options.to));
  if (options.name) conditions.push(eq(analyticsEvents.name, options.name));
  return db
    .select({
      name: analyticsEvents.name,
      count: sql<number>`count(*)::int`,
      uniqueUsers: sql<number>`count(distinct ${analyticsEvents.userId})::int`,
    })
    .from(analyticsEvents)
    .where(and(...conditions))
    .groupBy(analyticsEvents.name)
    .orderBy(desc(sql`count(*)`));
}

// ---------------------------------------------------------------------------
// Feature flags and settings
// ---------------------------------------------------------------------------

export async function listFeatureFlags(organizationId: string) {
  const db = getDb();
  return db
    .select()
    .from(featureFlags)
    .where(or(eq(featureFlags.organizationId, organizationId), isNull(featureFlags.organizationId)))
    .orderBy(asc(featureFlags.key));
}

export async function upsertFeatureFlag(input: {
  organizationId: string;
  key: string;
  description?: string;
  isEnabled?: boolean;
  rolloutPercentage?: number;
  updatedBy: string;
}) {
  const db = getDb();
  const [row] = await db
    .insert(featureFlags)
    .values({
      organizationId: input.organizationId,
      key: input.key,
      description: input.description,
      isEnabled: input.isEnabled ?? false,
      rolloutPercentage: input.rolloutPercentage ?? 0,
      updatedBy: input.updatedBy,
    })
    .onConflictDoUpdate({
      target: [featureFlags.key, featureFlags.organizationId],
      set: {
        description: input.description,
        isEnabled: input.isEnabled ?? false,
        rolloutPercentage: input.rolloutPercentage ?? 0,
        updatedBy: input.updatedBy,
        updatedAt: new Date(),
      },
    })
    .returning();
  return row!;
}

export async function isFeatureEnabled(
  organizationId: string,
  key: string,
  userId?: string,
): Promise<boolean> {
  const db = getDb();
  const [flag] = await db
    .select()
    .from(featureFlags)
    .where(
      and(
        eq(featureFlags.key, key),
        or(eq(featureFlags.organizationId, organizationId), isNull(featureFlags.organizationId)),
      ),
    )
    .orderBy(desc(featureFlags.organizationId))
    .limit(1);
  if (!flag) return false;
  return evaluateFeatureFlag(
    {
      key: flag.key,
      isEnabled: flag.isEnabled,
      rolloutPercentage: flag.rolloutPercentage,
      enabledOrganizationIds: flag.organizationId ? [flag.organizationId] : null,
      enabledUserIds: null,
    },
    { organizationId, userId },
  );
}

export async function listSettings(organizationId: string) {
  const db = getDb();
  return db
    .select()
    .from(systemSettings)
    .where(or(eq(systemSettings.organizationId, organizationId), isNull(systemSettings.organizationId)))
    .orderBy(asc(systemSettings.key));
}

export async function upsertSetting(input: {
  organizationId: string;
  key: string;
  value: SettingsValue;
  updatedBy: string;
}) {
  const db = getDb();
  const [row] = await db
    .insert(systemSettings)
    .values(input)
    .onConflictDoUpdate({
      target: [systemSettings.key, systemSettings.organizationId],
      set: { value: input.value, updatedBy: input.updatedBy, updatedAt: new Date() },
    })
    .returning();
  return row!;
}

// ---------------------------------------------------------------------------
// Audit trail
// ---------------------------------------------------------------------------

export async function appendAuditLog(input: {
  organizationId: string | null;
  actorId: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  ipHash?: string;
  userAgent?: string;
}) {
  const db = getDb();
  const [last] = await db
    .select({ hash: auditLogs.hash, createdAt: auditLogs.createdAt })
    .from(auditLogs)
    .where(
      input.organizationId
        ? eq(auditLogs.organizationId, input.organizationId)
        : isNull(auditLogs.organizationId),
    )
    .orderBy(desc(auditLogs.createdAt))
    .limit(1);

  const event = appendAuditEvent(
    last?.hash
      ? { ...input, resourceType: input.entityType ?? 'unknown', createdAt: last.createdAt, hash: last.hash, previousHash: null }
      : null,
    {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: input.action,
      resourceType: input.entityType ?? 'unknown',
      resourceId: input.entityId,
      metadata: input.after ?? null,
    },
  );

  const [row] = await db
    .insert(auditLogs)
    .values({
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      before: input.before ?? null,
      after: input.after ?? null,
      ipHash: input.ipHash,
      userAgent: input.userAgent,
      hash: event.hash,
      previousHash: event.previousHash,
    })
    .returning();
  return row!;
}

export async function listAuditLogs(
  organizationId: string | null,
  options: { from?: Date; to?: Date; action?: string; actorId?: string; limit?: number } = {},
) {
  const db = getDb();
  const conditions = [];
  if (organizationId) conditions.push(eq(auditLogs.organizationId, organizationId));
  if (options.from) conditions.push(gte(auditLogs.createdAt, options.from));
  if (options.to) conditions.push(lte(auditLogs.createdAt, options.to));
  if (options.action) conditions.push(eq(auditLogs.action, options.action));
  if (options.actorId) conditions.push(eq(auditLogs.actorId, options.actorId));
  return db
    .select()
    .from(auditLogs)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(auditLogs.createdAt))
    .limit(options.limit ?? 200);
}

export async function verifyAuditLogs(organizationId: string | null) {
  const rows = await listAuditLogs(organizationId, { limit: 10000 });
  const ordered = [...rows].reverse();
  const events: AuditEvent[] = ordered.map((row) => ({
    organizationId: row.organizationId,
    actorId: row.actorId,
    action: row.action,
    resourceType: row.entityType ?? 'unknown',
    resourceId: row.entityId,
    metadata: row.after as Record<string, unknown> | null,
    createdAt: row.createdAt,
    hash: row.hash ?? '',
    previousHash: row.previousHash,
  }));
  return verifyAuditChain(events);
}

// ---------------------------------------------------------------------------
// Consent and data subject requests
// ---------------------------------------------------------------------------

export async function recordConsent(input: {
  organizationId: string;
  userId: string;
  type: string;
  version: string;
  granted: boolean;
  ipHash?: string;
  metadata?: Record<string, unknown>;
}) {
  const db = getDb();
  const [row] = await db
    .insert(consentRecords)
    .values({
      ...input,
      grantedAt: input.granted ? new Date() : null,
      revokedAt: input.granted ? null : new Date(),
    })
    .returning();
  return row!;
}

export async function listConsents(organizationId: string, userId: string) {
  const db = getDb();
  return db
    .select()
    .from(consentRecords)
    .where(and(eq(consentRecords.organizationId, organizationId), eq(consentRecords.userId, userId)))
    .orderBy(desc(consentRecords.createdAt));
}

const REQUEST_TYPE_MAP: Record<string, DataRequestType> = {
  export: 'portability',
  deletion: 'erasure',
  access: 'access',
  correction: 'rectification',
};

export async function createDataSubjectRequest(input: {
  organizationId: string;
  userId: string;
  requestedBy: string;
  type: 'export' | 'deletion' | 'access' | 'correction';
  notes?: string;
}) {
  const db = getDb();
  const requestedAt = new Date();
  const [row] = await db
    .insert(dataSubjectRequests)
    .values({
      organizationId: input.organizationId,
      userId: input.userId,
      requestedBy: input.requestedBy,
      type: input.type,
      status: 'received',
      requestedAt,
      dueAt: dataRequestDueAt(requestedAt),
      notes: input.notes,
    })
    .returning();
  return row!;
}

export async function listDataSubjectRequests(organizationId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(dataSubjectRequests)
    .where(eq(dataSubjectRequests.organizationId, organizationId))
    .orderBy(asc(dataSubjectRequests.dueAt));
  return rows.map((row) => ({
    ...row,
    requestType: REQUEST_TYPE_MAP[row.type] ?? 'access',
    overdue: row.dueAt
      ? isDataRequestOverdue(
          { dueAt: row.dueAt, status: row.status as DataRequestStatus },
          new Date(),
        )
      : false,
  }));
}

export async function updateDataSubjectRequest(
  organizationId: string,
  id: string,
  status: DataRequestStatus,
  notes?: string,
) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(dataSubjectRequests)
    .where(and(eq(dataSubjectRequests.id, id), eq(dataSubjectRequests.organizationId, organizationId)))
    .limit(1);
  if (!row) throw new NotFoundError('Request not found');
  if (!canTransitionDataRequest(row.status as DataRequestStatus, status)) {
    throw new ConflictError(`Cannot move request from ${row.status} to ${status}`);
  }
  const [updated] = await db
    .update(dataSubjectRequests)
    .set({
      status,
      notes: notes ?? row.notes,
      completedAt: status === 'completed' ? new Date() : row.completedAt,
    })
    .where(eq(dataSubjectRequests.id, id))
    .returning();
  return updated!;
}

// ---------------------------------------------------------------------------
// Integrations, webhooks, notification templates
// ---------------------------------------------------------------------------

export async function listIntegrations(organizationId: string) {
  const db = getDb();
  return db
    .select()
    .from(integrationConfigs)
    .where(eq(integrationConfigs.organizationId, organizationId));
}

export async function upsertIntegration(input: typeof integrationConfigs.$inferInsert) {
  const db = getDb();
  const [row] = await db
    .insert(integrationConfigs)
    .values(input)
    .onConflictDoUpdate({
      target: [integrationConfigs.organizationId, integrationConfigs.provider],
      set: {
        type: input.type,
        config: input.config,
        secretRef: input.secretRef,
        isActive: input.isActive,
        updatedAt: new Date(),
      },
    })
    .returning();
  return row!;
}

export async function listWebhookEndpoints(organizationId: string) {
  const db = getDb();
  return db
    .select()
    .from(webhookEndpoints)
    .where(eq(webhookEndpoints.organizationId, organizationId));
}

export async function createWebhookEndpoint(input: typeof webhookEndpoints.$inferInsert) {
  const db = getDb();
  const [row] = await db.insert(webhookEndpoints).values(input).returning();
  return row!;
}

export async function listNotificationTemplates() {
  const db = getDb();
  return db
    .select()
    .from(notificationTemplates)
    .where(eq(notificationTemplates.isActive, true))
    .orderBy(asc(notificationTemplates.key), asc(notificationTemplates.locale));
}

export async function upsertNotificationTemplate(input: typeof notificationTemplates.$inferInsert) {
  const db = getDb();
  const [row] = await db
    .insert(notificationTemplates)
    .values(input)
    .onConflictDoUpdate({
      target: [
        notificationTemplates.key,
        notificationTemplates.locale,
        notificationTemplates.channel,
      ],
      set: {
        subject: input.subject,
        body: input.body,
        version: sql`${notificationTemplates.version} + 1`,
        isActive: input.isActive ?? true,
      },
    })
    .returning();
  return row!;
}

export { calculateWeightedGrade };
