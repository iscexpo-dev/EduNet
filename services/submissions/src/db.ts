import { drizzle } from 'drizzle-orm/postgres-js';
import { assignments, courses, submissions, users } from '@edunet/database';
import { eq, and, inArray } from 'drizzle-orm';
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

export async function findSubmissionById(id: string, organizationId: string) {
  const db = getDb();
  const result = await db
    .select({ submission: submissions })
    .from(submissions)
    .innerJoin(assignments, eq(submissions.assignmentId, assignments.id))
    .innerJoin(courses, eq(assignments.courseId, courses.id))
    .where(and(eq(submissions.id, id), eq(courses.organizationId, organizationId)));
  return result[0]?.submission || null;
}

export async function findSubmission(
  assignmentId: string,
  studentId: string,
  organizationId: string
) {
  const db = getDb();
  const result = await db
    .select({ submission: submissions })
    .from(submissions)
    .innerJoin(assignments, eq(submissions.assignmentId, assignments.id))
    .innerJoin(courses, eq(assignments.courseId, courses.id))
    .where(
      and(
        eq(submissions.assignmentId, assignmentId),
        eq(submissions.studentId, studentId),
        eq(courses.organizationId, organizationId)
      )
    );
  return result[0]?.submission || null;
}

export async function listSubmissionsByAssignment(
  assignmentId: string,
  organizationId: string,
  limit = 50,
  offset = 0
) {
  const db = getDb();
  const result = await db
    .select({ submission: submissions })
    .from(submissions)
    .innerJoin(assignments, eq(submissions.assignmentId, assignments.id))
    .innerJoin(courses, eq(assignments.courseId, courses.id))
    .where(
      and(eq(submissions.assignmentId, assignmentId), eq(courses.organizationId, organizationId))
    )
    .limit(limit)
    .offset(offset);
  return result.map(({ submission }) => submission);
}

export async function listSubmissionsByStudent(
  studentId: string,
  organizationId: string,
  limit = 50,
  offset = 0
) {
  const db = getDb();
  const result = await db
    .select({ submission: submissions })
    .from(submissions)
    .innerJoin(assignments, eq(submissions.assignmentId, assignments.id))
    .innerJoin(courses, eq(assignments.courseId, courses.id))
    .where(and(eq(submissions.studentId, studentId), eq(courses.organizationId, organizationId)))
    .limit(limit)
    .offset(offset);
  return result.map(({ submission }) => submission);
}

export async function createSubmission(data: {
  assignmentId: string;
  studentId: string;
  organizationId: string;
  content: string;
  isLate?: boolean;
  attachmentIds?: string[];
}) {
  const db = getDb();
  const [validTarget] = await db
    .select({ assignmentId: assignments.id })
    .from(assignments)
    .innerJoin(courses, eq(assignments.courseId, courses.id))
    .innerJoin(users, eq(users.id, data.studentId))
    .where(
      and(
        eq(assignments.id, data.assignmentId),
        eq(courses.organizationId, data.organizationId),
        eq(users.organizationId, data.organizationId),
        eq(users.role, 'student')
      )
    )
    .limit(1);
  if (!validTarget) {
    throw new Error('Assignment and student must belong to the authenticated organization');
  }

  const [submission] = await db
    .insert(submissions)
    .values({
      id: crypto.randomUUID(),
      assignmentId: data.assignmentId,
      studentId: data.studentId,
      content: data.content,
      submittedAt: new Date(),
      attemptNumber: 1,
      isLate: data.isLate ?? false,
      attachmentIds: data.attachmentIds ?? [],
    })
    .returning();
  return submission;
}

/** Applies a resubmission: new content, incremented attempt, refreshed lateness. */
export async function applyResubmission(
  id: string,
  organizationId: string,
  data: { content: string; isLate: boolean },
  attemptNumber: number,
) {
  const db = getDb();
  const [submission] = await db
    .update(submissions)
    .set({
      content: data.content,
      isLate: data.isLate,
      attemptNumber,
      submittedAt: new Date(),
      // A resubmission restarts the grading lifecycle.
      grade: null,
      feedback: null,
      gradedAt: null,
      gradedBy: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(submissions.id, id),
        inArray(
          submissions.assignmentId,
          db
            .select({ id: assignments.id })
            .from(assignments)
            .innerJoin(courses, eq(assignments.courseId, courses.id))
            .where(eq(courses.organizationId, organizationId)),
        ),
      ),
    )
    .returning();
  return submission;
}

/** Autosaves a draft: content-only update without touching submission facts. */
export async function autosaveSubmission(
  id: string,
  organizationId: string,
  content: string,
) {
  const db = getDb();
  const [submission] = await db
    .update(submissions)
    .set({ content, updatedAt: new Date() })
    .where(
      and(
        eq(submissions.id, id),
        inArray(
          submissions.assignmentId,
          db
            .select({ id: assignments.id })
            .from(assignments)
            .innerJoin(courses, eq(assignments.courseId, courses.id))
            .where(eq(courses.organizationId, organizationId)),
        ),
      ),
    )
    .returning();
  return submission;
}

export async function gradeSubmission(
  id: string,
  organizationId: string,
  grade: number,
  gradedBy: string,
  feedback?: string
) {
  const db = getDb();
  const [submission] = await db
    .update(submissions)
    .set({
      grade,
      gradedBy,
      gradedAt: new Date(),
      feedback: feedback || null,
    })
    .where(
      and(
        eq(submissions.id, id),
        inArray(
          submissions.assignmentId,
          db
            .select({ id: assignments.id })
            .from(assignments)
            .innerJoin(courses, eq(assignments.courseId, courses.id))
            .where(eq(courses.organizationId, organizationId))
        )
      )
    )
    .returning();
  return submission;
}

export async function deleteSubmission(id: string, organizationId: string) {
  const db = getDb();
  const [submission] = await db
    .delete(submissions)
    .where(
      and(
        eq(submissions.id, id),
        inArray(
          submissions.assignmentId,
          db
            .select({ id: assignments.id })
            .from(assignments)
            .innerJoin(courses, eq(assignments.courseId, courses.id))
            .where(eq(courses.organizationId, organizationId))
        )
      )
    )
    .returning();
  return submission;
}

// ---------------------------------------------------------------------------
// Assignment expansion: rubrics, revisions, events, grade history
// ---------------------------------------------------------------------------

import { rubricCriteria as rubricCriteriaTable, submissionRevisions, submissionEvents, submissionGradeRevisions } from '@edunet/database';

export async function listRubricCriteria(assignmentId: string, organizationId: string) {
  const db = getDb();
  const rows = await db
    .select({ criterion: rubricCriteriaTable })
    .from(rubricCriteriaTable)
    .innerJoin(assignments, eq(rubricCriteriaTable.assignmentId, assignments.id))
    .innerJoin(courses, eq(assignments.courseId, courses.id))
    .where(and(eq(assignments.id, assignmentId), eq(courses.organizationId, organizationId)))
    .orderBy(rubricCriteriaTable.order);
  return rows.map(({ criterion }) => criterion);
}

/** Replaces the whole rubric for an assignment (teacher/admin action). */
export async function replaceRubricCriteria(
  assignmentId: string,
  organizationId: string,
  criteria: { description: string; maxPoints: number; order: number }[],
) {
  const db = getDb();
  const assignment = await findAssignmentById(assignmentId, organizationId);
  if (!assignment) return null;
  await db.delete(rubricCriteriaTable).where(eq(rubricCriteriaTable.assignmentId, assignmentId));
  if (criteria.length === 0) return [];
  const inserted = await db
    .insert(rubricCriteriaTable)
    .values(criteria.map((entry, index) => ({
      assignmentId,
      description: entry.description.slice(0, 300),
      maxPoints: entry.maxPoints,
      order: entry.order ?? index,
    })))
    .returning();
  return inserted;
}

export async function recordSubmissionRevision(data: {
  submissionId: string;
  previousContent: string | null;
  newContent: string;
  attemptNumber: number;
  reason: 'create' | 'resubmission' | 'autosave';
}) {
  const db = getDb();
  const [revision] = await db
    .insert(submissionRevisions)
    .values({
      submissionId: data.submissionId,
      previousContent: data.previousContent,
      newContent: data.newContent,
      attemptNumber: data.attemptNumber,
      reason: data.reason,
      createdAt: new Date(),
    })
    .returning();
  return revision;
}

export async function listSubmissionRevisions(submissionId: string, organizationId: string) {
  const db = getDb();
  const rows = await db
    .select({ revision: submissionRevisions })
    .from(submissionRevisions)
    .innerJoin(submissions, eq(submissionRevisions.submissionId, submissions.id))
    .where(
      and(
        eq(submissionRevisions.submissionId, submissionId),
        inArray(
          submissions.assignmentId,
          db
            .select({ id: assignments.id })
            .from(assignments)
            .innerJoin(courses, eq(assignments.courseId, courses.id))
            .where(eq(courses.organizationId, organizationId)),
        ),
      ),
    )
    .orderBy(submissionRevisions.createdAt);
  return rows.map(({ revision }) => revision);
}

export async function recordSubmissionEvent(data: {
  submissionId: string;
  actorId: string | null;
  action: 'submitted' | 'resubmitted' | 'graded' | 'regraded' | 'autosaved';
  metadata?: Record<string, unknown>;
}) {
  const db = getDb();
  const [event] = await db
    .insert(submissionEvents)
    .values({
      submissionId: data.submissionId,
      actorId: data.actorId,
      action: data.action,
      metadata: data.metadata ?? null,
      createdAt: new Date(),
    })
    .returning();
  return event;
}

export async function listSubmissionEvents(submissionId: string, organizationId: string) {
  const db = getDb();
  const rows = await db
    .select({ event: submissionEvents })
    .from(submissionEvents)
    .innerJoin(submissions, eq(submissionEvents.submissionId, submissions.id))
    .where(
      and(
        eq(submissionEvents.submissionId, submissionId),
        inArray(
          submissions.assignmentId,
          db
            .select({ id: assignments.id })
            .from(assignments)
            .innerJoin(courses, eq(assignments.courseId, courses.id))
            .where(eq(courses.organizationId, organizationId)),
        ),
      ),
    )
    .orderBy(submissionEvents.createdAt);
  return rows.map(({ event }) => event);
}

export async function recordGradeRevision(data: {
  submissionId: string;
  adjustedBy: string | null;
  previousGrade: number | null;
  newGrade: number;
  reason: string;
}) {
  const db = getDb();
  const [revision] = await db
    .insert(submissionGradeRevisions)
    .values({
      submissionId: data.submissionId,
      adjustedBy: data.adjustedBy,
      previousGrade: data.previousGrade,
      newGrade: data.newGrade,
      reason: data.reason,
      createdAt: new Date(),
    })
    .returning();
  return revision;
}

export async function listGradeRevisions(submissionId: string, organizationId: string) {
  const db = getDb();
  const rows = await db
    .select({ revision: submissionGradeRevisions })
    .from(submissionGradeRevisions)
    .innerJoin(submissions, eq(submissionGradeRevisions.submissionId, submissions.id))
    .where(
      and(
        eq(submissionGradeRevisions.submissionId, submissionId),
        inArray(
          submissions.assignmentId,
          db
            .select({ id: assignments.id })
            .from(assignments)
            .innerJoin(courses, eq(assignments.courseId, courses.id))
            .where(eq(courses.organizationId, organizationId)),
        ),
      ),
    )
    .orderBy(submissionGradeRevisions.createdAt);
  return rows.map(({ revision }) => revision);
}
