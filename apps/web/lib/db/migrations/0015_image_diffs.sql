CREATE TABLE "image_diffs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"base_sha256" text NOT NULL,
	"head_sha256" text NOT NULL,
	"options_key" text NOT NULL,
	"options" jsonb NOT NULL,
	"base_attachment_id" uuid,
	"head_attachment_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"changed_pixels" integer,
	"total_pixels" integer,
	"ratio" real,
	"base_width" integer,
	"base_height" integer,
	"head_width" integer,
	"head_height" integer,
	"regions" jsonb,
	"regions_truncated" boolean DEFAULT false NOT NULL,
	"shift" jsonb,
	"overlay_key" text,
	"overlay_size" integer,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer,
	"claimed_at" timestamp with time zone,
	"computed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_ignore_regions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"test_id" uuid NOT NULL,
	"checkpoint_name" text NOT NULL,
	"variant" text NOT NULL,
	"regions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "review_decisions" ADD COLUMN "source" text DEFAULT 'human' NOT NULL;--> statement-breakpoint
ALTER TABLE "image_diffs" ADD CONSTRAINT "image_diffs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "image_diffs" ADD CONSTRAINT "image_diffs_base_attachment_id_attachments_id_fk" FOREIGN KEY ("base_attachment_id") REFERENCES "public"."attachments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "image_diffs" ADD CONSTRAINT "image_diffs_head_attachment_id_attachments_id_fk" FOREIGN KEY ("head_attachment_id") REFERENCES "public"."attachments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_ignore_regions" ADD CONSTRAINT "review_ignore_regions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_ignore_regions" ADD CONSTRAINT "review_ignore_regions_test_id_tests_id_fk" FOREIGN KEY ("test_id") REFERENCES "public"."tests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_ignore_regions" ADD CONSTRAINT "review_ignore_regions_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "image_diffs_pair_idx" ON "image_diffs" USING btree ("project_id","base_sha256","head_sha256","options_key");--> statement-breakpoint
CREATE INDEX "image_diffs_pending_idx" ON "image_diffs" USING btree ("status","created_at") WHERE "image_diffs"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "image_diffs_head_attachment_idx" ON "image_diffs" USING btree ("head_attachment_id");--> statement-breakpoint
CREATE INDEX "image_diffs_base_attachment_idx" ON "image_diffs" USING btree ("base_attachment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "review_ignore_regions_identity_idx" ON "review_ignore_regions" USING btree ("test_id","checkpoint_name","variant");