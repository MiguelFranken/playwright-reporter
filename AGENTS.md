<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# The monorepo

Turborepo, with [nub](https://github.com/nubjs/nub) as package manager and script
runner (Node and nub are pinned in `mise.toml`). Run scripts with `nub run …`,
binaries with `nub exec …`, and Turborepo tasks with `nub exec turbo run …`.

| Workspace | Package | What it is |
| --- | --- | --- |
| `apps/web` | `@miguelfranken/web` | The reporter app: Next.js, Drizzle, Better Auth, the ingest API and the MCP server route. |
| `apps/website` | `@miguelfranken/website` | The marketing site: Next.js + Payload CMS. See its own `AGENTS.md`. |
| `apps/docs` | `@miguelfranken/docs` | The documentation site: Next.js + Fumadocs, with the REST API reference. See its own `AGENTS.md`. |
| `apps/storybook` | `@miguelfranken/storybook` | The design-system catalogue. Configuration only; no stories live here. |
| `packages/ui` | `@miguelfranken/ui` | **The design system.** Every component either app renders. See [`packages/ui/AGENTS.md`](packages/ui/AGENTS.md). |
| `packages/protocol` | `@miguelfranken/protocol` | The wire contract between the reporter and the app (zod schemas + types). |
| `packages/reporter` | `@miguelfranken/reporter` | The Playwright reporter users install. Published. |
| `packages/mcp` | `@miguelfranken/mcp` | A stdio bridge to the app's MCP server, for clients without remote HTTP support. Published. |
| `examples/*` | | Playwright suites that feed the app (local demo, the live demo shop). |

## UI lives in the design system, not in the apps

`packages/ui` is the design system and `apps/storybook` is its catalogue. Every
story there runs in a real Chromium on each pull request, with an accessibility
check, in light and dark mode. **That is the only visual testing this repo has.**
A component written straight into `apps/web/components` can only be seen by
starting the app, signing in and seeding a database into the right state — so in
practice its empty, error, pending and long-text states are never looked at.

So when you build or change UI:

1. **Put the rendering in `packages/ui`**, in the layer it belongs to
   (primitive → pattern → view; see [`packages/ui/AGENTS.md`](packages/ui/AGENTS.md)),
   and give it a story for every state it can be in.
2. **Keep only the wiring in the app.** An `apps/web` component should be a thin
   *connected* wrapper: it calls the server action, reads `useSearchParams`, uses
   `next/navigation`, shows the toast, asks `window.confirm`, touches browser APIs
   (service workers, `canvas`), and passes plain props and callbacks to the view.
   If a file in `apps/web/components` contains a `<Table>`, a `<Dialog>` layout or
   a stack of `className`s, that part belongs in the design system.
3. **Pages compose views.** A `page.tsx` fetches, maps rows onto the view's prop
   type, and renders views inside `Suspense`. Markup that grows beyond a card
   shell and a `PageHeader` wants a view of its own.

The design system must run without Next.js, a database or a session — a boundary
test in `packages/ui` fails the build if it imports `next/*`, `drizzle-orm`,
`better-auth`, `postgres` or the app's `@/` alias.

## APIs in `apps/web`

- **Data a client component loads after render** (a drawer, a live view catching up) is a procedure in
  `apps/web/lib/rpc/router.ts`, called through TanStack Query with the typed `orpc` utils from `lib/rpc/client.ts`.
  Don't add a JSON route handler for it. Pages still read the database on the server.
  Build query options that more than one call site shares (a prefetch and the `useQuery` it warms) in
  `lib/rpc/queries.ts`, so the key and the cache policy cannot drift apart. The query client lives in the root layout
  and outlives navigations: sign-in and sign-out clear it. React Query Devtools load in `next dev` only.
- **After a Server Action**, don't call `router.refresh()` when the action already calls `revalidatePath`: the action's
  response carries the re-rendered page, and a refresh renders it a second time.
- **The public REST API** is `apps/web/lib/api` (oRPC's OpenAPI handler under `/api/v1`). It is a contract: v1 only
  grows. Endpoints wrap MCP tools with `fromTool`, so logic lives once. After changing it, regenerate the document with
  `nub run api:docs` in `apps/web`; a unit test fails on drift, and CI fails a breaking change against `main`.
- oRPC is pinned to an exact v2 beta. Upgrade it deliberately, in its own pull request, and read the changelog.

## Checking your work

```bash
nub exec turbo run check-types                                    # every workspace
nub exec turbo run test:unit --filter=!@miguelfranken/storybook   # node-side unit tests
nub exec turbo run test:unit --filter=@miguelfranken/storybook    # every story, in Chromium (+ a11y)
nub exec turbo run dev --filter=@miguelfranken/storybook          # the catalogue at http://localhost:6006
```

The Storybook tests need Playwright's Chromium once:
`nub exec --filter @miguelfranken/storybook playwright install chromium`.

Integration tests (`test:integration`) need Postgres via `TEST_DATABASE_URL`;
CI provides one.

## Conventions

- Commits and pull-request titles follow Conventional Commits. `main` is released
  by semantic-release: `feat`, `fix` and `perf` cut a release, the rest do not.
- Cross-package imports go through each package's `exports` map
  (`@miguelfranken/ui/views/run/run-header`); there are no root barrels.
