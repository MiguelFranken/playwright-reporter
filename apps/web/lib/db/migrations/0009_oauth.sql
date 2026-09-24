CREATE TYPE "public"."oauth_client_kind" AS ENUM('dcr', 'cimd');--> statement-breakpoint
CREATE TYPE "public"."oauth_token_kind" AS ENUM('access', 'refresh');--> statement-breakpoint
CREATE TABLE "oauth_clients" (
	"id" uuid PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"kind" "oauth_client_kind" NOT NULL,
	"client_name" text NOT NULL,
	"client_uri" text,
	"logo_uri" text,
	"redirect_uris" text[] NOT NULL,
	"token_endpoint_auth_method" text DEFAULT 'none' NOT NULL,
	"client_secret_hash" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"fetched_at" timestamp with time zone,
	CONSTRAINT "oauth_clients_client_id_unique" UNIQUE("client_id")
);
--> statement-breakpoint
CREATE TABLE "oauth_codes" (
	"code_hash" text PRIMARY KEY NOT NULL,
	"grant_id" uuid NOT NULL,
	"redirect_uri" text NOT NULL,
	"code_challenge" text NOT NULL,
	"resource" text,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "oauth_grants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"client_id" text NOT NULL,
	"scopes" text[] DEFAULT '{read}'::text[] NOT NULL,
	"team_ids" uuid[],
	"project_id" uuid,
	"all_teams" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "oauth_tokens" (
	"id" uuid PRIMARY KEY NOT NULL,
	"grant_id" uuid NOT NULL,
	"kind" "oauth_token_kind" NOT NULL,
	"token_hash" text NOT NULL,
	"resource" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"rotated_at" timestamp with time zone,
	CONSTRAINT "oauth_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "oauth_codes" ADD CONSTRAINT "oauth_codes_grant_id_oauth_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."oauth_grants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_grants" ADD CONSTRAINT "oauth_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_grants" ADD CONSTRAINT "oauth_grants_client_id_oauth_clients_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_clients"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_grants" ADD CONSTRAINT "oauth_grants_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_tokens" ADD CONSTRAINT "oauth_tokens_grant_id_oauth_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."oauth_grants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "oauth_grants_user_idx" ON "oauth_grants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "oauth_tokens_grant_idx" ON "oauth_tokens" USING btree ("grant_id");