#!/usr/bin/env node
/**
 * Validates the migration set without modifying any database.
 *
 * Static checks always run: journal/file consistency and non-empty SQL.
 * When DATABASE_URL (or the DB_* variables) is configured, the applied
 * migration count and latest timestamp are compared with the journal so a
 * release cannot start against a database with pending migrations.
 *
 * The script never prints credentials.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = resolve(process.env.MIGRATIONS_DIR || join(here, '..', 'drizzle'));
const journalPath = join(migrationsDir, 'meta', '_journal.json');

function fail(message) {
  console.error(`migration check: ${message}`);
  process.exit(1);
}

if (!existsSync(journalPath)) fail(`journal not found at ${journalPath}`);

let journal;
try {
  journal = JSON.parse(readFileSync(journalPath, 'utf8'));
} catch (error) {
  fail(`journal is not valid JSON: ${error.message}`);
}

if (!Array.isArray(journal.entries) || journal.entries.length === 0) {
  fail('journal has no migration entries');
}

const sqlFiles = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort();
const expected = journal.entries.map((entry) => `${entry.tag}.sql`);
const problems = [];

for (const [index, entry] of journal.entries.entries()) {
  if (entry.idx !== index) problems.push(`entry ${entry.tag} has idx ${entry.idx}, expected ${index}`);
  if (!entry.tag) problems.push(`entry at index ${index} has no tag`);
  if (typeof entry.when !== 'number' || !Number.isFinite(entry.when)) {
    problems.push(`entry ${entry.tag} has an invalid timestamp`);
  }
  const file = join(migrationsDir, `${entry.tag}.sql`);
  if (!existsSync(file)) {
    problems.push(`missing SQL file for ${entry.tag}`);
    continue;
  }
  const sql = readFileSync(file, 'utf8');
  if (sql.trim().length === 0) problems.push(`${entry.tag}.sql is empty`);
}

for (const file of sqlFiles) {
  if (!expected.includes(file)) problems.push(`orphan SQL file not present in journal: ${file}`);
}

if (problems.length > 0) {
  console.error('migration check: static validation failed');
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

const manifest = journal.entries.map((entry) => {
  const sql = readFileSync(join(migrationsDir, `${entry.tag}.sql`));
  return {
    idx: entry.idx,
    tag: entry.tag,
    when: entry.when,
    sha256: createHash('sha256').update(sql).digest('hex'),
  };
});

const latest = manifest[manifest.length - 1];
console.log(
  `migration check: ${manifest.length} migrations consistent (latest ${latest.tag})`,
);

const databaseUrl = process.env.DATABASE_URL?.trim();
const dbConfigured = Boolean(databaseUrl) || Boolean(process.env.DB_HOST?.trim());

if (!dbConfigured) {
  console.log('migration check: live database check SKIPPED (no DATABASE_URL or DB_HOST)');
  process.exit(0);
}

let postgres;
try {
  ({ default: postgres } = await import('postgres'));
} catch {
  console.log('migration check: live database check SKIPPED (postgres driver unavailable)');
  process.exit(0);
}

const connection = databaseUrl
  ? databaseUrl
  : `postgres://${encodeURIComponent(process.env.DB_USER || '')}:${encodeURIComponent(
      process.env.DB_PASSWORD || '',
    )}@${process.env.DB_HOST}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME || 'edunet'}`;

let sql;
try {
  sql = postgres(connection, { max: 1, connect_timeout: 10, idle_timeout: 2 });
  const rows = await sql`
    select id, hash, created_at
    from drizzle.__drizzle_migrations
    order by id asc
  `;
  const applied = rows.length;
  if (applied < manifest.length) {
    fail(`database has ${applied} applied migrations but ${manifest.length} are defined`);
  }
  const latestApplied = Number(rows[rows.length - 1]?.created_at ?? 0);
  if (latestApplied < latest.when) {
    fail(`database is missing the latest migration ${latest.tag}`);
  }
  console.log(`migration check: database is current (${applied} applied migrations)`);
} catch (error) {
  fail(`live database check failed: ${error instanceof Error ? error.message : String(error)}`);
} finally {
  await sql?.end({ timeout: 2 }).catch(() => undefined);
}
