'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { SuiteOption } from '@miguelfranken/ui/lib/test-case-models';
import { TestPickerDialog, type TestPickerResult } from '@miguelfranken/ui/views/test-cases/test-picker-dialog';
import type { ProjectRef } from '@/lib/rpc/client';
import { automatedTestsQuery } from '@/lib/rpc/queries';

/** The picker, fed by the project's Playwright tests as the user searches. Loads only while open. */
export function ConnectedTestPicker({
  projectRef,
  open,
  onOpenChange,
  mode,
  title,
  description,
  suites,
  onConfirm,
  pending,
}: {
  projectRef: ProjectRef;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'link' | 'adopt';
  title: string;
  description: React.ReactNode;
  suites?: SuiteOption[];
  onConfirm: (result: TestPickerResult) => void;
  pending: boolean;
}) {
  const [query, setQuery] = useState('');
  const tests = useQuery({ ...automatedTestsQuery(projectRef, query, mode === 'adopt'), enabled: open });
  return (
    <TestPickerDialog
      open={open}
      onOpenChange={onOpenChange}
      mode={mode}
      title={title}
      description={description}
      query={query}
      onQueryChange={setQuery}
      options={tests.data?.rows ?? []}
      total={tests.data?.total ?? 0}
      loading={tests.isPending}
      error={tests.isError ? 'The tests could not be loaded. Try again.' : null}
      suites={suites}
      onConfirm={onConfirm}
      pending={pending}
    />
  );
}
