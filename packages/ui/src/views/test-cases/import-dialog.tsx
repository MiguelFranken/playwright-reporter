'use client';

import { useState } from 'react';
import { Button } from '../../components/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/dialog';
import { FileInput } from '../../components/file-input';
import { Label } from '../../components/label';
import { FieldSelect } from './field-select';

export type ImportDuplicates = 'skip' | 'update' | 'copy';

export interface ImportSummary {
  created: number;
  updated: number;
  skipped: number;
  suites: number;
  errors: string[];
}

/**
 * Imports cases from a file exported here (JSON, with suites and history-free
 * content) or a spreadsheet (CSV, one case per row). A case counts as a
 * duplicate when its key (`TC-12`) or, without one, its title and suite match.
 */
export function ImportDialog({
  open,
  onOpenChange,
  action,
  pending = false,
  error,
  summary,
  hidden = {},
}: {
  /** Extra form fields the action needs, such as the project. */
  hidden?: Record<string, string>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The native form action: fields `file` and `duplicates`. */
  action: (formData: FormData) => void;
  pending?: boolean;
  error?: string | null;
  summary?: ImportSummary | null;
}) {
  const [duplicates, setDuplicates] = useState<ImportDuplicates>('skip');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form action={action} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Import test cases</DialogTitle>
            <DialogDescription>
              A JSON file exported from here keeps suites, steps and fields. A CSV needs a <code className="text-code-s">title</code> column; <code className="text-code-s">suite</code> (with <code className="text-code-s">/</code> between levels), <code className="text-code-s">steps</code>, <code className="text-code-s">priority</code> and the rest are optional.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="import-file">File</Label>
            <FileInput
              id="import-file"
              name="file"
              accept=".json,.csv,application/json,text/csv"
              required
              disabled={pending}
              prompt="Choose a file or drag it here"
              hint="JSON or CSV, up to 4 MB"
            />
          </div>
          <input type="hidden" name="duplicates" value={duplicates} />
          {Object.entries(hidden).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          <FieldSelect
            id="import-duplicates"
            label="When a case already exists"
            value={duplicates}
            disabled={pending}
            onValueChange={(v) => setDuplicates(v as ImportDuplicates)}
            items={[
              { value: 'skip', label: 'Keep the existing case' },
              { value: 'update', label: 'Update it from the file' },
              { value: 'copy', label: 'Import a copy' },
            ]}
          />
          {error ? <p className="text-body-s text-danger-text">{error}</p> : null}
          {summary ? (
            <div role="status" className="rounded-lg border border-border bg-surface-sunken px-3 py-2 text-body-s">
              <p>
                {summary.created} created, {summary.updated} updated, {summary.skipped} skipped
                {summary.suites ? `, ${summary.suites} new ${summary.suites === 1 ? 'suite' : 'suites'}` : ''}.
              </p>
              {summary.errors.length ? (
                <ul className="mt-1 list-disc ps-5 text-danger-text">
                  {summary.errors.slice(0, 5).map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                  {summary.errors.length > 5 ? <li>…and {summary.errors.length - 5} more</li> : null}
                </ul>
              ) : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="ghost" disabled={pending} onClick={() => onOpenChange(false)}>
              {summary ? 'Close' : 'Cancel'}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Importing…' : 'Import'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
