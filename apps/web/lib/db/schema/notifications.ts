/**
 * Browser push subscriptions: one row per browser a user turned run
 * notifications on in. The endpoint is the push service's URL for that
 * browser; `p256dh` and `auth` are the keys a payload is encrypted with.
 */
import { boolean, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth';

export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull().unique(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    userAgent: text('user_agent'),
    notifyStarted: boolean('notify_started').notNull().default(true),
    notifyFinished: boolean('notify_finished').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('push_subscriptions_user_idx').on(t.userId)],
);

export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;
