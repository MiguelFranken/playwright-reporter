'use client';

import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/card';
import { Checkbox } from '../../components/checkbox';
import { Input } from '../../components/input';
import { Label } from '../../components/label';
import { FIELD_KIND_LABELS, FIELD_KINDS, labelItems, type CaseFieldDef, type FieldKind } from '../../lib/test-cases';
import { FieldSelect } from './field-select';

interface Draft extends CaseFieldDef {
  /** Options as typed, one per comma. */
  optionText: string;
  /** Whether the key was typed by hand; until then it follows the label. */
  keyEdited: boolean;
}

function keyFor(label: string): string {
  const key = label
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^(\d)/, 'f_$1')
    .slice(0, 40);
  return key || 'field';
}

function toDraft(def: CaseFieldDef): Draft {
  return { ...def, optionText: def.options.join(', '), keyEdited: true };
}

/**
 * The project's own case fields: text, long text, number, date, dropdown or
 * checkbox. Saving replaces the whole list; removing a field hides its values
 * but keeps them in each case's history.
 */
export function FieldSettings({
  defs,
  onSave,
  pending = false,
  error,
  canEdit = true,
}: {
  defs: CaseFieldDef[];
  onSave: (defs: CaseFieldDef[]) => void;
  pending?: boolean;
  error?: string | null;
  canEdit?: boolean;
}) {
  const [drafts, setDrafts] = useState(() => defs.map(toDraft));
  const update = (i: number, patch: Partial<Draft>) => setDrafts((d) => d.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const move = (i: number, by: -1 | 1) =>
    setDrafts((d) => {
      const next = [...d];
      [next[i], next[i + by]] = [next[i + by], next[i]];
      return next;
    });
  const keys = drafts.map((d) => d.key);
  const duplicate = keys.find((k, i) => keys.indexOf(k) !== i);
  const invalid = drafts.some((d) => !d.label.trim() || (d.kind === 'select' && !d.optionText.trim()));
  const disabled = pending || !canEdit;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Custom fields</CardTitle>
        <CardDescription>Extra fields every test case of this project has, such as an owner, a component or an estimate.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {drafts.length === 0 ? <p className="text-body-s text-muted-foreground">No custom fields yet.</p> : null}
        <ol className="flex flex-col gap-3">
          {drafts.map((d, i) => {
            const n = i + 1;
            return (
              <li key={i} className="grid gap-3 rounded-lg border border-border p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_10rem_auto]">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`field-${i}-label`}>Label</Label>
                  <Input
                    id={`field-${i}-label`}
                    value={d.label}
                    disabled={disabled}
                    maxLength={80}
                    onChange={(e) => update(i, { label: e.target.value, ...(d.keyEdited ? {} : { key: keyFor(e.target.value) }) })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`field-${i}-key`}>Key</Label>
                  <Input id={`field-${i}-key`} value={d.key} disabled={disabled} className="text-code-s" onChange={(e) => update(i, { key: e.target.value, keyEdited: true })} />
                </div>
                <FieldSelect id={`field-${i}-kind`} label="Kind" value={d.kind} disabled={disabled} items={labelItems(FIELD_KINDS, FIELD_KIND_LABELS)} onValueChange={(v) => update(i, { kind: v as FieldKind })} />
                <div className="flex items-end gap-0.5">
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={`Move field ${n} up`} disabled={disabled || i === 0} onClick={() => move(i, -1)}>
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={`Move field ${n} down`} disabled={disabled || i === drafts.length - 1} onClick={() => move(i, 1)}>
                    <ArrowDown className="size-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove field ${n}`} disabled={disabled} onClick={() => setDrafts((x) => x.filter((_, j) => j !== i))}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
                {d.kind === 'select' ? (
                  <div className="flex flex-col gap-1.5 md:col-span-3">
                    <Label htmlFor={`field-${i}-options`}>Options</Label>
                    <Input id={`field-${i}-options`} value={d.optionText} disabled={disabled} placeholder="Accounts, Checkout, Search" onChange={(e) => update(i, { optionText: e.target.value })} />
                  </div>
                ) : null}
                <div className="flex items-center gap-2 md:col-span-4">
                  <Checkbox id={`field-${i}-required`} checked={d.required} disabled={disabled || d.kind === 'checkbox'} onCheckedChange={(on) => update(i, { required: on === true })} />
                  <Label htmlFor={`field-${i}-required`}>Required</Label>
                </div>
              </li>
            );
          })}
        </ol>
        {duplicate ? <p className="text-body-s text-danger-text">Two fields use the key “{duplicate}”.</p> : null}
        {error ? <p className="text-body-s text-danger-text">{error}</p> : null}
        {canEdit ? (
          <div className="flex flex-wrap justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled || drafts.length >= 30}
              onClick={() => setDrafts((d) => [...d, { key: `field_${d.length + 1}`, label: '', kind: 'text', options: [], required: false, optionText: '', keyEdited: false }])}
            >
              <Plus className="size-3.5" />
              Add field
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={disabled || invalid || !!duplicate}
              onClick={() =>
                onSave(
                  drafts.map((d) => ({
                    key: d.key.trim(),
                    label: d.label.trim(),
                    kind: d.kind,
                    required: d.kind === 'checkbox' ? false : d.required,
                    options: d.kind === 'select' ? d.optionText.split(',').map((o) => o.trim()).filter(Boolean) : [],
                  })),
                )
              }
            >
              {pending ? 'Saving…' : 'Save fields'}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
