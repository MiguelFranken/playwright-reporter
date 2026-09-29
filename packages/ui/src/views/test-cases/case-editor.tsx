'use client';

import { useState } from 'react';
import { Alert, AlertDescription } from '../../components/alert';
import { Button } from '../../components/button';
import { Card, CardContent } from '../../components/card';
import { Checkbox } from '../../components/checkbox';
import { Input } from '../../components/input';
import { Label } from '../../components/label';
import { Textarea } from '../../components/textarea';
import type { SuiteOption } from '../../lib/test-case-models';
import {
  CASE_AUTOMATION_LABELS,
  CASE_AUTOMATIONS,
  CASE_BEHAVIOR_LABELS,
  CASE_BEHAVIORS,
  CASE_PRIORITIES,
  CASE_PRIORITY_LABELS,
  CASE_SEVERITIES,
  CASE_SEVERITY_LABELS,
  CASE_STATUS_LABELS,
  CASE_STATUSES,
  CASE_TYPE_LABELS,
  CASE_TYPES,
  labelItems,
  type CaseAutomation,
  type CaseBehavior,
  type CaseFieldDef,
  type CasePriority,
  type CaseSeverity,
  type CaseStatus,
  type CaseStep,
  type CaseType,
  type CustomFieldValue,
  type StepFormat,
} from '../../lib/test-cases';
import { EMPTY_CASE, type CaseEditorValues } from '../../lib/test-case-editor';
import { FieldSelect } from './field-select';
import { StepsEditor } from './steps-editor';

export type { CaseEditorValues };
export { EMPTY_CASE };

export interface CaseEditorProps {
  initial: CaseEditorValues;
  suites: SuiteOption[];
  fieldDefs: CaseFieldDef[];
  /** How many tests are linked: a linked case is automated because of them. */
  linkCount?: number;
  onSubmit: (values: CaseEditorValues) => void;
  onCancel?: () => void;
  submitLabel: string;
  pendingLabel: string;
  pending?: boolean;
  error?: string | null;
}

const UNASSIGNED = '__unassigned__';

function parseTags(text: string): string[] {
  return [...new Set(text.split(',').map((t) => t.trim().replace(/^@+/, '')).filter(Boolean))];
}

/**
 * Creating or editing a case. Holds the draft itself and reports the whole
 * case on submit; the host saves it and shows what the server said.
 */
export function CaseEditor({ initial, suites, fieldDefs, linkCount = 0, onSubmit, onCancel, submitLabel, pendingLabel, pending = false, error }: CaseEditorProps) {
  const [values, setValues] = useState(initial);
  const [tagText, setTagText] = useState(initial.tags.join(', '));
  const set = <K extends keyof CaseEditorValues>(key: K, value: CaseEditorValues[K]) => setValues((v) => ({ ...v, [key]: value }));
  const setField = (key: string, value: CustomFieldValue) => setValues((v) => ({ ...v, customFields: { ...v.customFields, [key]: value } }));
  const missing = fieldDefs.filter((d) => d.required && d.kind !== 'checkbox' && (values.customFields[d.key] ?? '') === '');
  const canSubmit = !pending && values.title.trim().length > 0 && missing.length === 0;

  return (
    <form
      className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) onSubmit({ ...values, title: values.title.trim(), tags: parseTags(tagText) });
      }}
    >
      <div className="flex min-w-0 flex-col gap-5">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="case-title">Title</Label>
          <Input id="case-title" value={values.title} maxLength={500} required disabled={pending} onChange={(e) => set('title', e.target.value)} placeholder="Verify a user can log in with valid credentials" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="case-description">Description</Label>
          <Textarea id="case-description" rows={4} maxLength={20_000} value={values.description} disabled={pending} onChange={(e) => set('description', e.target.value)} placeholder="What this case checks, and why it matters." />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="case-preconditions">Preconditions</Label>
            <Textarea id="case-preconditions" rows={3} maxLength={5_000} value={values.preconditions} disabled={pending} onChange={(e) => set('preconditions', e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="case-postconditions">Postconditions</Label>
            <Textarea id="case-postconditions" rows={3} maxLength={5_000} value={values.postconditions} disabled={pending} onChange={(e) => set('postconditions', e.target.value)} />
          </div>
        </div>
        <StepsEditor
          format={values.stepsFormat}
          steps={values.steps}
          disabled={pending}
          onFormatChange={(f) => set('stepsFormat', f)}
          onStepsChange={(s) => set('steps', s)}
        />
      </div>

      <aside className="flex flex-col gap-4">
        <Card size="sm">
          <CardContent className="flex flex-col gap-4">
            <FieldSelect
              id="case-suite"
              label="Suite"
              value={values.suiteId ?? UNASSIGNED}
              disabled={pending}
              items={[{ value: UNASSIGNED, label: 'Unassigned' }, ...suites]}
              onValueChange={(v) => set('suiteId', v === UNASSIGNED ? null : v)}
            />
            <FieldSelect id="case-status" label="Status" value={values.status} disabled={pending} items={labelItems(CASE_STATUSES, CASE_STATUS_LABELS)} onValueChange={(v) => set('status', v as CaseStatus)} />
            <div className="grid grid-cols-2 gap-3">
              <FieldSelect id="case-priority" label="Priority" value={values.priority} disabled={pending} items={labelItems(CASE_PRIORITIES, CASE_PRIORITY_LABELS)} onValueChange={(v) => set('priority', v as CasePriority)} />
              <FieldSelect id="case-severity" label="Severity" value={values.severity} disabled={pending} items={labelItems(CASE_SEVERITIES, CASE_SEVERITY_LABELS)} onValueChange={(v) => set('severity', v as CaseSeverity)} />
              <FieldSelect id="case-type" label="Type" value={values.type} disabled={pending} items={labelItems(CASE_TYPES, CASE_TYPE_LABELS)} onValueChange={(v) => set('type', v as CaseType)} />
              <FieldSelect id="case-behavior" label="Behavior" value={values.behavior} disabled={pending} items={labelItems(CASE_BEHAVIORS, CASE_BEHAVIOR_LABELS)} onValueChange={(v) => set('behavior', v as CaseBehavior)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <FieldSelect
                id="case-automation"
                label="Automation"
                value={values.automation}
                disabled={pending}
                items={labelItems(CASE_AUTOMATIONS, CASE_AUTOMATION_LABELS)}
                onValueChange={(v) => set('automation', v as CaseAutomation)}
              />
              <p className="text-body-s text-muted-foreground">
                {linkCount
                  ? `${linkCount} linked ${linkCount === 1 ? 'test keeps' : 'tests keep'} this case automated.`
                  : values.automation === 'automated'
                    ? 'Unverified until a Playwright test is linked. Tag a test with @TC-<number> to link it.'
                    : 'Linking a Playwright test marks the case automated.'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="case-muted" checked={values.muted} disabled={pending} onCheckedChange={(on) => set('muted', on === true)} />
              <Label htmlFor="case-muted">Muted</Label>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="case-tags">Tags</Label>
              <Input id="case-tags" value={tagText} disabled={pending} onChange={(e) => setTagText(e.target.value)} placeholder="smoke, checkout" />
              <p className="text-body-s text-muted-foreground">Separate tags with commas.</p>
            </div>
          </CardContent>
        </Card>

        {fieldDefs.length ? (
          <Card size="sm">
            <CardContent className="flex flex-col gap-4">
              <h3 className="text-eyebrow text-muted-foreground">Custom fields</h3>
              {fieldDefs.map((def) => (
                <CustomFieldInput key={def.key} def={def} value={values.customFields[def.key] ?? null} disabled={pending} onChange={(v) => setField(def.key, v)} />
              ))}
            </CardContent>
          </Card>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2">
          {onCancel ? (
            <Button type="button" variant="ghost" disabled={pending} onClick={onCancel}>
              Cancel
            </Button>
          ) : null}
          <Button type="submit" disabled={!canSubmit}>
            {pending ? pendingLabel : submitLabel}
          </Button>
        </div>
        {missing.length ? <p className="text-end text-body-s text-muted-foreground">Fill in {missing.map((d) => d.label).join(', ')} to save.</p> : null}
      </aside>
    </form>
  );
}

function CustomFieldInput({ def, value, onChange, disabled }: { def: CaseFieldDef; value: CustomFieldValue; onChange: (v: CustomFieldValue) => void; disabled?: boolean }) {
  const id = `field-${def.key}`;
  const label = `${def.label}${def.required ? ' (required)' : ''}`;
  if (def.kind === 'checkbox') {
    return (
      <div className="flex items-center gap-2">
        <Checkbox id={id} checked={value === true} disabled={disabled} onCheckedChange={(on) => onChange(on === true)} />
        <Label htmlFor={id}>{def.label}</Label>
      </div>
    );
  }
  if (def.kind === 'select') {
    return (
      <FieldSelect
        id={id}
        label={label}
        value={typeof value === 'string' && value ? value : '__none__'}
        disabled={disabled}
        items={[{ value: '__none__', label: 'Not set' }, ...def.options.map((o) => ({ value: o, label: o }))]}
        onValueChange={(v) => onChange(v === '__none__' ? null : v)}
      />
    );
  }
  const text = value === null || value === undefined ? '' : String(value);
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {def.kind === 'textarea' ? (
        <Textarea id={id} rows={3} value={text} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <Input
          id={id}
          type={def.kind === 'number' ? 'number' : def.kind === 'date' ? 'date' : 'text'}
          value={text}
          disabled={disabled}
          onChange={(e) => onChange(def.kind === 'number' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value)}
        />
      )}
    </div>
  );
}
