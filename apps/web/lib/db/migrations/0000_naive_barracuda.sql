CREATE TYPE "public"."attachment_kind" AS ENUM('screenshot', 'video', 'trace', 'image', 'text', 'other');--> statement-breakpoint
CREATE TYPE "public"."attachment_status" AS ENUM('pending', 'uploaded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."attempt_status" AS ENUM('passed', 'failed', 'timedOut', 'skipped', 'interrupted');--> statement-breakpoint
CREATE TYPE "public"."executor" AS ENUM('ci', 'local');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('running', 'passed', 'failed', 'timedout', 'interrupted', 'incomplete');--> statement-breakpoint
CREATE TYPE "public"."shard_status" AS ENUM('running', 'passed', 'failed', 'timedout', 'interrupted');--> statement-breakpoint
CREATE TYPE "public"."test_outcome" AS ENUM('running', 'passed', 'failed', 'flaky', 'skipped', 'timedout', 'interrupted');--> statement-breakpoint
CREATE TABLE "api_tokens" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"token_prefix" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "api_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"attempt_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"name" text NOT NULL,
	"content_type" text NOT NULL,
	"kind" "attachment_kind" DEFAULT 'other' NOT NULL,
	"storage_key" text NOT NULL,
	"storage_driver" text NOT NULL,
	"size_bytes" integer,
	"status" "attachment_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"run_counter" integer DEFAULT 0 NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "run_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "run_shards" (
	"run_id" uuid NOT NULL,
	"shard_index" integer NOT NULL,
	"status" "shard_status" DEFAULT 'running' NOT NULL,
	"last_seq" integer DEFAULT -1 NOT NULL,
	"expected_tests" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"duration_ms" integer,
	"hostname" text,
	CONSTRAINT "run_shards_run_id_shard_index_pk" PRIMARY KEY("run_id","shard_index")
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"ci_run_id" text NOT NULL,
	"status" "run_status" DEFAULT 'running' NOT NULL,
	"executor" "executor" DEFAULT 'local' NOT NULL,
	"environment" text,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"duration_ms" integer,
	"expected_tests" integer DEFAULT 0 NOT NULL,
	"shard_total" integer DEFAULT 1 NOT NULL,
	"git_branch" text,
	"git_sha" text,
	"git_short_sha" text,
	"git_message" text,
	"git_author_name" text,
	"git_author_email" text,
	"git_repo_url" text,
	"pr_number" integer,
	"pr_url" text,
	"ci_provider" text,
	"ci_build_url" text,
	"ci_job" text,
	"ci_build_number" text,
	"git" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ci" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"system" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"playwright" jsonb DEFAULT '{"projects":[]}'::jsonb NOT NULL,
	"last_event_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "test_attempts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"test_result_id" uuid NOT NULL,
	"retry" integer NOT NULL,
	"status" "attempt_status" NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"worker_index" integer DEFAULT 0 NOT NULL,
	"parallel_index" integer DEFAULT 0 NOT NULL,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"stdout" text DEFAULT '' NOT NULL,
	"stderr" text DEFAULT '' NOT NULL,
	"annotations" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "test_results" (
	"id" uuid PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"test_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"shard_index" integer DEFAULT 0 NOT NULL,
	"outcome" "test_outcome" DEFAULT 'running' NOT NULL,
	"expected_status" "attempt_status" DEFAULT 'passed' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"line" integer DEFAULT 0 NOT NULL,
	"column" integer DEFAULT 0 NOT NULL,
	"annotations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"error_signature" text,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "tests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"test_key" text NOT NULL,
	"pw_test_id" text,
	"file" text NOT NULL,
	"title" text NOT NULL,
	"title_path" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pw_project" text DEFAULT '' NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_attempt_id_test_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."test_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_events" ADD CONSTRAINT "run_events_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_events" ADD CONSTRAINT "run_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_shards" ADD CONSTRAINT "run_shards_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_attempts" ADD CONSTRAINT "test_attempts_test_result_id_test_results_id_fk" FOREIGN KEY ("test_result_id") REFERENCES "public"."test_results"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_results" ADD CONSTRAINT "test_results_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_results" ADD CONSTRAINT "test_results_test_id_tests_id_fk" FOREIGN KEY ("test_id") REFERENCES "public"."tests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_results" ADD CONSTRAINT "test_results_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tests" ADD CONSTRAINT "tests_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attachments_attempt_idx" ON "attachments" USING btree ("attempt_id");--> statement-breakpoint
CREATE INDEX "attachments_run_idx" ON "attachments" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "run_events_run_idx" ON "run_events" USING btree ("run_id","id");--> statement-breakpoint
CREATE INDEX "run_events_project_idx" ON "run_events" USING btree ("project_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "runs_project_number_idx" ON "runs" USING btree ("project_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "runs_project_ci_run_idx" ON "runs" USING btree ("project_id","ci_run_id");--> statement-breakpoint
CREATE INDEX "runs_project_started_idx" ON "runs" USING btree ("project_id","started_at");--> statement-breakpoint
CREATE INDEX "runs_project_branch_idx" ON "runs" USING btree ("project_id","git_branch");--> statement-breakpoint
CREATE INDEX "runs_project_status_idx" ON "runs" USING btree ("project_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "test_attempts_result_retry_idx" ON "test_attempts" USING btree ("test_result_id","retry");--> statement-breakpoint
CREATE UNIQUE INDEX "test_results_run_test_idx" ON "test_results" USING btree ("run_id","test_id");--> statement-breakpoint
CREATE INDEX "test_results_test_started_idx" ON "test_results" USING btree ("test_id","started_at");--> statement-breakpoint
CREATE INDEX "test_results_run_outcome_idx" ON "test_results" USING btree ("run_id","outcome");--> statement-breakpoint
CREATE INDEX "test_results_run_signature_idx" ON "test_results" USING btree ("run_id","error_signature");--> statement-breakpoint
CREATE INDEX "test_results_project_started_idx" ON "test_results" USING btree ("project_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tests_project_key_idx" ON "tests" USING btree ("project_id","test_key");--> statement-breakpoint
CREATE INDEX "tests_project_file_idx" ON "tests" USING btree ("project_id","file");