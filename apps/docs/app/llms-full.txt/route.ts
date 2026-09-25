import { docsLlms } from '@/lib/source';

export const revalidate = false;

/** Every page as Markdown in one file, in navigation order. */
export async function GET() {
  return new Response(await docsLlms.full(), { headers: { 'content-type': 'text/markdown; charset=utf-8' } });
}
