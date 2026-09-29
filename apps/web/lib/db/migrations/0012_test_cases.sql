CREATE TYPE "public"."case_automation" AS ENUM('manual', 'planned', 'automated');--> statement-breakpoint
CREATE TYPE "public"."case_behavior" AS ENUM('positive', 'negative', 'destructive', 'none');--> statement-breakpoint
CREATE TYPE "public"."case_field_kind" AS ENUM('text', 'textarea', 'number', 'date', 'select', 'checkbox');--> statement-breakpoint
CREATE TYPE "public"."case_link_source" AS ENUM('manual', 'code');--> statement-breakpoint
CREATE TYPE "public"."case_priority" AS ENUM('critical', 'high', 'medium', 'low', 'none');--> statement-breakpoint
CREATE TYPE "public"."case_severity" AS ENUM('blocker', 'critical', 'major', 'normal', 'minor', 'trivial', 'none');--> statement-breakpoint
CREATE TYPE "public"."case_status" AS ENUM('active', 'draft', 'deprecated');--> statement-breakpoint
CREATE TYPE "public"."case_type" AS ENUM('functional', 'smoke', 'regression', 'integration', 'e2e', 'api', 'unit', 'performance', 'security', 'accessibility', 'usability', 'compatibility', 'acceptance', 'exploratory', 'other');--> statement-breakpoint
CREATE TYPE "public"."step_format" AS ENUM('classic', 'gherkin');--> statement-breakpoint
CREATE TABLE "test_case_fields" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"kind" "case_field_kind" NOT NULL,
	"options" text[] DEFAULT '{}' NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "test_case_links" (
	"case_id" uuid NOT NULL,
	"test_id" uuid NOT NULL,
	"source" "case_link_source" DEFAULT 'manual' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "test_case_links_case_id_test_id_pk" PRIMARY KEY("case_id","test_id")
);
--> statement-breakpoint
CREATE TABLE "test_case_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"case_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"changed" text[] DEFAULT '{}' NOT NULL,
	"author_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "test_cases" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"suite_id" uuid,
	"position" integer DEFAULT 0 NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"preconditions" text DEFAULT '' NOT NULL,
	"postconditions" text DEFAULT '' NOT NULL,
	"steps_format" "step_format" DEFAULT 'classic' NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "case_status" DEFAULT 'active' NOT NULL,
	"priority" "case_priority" DEFAULT 'none' NOT NULL,
	"severity" "case_severity" DEFAULT 'normal' NOT NULL,
	"type" "case_type" DEFAULT 'functional' NOT NULL,
	"behavior" "case_behavior" DEFAULT 'none' NOT NULL,
	"automation" "case_automation" DEFAULT 'manual' NOT NULL,
	"muted" boolean DEFAULT false NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "test_suites" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "case_counter" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "test_case_fields" ADD CONSTRAINT "test_case_fields_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_case_links" ADD CONSTRAINT "test_case_links_case_id_test_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."test_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_case_links" ADD CONSTRAINT "test_case_links_test_id_tests_id_fk" FOREIGN KEY ("test_id") REFERENCES "public"."tests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_case_links" ADD CONSTRAINT "test_case_links_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_case_versions" ADD CONSTRAINT "test_case_versions_case_id_test_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."test_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_case_versions" ADD CONSTRAINT "test_case_versions_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_suite_id_test_suites_id_fk" FOREIGN KEY ("suite_id") REFERENCES "public"."test_suites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_suites" ADD CONSTRAINT "test_suites_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_suites" ADD CONSTRAINT "test_suites_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."test_suites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "test_case_fields_project_key_idx" ON "test_case_fields" USING btree ("project_id","key");--> statement-breakpoint
CREATE INDEX "test_case_links_test_idx" ON "test_case_links" USING btree ("test_id");--> statement-breakpoint
CREATE UNIQUE INDEX "test_case_versions_case_version_idx" ON "test_case_versions" USING btree ("case_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "test_cases_project_number_idx" ON "test_cases" USING btree ("project_id","number");--> statement-breakpoint
CREATE INDEX "test_cases_project_suite_idx" ON "test_cases" USING btree ("project_id","suite_id","position");--> statement-breakpoint
CREATE INDEX "test_suites_project_parent_idx" ON "test_suites" USING btree ("project_id","parent_id","position");