import { relations } from 'drizzle-orm';
import {
  boolean,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  CASE_AUTOMATIONS,
  CASE_BEHAVIORS,
  CASE_PRIORITIES,
  CASE_SEVERITIES,
  CASE_STATUSES,
  CASE_TYPES,
  FIELD_KINDS,
  LINK_SOURCES,
  STEP_FORMATS,
  type CaseStep,
  type CustomFieldValue,
} from '@miguelfranken/ui/lib/test-cases';
import { users } from './auth';
import { projects, tests } from './reporting';

export const caseStatusEnum = pgEnum('case_status', CASE_STATUSES);
export const casePriorityEnum = pgEnum('case_priority', CASE_PRIORITIES);
export const caseSeverityEnum = pgEnum('case_severity', CASE_SEVERITIES);
export const caseTypeEnum = pgEnum('case_type', CASE_TYPES);
export const caseBehaviorEnum = pgEnum('case_behavior', CASE_BEHAVIORS);
export const caseAutomationEnum = pgEnum('case_automation', CASE_AUTOMATIONS);
export const stepFormatEnum = pgEnum('step_format', STEP_FORMATS);
export const caseLinkSourceEnum = pgEnum('case_link_source', LINK_SOURCES);
export const caseFieldKindEnum = pgEnum('case_field_kind', FIELD_KINDS);

/** A folder of cases. `parent_id` nests it (at most `MAX_SUITE_DEPTH` deep); deleting a suite deletes what it holds. */
export const testSuites = pgTable(
  'test_suites',
  {
    id: uuid('id').primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    parentId: uuid('parent_id'),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    position: integer('position').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({ columns: [t.parentId], foreignColumns: [t.id], name: 'test_suites_parent_fk' }).onDelete('cascade'),
    index('test_suites_project_parent_idx').on(t.projectId, t.parentId, t.position),
  ],
);

/**
 * A test case, known to people as `TC-<number>`. A case without a suite is
 * unassigned. `version` counts saved edits; each one leaves a snapshot in
 * `test_case_versions`.
 */
export const testCases = pgTable(
  'test_cases',
  {
    id: uuid('id').primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    number: integer('number').notNull(),
    suiteId: uuid('suite_id').references(() => testSuites.id, { onDelete: 'cascade' }),
    position: integer('position').notNull().default(0),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    preconditions: text('preconditions').notNull().default(''),
    postconditions: text('postconditions').notNull().default(''),
    stepsFormat: stepFormatEnum('steps_format').notNull().default('classic'),
    steps: jsonb('steps').$type<CaseStep[]>().notNull().default([]),
    status: caseStatusEnum('status').notNull().default('active'),
    priority: casePriorityEnum('priority').notNull().default('none'),
    severity: caseSeverityEnum('severity').notNull().default('normal'),
    type: caseTypeEnum('type').notNull().default('functional'),
    behavior: caseBehaviorEnum('behavior').notNull().default('none'),
    automation: caseAutomationEnum('automation').notNull().default('manual'),
    muted: boolean('muted').notNull().default(false),
    tags: text('tags').array().notNull().default([]),
    customFields: jsonb('custom_fields').$type<Record<string, CustomFieldValue>>().notNull().default({}),
    version: integer('version').notNull().default(1),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('test_cases_project_number_idx').on(t.projectId, t.number),
    index('test_cases_project_suite_idx').on(t.projectId, t.suiteId, t.position),
  ],
);

/** A Playwright test covering a case: linked by hand, or from a `@TC-n` tag or annotation in the test's code. */
export const testCaseLinks = pgTable(
  'test_case_links',
  {
    caseId: uuid('case_id')
      .notNull()
      .references(() => testCases.id, { onDelete: 'cascade' }),
    testId: uuid('test_id')
      .notNull()
      .references(() => tests.id, { onDelete: 'cascade' }),
    source: caseLinkSourceEnum('source').notNull().default('manual'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.caseId, t.testId] }), index('test_case_links_test_idx').on(t.testId)],
);

/** The case as it was after each saved edit. `changed` names the fields that edit touched. */
export const testCaseVersions = pgTable(
  'test_case_versions',
  {
    id: uuid('id').primaryKey(),
    caseId: uuid('case_id')
      .notNull()
      .references(() => testCases.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    snapshot: jsonb('snapshot').$type<Record<string, unknown>>().notNull(),
    changed: text('changed').array().notNull().default([]),
    authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('test_case_versions_case_version_idx').on(t.caseId, t.version)],
);

/** A project's own case fields. Values live in `test_cases.custom_fields`, keyed by `key`. */
export const testCaseFields = pgTable(
  'test_case_fields',
  {
    id: uuid('id').primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    label: text('label').notNull(),
    kind: caseFieldKindEnum('kind').notNull(),
    options: text('options').array().notNull().default([]),
    required: boolean('required').notNull().default(false),
    position: integer('position').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('test_case_fields_project_key_idx').on(t.projectId, t.key)],
);

export const testSuitesRelations = relations(testSuites, ({ one, many }) => ({
  project: one(projects, { fields: [testSuites.projectId], references: [projects.id] }),
  cases: many(testCases),
}));

export const testCasesRelations = relations(testCases, ({ one, many }) => ({
  project: one(projects, { fields: [testCases.projectId], references: [projects.id] }),
  suite: one(testSuites, { fields: [testCases.suiteId], references: [testSuites.id] }),
  links: many(testCaseLinks),
  versions: many(testCaseVersions),
}));

export const testCaseLinksRelations = relations(testCaseLinks, ({ one }) => ({
  case: one(testCases, { fields: [testCaseLinks.caseId], references: [testCases.id] }),
  test: one(tests, { fields: [testCaseLinks.testId], references: [tests.id] }),
}));

export type TestSuite = typeof testSuites.$inferSelect;
export type TestCase = typeof testCases.$inferSelect;
export type TestCaseLink = typeof testCaseLinks.$inferSelect;
export type TestCaseVersion = typeof testCaseVersions.$inferSelect;
export type TestCaseField = typeof testCaseFields.$inferSelect;
