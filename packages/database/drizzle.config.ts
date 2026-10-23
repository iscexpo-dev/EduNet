import type { Config } from 'drizzle-kit';

/**
 * Single source of truth for the EduNet schema.
 *
 * Service-owned tables (content, assessments, notifications) are aggregated
 * here so that `drizzle-kit generate` emits one ordered, reproducible
 * migration set. Previously only the 7 core tables were migrated, which left
 * lessons, quizzes and notifications absent from a freshly provisioned
 * database.
 */
export default {
  schema: [
    './src/schema.ts',
    './src/platform-schema.ts',
    '../../services/content/src/schema.ts',
    '../../services/assessments/src/schema.ts',
    '../../services/notifications/src/schema.ts',
  ],
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'edunet',
  },
} satisfies Config;
