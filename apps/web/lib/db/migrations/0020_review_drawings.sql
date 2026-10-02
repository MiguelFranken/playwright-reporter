CREATE TABLE "review_drawings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"test_id" uuid NOT NULL,
	"checkpoint_name" text NOT NULL,
	"variant" text NOT NULL,
	"origin_capture_id" uuid,
	"origin_sha256" text,
	"origin_width" integer NOT NULL,
	"origin_height" integer NOT NULL,
	"shape" jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "review_drawings" ADD CONSTRAINT "review_drawings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_drawings" ADD CONSTRAINT "review_drawings_test_id_tests_id_fk" FOREIGN KEY ("test_id") REFERENCES "public"."tests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_drawings" ADD CONSTRAINT "review_drawings_origin_capture_id_review_captures_id_fk" FOREIGN KEY ("origin_capture_id") REFERENCES "public"."review_captures"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_drawings" ADD CONSTRAINT "review_drawings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "review_drawings_identity_idx" ON "review_drawings" USING btree ("test_id","checkpoint_name","variant");--> statement-breakpoint
CREATE INDEX "review_drawings_origin_capture_idx" ON "review_drawings" USING btree ("origin_capture_id");