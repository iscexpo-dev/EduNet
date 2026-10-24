import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {
  parentChildRelationships,
  users,
  enrollments,
  courses,
  submissions,
  assignments,
  resolveConnectionString,
} from '@edunet/database';
import { and, eq, inArray, isNull } from 'drizzle-orm';

type ParentsDb = ReturnType<typeof drizzle>;

let client: postgres.Sql | null = null;
let database: ParentsDb | null = null;

export function getDb(): ParentsDb {
  if (!database) {
    client = postgres(resolveConnectionString());
    database = drizzle(client);
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

export async function findUserById(id: string) {
  const result = await getDb()
    .select({
      id: users.id,
      role: users.role,
      organizationId: users.organizationId,
      deletedAt: users.deletedAt,
    })
    .from(users)
    .where(and(eq(users.id, id), isNull(users.deletedAt)))
    .limit(1);
  return result[0] || null;
}

// Parent-Child Relationship operations
export async function findParentChildRelationshipById(id: string) {
  const result = await getDb()
    .select()
    .from(parentChildRelationships)
    .where(and(eq(parentChildRelationships.id, id), isNull(parentChildRelationships.deletedAt)))
    .limit(1);
  return result[0] || null;
}

export async function findParentChildRelationship(parentId: string, childId: string) {
  const result = await getDb()
    .select()
    .from(parentChildRelationships)
    .where(
      and(
        eq(parentChildRelationships.parentId, parentId),
        eq(parentChildRelationships.childId, childId),
        isNull(parentChildRelationships.deletedAt),
      ),
    )
    .limit(1);
  return result[0] || null;
}

export async function listChildrenByParent(parentId: string, limit = 50, offset = 0) {
  const relationships = await getDb()
    .select()
    .from(parentChildRelationships)
    .where(
      and(
        eq(parentChildRelationships.parentId, parentId),
        isNull(parentChildRelationships.deletedAt),
      ),
    )
    .limit(limit)
    .offset(offset);

  const childIds = relationships.map((relationship) => relationship.childId);
  if (childIds.length === 0) return [];

  return getDb()
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      role: users.role,
      organizationId: users.organizationId,
      isVerified: users.isVerified,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(and(inArray(users.id, childIds), eq(users.role, 'student'), isNull(users.deletedAt)));
}

export async function listParentsByChild(childId: string, limit = 50, offset = 0) {
  const relationships = await getDb()
    .select()
    .from(parentChildRelationships)
    .where(
      and(
        eq(parentChildRelationships.childId, childId),
        isNull(parentChildRelationships.deletedAt),
      ),
    )
    .limit(limit)
    .offset(offset);

  const parentIds = relationships.map((relationship) => relationship.parentId);
  if (parentIds.length === 0) return [];

  return getDb()
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      role: users.role,
      organizationId: users.organizationId,
      isVerified: users.isVerified,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(and(inArray(users.id, parentIds), eq(users.role, 'parent'), isNull(users.deletedAt)));
}

export async function createParentChildRelationship(
  data: typeof parentChildRelationships.$inferInsert,
) {
  const result = await getDb().insert(parentChildRelationships).values(data).returning();
  return result[0];
}

export async function updateParentChildRelationship(
  id: string,
  data: Partial<typeof parentChildRelationships.$inferInsert>,
) {
  const result = await getDb()
    .update(parentChildRelationships)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(parentChildRelationships.id, id))
    .returning();
  return result[0];
}

export async function deleteParentChildRelationship(id: string) {
  const result = await getDb()
    .delete(parentChildRelationships)
    .where(eq(parentChildRelationships.id, id))
    .returning();
  return result[0];
}

// Child progress and grades for parents
export async function getChildEnrollments(childId: string) {
  return getDb()
    .select({
      enrollmentId: enrollments.id,
      courseId: enrollments.courseId,
      enrolledAt: enrollments.enrolledAt,
      status: enrollments.status,
      courseTitle: courses.title,
      courseSubject: courses.subject,
      courseGrade: courses.grade,
    })
    .from(enrollments)
    .innerJoin(courses, eq(enrollments.courseId, courses.id))
    .where(and(eq(enrollments.studentId, childId), isNull(enrollments.deletedAt)));
}

export async function getChildSubmissions(childId: string) {
  return getDb()
    .select({
      submissionId: submissions.id,
      assignmentId: submissions.assignmentId,
      content: submissions.content,
      submittedAt: submissions.submittedAt,
      grade: submissions.grade,
      gradedAt: submissions.gradedAt,
      assignmentTitle: assignments.title,
      assignmentMaxPoints: assignments.maxPoints,
      assignmentDueDate: assignments.dueDate,
    })
    .from(submissions)
    .innerJoin(assignments, eq(submissions.assignmentId, assignments.id))
    .where(and(eq(submissions.studentId, childId), isNull(submissions.deletedAt)));
}
