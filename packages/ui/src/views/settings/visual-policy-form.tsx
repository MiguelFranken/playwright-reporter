'use client';

import { Plus, ShieldBan, ShieldCheck, Trash2 } from 'lucide-react';
import { useId, useState } from 'react';
import { Button } from '../../components/button';
import { Input } from '../../components/input';
import { Label } from '../../components/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/select';
import { cn } from '../../lib/cn';
import {
  AI_MODE_LABELS,
  AI_MODES,
  describePolicyScope,
  formatMicroUsd,
  POLICY_CAPABILITY_LABELS,
  POLICY_SCOPE_KINDS,
  POLICY_SCOPE_LABELS,
  type AiMode,
  type PolicyCapability,
  type PolicyRule,
  type PolicyScope,
  type PolicyScopeKind,
} from '../../lib/visual-diff';

export interface VisualAiValues {
  mode: AiMode;
  model: string | null;
  monthlyBudgetMicroUsd: number | null;
  perJobMaxMicroUsd: number;
}

/** Things a rule's scope can name, offered as choices. */
export interface PolicyChoices {
  suites: { id: string; name: string }[];
  tests: { id: string; title: string; file: string }[];
  /** The models the deployment allows. */
  models: string[];
}

export interface VisualPolicyFormProps {
  rules: readonly PolicyRule[];
  ai: VisualAiValues;
  choices: PolicyChoices;
  /** The form action — the app passes its `useActionState` dispatcher. Fields: `rules` (JSON), `aiMode`, `aiModel`, `aiMonthlyBudgetUsd`, `aiPerJobMaxUsd`. */
  action: (formData: FormData) => void;
  pending?: boolean;
  error?: string | null;
  disabled?: boolean;
  /** Why the deployment cannot run analyses, when it cannot (no gateway key). */
  aiUnavailableReason?: string | null;
  /** This month so far, in micro-dollars, when known. */
  spentThisMonthMicroUsd?: number | null;
  children?: React.ReactNode;
}

const usd = (micro: number | null) => (micro === null ? '' : String(Math.round(micro / 10_000) / 100));

/**
 * Project settings → Visual comparison → Where rules and AI analyses are
 * allowed: a list of scoped allow/deny rules for the two abilities that change
 * what a comparison means or cost money, and the project's AI mode and budget.
 * A deny on a folder beats an allow on a screen inside it.
 */
export function VisualPolicyForm({ rules, ai, choices, action, pending = false, error, disabled = false, aiUnavailableReason, spentThisMonthMicroUsd, children }: VisualPolicyFormProps) {
  const [list, setList] = useState<PolicyRule[]>([...rules]);
  const [draft, setDraft] = useState<{ kind: PolicyScopeKind; capability: PolicyCapability; effect: 'allow' | 'deny'; path: string; suiteId: string; testId: string; checkpointName: string; variant: string }>({
    kind: 'file',
    capability: 'ai',
    effect: 'deny',
    path: '',
    suiteId: choices.suites[0]?.id ?? '',
    testId: choices.tests[0]?.id ?? '',
    checkpointName: '',
    variant: '',
  });
  const off = disabled || pending;
  const ids = useId();
  const scopeOf = (): PolicyScope | null => {
    switch (draft.kind) {
      case 'project':
        return { kind: 'project' };
      case 'file':
        return draft.path.trim() ? { kind: 'file', path: draft.path.trim() } : null;
      case 'suite': {
        const s = choices.suites.find((x) => x.id === draft.suiteId);
        return s ? { kind: 'suite', suiteId: s.id, name: s.name } : null;
      }
      case 'test': {
        const t = choices.tests.find((x) => x.id === draft.testId);
        return t ? { kind: 'test', testId: t.id, title: t.title } : null;
      }
      case 'screen': {
        const t = choices.tests.find((x) => x.id === draft.testId);
        return t && draft.checkpointName.trim() ? { kind: 'screen', testId: t.id, checkpointName: draft.checkpointName.trim(), title: `${t.title} › ${draft.checkpointName.trim()}` } : null;
      }
      case 'variant': {
        const t = choices.tests.find((x) => x.id === draft.testId);
        return t && draft.checkpointName.trim() && draft.variant.trim() ? { kind: 'variant', testId: t.id, checkpointName: draft.checkpointName.trim(), variant: draft.variant.trim() } : null;
      }
    }
  };
  const add = () => {
    const scope = scopeOf();
    if (!scope) return;
    setList((l) => [...l, { id: `rule-${Date.now().toString(36)}-${l.length}`, scope, capability: draft.capability, effect: draft.effect }]);
  };
  const needsTest = draft.kind === 'test' || draft.kind === 'screen' || draft.kind === 'variant';
  return (
    <form action={action} className="flex flex-col gap-5">
      {children}
      <input type="hidden" name="rules" value={JSON.stringify(list)} />
      <section className="flex flex-col gap-3" aria-labelledby={`${ids}-rules`}>
        <div>
          <h3 id={`${ids}-rules`} className="text-label-m">
            Where rules and AI analyses are allowed
          </h3>
          <p className="text-xs text-muted-foreground">Leaving areas out of a comparison is allowed everywhere unless denied; AI analysis follows the mode below. A deny on a folder or suite wins over an allow on a screen inside it.</p>
        </div>
        {list.length ? (
          <ul className="flex flex-col gap-1" aria-label="Policy rules">
            {list.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 rounded-md bg-surface-sunken px-2.5 py-1.5 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  {r.effect === 'deny' ? <ShieldBan aria-hidden className="size-4 shrink-0 text-danger-text" /> : <ShieldCheck aria-hidden className="size-4 shrink-0 text-success-text" />}
                  <span className="min-w-0 truncate">
                    <span className={cn('font-medium', r.effect === 'deny' ? 'text-danger-text' : 'text-success-text')}>{r.effect === 'deny' ? 'Deny' : 'Allow'}</span> {POLICY_CAPABILITY_LABELS[r.capability].toLowerCase()} · <span className="text-muted-foreground">{POLICY_SCOPE_LABELS[r.scope.kind]}:</span> {describePolicyScope(r.scope)}
                  </span>
                </span>
                {disabled ? null : (
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove rule: ${r.effect} ${POLICY_CAPABILITY_LABELS[r.capability].toLowerCase()} for ${describePolicyScope(r.scope)}`} onClick={() => setList((l) => l.filter((x) => x.id !== r.id))}>
                    <Trash2 />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No rules: the project's defaults apply everywhere.</p>
        )}
        {disabled ? null : (
          <div className="flex flex-wrap items-end gap-2 rounded-md border border-dashed border-border p-3" role="group" aria-label="Add a rule">
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${ids}-effect`}>Effect</Label>
              <Select value={draft.effect} onValueChange={(v) => setDraft({ ...draft, effect: (v as 'allow' | 'deny') ?? 'deny' })}>
                <SelectTrigger id={`${ids}-effect`} size="sm" className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="deny">Deny</SelectItem>
                  <SelectItem value="allow">Allow</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${ids}-capability`}>Ability</Label>
              <Select value={draft.capability} onValueChange={(v) => setDraft({ ...draft, capability: (v as PolicyCapability) ?? 'ai' })}>
                <SelectTrigger id={`${ids}-capability`} size="sm" className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['ai', 'ignore'] as const).map((c) => (
                    <SelectItem key={c} value={c}>
                      {POLICY_CAPABILITY_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${ids}-kind`}>Scope</Label>
              <Select value={draft.kind} onValueChange={(v) => setDraft({ ...draft, kind: (v as PolicyScopeKind) ?? 'file' })}>
                <SelectTrigger id={`${ids}-kind`} size="sm" className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {POLICY_SCOPE_KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {POLICY_SCOPE_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {draft.kind === 'file' ? (
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${ids}-path`}>Spec file or folder</Label>
                <Input id={`${ids}-path`} value={draft.path} onChange={(e) => setDraft({ ...draft, path: e.target.value })} placeholder="tests/checkout" className="h-8 w-56" />
              </div>
            ) : null}
            {draft.kind === 'suite' ? (
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${ids}-suite`}>Suite</Label>
                <Select value={draft.suiteId} onValueChange={(v) => setDraft({ ...draft, suiteId: String(v ?? '') })}>
                  <SelectTrigger id={`${ids}-suite`} size="sm" className="w-56">
                    <SelectValue placeholder="Choose a suite" />
                  </SelectTrigger>
                  <SelectContent>
                    {choices.suites.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            {needsTest ? (
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${ids}-test`}>Test</Label>
                <Select value={draft.testId} onValueChange={(v) => setDraft({ ...draft, testId: String(v ?? '') })}>
                  <SelectTrigger id={`${ids}-test`} size="sm" className="w-64">
                    <SelectValue placeholder="Choose a test" />
                  </SelectTrigger>
                  <SelectContent>
                    {choices.tests.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            {draft.kind === 'screen' || draft.kind === 'variant' ? (
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${ids}-checkpoint`}>Checkpoint key</Label>
                <Input id={`${ids}-checkpoint`} value={draft.checkpointName} onChange={(e) => setDraft({ ...draft, checkpointName: e.target.value })} placeholder="booking-summary" className="h-8 w-44" />
              </div>
            ) : null}
            {draft.kind === 'variant' ? (
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${ids}-variant`}>Variant</Label>
                <Input id={`${ids}-variant`} value={draft.variant} onChange={(e) => setDraft({ ...draft, variant: e.target.value })} placeholder="mobile" className="h-8 w-28" />
              </div>
            ) : null}
            <Button type="button" variant="outline" size="sm" disabled={!scopeOf() || off} onClick={add}>
              <Plus /> Add rule
            </Button>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby={`${ids}-ai`}>
        <div>
          <h3 id={`${ids}-ai`} className="text-label-m">
            AI analysis of visual differences
          </h3>
          <p className="text-xs text-muted-foreground">
            A model looks at the changed regions and says what it sees — a random name, a clock, a real change — and may propose tight areas to leave out, which a person accepts or not. It sends crops of the images to the provider and costs money; the budget is enforced, not just shown.
          </p>
        </div>
        {aiUnavailableReason ? <p className="rounded-md border border-warning-border bg-warning-subtle px-3 py-2 text-xs text-warning-text">{aiUnavailableReason}</p> : null}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${ids}-mode`}>Mode</Label>
            <Select name="aiMode" defaultValue={ai.mode} disabled={off}>
              <SelectTrigger id={`${ids}-mode`} size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AI_MODES.map((m) => (
                  <SelectItem key={m} value={m}>
                    {AI_MODE_LABELS[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">On request: a button in the viewer. After every run: new differences are analysed once each, within the budget.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${ids}-model`}>Model</Label>
            {choices.models.length ? (
              <Select name="aiModel" defaultValue={ai.model && choices.models.includes(ai.model) ? ai.model : choices.models[0]} disabled={off}>
                <SelectTrigger id={`${ids}-model`} size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {choices.models.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input id={`${ids}-model`} name="aiModel" defaultValue={ai.model ?? ''} disabled={off} className="h-8" placeholder="google/gemini-3.8-flash" />
            )}
            <p className="text-xs text-muted-foreground">From the deployment's allow list.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${ids}-budget`}>Monthly budget, USD</Label>
            <Input id={`${ids}-budget`} name="aiMonthlyBudgetUsd" type="number" inputMode="decimal" min={0} step={0.01} defaultValue={usd(ai.monthlyBudgetMicroUsd)} disabled={off} className="h-8" placeholder="no cap below the team's" />
            <p className="text-xs text-muted-foreground">{spentThisMonthMicroUsd != null ? `${formatMicroUsd(spentThisMonthMicroUsd)} spent or reserved this month (UTC).` : 'Reserved before each call, settled after; the team’s limit applies too.'}</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${ids}-perjob`}>Per analysis, USD</Label>
            <Input id={`${ids}-perjob`} name="aiPerJobMaxUsd" type="number" inputMode="decimal" min={0.001} step={0.001} defaultValue={usd(ai.perJobMaxMicroUsd)} disabled={off} className="h-8" />
            <p className="text-xs text-muted-foreground">The most one analysis may reserve.</p>
          </div>
        </div>
      </section>
      {disabled ? null : (
        <div className="flex items-center gap-3">
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? 'Saving…' : 'Save'}
          </Button>
          {error ? (
            <p role="alert" className="text-sm text-danger-text">
              {error}
            </p>
          ) : null}
        </div>
      )}
    </form>
  );
}
