import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq } from 'drizzle-orm';
import * as schema from './schema';

export * from './schema';
export * from './platform-schema';

type Database = ReturnType<typeof drizzle<typeof schema>>;

/**
 * Resolves the connection string, failing loudly instead of silently building
 * `postgres://undefined:undefined@undefined:undefined/undefined`.
 */
export function resolveConnectionString(): string {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const { DB_USER, DB_PASSWORD, DB_HOST, DB_PORT, DB_NAME } = process.env;
  const missing = Object.entries({ DB_USER, DB_PASSWORD, DB_HOST, DB_PORT, DB_NAME })
    .filter(([, value]) => value === undefined || value === '')
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(
      `Database is not configured: set DATABASE_URL or all of ${missing.join(', ')}`,
    );
  }

  return `postgres://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}`;
}

let client: postgres.Sql | null = null;
let database: Database | null = null;

/**
 * Lazily creates the shared client.
 *
 * Connection setup must not happen at import time: schema modules are imported
 * by drizzle-kit and by tooling without a database, and eagerly opening a
 * client made `import '@edunet/database'` crash whenever the env was absent.
 */
export function getDb(): Database {
  if (!database) {
    client = postgres(resolveConnectionString());
    database = drizzle(client, { schema });
  }
  return database;
}

/** Close the shared connection, primarily for integration-test teardown. */
export async function closeDb(): Promise<void> {
  if (client) {
    const activeClient = client;
    client = null;
    database = null;
    await activeClient.end();
  }
}

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
