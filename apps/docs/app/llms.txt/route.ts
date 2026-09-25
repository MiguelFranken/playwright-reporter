import { docsLlms } from '@/lib/source';

export const revalidate = false;

/** The index for AI agents (llmstxt.org): every page with its description. */
export async function GET() {
  return new Response(await docsLlms.index(), { headers: { 'content-type': 'text/markdown; charset=utf-8' } });
}
