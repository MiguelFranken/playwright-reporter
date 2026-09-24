CREATE TYPE "public"."run_end_reason" AS ENUM('reporter', 'stale');--> statement-breakpoint
ALTER TYPE "public"."shard_status" ADD VALUE 'incomplete';--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "stale_after_ms" integer DEFAULT 300000 NOT NULL;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "end_reason" "run_end_reason";--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "watchdog_id" text;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "watchdog_claimed_at" timestamp with time zone;--> statement-breakpoint
-- Close runs left `running` by a reporter that died before watchdogs existed.
-- An hour of silence is far past any stale timeout. (Shards keep their status:
-- the new `incomplete` shard value cannot be used in the transaction adding it.)
UPDATE "test_results" SET "outcome" = 'interrupted', "finished_at" = r."last_event_at"
FROM "runs" r
WHERE "test_results"."run_id" = r."id" AND "test_results"."outcome" = 'running'
  AND r."status" = 'running' AND r."last_event_at" < now() - interval '1 hour';--> statement-breakpoint
UPDATE "runs" SET
  "status" = 'incomplete',
  "end_reason" = 'stale',
  "finished_at" = "last_event_at",
  "duration_ms" = least(2147483647, greatest(0, extract(epoch from ("last_event_at" - "started_at")) * 1000))::int
WHERE "status" = 'running' AND "last_event_at" < now() - interval '1 hour';
