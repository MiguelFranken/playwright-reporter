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
ALTER TABLE "review_decisions" ADD COLUMN "provenance" jsonb;--> statement-breakpoint
ALTER TABLE "review_ignore_regions" ADD COLUMN "rules" jsonb;--> statement-breakpoint
ALTER TABLE "review_ignore_regions" ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "review_ignore_revisions" ADD CONSTRAINT "review_ignore_revisions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_ignore_revisions" ADD CONSTRAINT "review_ignore_revisions_test_id_tests_id_fk" FOREIGN KEY ("test_id") REFERENCES "public"."tests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_ignore_revisions" ADD CONSTRAINT "review_ignore_revisions_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "review_ignore_revisions_identity_idx" ON "review_ignore_revisions" USING btree ("test_id","checkpoint_name","variant","revision");--> statement-breakpoint
CREATE INDEX "review_ignore_revisions_project_idx" ON "review_ignore_revisions" USING btree ("project_id","created_at");