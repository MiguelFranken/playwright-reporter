CREATE TYPE "public"."review_decision" AS ENUM('approved', 'changes_requested');--> statement-breakpoint
CREATE TABLE "review_captures" (
	"id" uuid PRIMARY KEY NOT NULL,
	"checkpoint_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"test_id" uuid NOT NULL,
	"checkpoint_name" text NOT NULL,
	"variant" text NOT NULL,
	"attachment_id" uuid NOT NULL,
	"thumbnail_attachment_id" uuid,
	"viewport_width" integer,
	"viewport_height" integer,
	"device_scale_factor" real,
	"is_mobile" boolean,
	"full_page" boolean,
	"width" integer,
	"height" integer,
	"sha256" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_checkpoints" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"test_result_id" uuid NOT NULL,
	"attempt_id" uuid NOT NULL,
	"test_id" uuid NOT NULL,
	"name" text NOT NULL,
	"title" text,
	"description" text,
	"sequence" integer NOT NULL,
	"kind" text,
	"flow" text,
	"step_path" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"url" text,
	"page_title" text,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"captured_at" timestamp with time zone,
	"offset_ms" integer,
	"source" text DEFAULT 'record' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_decisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"test_id" uuid NOT NULL,
	"checkpoint_name" text NOT NULL,
	"variant" text NOT NULL,
	"sha256" text,
	"capture_id" uuid,
	"run_id" uuid,
	"decision" "review_decision" NOT NULL,
	"comment" text,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "ordinal" integer;--> statement-breakpoint
ALTER TABLE "review_captures" ADD CONSTRAINT "review_captures_checkpoint_id_review_checkpoints_id_fk" FOREIGN KEY ("checkpoint_id") REFERENCES "public"."review_checkpoints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_captures" ADD CONSTRAINT "review_captures_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_captures" ADD CONSTRAINT "review_captures_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_captures" ADD CONSTRAINT "review_captures_test_id_tests_id_fk" FOREIGN KEY ("test_id") REFERENCES "public"."tests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_captures" ADD CONSTRAINT "review_captures_attachment_id_attachments_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "public"."attachments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_captures" ADD CONSTRAINT "review_captures_thumbnail_attachment_id_attachments_id_fk" FOREIGN KEY ("thumbnail_attachment_id") REFERENCES "public"."attachments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_checkpoints" ADD CONSTRAINT "review_checkpoints_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_checkpoints" ADD CONSTRAINT "review_checkpoints_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_checkpoints" ADD CONSTRAINT "review_checkpoints_test_result_id_test_results_id_fk" FOREIGN KEY ("test_result_id") REFERENCES "public"."test_results"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_checkpoints" ADD CONSTRAINT "review_checkpoints_attempt_id_test_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."test_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_checkpoints" ADD CONSTRAINT "review_checkpoints_test_id_tests_id_fk" FOREIGN KEY ("test_id") REFERENCES "public"."tests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_decisions" ADD CONSTRAINT "review_decisions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_decisions" ADD CONSTRAINT "review_decisions_test_id_tests_id_fk" FOREIGN KEY ("test_id") REFERENCES "public"."tests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_decisions" ADD CONSTRAINT "review_decisions_capture_id_review_captures_id_fk" FOREIGN KEY ("capture_id") REFERENCES "public"."review_captures"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_decisions" ADD CONSTRAINT "review_decisions_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_decisions" ADD CONSTRAINT "review_decisions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "review_captures_attachment_idx" ON "review_captures" USING btree ("attachment_id");--> statement-breakpoint
CREATE INDEX "review_captures_checkpoint_idx" ON "review_captures" USING btree ("checkpoint_id");--> statement-breakpoint
CREATE INDEX "review_captures_identity_idx" ON "review_captures" USING btree ("test_id","checkpoint_name","variant","created_at");--> statement-breakpoint
CREATE INDEX "review_captures_run_idx" ON "review_captures" USING btree ("run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "review_checkpoints_attempt_name_idx" ON "review_checkpoints" USING btree ("attempt_id","name");--> statement-breakpoint
CREATE INDEX "review_checkpoints_run_idx" ON "review_checkpoints" USING btree ("run_id","test_result_id","sequence");--> statement-breakpoint
CREATE INDEX "review_checkpoints_test_name_idx" ON "review_checkpoints" USING btree ("test_id","name");--> statement-breakpoint
CREATE INDEX "review_decisions_identity_idx" ON "review_decisions" USING btree ("test_id","checkpoint_name","variant","created_at");--> statement-breakpoint
CREATE INDEX "review_decisions_project_idx" ON "review_decisions" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "review_decisions_capture_idx" ON "review_decisions" USING btree ("capture_id");--> statement-breakpoint
-- Backfill: runs ingested before checkpoints existed already hold review
-- screenshots named `review:<name>:<variant>`. Their order within an attempt
-- was never recorded (the rows share `created_at`), so it is approximated.
WITH legacy AS (
  SELECT a.id AS attachment_id, a.attempt_id, a.created_at, substr(a.name, 8) AS rest
  FROM attachments a
  WHERE a.name LIKE 'review:%' AND a.content_type LIKE 'image/%' AND a.name NOT LIKE '%:thumb'
),
parsed AS (
  SELECT attachment_id, attempt_id, created_at,
    CASE WHEN position(':' in rest) > 0 THEN regexp_replace(rest, ':[^:]*$', '') ELSE rest END AS cp_name,
    CASE WHEN position(':' in rest) > 0 THEN substring(rest from '[^:]*$') ELSE 'default' END AS variant
  FROM legacy
),
cps AS (
  SELECT attempt_id, cp_name, min(created_at) AS created_at, min(attachment_id::text) AS first_id
  FROM parsed WHERE cp_name <> '' AND variant <> ''
  GROUP BY attempt_id, cp_name
),
ins AS (
  INSERT INTO "review_checkpoints" ("id", "project_id", "run_id", "test_result_id", "attempt_id", "test_id", "name", "sequence", "source", "created_at")
  SELECT gen_random_uuid(), r.project_id, tr.run_id, tr.id, cps.attempt_id, tr.test_id, cps.cp_name,
    (row_number() OVER (PARTITION BY cps.attempt_id ORDER BY cps.created_at, cps.first_id) - 1)::int, 'legacy', cps.created_at
  FROM cps
  JOIN test_attempts ta ON ta.id = cps.attempt_id
  JOIN test_results tr ON tr.id = ta.test_result_id
  JOIN runs r ON r.id = tr.run_id
  RETURNING "id", "attempt_id", "name", "project_id", "run_id", "test_id"
)
INSERT INTO "review_captures" ("id", "checkpoint_id", "project_id", "run_id", "test_id", "checkpoint_name", "variant", "attachment_id", "created_at")
SELECT DISTINCT ON (ins.id, p.variant) gen_random_uuid(), ins.id, ins.project_id, ins.run_id, ins.test_id, ins.name, p.variant, p.attachment_id, p.created_at
FROM ins JOIN parsed p ON p.attempt_id = ins.attempt_id AND p.cp_name = ins.name
ORDER BY ins.id, p.variant, p.attachment_id;
