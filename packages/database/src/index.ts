import { eq } from 'drizzle-orm';
import { getDb } from './client';
import * as schema from './schema';

export * from './schema';
export * from './platform-schema';
export * from './client';
export * from './rate-limit';

export async function findCourseById(id: string) {
  const result = await getDb()
    .select()
    .from(schema.courses)
    .where(eq(schema.courses.id, id));
  return result[0] || null;
}

export async function findAssignmentById(id: string) {
  const result = await getDb()
    .select()
    .from(schema.assignments)
    .where(eq(schema.assignments.id, id));
  return result[0] || null;
}

export async function findSubmissionById(id: string) {
  const result = await getDb()
    .select()
    .from(schema.submissions)
    .where(eq(schema.submissions.id, id));
  return result[0] || null;
}

export async function findUserById(id: string) {
  const result = await getDb()
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, id));
  return result[0] || null;
}

export async function findOrganizationById(id: string) {
  const result = await getDb()
    .select()
    .from(schema.organizations)
    .where(eq(schema.organizations.id, id));
  return result[0] || null;
}

export * from './readiness';
