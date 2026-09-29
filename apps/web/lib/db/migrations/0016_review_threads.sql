CREATE TYPE "public"."comment_source" AS ENUM('app', 'mcp', 'api');--> statement-breakpoint
CREATE TYPE "public"."review_anchor_kind" AS ENUM('point', 'area', 'image');--> statement-breakpoint
CREATE TYPE "public"."review_comment_kind" AS ENUM('comment', 'resolved', 'reopened');--> statement-breakpoint
CREATE TYPE "public"."review_thread_status" AS ENUM('open', 'resolved');--> statement-breakpoint
CREATE TABLE "review_comments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"thread_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" uuid,
	"kind" "review_comment_kind" DEFAULT 'comment' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"source" "comment_source" DEFAULT 'app' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "review_threads" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"test_id" uuid NOT NULL,
	"checkpoint_name" text NOT NULL,
	"variant" text NOT NULL,
	"number" integer NOT NULL,
	"origin_capture_id" uuid,
	"origin_run_id" uuid,
	"origin_sha256" text,
	"origin_width" integer NOT NULL,
	"origin_height" integer NOT NULL,
	"origin_scale" real,
	"anchor" "review_anchor_kind" NOT NULL,
	"x" real DEFAULT 0 NOT NULL,
	"y" real DEFAULT 0 NOT NULL,
	"w" real,
	"h" real,
	"status" "review_thread_status" DEFAULT 'open' NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid,
	"resolved_capture_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_threads_area_check" CHECK ("review_threads"."anchor" <> 'area' or ("review_threads"."w" is not null and "review_threads"."h" is not null))
);
--> statement-breakpoint
ALTER TABLE "review_comments" ADD CONSTRAINT "review_comments_thread_id_review_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."review_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_comments" ADD CONSTRAINT "review_comments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_comments" ADD CONSTRAINT "review_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_threads" ADD CONSTRAINT "review_threads_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_threads" ADD CONSTRAINT "review_threads_test_id_tests_id_fk" FOREIGN KEY ("test_id") REFERENCES "public"."tests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_threads" ADD CONSTRAINT "review_threads_origin_capture_id_review_captures_id_fk" FOREIGN KEY ("origin_capture_id") REFERENCES "public"."review_captures"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_threads" ADD CONSTRAINT "review_threads_origin_run_id_runs_id_fk" FOREIGN KEY ("origin_run_id") REFERENCES "public"."runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_threads" ADD CONSTRAINT "review_threads_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_threads" ADD CONSTRAINT "review_threads_resolved_capture_id_review_captures_id_fk" FOREIGN KEY ("resolved_capture_id") REFERENCES "public"."review_captures"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_threads" ADD CONSTRAINT "review_threads_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "review_comments_thread_idx" ON "review_comments" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "review_threads_number_idx" ON "review_threads" USING btree ("test_id","checkpoint_name","variant","number");--> statement-breakpoint
CREATE INDEX "review_threads_identity_idx" ON "review_threads" USING btree ("test_id","checkpoint_name","variant","status");--> statement-breakpoint
CREATE INDEX "review_threads_project_idx" ON "review_threads" USING btree ("project_id","status","last_activity_at");--> statement-breakpoint
CREATE INDEX "review_threads_origin_capture_idx" ON "review_threads" USING btree ("origin_capture_id");--> statement-breakpoint
CREATE INDEX "review_threads_resolved_capture_idx" ON "review_threads" USING btree ("resolved_capture_id");--> statement-breakpoint
-- Change requests written before threads existed become whole-image threads, one per image and comment
-- (a decision about several captures copied its comment onto each). The thread takes the decision's id,
-- so its opening comment can be found again; a later approval of the image resolves it.
INSERT INTO "review_threads" ("id", "project_id", "test_id", "checkpoint_name", "variant", "number", "origin_capture_id", "origin_run_id", "origin_sha256", "origin_width", "origin_height", "origin_scale", "anchor", "status", "resolved_at", "created_by", "created_at", "last_activity_at")
SELECT src."id", src."project_id", src."test_id", src."checkpoint_name", src."variant",
  row_number() OVER (PARTITION BY src."test_id", src."checkpoint_name", src."variant" ORDER BY src."created_at", src."id"),
  src."capture_id", src."run_id", src."sha256", coalesce(c."width", 1), coalesce(c."height", 1), c."device_scale_factor", 'image',
  CASE WHEN approval."created_at" IS NULL THEN 'open' ELSE 'resolved' END::"review_thread_status",
  approval."created_at", src."user_id", src."created_at", coalesce(approval."created_at", src."created_at")
FROM (
  SELECT DISTINCT ON (d."test_id", d."checkpoint_name", d."variant", d."comment") d.*
  FROM "review_decisions" d
  WHERE d."decision" = 'changes_requested' AND d."comment" IS NOT NULL AND btrim(d."comment") <> ''
  ORDER BY d."test_id", d."checkpoint_name", d."variant", d."comment", d."created_at", d."id"
) src
LEFT JOIN "review_captures" c ON c."id" = src."capture_id"
LEFT JOIN LATERAL (
  SELECT a."created_at" FROM "review_decisions" a
  WHERE a."test_id" = src."test_id" AND a."checkpoint_name" = src."checkpoint_name" AND a."variant" = src."variant"
    AND a."decision" = 'approved' AND a."source" = 'human' AND a."created_at" > src."created_at"
  ORDER BY a."created_at" LIMIT 1
) approval ON true;--> statement-breakpoint
INSERT INTO "review_comments" ("id", "thread_id", "project_id", "user_id", "kind", "body", "source", "created_at")
SELECT gen_random_uuid(), t."id", t."project_id", d."user_id", 'comment', btrim(d."comment"), 'app', d."created_at"
FROM "review_threads" t
JOIN "review_decisions" d ON d."id" = t."id";
