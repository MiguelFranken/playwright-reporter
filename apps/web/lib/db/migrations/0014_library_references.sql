CREATE TABLE "library_references" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"branch" text,
	"pr_number" integer,
	"title" text,
	"description" text,
	"pinned_run_id" uuid,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "library_references_target_check" CHECK (("library_references"."kind" = 'branch' and "library_references"."branch" is not null and "library_references"."pr_number" is null) or ("library_references"."kind" = 'pull_request' and "library_references"."pr_number" is not null))
);
--> statement-breakpoint
ALTER TABLE "library_references" ADD CONSTRAINT "library_references_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_references" ADD CONSTRAINT "library_references_pinned_run_id_runs_id_fk" FOREIGN KEY ("pinned_run_id") REFERENCES "public"."runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_references" ADD CONSTRAINT "library_references_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "library_references_branch_idx" ON "library_references" USING btree ("project_id","branch") WHERE "library_references"."kind" = 'branch';--> statement-breakpoint
CREATE UNIQUE INDEX "library_references_pr_idx" ON "library_references" USING btree ("project_id","pr_number") WHERE "library_references"."kind" = 'pull_request';--> statement-breakpoint
CREATE UNIQUE INDEX "library_references_default_idx" ON "library_references" USING btree ("project_id") WHERE "library_references"."is_default";--> statement-breakpoint
CREATE INDEX "library_references_pinned_idx" ON "library_references" USING btree ("pinned_run_id");