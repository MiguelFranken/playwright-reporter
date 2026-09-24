<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Payload CMS

Payload lives in `payload/` and `payload.config.ts`; follow the `payload` skill in
`.agents/skills/payload` for collections, fields, access control and hooks.

Never edit `app/(payload)/*` or `app/(payload)/admin/importMap.js` by hand; regenerate the
import map with `pnpm payload:importmap`.

`packages/ui` never imports Payload. Marketing components take plain props; the adapters in
`components/blocks/` are the only place Payload types and `@miguelfranken/ui` meet.
