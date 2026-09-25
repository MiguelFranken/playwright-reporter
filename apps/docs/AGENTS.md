# apps/docs — the documentation site

A Next.js 16 app built on [Fumadocs](https://fumadocs.dev) and its Next.js integration (`fumadocs-mdx/next`,
`fumadocs-ui/provider/next`). It documents the product for the people who deploy and use it; the REST API reference is
one section of it.

```bash
nub exec turbo run dev --filter=@miguelfranken/docs   # http://localhost:3002
nub run --filter @miguelfranken/docs build
```

## How it looks

The docs are the product's: `app/global.css` imports `@miguelfranken/ui/styles.css` (tokens, Inter and JetBrains
Mono, radius, elevation, the typography roles) and `fumadocs-ui/css/shadcn.css`, which points every `--color-fd-*` at
the design system's tokens. The rest of that file only adapts Fumadocs' chrome, and follows the app:

- **Layout:** Fumadocs' notebook layout: a top bar with the tabs (**Guides**, **REST API** — the `root: true` folders
  `(guides)` and `api`), a grey sidebar and a white page, as in the app.
- **Colour:** ink for primary actions, the accent (`--accent-*`) only for links, focus, the active item and eyebrows;
  status tones for callouts. Never raw colours.
- **Type:** the roles (`text-eyebrow`, `text-display-m`, `text-lead`, `text-headline-m`, `text-body-s`, …), not ad-hoc
  sizes. Reading text is 15px/1.7.
- **Components:** `components/` holds the docs' own (`PageHeader`, `HomeHero`, `Card`/`Cards`, `Callout`, `BrandMark`),
  built from the design system's tokens and, where it has one, its primitives (`buttonVariants`). A component both
  apps need belongs in `packages/ui` instead.

## Writing a page

- Pages are MDX under `content/docs/` — guides in `(guides)/<section>/`, the API guides in `api/`. A section's
  `meta.json` sets its title, its Lucide `icon` and its page order. Frontmatter needs `title` and `description` (the description is the subtitle,
  the search snippet and the `llms.txt` entry).
- Components available without an import (`components/mdx.tsx`): `Callout` (`type`: info, warn, error, idea),
  `Cards`/`Card` (`icon`, `title`, `description`, `href`), `Steps`/`Step`, `Tabs`/`Tab`, and code blocks with
  `title="…"`. Icons come from `lucide-react`, imported at the top of the MDX file.
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
