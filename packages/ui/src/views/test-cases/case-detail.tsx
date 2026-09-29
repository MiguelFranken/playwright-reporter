'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Badge } from '../../components/badge';
import { Button, buttonVariants } from '../../components/button';
import { Card, CardContent } from '../../components/card';
import { cn } from '../../lib/cn';
import { formatDateTime, formatRelative } from '../../lib/format';
import type { CaseDetail, LinkedTest } from '../../lib/test-case-models';
import {
  CASE_BEHAVIOR_LABELS,
  CASE_SEVERITY_LABELS,
  CASE_TYPE_LABELS,
  caseKey,
  GHERKIN_KEYWORD_LABELS,
  type CaseFieldDef,
  type CaseStep,
  type CustomFieldValue,
  type StepFormat,
} from '../../lib/test-cases';
import { Link } from '../../provider';
import { AutomationBadge, CaseStatusBadge, MutedBadge, PriorityLabel, VerdictBadge } from './case-badges';
import { LinkedTests, type LinkedTestsHrefs } from './linked-tests';

export interface CaseDetailHrefs extends LinkedTestsHrefs {
  previous?: string | null;
  next?: string | null;
}

export interface CaseDetailViewProps {
  detail: CaseDetail;
  fieldDefs: CaseFieldDef[];
  hrefs: CaseDetailHrefs;
  now?: Date;
  /** "3 of 42" in the list the case was opened from. */
  position?: { index: number; total: number } | null;
  canEdit?: boolean;
  onUnlink?: (test: LinkedTest) => void;
  pendingTestId?: string | null;
  linkAction?: React.ReactNode;
}

/** A case, read: what to do, what it is, and what the tests covering it say. */
export function CaseDetailView({ detail, fieldDefs, hrefs, now, position, canEdit, onUnlink, pendingTestId, linkAction }: CaseDetailViewProps) {
  const key = caseKey(detail.number);
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex min-w-0 flex-col gap-6">
        <TextBlock title="Description" text={detail.description} empty="No description." />
        {detail.preconditions || detail.postconditions ? (
          <div className="grid gap-4 md:grid-cols-2">
            <TextBlock title="Preconditions" text={detail.preconditions} empty="None." />
            <TextBlock title="Postconditions" text={detail.postconditions} empty="None." />
          </div>
        ) : null}
        <StepsView format={detail.stepsFormat} steps={detail.steps} />
        <LinkedTests caseKey={key} links={detail.links} hrefs={hrefs} now={now} canEdit={canEdit} onUnlink={onUnlink} pendingTestId={pendingTestId} linkAction={linkAction} />
        {hrefs.previous !== undefined || hrefs.next !== undefined ? (
          <nav aria-label="Other cases" className="flex items-center justify-between gap-3 border-t border-border pt-4">
            <NeighbourLink href={hrefs.previous ?? null} label="Previous case" direction="previous" />
            {position ? (
              <span className="text-body-s text-muted-foreground tabular-nums">
                {position.index} of {position.total}
              </span>
            ) : null}
            <NeighbourLink href={hrefs.next ?? null} label="Next case" direction="next" />
          </nav>
        ) : null}
      </div>

      <aside className="flex flex-col gap-4">
        <Card size="sm">
          <CardContent>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-3 text-body-m">
              <Prop label="Status">
                <CaseStatusBadge status={detail.status} />
              </Prop>
              <Prop label="Verdict">
                <VerdictBadge verdict={detail.verdict} />
              </Prop>
              <Prop label="Automation">
                <AutomationBadge automation={detail.automation} linkCount={detail.linkCount} />
              </Prop>
              <Prop label="Priority">
                <PriorityLabel priority={detail.priority} />
              </Prop>
              <Prop label="Severity">{CASE_SEVERITY_LABELS[detail.severity]}</Prop>
              <Prop label="Type">{CASE_TYPE_LABELS[detail.type]}</Prop>
              <Prop label="Behavior">{CASE_BEHAVIOR_LABELS[detail.behavior]}</Prop>
              {detail.muted ? (
                <Prop label="Muted">
                  <MutedBadge />
                </Prop>
              ) : null}
              <Prop label="Tags">
                {detail.tags.length ? (
                  <span className="flex flex-wrap gap-1">
                    {detail.tags.map((t) => (
                      <Badge key={t} variant="secondary" className="font-normal">
                        {t}
                      </Badge>
                    ))}
                  </span>
                ) : (
                  <span className="text-muted-foreground">None</span>
                )}
              </Prop>
            </dl>
          </CardContent>
        </Card>

        {fieldDefs.length ? (
          <Card size="sm">
            <CardContent>
              <h2 className="mb-3 text-eyebrow text-muted-foreground">Custom fields</h2>
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-3 text-body-m">
                {fieldDefs.map((def) => (
                  <Prop key={def.key} label={def.label}>
                    <FieldValue def={def} value={detail.customFields[def.key] ?? null} />
                  </Prop>
                ))}
              </dl>
            </CardContent>
          </Card>
        ) : null}

        <p className="px-1 text-body-s text-muted-foreground">
          Version {detail.version}. Created {formatRelative(detail.createdAt, { now })}
          {detail.createdBy ? ` by ${detail.createdBy}` : ''}; last changed <time dateTime={detail.updatedAt.toISOString()} title={formatDateTime(detail.updatedAt)}>{formatRelative(detail.updatedAt, { now })}</time>
          {detail.updatedBy ? ` by ${detail.updatedBy}` : ''}.
        </p>
      </aside>
    </div>
  );
}

function Prop({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-body-s text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </>
  );
}

function FieldValue({ def, value }: { def: CaseFieldDef; value: CustomFieldValue }) {
  if (def.kind === 'checkbox') return <>{value === true ? 'Yes' : 'No'}</>;
  if (value === null || value === '') return <span className="text-muted-foreground">Not set</span>;
  return <span className={cn(def.kind === 'textarea' && 'whitespace-pre-wrap')}>{String(value)}</span>;
}

function TextBlock({ title, text, empty }: { title: string; text: string; empty: string }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-headline-s">{title}</h2>
      {text ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-3 text-body-m whitespace-pre-wrap text-pretty">{text}</p>
      ) : (
        <p className="text-body-s text-muted-foreground">{empty}</p>
      )}
    </section>
  );
}

/** The steps as a reader sees them, in the format they were written in. */
export function StepsView({ format, steps }: { format: StepFormat; steps: CaseStep[] }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-headline-s">Steps</h2>
      {steps.length === 0 ? (
        <p className="text-body-s text-muted-foreground">No steps.</p>
      ) : format === 'gherkin' ? (
        <ol className="rounded-lg border border-border bg-surface px-4 py-3 text-body-m">
          {steps.map((s, i) => (
            <li key={i} className={cn('py-0.5', (s.keyword === 'and' || s.keyword === 'but') && 'ps-6')}>
              <span className="font-semibold text-accent-text">{GHERKIN_KEYWORD_LABELS[s.keyword]}</span> {s.action}
            </li>
          ))}
        </ol>
      ) : (
        <ol className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
          {steps.map((s, i) => (
            <li key={i} className="flex gap-3 px-4 py-3">
              <span className="w-5 shrink-0 text-end text-code-s text-muted-foreground tabular-nums">{i + 1}.</span>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <p className="text-body-m whitespace-pre-wrap">{s.action || <span className="text-muted-foreground">No action</span>}</p>
                {s.data ? (
                  <p className="text-body-s">
                    <span className="text-eyebrow text-muted-foreground">Test data </span>
                    <code className="text-code-s">{s.data}</code>
                  </p>
                ) : null}
                {s.expected ? (
                  <div>
                    <p className="text-eyebrow text-success-text">Expected result</p>
                    <p className="text-body-m whitespace-pre-wrap">{s.expected}</p>
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function NeighbourLink({ href, label, direction }: { href: string | null; label: string; direction: 'previous' | 'next' }) {
  const Icon = direction === 'previous' ? ChevronLeft : ChevronRight;
  if (!href) {
    return (
      <Button variant="ghost" size="sm" disabled>
        {direction === 'previous' ? <Icon className="size-4" /> : null}
        {label}
        {direction === 'next' ? <Icon className="size-4" /> : null}
      </Button>
    );
  }
  return (
    <Link href={href} rel={direction === 'previous' ? 'prev' : 'next'} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
      {direction === 'previous' ? <Icon className="size-4" /> : null}
      {label}
      {direction === 'next' ? <Icon className="size-4" /> : null}
    </Link>
  );
}
