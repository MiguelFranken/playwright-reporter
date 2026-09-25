# apps/docs — the documentation site

A Next.js 16 app built on [Fumadocs](https://fumadocs.dev) and its Next.js integration (`fumadocs-mdx/next`,
`fumadocs-ui/provider/next`). It documents the product for the people who deploy and use it; the REST API reference is
one section of it.

```bash
nub exec turbo run dev --filter=@miguelfranken/docs   # http://localhost:3002
nub run --filter @miguelfranken/docs build
```

## Writing a page

- Pages are MDX under `content/docs/`. Frontmatter needs `title` and `description` (the description is the subtitle,
  the search snippet and the `llms.txt` entry).
- A folder's `meta.json` sets its title and page order. The root `meta.json` sets the sidebar sections.
- Components available without an import: the Fumadocs defaults (`Callout`, `Card`, `Cards`, code blocks with
  `title="…"`), plus `Steps`/`Step` and `Tabs`/`Tab` (`components/mdx.tsx`). Add more there.
- Link other pages by their URL (`/docs/deployment/vercel`).
- Facts come from the code, not from memory: env vars and defaults from `apps/web/lib/**/config.ts`, roles from
  `apps/web/lib/auth/permissions.ts`, the reporter's options from `packages/reporter`. When a behaviour changes, the page
  changes in the same pull request.

## The REST API reference

The pages under `/docs/api/reference` are generated at build time by `fumadocs-openapi` from `docs/openapi.json` at the
repository root, which apps/web generates from its router (`nub run api:docs` in apps/web). Never edit them; change the
procedure's `summary`, `description` or zod `.describe()` in `apps/web/lib/api` instead. The hand-written guides live in
`content/docs/api/`.

## For agents

Every page is also Markdown (`/docs/<page>.md`), `/llms.txt` and `/llms-full.txt` list and concatenate them, and
`/api/mcp` is an MCP server with `search`, `list_pages` and `get_page` (`lib/source.ts` renders the Markdown).
