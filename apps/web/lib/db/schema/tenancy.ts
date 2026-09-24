/**
 * Teams, memberships, invitations and the audit log. Better Auth owns identity
 * only (see `auth.ts`); tenancy is ours, authorized by `lib/auth/access.ts`.
 */
import { relations, sql } from 'drizzle-orm';
import { bigserial, index, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth';

// 'owner' is deliberately reserved for self-service team creation later.
export const teamRoleEnum = pgEnum('team_role', ['admin', 'member', 'viewer']);

export type TeamRole = (typeof teamRoleEnum.enumValues)[number];

export const teams = pgTable('teams', {
  id: uuid('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  // An `/api/avatars/teams/…` URL, like `users.image`.
  image: text('image'),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const teamMembers = pgTable(
  'team_members',
  {
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: teamRoleEnum('role').notNull(),
    addedBy: uuid('added_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The access check is a primary-key lookup.
    primaryKey({ columns: [t.teamId, t.userId] }),
    index('team_members_user_idx').on(t.userId),
  ],
);

export const teamInvitations = pgTable(
  'team_invitations',
  {
    id: uuid('id').primaryKey(),
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    email: text('email').notNull(), // stored lower-cased
    role: teamRoleEnum('role').notNull(),
    tokenHash: text('token_hash').notNull(), // sha256(token); the token is shown once
    invitedBy: uuid('invited_by').references(() => users.id, { onDelete: 'set null' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    acceptedBy: uuid('accepted_by').references(() => users.id, { onDelete: 'set null' }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('team_invitations_token_idx').on(t.tokenHash),
    // One pending invitation per email per team.
    uniqueIndex('team_invitations_pending_email_idx')
      .on(t.teamId, t.email)
      .where(sql`accepted_at is null and revoked_at is null`),
    index('team_invitations_team_idx').on(t.teamId, t.createdAt),
  ],
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    teamId: uuid('team_id').references(() => teams.id, { onDelete: 'set null' }),
    // No FK: audit rows outlive the projects they describe.
    projectId: uuid('project_id'),
    action: text('action').notNull(),
    target: jsonb('target').$type<Record<string, unknown>>().notNull().default({}),
    ipAddress: text('ip_address'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('audit_logs_team_idx').on(t.teamId, t.createdAt), index('audit_logs_actor_idx').on(t.actorId, t.createdAt)],
);

export const teamsRelations = relations(teams, ({ many, one }) => ({
  members: many(teamMembers),
  invitations: many(teamInvitations),
  creator: one(users, { fields: [teams.createdBy], references: [users.id] }),
}));

export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
  team: one(teams, { fields: [teamMembers.teamId], references: [teams.id] }),
  user: one(users, { fields: [teamMembers.userId], references: [users.id] }),
}));

export const teamInvitationsRelations = relations(teamInvitations, ({ one }) => ({
  team: one(teams, { fields: [teamInvitations.teamId], references: [teams.id] }),
  inviter: one(users, { fields: [teamInvitations.invitedBy], references: [users.id] }),
}));

export type Team = typeof teams.$inferSelect;
export type TeamMember = typeof teamMembers.$inferSelect;
export type TeamInvitation = typeof teamInvitations.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
