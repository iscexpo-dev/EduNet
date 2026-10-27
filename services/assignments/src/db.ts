import { drizzle } from 'drizzle-orm/postgres-js';
import { assignments, courses, enrollments, submissions, users } from '@edunet/database';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import postgres from 'postgres';

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
    const activeClient = client;
    client = null;
    db = null;
    await activeClient.end();
  }
}

export async function findCourseById(id: string, organizationId: string) {
  const db = getDb();
  const result = await db
    .select()
    .from(courses)
    .where(and(eq(courses.id, id), eq(courses.organizationId, organizationId)));
  return result[0] || null;
}

export async function findAssignmentById(id: string, organizationId: string) {
  const db = getDb();
  const result = await db
    .select({ assignment: assignments })
    .from(assignments)
    .innerJoin(courses, eq(assignments.courseId, courses.id))
    .where(and(eq(assignments.id, id), eq(courses.organizationId, organizationId)));
  return result[0]?.assignment || null;
}

export async function isStudentEnrolled(
  studentId: string,
  courseId: string,
  organizationId: string,
) {
  const db = getDb();
  const result = await db
    .select({ id: enrollments.id })
    .from(enrollments)
    .innerJoin(courses, eq(enrollments.courseId, courses.id))
    .innerJoin(users, eq(enrollments.studentId, users.id))
    .where(
      and(
        eq(enrollments.studentId, studentId),
        eq(enrollments.courseId, courseId),
        eq(enrollments.status, 'active'),
        isNull(enrollments.deletedAt),
        eq(courses.organizationId, organizationId),
        eq(users.organizationId, organizationId),
      ),
    )
    .limit(1);
  return result.length > 0;
}

export async function listAssignmentsByCourse(
  courseId: string,
  organizationId: string,
  limit = 50,
  offset = 0,
  activeOnly = false
) {
  const db = getDb();
  const result = await db
    .select({ assignment: assignments })
    .from(assignments)
    .innerJoin(courses, eq(assignments.courseId, courses.id))
    .where(
      and(
        eq(assignments.courseId, courseId),
        eq(courses.organizationId, organizationId),
        activeOnly ? eq(assignments.isActive, true) : undefined,
        activeOnly ? isNull(assignments.deletedAt) : undefined,
      ),
    )
    .limit(limit)
    .offset(offset);
  return result.map(({ assignment }) => assignment);
}

export async function createAssignment(data: {
  courseId: string;
  organizationId: string;
  teacherId: string;
  title: string;
  description: string;
  dueDate: Date;
  maxPoints: number;
  latePolicy?: string;
  latePenaltyPercent?: number;
  allowResubmission?: boolean;
  resubmissionDeadline?: Date | null;
}) {
  const db = getDb();
  const [course] = await db
    .select({ id: courses.id })
    .from(courses)
    .innerJoin(users, eq(courses.teacherId, users.id))
    .where(
      and(
        eq(courses.id, data.courseId),
        eq(courses.organizationId, data.organizationId),
        eq(courses.teacherId, data.teacherId),
        eq(users.organizationId, data.organizationId),
        eq(users.role, 'teacher')
      )
    )
    .limit(1);
  if (!course) {
    throw new Error('Course must belong to the authenticated organization and its teacher');
  }

  const [assignment] = await db
    .insert(assignments)
    .values({
      id: crypto.randomUUID(),
      courseId: data.courseId,
      title: data.title,
      description: data.description,
      dueDate: data.dueDate,
      maxPoints: data.maxPoints,
      latePolicy: data.latePolicy ?? 'accept',
      latePenaltyPercent: data.latePenaltyPercent ?? 0,
      allowResubmission: data.allowResubmission ?? false,
      resubmissionDeadline: data.resubmissionDeadline ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();
  return assignment;
}

export async function updateAssignment(
  id: string,
  organizationId: string,
  data: {
    title?: string;
    description?: string;
    dueDate?: Date;
    maxPoints?: number;
    latePolicy?: string;
    latePenaltyPercent?: number;
    allowResubmission?: boolean;
    resubmissionDeadline?: Date | null;
  }
) {
  const db = getDb();
  const [assignment] = await db
    .update(assignments)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(assignments.id, id),
        inArray(
          assignments.courseId,
          db
            .select({ id: courses.id })
            .from(courses)
            .where(eq(courses.organizationId, organizationId))
        )
      )
    )
    .returning();
  return assignment;
}

export async function deleteAssignment(id: string, organizationId: string) {
  const db = getDb();
  const [assignment] = await db
    .delete(assignments)
    .where(
      and(
        eq(assignments.id, id),
        inArray(
          assignments.courseId,
          db
            .select({ id: courses.id })
            .from(courses)
            .where(eq(courses.organizationId, organizationId))
        )
      )
    )
    .returning();
  return assignment;
}

export async function getAssignmentSubmissionCount(assignmentId: string, organizationId: string) {
  const db = getDb();
  const result = await db
    .select({ id: submissions.id })
    .from(submissions)
    .innerJoin(assignments, eq(submissions.assignmentId, assignments.id))
    .innerJoin(courses, eq(assignments.courseId, courses.id))
    .where(
      and(eq(submissions.assignmentId, assignmentId), eq(courses.organizationId, organizationId))
    );
  return result.length;
}
