import { drizzle } from 'drizzle-orm/postgres-js';
import { courses, enrollments, users } from '@edunet/database';
import { eq, and, isNull } from 'drizzle-orm';
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

export async function listCoursesByOrganization(
  organizationId: string,
  limit = 50,
  offset = 0,
  activeOnly = false,
) {
  const db = getDb();
  return db
    .select()
    .from(courses)
    .where(
      and(
        eq(courses.organizationId, organizationId),
        activeOnly ? eq(courses.isActive, true) : undefined,
        activeOnly ? isNull(courses.deletedAt) : undefined,
      ),
    )
    .limit(limit)
    .offset(offset);
}

export async function listCoursesByTeacher(
  organizationId: string,
  teacherId: string,
  limit = 50,
  offset = 0,
  activeOnly = false,
) {
  const db = getDb();
  return db
    .select()
    .from(courses)
    .where(
      and(
        eq(courses.organizationId, organizationId),
        eq(courses.teacherId, teacherId),
        activeOnly ? eq(courses.isActive, true) : undefined,
        activeOnly ? isNull(courses.deletedAt) : undefined,
      ),
    )
    .limit(limit)
    .offset(offset);
}

export async function createCourse(data: {
  organizationId: string;
  title: string;
  description: string;
  subject: string;
  grade?: string;
  teacherId: string;
}) {
  const db = getDb();
  const [teacher] = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.id, data.teacherId),
        eq(users.organizationId, data.organizationId),
        eq(users.role, 'teacher')
      )
    )
    .limit(1);
  if (!teacher) {
    throw new Error('Course teacher must belong to the authenticated organization');
  }

  const [course] = await db
    .insert(courses)
    .values({
      id: crypto.randomUUID(),
      organizationId: data.organizationId,
      title: data.title,
      description: data.description,
      subject: data.subject,
      grade: data.grade,
      teacherId: data.teacherId,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();
  return course;
}

export async function updateCourse(
  id: string,
  organizationId: string,
  data: {
    title?: string;
    description?: string;
    subject?: string;
    grade?: string;
    isActive?: boolean;
  }
) {
  const db = getDb();
  const [course] = await db
    .update(courses)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(and(eq(courses.id, id), eq(courses.organizationId, organizationId)))
    .returning();
  return course;
}

export async function deleteCourse(id: string, organizationId: string) {
  const db = getDb();
  const [course] = await db
    .delete(courses)
    .where(and(eq(courses.id, id), eq(courses.organizationId, organizationId)))
    .returning();
  return course;
}

export async function getCourseEnrollmentCount(courseId: string, organizationId: string) {
  const db = getDb();
  const result = await db
    .select({ id: enrollments.id })
    .from(enrollments)
    .innerJoin(courses, eq(enrollments.courseId, courses.id))
    .where(and(eq(courses.id, courseId), eq(courses.organizationId, organizationId)));
  return result.length;
}
