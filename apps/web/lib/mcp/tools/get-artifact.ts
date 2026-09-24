import type { ImageContent } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { attachmentsOfResult, getAttachmentInProject } from '@/lib/db/queries/mcp-analysis';
import type { Attachment } from '@/lib/db/schema';
import { getStorage } from '@/lib/storage';
import { daysFor, getRetentionPolicy } from '@/lib/storage/retention';
import { inlineImageMaxBytes } from '../config';
import { ToolError, invalid, notFound } from '../errors';
import { commonParams, isUuid, resultParam } from '../params';
import { defineTool, output } from '../registry';
import { link } from '../render/markdown';
import { resolveResult } from '../resolve';

const TEXT_TYPES = /^(text\/|application\/(json|xml|x-ndjson))/;
const MAX_TEXT_BYTES = 256 * 1024;

const input = z.object({
  ...commonParams,
  attachment: z.string().optional().describe('Attachment id (from get_result or get_failure_context).'),
  result: resultParam.optional().describe('Instead of an id: a result, whose failing attempt’s diff, actual or screenshot is picked.'),
  name: z.string().optional().describe('With "result": the attachment name to pick (e.g. "trace", "screenshot").'),
  kind: z.enum(['screenshot', 'video', 'trace', 'image', 'text', 'other']).optional().describe('With "result": the kind to pick.'),
});

const outputSchema = output({
  project: z.string(),
  attachment: z.object({ id: z.string(), name: z.string(), kind: z.string(), contentType: z.string(), sizeBytes: z.number().nullable(), attempt: z.number() }),
  resultUrl: z.string(),
  delivered: z.enum(['image', 'text', 'link']),
  url: z.string(),
  traceViewerUrl: z.string().nullable(),
  showTraceCommand: z.string().nullable(),
  text: z.string().nullable(),
  note: z.string().nullable(),
});

/** Visual failures first: a diff says the most, then the actual image, then any screenshot. */
function pickVisual(list: { attachment: Attachment; retry: number; attemptStatus: string }[], name?: string, kind?: string) {
  const usable = list.filter((a) => (!name || a.attachment.name.toLowerCase().includes(name.toLowerCase())) && (!kind || a.attachment.kind === kind));
  if (name || kind) return usable[0];
  const failing = usable.filter((a) => a.attemptStatus !== 'passed');
  const pool = failing.length ? failing : usable;
  const score = (a: Attachment) => (/diff/i.test(a.name) ? 0 : /actual/i.test(a.name) ? 1 : a.kind === 'screenshot' ? 2 : a.kind === 'image' ? 3 : a.kind === 'trace' ? 4 : 5);
  return [...pool].sort((a, b) => score(a.attachment) - score(b.attachment))[0];
}

async function readAll(stream: ReadableStream<Uint8Array>, max: number): Promise<{ bytes: Uint8Array; complete: boolean }> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let complete = true;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
    if (size > max) {
      complete = false;
      await reader.cancel();
      break;
    }
  }
  const bytes = new Uint8Array(Math.min(size, max));
  let offset = 0;
  for (const chunk of chunks) {
    const take = Math.min(chunk.byteLength, bytes.byteLength - offset);
    bytes.set(chunk.subarray(0, take), offset);
    offset += take;
    if (offset >= bytes.byteLength) break;
  }
  return { bytes, complete };
}

export const getArtifact = defineTool({
  name: 'get_artifact',
  title: 'Get artifact',
  toolset: 'debug',
  description:
    'The contents of one test attachment: screenshots and visual diffs as images you can look at, text attachments inline, traces and videos as short-lived links (with a trace-viewer link and a local show-trace command).',
  input,
  output: outputSchema,
  async handler(args, ctx) {
    const project = await ctx.project(args.project, { artifact: ['read'] });
    let row: NonNullable<Awaited<ReturnType<typeof getAttachmentInProject>>> | null = null;
    if (args.attachment) {
      if (!isUuid(args.attachment)) throw invalid('"attachment" is an attachment id, e.g. from get_result.');
      row = await getAttachmentInProject(project.project.id, args.attachment.toLowerCase());
      if (!row) throw notFound(`Attachment ${args.attachment} not found in ${project.ref}.`, 'Call get_result to list a result’s attachments.');
    } else if (args.result) {
      const { resultId } = await resolveResult(project, { result: args.result });
      const picked = pickVisual(await attachmentsOfResult(resultId), args.name, args.kind);
      if (!picked) throw notFound('That result has no matching attachment.', 'Call get_result to see its attachments.');
      row = await getAttachmentInProject(project.project.id, picked.attachment.id);
    } else {
      throw invalid('Pass "attachment", or "result" (optionally with "name" or "kind").');
    }
    const a = row!.attachment;
    if (a.status === 'expired') {
      const { policy } = await getRetentionPolicy();
      throw new ToolError(
        'ARTIFACT_EXPIRED',
        `The ${a.kind} "${a.name}" was deleted by the retention policy${policy.enabled ? ` (${a.kind} attachments are kept ${daysFor(policy, a.kind)} days)` : ''}.`,
        'Re-run the test to produce a fresh one (get_rerun_command).',
      );
    }
    if (a.status !== 'uploaded') {
      throw new ToolError('ARTIFACT_UNAVAILABLE', `The ${a.kind} "${a.name}" is ${a.status === 'pending' ? 'still uploading' : 'missing: its upload failed'}.`);
    }

    const url = ctx.artifactUrl(a.id);
    const resultUrl = project.links.result(row!.runNumber, row!.resultId);
    const base = {
      project: project.ref,
      attachment: { id: a.id, name: a.name, kind: a.kind, contentType: a.contentType, sizeBytes: a.sizeBytes, attempt: row!.retry + 1 },
      resultUrl,
      url,
      traceViewerUrl: null as string | null,
      showTraceCommand: null as string | null,
      text: null as string | null,
      note: null as string | null,
    };
    let images: ImageContent[] = [];
    let delivered: 'image' | 'text' | 'link' = 'link';

    if (a.kind === 'trace') {
      base.traceViewerUrl = `https://trace.playwright.dev/?trace=${encodeURIComponent(url)}`;
      base.showTraceCommand = `npx playwright show-trace "${url}"`;
      base.note = 'Open the trace in the viewer, or run the command locally; the link expires in a few minutes.';
    } else if (a.contentType.startsWith('image/') && (a.sizeBytes ?? 0) <= inlineImageMaxBytes()) {
      const object = await getStorage().get(a.storageKey);
      if (object) {
        const { bytes, complete } = await readAll(object.stream, inlineImageMaxBytes());
        if (complete) {
          images = [{ type: 'image', data: Buffer.from(bytes).toString('base64'), mimeType: a.contentType }];
          delivered = 'image';
        }
      }
      if (delivered !== 'image') base.note = 'The image is too large to inline; open the link.';
    } else if (TEXT_TYPES.test(a.contentType)) {
      const object = await getStorage().get(a.storageKey);
      if (object) {
        const { bytes, complete } = await readAll(object.stream, MAX_TEXT_BYTES);
        base.text = new TextDecoder().decode(bytes);
        delivered = 'text';
        if (!complete) base.note = `Only the first ${MAX_TEXT_BYTES / 1024} KB are shown.`;
      }
    } else {
      base.note = a.contentType.startsWith('image/') ? 'The image is too large to inline; open the link.' : 'Binary attachment: open the link.';
    }

    return {
      data: { ...base, delivered },
      images,
      render(md, d) {
        md.heading(`${d.attachment.kind}: ${d.attachment.name} (attempt ${d.attachment.attempt})`, 2);
        md.kv([
          ['Type', `${d.attachment.contentType}${d.attachment.sizeBytes ? `, ${Math.round(d.attachment.sizeBytes / 1024)} KB` : ''}`],
          ['Result', link('open in app', d.resultUrl)],
          ['Link (expires soon)', d.url],
          ['Trace viewer', d.traceViewerUrl],
          ['Locally', d.showTraceCommand ? `\`${d.showTraceCommand}\`` : null],
        ]);
        if (d.delivered === 'image') md.line('The image is attached below.');
        if (d.text !== null) md.untrusted('Attachment', d.text, 20_000);
        if (d.note) md.line(d.note);
      },
    };
  },
});
