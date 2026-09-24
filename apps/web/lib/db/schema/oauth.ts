/**
 * The authorization server behind MCP connectors (claude.ai, ChatGPT and any
 * client that speaks MCP authorization). Deliberately small: authorization
 * code + PKCE, refresh tokens with rotation, opaque tokens stored as sha256.
 *
 * A grant is what the user consented to — which teams or project, which
 * scopes — and is what the MCP server's principal resolver reads, exactly
 * like a personal access token row.
 */
import { sql } from 'drizzle-orm';
import { boolean, index, pgEnum, pgTable, text, timestamp, uuid, jsonb } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { projects } from './reporting';

/** `dcr`: registered through the registration endpoint. `cimd`: a Client ID Metadata Document URL, fetched and cached. */
export const oauthClientKindEnum = pgEnum('oauth_client_kind', ['dcr', 'cimd']);

export const oauthClients = pgTable('oauth_clients', {
  id: uuid('id').primaryKey(),
  clientId: text('client_id').notNull().unique(),
  kind: oauthClientKindEnum('kind').notNull(),
  clientName: text('client_name').notNull(),
  clientUri: text('client_uri'),
  logoUri: text('logo_uri'),
  redirectUris: text('redirect_uris').array().notNull(),
  // 'none' for public clients (every current MCP client); secrets are hashed.
  tokenEndpointAuthMethod: text('token_endpoint_auth_method').notNull().default('none'),
  clientSecretHash: text('client_secret_hash'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  /** For CIMD clients: when the metadata document was last fetched. */
  fetchedAt: timestamp('fetched_at', { withTimezone: true }),
});

export const oauthGrants = pgTable(
  'oauth_grants',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    clientId: text('client_id')
      .notNull()
      .references(() => oauthClients.clientId, { onDelete: 'cascade' }),
    scopes: text('scopes').array().notNull().default(sql`'{read}'::text[]`),
    teamIds: uuid('team_ids').array(),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    allTeams: boolean('all_teams').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [index('oauth_grants_user_idx').on(t.userId)],
);

export const oauthCodes = pgTable('oauth_codes', {
  codeHash: text('code_hash').primaryKey(),
  grantId: uuid('grant_id')
    .notNull()
    .references(() => oauthGrants.id, { onDelete: 'cascade' }),
  redirectUri: text('redirect_uri').notNull(),
  codeChallenge: text('code_challenge').notNull(),
  resource: text('resource'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
});

export const oauthTokenKindEnum = pgEnum('oauth_token_kind', ['access', 'refresh']);

export const oauthTokens = pgTable(
  'oauth_tokens',
  {
    id: uuid('id').primaryKey(),
    grantId: uuid('grant_id')
      .notNull()
      .references(() => oauthGrants.id, { onDelete: 'cascade' }),
    kind: oauthTokenKindEnum('kind').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    resource: text('resource'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    /** A rotated refresh token: presenting it again means it leaked, and the grant is revoked. */
    rotatedAt: timestamp('rotated_at', { withTimezone: true }),
  },
  (t) => [index('oauth_tokens_grant_idx').on(t.grantId)],
);

export type OAuthClient = typeof oauthClients.$inferSelect;
export type OAuthGrant = typeof oauthGrants.$inferSelect;
