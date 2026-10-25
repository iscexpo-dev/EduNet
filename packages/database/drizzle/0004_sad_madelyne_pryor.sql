CREATE TABLE "rate_limit_windows" (
	"key" varchar(200) PRIMARY KEY NOT NULL,
	"window_start" bigint NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "hash" varchar(64);--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "previous_hash" varchar(64);--> statement-breakpoint
CREATE INDEX "rate_limit_windows_expires_idx" ON "rate_limit_windows" USING btree ("expires_at");