-- Enable the pg_trgm extension for trigram-based fuzzy search.
-- This extension must be available in the target PostgreSQL database before
-- applying this migration. It is intentionally opt-in: the search service
-- only uses trigram matching when SEARCH_USE_TRIGRAM=true and this migration
-- has been applied. Until query plans justify it, search falls back to the
-- existing normalized LIKE relevance scoring.
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "courses_title_trgm_idx" ON "courses" USING gin ("title" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "courses_subject_trgm_idx" ON "courses" USING gin ("subject" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "courses_description_trgm_idx" ON "courses" USING gin ("description" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_first_name_trgm_idx" ON "users" USING gin ("first_name" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_last_name_trgm_idx" ON "users" USING gin ("last_name" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_email_trgm_idx" ON "users" USING gin ("email" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assignments_title_trgm_idx" ON "assignments" USING gin ("title" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "organizations_name_trgm_idx" ON "organizations" USING gin ("name" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "organizations_code_trgm_idx" ON "organizations" USING gin ("code" gin_trgm_ops);
