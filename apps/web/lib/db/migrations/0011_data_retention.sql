CREATE TABLE "data_sweeps" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"trigger" "sweep_trigger" NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"deleted" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"artifact_bytes" bigint DEFAULT 0 NOT NULL,
	"has_more" boolean DEFAULT false NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE INDEX "data_sweeps_started_idx" ON "data_sweeps" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "runs_started_idx" ON "runs" USING btree ("started_at");