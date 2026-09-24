CREATE TYPE "public"."sweep_trigger" AS ENUM('cron', 'ingest', 'manual');--> statement-breakpoint
ALTER TYPE "public"."attachment_status" ADD VALUE 'expired';--> statement-breakpoint
CREATE TABLE "artifact_sweeps" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"trigger" "sweep_trigger" NOT NULL,
	"storage_driver" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"expired_count" integer DEFAULT 0 NOT NULL,
	"expired_bytes" bigint DEFAULT 0 NOT NULL,
	"has_more" boolean DEFAULT false NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "instance_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "expired_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "instance_settings" ADD CONSTRAINT "instance_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "artifact_sweeps_started_idx" ON "artifact_sweeps" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "attachments_live_created_idx" ON "attachments" USING btree ("created_at") WHERE expired_at is null;