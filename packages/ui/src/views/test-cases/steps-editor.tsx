'use client';

import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { Button } from '../../components/button';
import { Input } from '../../components/input';
import { Label } from '../../components/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/select';
import { SegmentedControl } from '../../components/segmented-control';
import { Textarea } from '../../components/textarea';
import {
  GHERKIN_KEYWORD_LABELS,
  GHERKIN_KEYWORDS,
  labelItems,
  STEP_FORMAT_LABELS,
  STEP_FORMATS,
  type CaseStep,
  type GherkinKeyword,
  type StepFormat,
} from '../../lib/test-cases';

const KEYWORD_ITEMS = labelItems(GHERKIN_KEYWORDS, GHERKIN_KEYWORD_LABELS);

export function blankStep(format: StepFormat, previous?: CaseStep): CaseStep {
  const keyword: GherkinKeyword = format === 'gherkin' ? (previous ? (previous.keyword === 'given' ? 'when' : previous.keyword === 'when' ? 'then' : 'and') : 'given') : 'given';
  return { action: '', data: '', expected: '', keyword };
}

/**
 * The steps of a case, in either format. Switching formats keeps every step's
 * text: classic shows action, test data and expected result; Gherkin shows the
 * keyword and the action.
 */
export function StepsEditor({
  format,
  steps,
  onFormatChange,
  onStepsChange,
  disabled,
}: {
  format: StepFormat;
  steps: CaseStep[];
  onFormatChange: (format: StepFormat) => void;
  onStepsChange: (steps: CaseStep[]) => void;
  disabled?: boolean;
}) {
  const update = (i: number, patch: Partial<CaseStep>) => onStepsChange(steps.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = (i: number, by: -1 | 1) => {
    const next = [...steps];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    onStepsChange(next);
  };

  return (
    <section aria-labelledby="steps-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="steps-heading" className="text-headline-s">
          Steps
        </h3>
        <SegmentedControl
          aria-label="Step format"
          value={format}
          items={STEP_FORMATS.map((f) => ({ value: f, label: STEP_FORMAT_LABELS[f] }))}
          onValueChange={(v) => onFormatChange(v as StepFormat)}
        />
      </div>

      {steps.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border-strong px-4 py-6 text-center text-body-s text-muted-foreground">
          No steps yet. {format === 'gherkin' ? 'Describe the scenario with Given, When and Then.' : 'Add what to do and what should happen.'}
        </p>
      ) : (
        <ol className="flex flex-col gap-2">
          {steps.map((step, i) => {
            const n = i + 1;
            return (
              <li key={i} className="flex gap-3 rounded-lg border border-border bg-surface p-3">
                <span className="mt-2 w-5 shrink-0 text-end text-code-s text-muted-foreground tabular-nums" aria-hidden>
                  {n}.
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  {format === 'gherkin' ? (
                    <div className="flex gap-2">
                      <Select items={KEYWORD_ITEMS} value={step.keyword} disabled={disabled} onValueChange={(v) => v && update(i, { keyword: v as GherkinKeyword })}>
                        <SelectTrigger aria-label={`Step ${n} keyword`} className="w-28 shrink-0">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {KEYWORD_ITEMS.map((k) => (
                            <SelectItem key={k.value} value={k.value}>
                              {k.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input aria-label={`Step ${n}`} value={step.action} disabled={disabled} onChange={(e) => update(i, { action: e.target.value })} placeholder="the customer has a saved card" />
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-col gap-1">
                        <Label htmlFor={`step-${i}-action`} className="text-label-s text-muted-foreground">
                          Step {n}: action
                        </Label>
                        <Textarea id={`step-${i}-action`} rows={2} value={step.action} disabled={disabled} onChange={(e) => update(i, { action: e.target.value })} />
                      </div>
                      <div className="grid gap-2 md:grid-cols-2">
                        <div className="flex flex-col gap-1">
                          <Label htmlFor={`step-${i}-data`} className="text-label-s text-muted-foreground">
                            Test data
                          </Label>
                          <Input id={`step-${i}-data`} value={step.data} disabled={disabled} onChange={(e) => update(i, { data: e.target.value })} />
                        </div>
                        <div className="flex flex-col gap-1">
                          <Label htmlFor={`step-${i}-expected`} className="text-label-s text-muted-foreground">
                            Expected result
                          </Label>
                          <Input id={`step-${i}-expected`} value={step.expected} disabled={disabled} onChange={(e) => update(i, { expected: e.target.value })} />
                        </div>
                      </div>
                    </>
                  )}
                </div>
                <div className="flex shrink-0 flex-col gap-0.5">
                  <Button type="button" variant="ghost" size="icon-xs" aria-label={`Move step ${n} up`} disabled={disabled || i === 0} onClick={() => move(i, -1)}>
                    <ArrowUp className="size-3.5" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon-xs" aria-label={`Move step ${n} down`} disabled={disabled || i === steps.length - 1} onClick={() => move(i, 1)}>
                    <ArrowDown className="size-3.5" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon-xs" aria-label={`Remove step ${n}`} disabled={disabled} onClick={() => onStepsChange(steps.filter((_, j) => j !== i))}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <div>
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => onStepsChange([...steps, blankStep(format, steps.at(-1))])}>
          <Plus className="size-3.5" />
          Add step
        </Button>
      </div>
    </section>
  );
}
