CREATE TABLE "review_ignore_revisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"test_id" uuid NOT NULL,
	"checkpoint_name" text NOT NULL,
	"variant" text NOT NULL,
	"revision" integer NOT NULL,
	"rules" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reason" text,
	"source" text DEFAULT 'app' NOT NULL,
	"changed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_budget_periods" (
	"id" uuid PRIMARY KEY NOT NULL,
	"team_id" uuid NOT NULL,
	"project_id" uuid,
	"period" text NOT NULL,
	"spent_micro_usd" bigint DEFAULT 0 NOT NULL,
	"reserved_micro_usd" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_usage_ledger" (
	"id" uuid PRIMARY KEY NOT NULL,
	"team_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"period" text NOT NULL,
	"kind" text NOT NULL,
	"micro_usd" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "visual_analysis_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"base_capture_id" uuid NOT NULL,
	"head_capture_id" uuid NOT NULL,
	"revision" text NOT NULL,
	"region_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"purpose" text DEFAULT 'suggest_ignore' NOT NULL,
	"input_fingerprint" text NOT NULL,
	"idempotency_key" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"trigger" text DEFAULT 'manual' NOT NULL,
	"model" text NOT NULL,
	"provider" text,
	"prompt_version" text NOT NULL,
	"schema_version" text NOT NULL,
	"price_version" text NOT NULL,
	"reserved_micro_usd" bigint DEFAULT 0 NOT NULL,
	"actual_micro_usd" bigint,
	"usage" jsonb,
	"summary" text,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"claimed_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "visual_analysis_suggestions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"job_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"region_id" text NOT NULL,
	"region_label" text NOT NULL,
	"observation" text NOT NULL,
	"hypothesis" text NOT NULL,
	"alternatives" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"recommendation" text NOT NULL,
	"uncertainty" text NOT NULL,
	"proposed_rects" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"effect" jsonb,
	"decision" text DEFAULT 'open' NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"rule_revision" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "review_decisions" ADD COLUMN "provenance" jsonb;--> statement-breakpoint
ALTER TABLE "review_ignore_regions" ADD COLUMN "rules" jsonb;--> statement-breakpoint
ALTER TABLE "review_ignore_regions" ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "review_ignore_revisions" ADD CONSTRAINT "review_ignore_revisions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_ignore_revisions" ADD CONSTRAINT "review_ignore_revisions_test_id_tests_id_fk" FOREIGN KEY ("test_id") REFERENCES "public"."tests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_ignore_revisions" ADD CONSTRAINT "review_ignore_revisions_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_budget_periods" ADD CONSTRAINT "ai_budget_periods_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_budget_periods" ADD CONSTRAINT "ai_budget_periods_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_ledger" ADD CONSTRAINT "ai_usage_ledger_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_ledger" ADD CONSTRAINT "ai_usage_ledger_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_ledger" ADD CONSTRAINT "ai_usage_ledger_job_id_visual_analysis_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."visual_analysis_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visual_analysis_jobs" ADD CONSTRAINT "visual_analysis_jobs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visual_analysis_jobs" ADD CONSTRAINT "visual_analysis_jobs_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visual_analysis_jobs" ADD CONSTRAINT "visual_analysis_jobs_base_capture_id_review_captures_id_fk" FOREIGN KEY ("base_capture_id") REFERENCES "public"."review_captures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visual_analysis_jobs" ADD CONSTRAINT "visual_analysis_jobs_head_capture_id_review_captures_id_fk" FOREIGN KEY ("head_capture_id") REFERENCES "public"."review_captures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visual_analysis_jobs" ADD CONSTRAINT "visual_analysis_jobs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visual_analysis_suggestions" ADD CONSTRAINT "visual_analysis_suggestions_job_id_visual_analysis_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."visual_analysis_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visual_analysis_suggestions" ADD CONSTRAINT "visual_analysis_suggestions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visual_analysis_suggestions" ADD CONSTRAINT "visual_analysis_suggestions_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "review_ignore_revisions_identity_idx" ON "review_ignore_revisions" USING btree ("test_id","checkpoint_name","variant","revision");--> statement-breakpoint
CREATE INDEX "review_ignore_revisions_project_idx" ON "review_ignore_revisions" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_budget_periods_team_idx" ON "ai_budget_periods" USING btree ("team_id","period") WHERE "ai_budget_periods"."project_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_budget_periods_project_idx" ON "ai_budget_periods" USING btree ("team_id","project_id","period") WHERE "ai_budget_periods"."project_id" is not null;--> statement-breakpoint
CREATE INDEX "ai_usage_ledger_job_idx" ON "ai_usage_ledger" USING btree ("job_id","kind");--> statement-breakpoint
CREATE INDEX "ai_usage_ledger_period_idx" ON "ai_usage_ledger" USING btree ("team_id","period","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "visual_analysis_jobs_fingerprint_idx" ON "visual_analysis_jobs" USING btree ("project_id","input_fingerprint");--> statement-breakpoint
CREATE UNIQUE INDEX "visual_analysis_jobs_idempotency_idx" ON "visual_analysis_jobs" USING btree ("project_id","idempotency_key") WHERE "visual_analysis_jobs"."idempotency_key" is not null;--> statement-breakpoint
CREATE INDEX "visual_analysis_jobs_pair_idx" ON "visual_analysis_jobs" USING btree ("base_capture_id","head_capture_id","created_at");--> statement-breakpoint
CREATE INDEX "visual_analysis_jobs_project_idx" ON "visual_analysis_jobs" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "visual_analysis_jobs_running_idx" ON "visual_analysis_jobs" USING btree ("status","claimed_at") WHERE "visual_analysis_jobs"."status" in ('queued', 'running');--> statement-breakpoint
CREATE INDEX "visual_analysis_suggestions_job_idx" ON "visual_analysis_suggestions" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "visual_analysis_suggestions_project_idx" ON "visual_analysis_suggestions" USING btree ("project_id","decision");