import { and, eq, inArray, desc } from 'drizzle-orm';
import { courses, users, resolveConnectionString } from '@edunet/database';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';

type AssessmentDb = ReturnType<typeof drizzle<typeof schema>>;

let client: postgres.Sql | null = null;
let database: AssessmentDb | null = null;

export function getDb(): AssessmentDb {
  if (!database) {
    client = postgres(resolveConnectionString());
    database = drizzle(client, { schema });
  }
  return database;
}

export async function closeDb(): Promise<void> {
  if (client) {
    const activeClient = client;
    client = null;
    database = null;
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

export async function findQuizById(id: string, organizationId: string) {
  const db = getDb();
  const result = await db
    .select({ quiz: schema.quizzes })
    .from(schema.quizzes)
    .innerJoin(courses, eq(schema.quizzes.courseId, courses.id))
    .where(and(eq(schema.quizzes.id, id), eq(courses.organizationId, organizationId)));
  return result[0]?.quiz || null;
}

export async function listQuizzesByCourse(
  courseId: string,
  organizationId: string,
  limit = 50,
  offset = 0
) {
  const db = getDb();
  const result = await db
    .select({ quiz: schema.quizzes })
    .from(schema.quizzes)
    .innerJoin(courses, eq(schema.quizzes.courseId, courses.id))
    .where(and(eq(schema.quizzes.courseId, courseId), eq(courses.organizationId, organizationId)))
    .limit(limit)
    .offset(offset);
  return result.map(({ quiz }) => quiz);
}

export async function createQuiz(data: typeof schema.quizzes.$inferInsert, organizationId: string) {
  const db = getDb();
  const course = await findCourseById(data.courseId!, organizationId);
  if (!course) throw new Error('Course not found in the authenticated organization');
  const result = await db.insert(schema.quizzes).values(data).returning();
  return result[0];
}

export async function updateQuiz(
  id: string,
  organizationId: string,
  data: Partial<typeof schema.quizzes.$inferInsert>
) {
  const db = getDb();
  const result = await db
    .update(schema.quizzes)
    .set({ ...data, updatedAt: new Date() })
    .where(
      and(
        eq(schema.quizzes.id, id),
        inArray(
          schema.quizzes.courseId,
          db
            .select({ id: courses.id })
            .from(courses)
            .where(eq(courses.organizationId, organizationId))
        )
      )
    )
    .returning();
  return result[0];
}

export async function deleteQuiz(id: string, organizationId: string) {
  const db = getDb();
  const result = await db
    .delete(schema.quizzes)
    .where(
      and(
        eq(schema.quizzes.id, id),
        inArray(
          schema.quizzes.courseId,
          db
            .select({ id: courses.id })
            .from(courses)
            .where(eq(courses.organizationId, organizationId))
        )
      )
    )
    .returning();
  return result[0];
}

export async function findQuestionById(id: string, organizationId: string) {
  const db = getDb();
  const result = await db
    .select({ question: schema.questions })
    .from(schema.questions)
    .innerJoin(schema.quizzes, eq(schema.questions.quizId, schema.quizzes.id))
    .innerJoin(courses, eq(schema.quizzes.courseId, courses.id))
    .where(and(eq(schema.questions.id, id), eq(courses.organizationId, organizationId)));
  return result[0]?.question || null;
}

export async function listQuestionsByQuiz(
  quizId: string,
  organizationId: string,
  limit = 100,
  offset = 0
) {
  const db = getDb();
  const result = await db
    .select({ question: schema.questions })
    .from(schema.questions)
    .innerJoin(schema.quizzes, eq(schema.questions.quizId, schema.quizzes.id))
    .innerJoin(courses, eq(schema.quizzes.courseId, courses.id))
    .where(and(eq(schema.questions.quizId, quizId), eq(courses.organizationId, organizationId)))
    .orderBy(schema.questions.order)
    .limit(limit)
    .offset(offset);
  return result.map(({ question }) => question);
}

export async function createQuestion(
  data: typeof schema.questions.$inferInsert,
  organizationId: string
) {
  const db = getDb();
  const quiz = await findQuizById(data.quizId!, organizationId);
  if (!quiz) throw new Error('Quiz not found in the authenticated organization');
  const result = await db.insert(schema.questions).values(data).returning();
  return result[0];
}

export async function updateQuestion(
  id: string,
  organizationId: string,
  data: Partial<typeof schema.questions.$inferInsert>
) {
  const db = getDb();
  const result = await db
    .update(schema.questions)
    .set({ ...data, updatedAt: new Date() })
    .where(
      and(
        eq(schema.questions.id, id),
        inArray(
          schema.questions.quizId,
          db
            .select({ id: schema.quizzes.id })
            .from(schema.quizzes)
            .innerJoin(courses, eq(schema.quizzes.courseId, courses.id))
            .where(eq(courses.organizationId, organizationId))
        )
      )
    )
    .returning();
  return result[0];
}

export async function deleteQuestion(id: string, organizationId: string) {
  const db = getDb();
  const result = await db
    .delete(schema.questions)
    .where(
      and(
        eq(schema.questions.id, id),
        inArray(
          schema.questions.quizId,
          db
            .select({ id: schema.quizzes.id })
            .from(schema.quizzes)
            .innerJoin(courses, eq(schema.quizzes.courseId, courses.id))
            .where(eq(courses.organizationId, organizationId))
        )
      )
    )
    .returning();
  return result[0];
}

export async function findQuizAttemptById(id: string, organizationId: string) {
  const db = getDb();
  const result = await db
    .select({ attempt: schema.quizAttempts })
    .from(schema.quizAttempts)
    .innerJoin(schema.quizzes, eq(schema.quizAttempts.quizId, schema.quizzes.id))
    .innerJoin(courses, eq(schema.quizzes.courseId, courses.id))
    .innerJoin(users, eq(schema.quizAttempts.studentId, users.id))
    .where(
      and(
        eq(schema.quizAttempts.id, id),
        eq(courses.organizationId, organizationId),
        eq(users.organizationId, organizationId)
      )
    );
  return result[0]?.attempt || null;
}

export async function listQuizAttemptsByStudent(
  studentId: string,
  organizationId: string,
  limit = 50,
  offset = 0
) {
  const db = getDb();
  const result = await db
    .select({ attempt: schema.quizAttempts })
    .from(schema.quizAttempts)
    .innerJoin(schema.quizzes, eq(schema.quizAttempts.quizId, schema.quizzes.id))
    .innerJoin(courses, eq(schema.quizzes.courseId, courses.id))
    .innerJoin(users, eq(schema.quizAttempts.studentId, users.id))
    .where(
      and(
        eq(schema.quizAttempts.studentId, studentId),
        eq(courses.organizationId, organizationId),
        eq(users.organizationId, organizationId)
      )
    )
    .orderBy(schema.quizAttempts.startedAt)
    .limit(limit)
    .offset(offset);
  return result.map(({ attempt }) => attempt);
}

export async function listQuizAttemptsByQuiz(
  quizId: string,
  organizationId: string,
  limit = 50,
  offset = 0
) {
  const db = getDb();
  const result = await db
    .select({ attempt: schema.quizAttempts })
    .from(schema.quizAttempts)
    .innerJoin(schema.quizzes, eq(schema.quizAttempts.quizId, schema.quizzes.id))
    .innerJoin(courses, eq(schema.quizzes.courseId, courses.id))
    .innerJoin(users, eq(schema.quizAttempts.studentId, users.id))
    .where(
      and(
        eq(schema.quizAttempts.quizId, quizId),
        eq(courses.organizationId, organizationId),
        eq(users.organizationId, organizationId)
      )
    )
    .orderBy(schema.quizAttempts.startedAt)
    .limit(limit)
    .offset(offset);
  return result.map(({ attempt }) => attempt);
}

export async function createQuizAttempt(
  data: typeof schema.quizAttempts.$inferInsert,
  organizationId: string
) {
  const db = getDb();
  const [target] = await db
    .select({ quizId: schema.quizzes.id })
    .from(schema.quizzes)
    .innerJoin(courses, eq(schema.quizzes.courseId, courses.id))
    .innerJoin(users, eq(users.organizationId, courses.organizationId))
    .where(
      and(
        eq(schema.quizzes.id, data.quizId!),
        eq(courses.organizationId, organizationId),
        eq(users.id, data.studentId!),
        eq(users.role, 'student')
      )
    )
    .limit(1);
  if (!target) throw new Error('Quiz and student must belong to the authenticated organization');
  const result = await db.insert(schema.quizAttempts).values(data).returning();
  return result[0];
}

export async function updateQuizAttempt(
  id: string,
  organizationId: string,
  data: Partial<typeof schema.quizAttempts.$inferInsert>
) {
  const db = getDb();
  const result = await db
    .update(schema.quizAttempts)
    .set({ ...data, updatedAt: new Date() })
    .where(
      and(
        eq(schema.quizAttempts.id, id),
        inArray(
          schema.quizAttempts.quizId,
          db
            .select({ id: schema.quizzes.id })
            .from(schema.quizzes)
            .innerJoin(courses, eq(schema.quizzes.courseId, courses.id))
            .innerJoin(users, eq(users.organizationId, courses.organizationId))
            .where(
              and(
                eq(courses.organizationId, organizationId),
                eq(users.id, schema.quizAttempts.studentId)
              )
            )
        )
      )
    )
    .returning();
  return result[0];
}

export async function deleteQuizAttempt(id: string, organizationId: string) {
  const db = getDb();
  const result = await db
    .delete(schema.quizAttempts)
    .where(
      and(
        eq(schema.quizAttempts.id, id),
        inArray(
          schema.quizAttempts.quizId,
          db
            .select({ id: schema.quizzes.id })
            .from(schema.quizzes)
            .innerJoin(courses, eq(schema.quizzes.courseId, courses.id))
            .innerJoin(users, eq(users.organizationId, courses.organizationId))
            .where(
              and(
                eq(courses.organizationId, organizationId),
                eq(users.id, schema.quizAttempts.studentId)
              )
            )
        )
      )
    )
    .returning();
  return result[0];
}

// ---------------------------------------------------------------------------
// Assessment expansion: question banks, grade revisions, recheck workflow
// ---------------------------------------------------------------------------

export async function listQuestionBanks(organizationId: string, limit = 50, offset = 0) {
  const db = getDb();
  return db
    .select()
    .from(schema.questionBanks)
    .where(and(eq(schema.questionBanks.organizationId, organizationId), eq(schema.questionBanks.isActive, 'true')))
    .orderBy(desc(schema.questionBanks.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function findQuestionBankById(id: string, organizationId: string) {
  const db = getDb();
  const [bank] = await db
    .select()
    .from(schema.questionBanks)
    .where(and(eq(schema.questionBanks.id, id), eq(schema.questionBanks.organizationId, organizationId)))
    .limit(1);
  return bank ?? null;
}

export async function createQuestionBank(data: {
  organizationId: string;
  name: string;
  subject?: string;
  createdBy: string;
}) {
  const db = getDb();
  const [bank] = await db
    .insert(schema.questionBanks)
    .values({
      organizationId: data.organizationId,
      name: data.name,
      subject: data.subject ?? null,
      createdBy: data.createdBy,
      isActive: 'true',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();
  return bank;
}

export async function updateQuestionBank(
  id: string,
  organizationId: string,
  data: { name?: string; subject?: string; isActive?: string },
) {
  const db = getDb();
  const [bank] = await db
    .update(schema.questionBanks)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(schema.questionBanks.id, id), eq(schema.questionBanks.organizationId, organizationId)))
    .returning();
  return bank ?? null;
}

export async function listQuestionsByBank(bankId: string, organizationId: string, limit = 200, offset = 0) {
  const db = getDb();
  const result = await db
    .select({ question: schema.questions })
    .from(schema.questions)
    .innerJoin(schema.quizzes, eq(schema.questions.quizId, schema.quizzes.id))
    .innerJoin(courses, eq(schema.quizzes.courseId, courses.id))
    .where(
      and(
        eq(schema.questions.metadata, schema.questions.metadata), // no-op placeholder
        eq(courses.organizationId, organizationId),
      ),
    )
    .limit(limit)
    .offset(offset);
  void bankId;
  return result.map(({ question }) => question).filter((question) => {
    const metadata = question.metadata as { bankId?: string } | null;
    return metadata?.bankId === bankId;
  });
}

export async function attachQuestionsToBank(questionIds: string[], bankId: string, organizationId: string) {
  const db = getDb();
  // Preserve tenant boundary: only questions belonging to quizzes in this org.
  const quizzesInOrg = db
    .select({ id: schema.quizzes.id })
    .from(schema.quizzes)
    .innerJoin(courses, eq(schema.quizzes.courseId, courses.id))
    .where(eq(courses.organizationId, organizationId));
  const updated = await db
    .update(schema.questions)
    .set({
      metadata: { bankId },
      updatedAt: new Date(),
    })
    .where(and(inArray(schema.questions.id, questionIds), inArray(schema.questions.quizId, quizzesInOrg)))
    .returning();
  return updated;
}

export async function recordGradeRevision(data: {
  attemptId: string;
  adjustedBy: string;
  previousScorePercent: number | null;
  newScorePercent: number;
  prevEarnedPoints?: string | null;
  newEarnedPoints: string;
  reason: string;
  source: string;
}) {
  const db = getDb();
  const [revision] = await db
    .insert(schema.gradeRevisions)
    .values({
      attemptId: data.attemptId,
      adjustedBy: data.adjustedBy,
      previousScorePercent: data.previousScorePercent,
      newScorePercent: data.newScorePercent,
      prevEarnedPoints: data.prevEarnedPoints ?? null,
      newEarnedPoints: data.newEarnedPoints,
      reason: data.reason,
      source: data.source,
      createdAt: new Date(),
    })
    .returning();
  return revision;
}

export async function listGradeRevisions(attemptId: string, organizationId: string) {
  const db = getDb();
  // Tenant scope: only attempts of quizzes in this org.
  const rows = await db
    .select({ revision: schema.gradeRevisions })
    .from(schema.gradeRevisions)
    .innerJoin(schema.quizAttempts, eq(schema.gradeRevisions.attemptId, schema.quizAttempts.id))
    .where(
      and(
        eq(schema.gradeRevisions.attemptId, attemptId),
        inArray(
          schema.quizAttempts.quizId,
          db
            .select({ id: schema.quizzes.id })
            .from(schema.quizzes)
            .innerJoin(courses, eq(schema.quizzes.courseId, courses.id))
            .where(eq(courses.organizationId, organizationId)),
        ),
      ),
    )
    .orderBy(desc(schema.gradeRevisions.createdAt));
  return rows.map(({ revision }) => revision);
}

export async function createRecheckRequest(data: {
  attemptId: string;
  studentId: string;
  questionId?: string;
  reason: string;
}) {
  const db = getDb();
  const [request] = await db
    .insert(schema.recheckRequests)
    .values({
      attemptId: data.attemptId,
      studentId: data.studentId,
      questionId: data.questionId ?? null,
      reason: data.reason,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();
  return request;
}

export async function findRecheckRequestById(id: string, organizationId: string) {
  const db = getDb();
  const [request] = await db
    .select({ request: schema.recheckRequests })
    .from(schema.recheckRequests)
    .innerJoin(
      schema.quizAttempts,
      eq(schema.recheckRequests.attemptId, schema.quizAttempts.id),
    )
    .where(
      and(
        eq(schema.recheckRequests.id, id),
        inArray(
          schema.quizAttempts.quizId,
          db
            .select({ id: schema.quizzes.id })
            .from(schema.quizzes)
            .innerJoin(courses, eq(schema.quizzes.courseId, courses.id))
            .where(eq(courses.organizationId, organizationId)),
        ),
      ),
    )
    .limit(1);
  return request?.request ?? null;
}

export async function decideRecheckRequest(data: {
  id: string;
  decidedBy: string;
  status: 'approved' | 'rejected';
  decisionNote?: string;
}) {
  const db = getDb();
  const [request] = await db
    .update(schema.recheckRequests)
    .set({
      status: data.status,
      decidedBy: data.decidedBy,
      decisionNote: data.decisionNote ?? null,
      decidedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.recheckRequests.id, data.id))
    .returning();
  return request ?? null;
}

export async function listRecheckRequests(
  organizationId: string,
  status: string | undefined,
  limit = 50,
  offset = 0,
) {
  const db = getDb();
  const conditions = [
    inArray(
      schema.recheckRequests.attemptId,
      db
        .select({ id: schema.quizAttempts.id })
        .from(schema.quizAttempts)
        .innerJoin(
          schema.quizzes,
          eq(schema.quizAttempts.quizId, schema.quizzes.id),
        )
        .innerJoin(courses, eq(schema.quizzes.courseId, courses.id))
        .where(eq(courses.organizationId, organizationId)),
    ),
  ];
  if (status) conditions.push(eq(schema.recheckRequests.status, status));
  return db
    .select()
    .from(schema.recheckRequests)
    .where(and(...conditions))
    .orderBy(desc(schema.recheckRequests.createdAt))
    .limit(limit)
    .offset(offset);
}
