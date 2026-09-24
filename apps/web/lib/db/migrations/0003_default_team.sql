-- Move the projects that existed before teams into a `default` team.
-- Idempotent, so re-running on a branch is safe.
INSERT INTO "teams" ("id", "slug", "name")
VALUES (gen_random_uuid(), 'default', 'Default team')
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
UPDATE "projects"
SET "team_id" = (SELECT "id" FROM "teams" WHERE "slug" = 'default')
WHERE "team_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "team_id" SET NOT NULL;
