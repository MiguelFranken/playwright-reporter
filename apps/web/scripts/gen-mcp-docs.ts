/**
 * Writes docs/mcp-tools.md from the MCP tool registry. Run from apps/web:
 * `nub run mcp:docs`.
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { renderToolsDoc } from '../lib/mcp/docs';

const target = path.resolve(import.meta.dirname, '../../../docs/mcp-tools.md');
writeFileSync(target, renderToolsDoc());
console.log(`wrote ${path.relative(process.cwd(), target)}`);
