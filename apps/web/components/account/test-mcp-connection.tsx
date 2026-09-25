'use client';

import { useState, useTransition } from 'react';
import { McpConnectionTest, type McpConnectionResult } from '@miguelfranken/ui/views/account/mcp-connection-test';
import { testMcpConnection } from '@/app/(app)/account/ai/actions';

/**
 * The "Test connection" slot of the AI assistants view. It reports what an
 * assistant signed in as this user would find — whether the server is on, and
 * which projects it reaches — without the user having to paste a token first.
 */
export function TestMcpConnection() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<McpConnectionResult | null>(null);
  return <McpConnectionTest pending={pending} result={result} onTest={() => startTransition(async () => setResult(await testMcpConnection()))} />;
}
