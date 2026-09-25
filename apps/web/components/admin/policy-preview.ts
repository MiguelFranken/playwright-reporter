'use client';

import { useEffect, useState } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import type { PolicyPreviewStatus } from '@miguelfranken/ui/views/admin/policy-preview';

/** How long typing has to pause before the fields are previewed. */
export const PREVIEW_DEBOUNCE_MS = 400;

/** `value`, once it has stopped changing for `ms`. */
export function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

type Answer = { ok: true } | { ok: false; message: string };

/**
 * A retention preview query as `PolicyPreview` shows it. `settled` is false
 * while the fields on screen are newer than the ones asked about (the user is
 * still typing): the answer on screen is then dimmed as out of date.
 */
export function previewStatus<T extends Answer>(query: UseQueryResult<T>, settled: boolean): { status: PolicyPreviewStatus; message?: string } {
  if (query.isError) return { status: 'error' };
  const data = query.data;
  if (!data) return { status: 'loading' };
  if (!data.ok) return { status: 'invalid', message: data.message };
  return { status: !settled || query.isPlaceholderData || query.isFetching ? 'updating' : 'ready' };
}
