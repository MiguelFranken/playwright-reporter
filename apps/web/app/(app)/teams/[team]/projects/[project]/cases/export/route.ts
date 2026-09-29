import { AccessError, requireProjectOr404 } from '@/lib/auth/access';
import { exportCases } from '@/lib/db/queries/test-cases';
import { isUuid } from '@/lib/db/queries/shared';
import { toCsv } from '@/lib/test-cases/transfer';

type Params = Promise<{ team: string; project: string }>;

/**
 * Downloads the project's test cases (or one suite's subtree, `?suite=`) as
 * JSON, which re-imports with everything intact, or as CSV (`?format=csv`)
 * for a spreadsheet.
 */
export async function GET(request: Request, { params }: { params: Params }) {
  const { team, project: slug } = await params;
  let access;
  try {
    access = await requireProjectOr404(team, slug, { testCase: ['read'] });
  } catch (error) {
    if (error instanceof AccessError) return error.toResponse();
    throw error;
  }
  const url = new URL(request.url);
  const suite = url.searchParams.get('suite');
  const doc = await exportCases(access.project.id, { suite: suite === 'unassigned' || (suite && isUuid(suite)) ? suite : undefined });
  const stamp = new Date().toISOString().slice(0, 10);
  const name = `${access.project.slug}-test-cases-${stamp}`;
  const headers = { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' };
  if (url.searchParams.get('format') === 'csv') {
    // A byte order mark, so spreadsheet apps read the file as UTF-8.
    return new Response(`﻿${toCsv(doc)}`, {
      headers: { ...headers, 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${name}.csv"` },
    });
  }
  return new Response(JSON.stringify(doc, null, 2), {
    headers: { ...headers, 'content-type': 'application/json; charset=utf-8', 'content-disposition': `attachment; filename="${name}.json"` },
  });
}
