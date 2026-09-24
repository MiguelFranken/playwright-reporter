-- SaaS-starter leftovers (PROJECT_TECHNICAL_DECISIONS.md §15). Verified empty
-- on the connected branch. The new `users`, `teams` and `team_members` reuse
-- these names, so the drop has to be its own migration that runs first.
DROP TABLE IF EXISTS "activity_logs" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "invitations" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "team_members" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "teams" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "users" CASCADE;
