/**
 * Credentials that act as a *person*, as opposed to `api_tokens`, which act
 * as a reporter for one project. Used by the MCP server; the principal a token
 * resolves to is re-checked against live team membership on every request, so
 * the restrictions here can only narrow what the user may do, never widen it.
 */
import { sql } from 'drizzle-orm';
import { boolean, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { projects } from './reporting';

export const personalAccessTokens = pgTable(
  'personal_access_tokens',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    // "pwr_pat_AbCdEf" — what lists show; the secret itself is never stored.
    tokenPrefix: text('token_prefix').notNull(),
    // 'read' | 'write'. Write tools do not exist yet; the column keeps the door open.
    scopes: text('scopes').array().notNull().default(sql`'{read}'::text[]`),
    // null = every team the user can see. No FK: a deleted team's id is harmless,
    // because access is re-resolved against live membership.
    teamIds: uuid('team_ids').array(),
    // Deleting the project deletes tokens pinned to it rather than widening them.
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    // Superadmin-only opt-in: keep the instance-wide role across every team.
    allTeams: boolean('all_teams').notNull().default(false),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('personal_access_tokens_user_idx').on(t.userId)],
);

export type PersonalAccessToken = typeof personalAccessTokens.$inferSelect;
