/**
 * Renders the tool reference (`docs/mcp-tools.md`) from the registry itself,
 * so the documentation cannot drift from the schemas clients actually see.
 * `docs.test.ts` fails when the committed file is out of date; regenerate
 * with `nub run mcp:docs` in apps/web.
 */
import { z } from 'zod';
import { DEFAULT_ANNOTATIONS, type ToolDef } from './registry';
import { TOOLS } from './tools';
import { PROMPTS } from './prompts';

type JsonSchema = {
  type?: string | string[];
  description?: string;
  enum?: unknown[];
  items?: JsonSchema;
  anyOf?: JsonSchema[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  default?: unknown;
  minimum?: number;
  maximum?: number;
};

function typeOf(s: JsonSchema): string {
  if (s.enum) return s.enum.map((v) => `\`${JSON.stringify(v)}\``).join(' \\| ');
  if (s.anyOf) return s.anyOf.map(typeOf).join(' \\| ');
  if (s.type === 'array') return `${s.items ? typeOf(s.items) : 'any'}[]`;
  const t = Array.isArray(s.type) ? s.type.join(' \\| ') : (s.type ?? 'any');
  const range = s.minimum !== undefined || s.maximum !== undefined ? ` (${s.minimum ?? ''}–${s.maximum ?? ''})` : '';
  return `${t}${range}`;
}

function describeOf(s: JsonSchema): string {
  return (s.description ?? s.anyOf?.find((a) => a.description)?.description ?? '').replace(/\|/g, '\\|');
}

function inputTable(schema: z.ZodObject): string[] {
  const json = z.toJSONSchema(schema, { io: 'input' }) as JsonSchema;
  const props = Object.entries(json.properties ?? {});
  if (props.length === 0) return ['No parameters.'];
  const required = new Set(json.required ?? []);
  return [
    '| Parameter | Type | Required | Description |',
    '|---|---|---|---|',
    ...props.map(([name, s]) => `| \`${name}\` | ${typeOf(s)} | ${required.has(name) ? 'yes' : ''} | ${describeOf(s)} |`),
  ];
}

function outputFields(schema: z.ZodObject): string {
  const json = z.toJSONSchema(schema, { io: 'output' }) as JsonSchema;
  return Object.keys(json.properties ?? {})
    .map((k) => `\`${k}\``)
    .join(', ');
}

function firstSentence(text: string) {
  return `${text.split('. ')[0].replace(/\.$/, '').replace(/\|/g, '\\|')}.`;
}

export function renderToolsDoc(tools: ToolDef[] = TOOLS): string {
  const lines = [
    '# MCP tool reference',
    '',
    '<!-- Generated from apps/web/lib/mcp by `nub run mcp:docs` (in apps/web). Do not edit by hand. -->',
    '',
    'Every tool is read-only (`readOnlyHint: true`, `idempotentHint: true`, `openWorldHint: false`). Every project-scoped tool',
    'also accepts `project`, `format` (`markdown` | `json`) and `maxChars`. See the README section "AI assistants (MCP)" for setup.',
    '',
    '| Tool | Toolset | Summary |',
    '|---|---|---|',
    ...tools.map((t) => `| [\`${t.name}\`](#${t.name}) | ${t.toolset} | ${firstSentence(t.description)} |`),
    '',
  ];
  for (const tool of tools) {
    const annotations = { ...DEFAULT_ANNOTATIONS, ...tool.annotations };
    lines.push(
      `## ${tool.name}`,
      '',
      `**${tool.title}** · toolset \`${tool.toolset}\`${annotations.readOnlyHint ? '' : ' · **writes**'}`,
      '',
      tool.description,
      '',
      ...inputTable(tool.input),
      '',
      `Structured output fields: ${outputFields(tool.output)}.`,
      '',
    );
  }
  lines.push('## Prompts', '', '| Prompt | Arguments | Purpose |', '|---|---|---|');
  for (const prompt of PROMPTS) {
    const json = z.toJSONSchema(prompt.args, { io: 'input' }) as JsonSchema;
    const required = new Set(json.required ?? []);
    const args = Object.keys(json.properties ?? {}).map((k) => (required.has(k) ? `\`${k}\`` : `\`${k}?\``));
    lines.push(`| \`${prompt.name}\` | ${args.join(', ') || '–'} | ${prompt.description.replace(/\|/g, '\\|')} |`);
  }
  lines.push(
    '',
    '## Resources',
    '',
    '| URI | Content |',
    '|---|---|',
    '| `pwr://guide` | How to use the tools: identifiers, verdicts, paging, safety. |',
    '| `pwr://projects/{team}/{project}/runs/{number}` | A run summary in markdown. |',
    '| `pwr://artifacts/{attachmentId}` | An artifact’s bytes (access-checked on every read). |',
    '',
  );
  return lines.join('\n');
}
