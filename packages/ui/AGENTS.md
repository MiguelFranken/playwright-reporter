# `@miguelfranken/ui` — the design system

Everything the product renders itself out of. It runs without Next.js, without a
database and without an authenticated session — if a component cannot, it does
not belong here.

`apps/storybook` is the catalogue for this package. It holds configuration only;
the stories live here, next to the components they describe. Those stories are
the repo's only visual tests: UI that lives in `apps/web` instead is only ever
seen by starting the app against a database in the right state.

## Layers

The dependency direction is strictly downward. Nothing ever imports a layer
above it. This is also the Storybook sidebar hierarchy.

| Layer | Folder | What belongs here | May import |
| --- | --- | --- | --- |
| 0 Foundations | `src/styles`, `src/lib`, `src/hooks` | Tokens, `cn`, formatting, tone maps, status vocabularies. No JSX. | nothing |
| 1 Primitives | `src/components` | The shadcn / Base UI set: Button, Dialog, Table, Select… One file per primitive, generated names kept. | 0 |
| 2 Patterns | `src/patterns` | Product-flavoured but data-agnostic: StatusBadge, CountsBar, EmptyState, MetricCard… | 0, 1 |
| 3 Views | `src/views` | Presentational domain views driven by a view model passed in as props: RunsTable, RunHeader, ExplorerTable… | 0, 1, 2 |
| 3 Marketing | `src/marketing` | Section-level components the website (`apps/website`) renders CMS blocks into: SiteHeader, Hero, FeatureShowcase, ComparisonTable, CodeTabs… plus the product demos. | 0, 1, 2, and `views/` for demos |

`marketing/` sits beside Views, not above it: the reporter app never imports it,
and nothing in `views/` may import from it. It knows nothing about Payload —
the website's block adapters map CMS data onto plain props. Its shared
vocabulary (`MarketingLink`, `ThemedImageSources`, section settings) lives in
`src/lib/marketing.ts` so server code can read it.

The demos in `src/marketing/demos.tsx` are the app's own views driven by the
fixtures below. That is why fixtures stay private: the website imports finished
demo components, never the data behind them.

These folders are story-only and are **not** in the `exports` map, so nothing
outside the catalogue can import them:

- `src/fixtures` — deterministic sample data typed by the view models.
- `src/foundations`, `src/pages` — token tables and whole-screen compositions.

Feature components — anything that touches server actions, `next/navigation`,
the auth client or SSE — stay in `apps/web/components` and are not catalogued
here.

## Every component gets a story

A component without a story is not finished.

- At least a `Default`.
- Anything stateful gets a `play` function that drives it the way a user would,
  through roles and accessible names.
- Views get their realistic state *and* their edge states: empty, loading, long
  text, missing optional data.

Stories run as tests in a real browser on every pull request, with an
accessibility check on each one, so the catalogue cannot quietly rot. That is
the whole reason the rule is absolute.

## Building UI for the app

New UI starts here, not in `apps/web/components`. The app keeps only the part
that cannot run in Storybook.

### Where does it go?

| It… | Put it in |
| --- | --- |
| is a generic control with no product vocabulary (Switch, Checkbox, Dialog) | `src/components` — prefer `shadcn add`, else wrap the Base UI part in the same style |
| knows the product's language but not its data (a status badge, an avatar with initials, an empty state) | `src/patterns` |
| renders one domain object or list from a view model (a token table, a consent card, a retention form) | `src/views/<domain>/` |
| is a constant, formatter, label map or option builder that server code also reads | `src/lib` (no `'use client'`) |
| calls a server action, `next/navigation`, `useSearchParams`, the auth client, SSE, a service worker, `canvas`, `window.confirm` or `toast` | a connected wrapper in `apps/web/components` |

Domains under `src/views/`: `run`, `runs`, `explorer`, `dashboard`, `branches`,
`settings` (project settings), `account` (the signed-in user's own page),
`admin` (superadmin screens), `connect` (the OAuth consent screen). Add a folder
when a new area of the app appears; its story titles are `Views/<Domain>/…`.

### Moving a component out of `apps/web`

Split it into a *controlled view* here and a *connected wrapper* there. The
wrapper should end up a screenful of hooks and one JSX element.

1. **Props type first.** Move the row / view-model interface (`PersonalTokenRow`,
   `ConnectedAppRow`) into the view file and re-export or import it from the app.
   Never import an app type into the package; declare a UI union instead
   (`ArtifactKind`, `StorageDriver`) and let the app's type check against it.
2. **Side effects become callbacks.** A server action call turns into
   `onRevoke(row)`, `onSubmit(values)`, `onCheckedChange(next)`. The wrapper
   does the `startTransition`, the `toast`, the `window.confirm` and the
   `router.refresh()`.
3. **Pending state comes in as a prop.** `pending` for a single control,
   `pendingId` for a list where one row is busy. The view only disables and
   relabels (`Revoking…`); it never owns the transition.
4. **Forms keep native actions.** A view that renders a `<form>` takes
   `action: (formData: FormData) => void` plus `pending` and `error`, so the
   wrapper can pass the `useActionState` dispatcher and progressive enhancement
   keeps working. Field `name`s are part of the contract with the server action
   — keep them.
5. **Slots for app-only controls.** When one button in an otherwise
   presentational view is connected (a "Test connection" that calls a server
   action), take it as a `ReactNode` slot rather than a callback plus a result
   shape. See `AiAssistants` → `testConnection`.
6. **Browser-API state machines stay in the app, their screens move.** Push
   notifications: the wrapper talks to the service worker and hands a `state`
   (`unsupported`, `blocked`, `off`, `on`) to a view that renders each one.
7. **Keep the text and accessible names identical.** Integration and e2e tests
   in the app query by them.
8. **Write the stories before deleting the old markup**: default, empty,
   pending, error, long text, and a `play` that drives every callback and
   asserts it with `fn()`.

## Two traps that type-check and then fail at runtime

Both come from the React Server Components boundary. Neither is caught by
`tsc`, and both have already bitten this codebase once.

**1. A function cannot be passed from a server component to a client one.**

Views take `hrefs` builder objects (`hrefs.run(482)`), which is fine for the
many views a *server* component renders. But a connected `Url*` wrapper in the
app is a client component, so it must receive the plain `base` string and call
`runHrefs` / `projectHrefs` itself. Same rule for `UiProvider`: the app wires
`linkComponent={NextLink}` inside `apps/web/components/ui-provider.tsx`, not in
the server `layout.tsx`.

**2. A *value* exported from a `'use client'` module arrives as a client reference.**

`RUN_TABS.includes` is not a function if `RUN_TABS` is declared beside the
client component that renders it. Shared constants therefore live in `src/lib/`,
which carries no directive — `src/lib/run-tab.ts`, `src/lib/explorer-sort.ts`.
Types are unaffected, being erased.

When adding a constant that server code will read, put it in `src/lib/`.

## How the system works

### Types: the UI owns its props

A component declares the shape it renders, as a plain exported interface next to
it, listing only the fields it actually reads. `RunHeader` declares
`RunHeaderData`; it used to accept a whole Drizzle row and use seven fields of
it.

The app's query layer then imports that type and produces it, so a SQL
projection that stops matching what the UI renders fails `check-types`. The
dependency direction is the point: the app depends on the design system, never
the other way round.

Wire-level vocabulary (`RunStatus`, `TestOutcome`, `AttemptStatus`, `Executor`,
the `*Info` shapes) is `import type`d from `@miguelfranken/protocol` so the two cannot
drift. Type-only, so `zod` never enters the UI bundle — the boundary test
enforces that.

Generics are for components that are genuinely shape-agnostic. A domain view
knows its domain; it just must not know the database.

### Host integration: a provider or a prop, never a generic

Three things only the app knows:

- **Links** come from `UiProvider` (`src/provider.tsx`). The app passes
  `next/link`; Storybook falls back to a plain `<a>`. `LinkProps` includes a
  `ref` — Base UI's `render` prop mounts nothing without one.
- **URLs** arrive as `hrefs` builder callbacks, or as resolved strings where the
  answer depends on host knowledge (which shape a commit URL takes is a
  git-provider question, so `gitCommitUrl` arrives resolved).
- **URL state** is controlled — `value` / `onValueChange`, `page` /
  `onPageChange`. `isPending` lets a control show a transition is in flight
  without owning it.

### Controlled here, connected there

Every URL-bound control exists twice: a controlled component here that a story
can drive, and a three-line `Url*` wrapper in `apps/web` that binds it to
`useSearchParams`. All the routing coupling lives in the wrapper.

### Styling

- `src/styles/globals.css` holds both token tiers. Tier 1 names a *value*
  (`--n-600`); tier 2 names a *meaning* (`--muted-foreground`). Components only
  ever reference tier 2 — that is what makes the dark theme a re-point rather
  than a re-design.
- `@source "../"` in that file makes Tailwind scan this package's source
  whichever app imports the stylesheet. Without it, classes used only in here
  would be missing from the app's build.
- Typography is **roles, not sizes**: `text-headline-m` is a complete style.
  `cn` (`src/lib/cn.ts`) knows the role list, so `cn('text-headline-m',
  'text-muted-foreground')` keeps both instead of dropping the role. Adding a
  role means adding it to `TYPOGRAPHY_ROLES` too. See [`TYPOGRAPHY.md`](./TYPOGRAPHY.md).
- Status colour goes through `src/lib/tone.ts`. Every status collapses to one of
  five tones, and only the tone reaches CSS. Colour is never the only carrier —
  each badge also ships a label and an icon.
- **Tailwind scans source text for literal class names.** A class assembled at
  runtime (``bg-${token}``) is never generated. Spell it out, or use an inline
  `style={{ background: 'var(--token)' }}`.

### Charts

One chart, many datasets. The vocabulary lives in `src/lib/chart.ts` — geometry,
chrome, the series order — and every chart reads it rather than inventing its
own axis props. Four rules hold the system together:

- **The headline is a number, not an axis.** `ChartFrame`
  (`src/patterns/chart-frame.tsx`) states the measure, the value and the
  movement, then hands the plot the space under a hairline. That is what lets
  the plot drop its own title, and why a chart card has no `CardHeader`.
- **Chrome recedes.** No axis lines, four horizontal gridlines, ticks at 11px in
  `--chart-axis` on 1-2-5 steps (`niceTicks` — asked for four ticks between 80
  and 100 Recharts offers 86.67). `CHART_AXIS`, `CHART_GRID` and `CHART_CURSOR`
  are spread onto the Recharts elements; don't hand-roll them.
- **Marks are sized to their band, not to a constant.** `barSizeFor(count)`:
  ten runs across a full-width card get a 44px bar, thirty get 26px. A fixed cap
  is what makes a chart look broken — a 22px stick in a 190px band reads as an
  empty room. Bars stand in a faint `--chart-track` slot, which is what gives the
  plot its rhythm and shows which runs carried fewer tests.
- **The numbers the headline is made of go in `ChartStats`,** a recessed divided
  strip under it. It answers "out of what?" so neither plot has to label itself.
- **White does the separating.** Stacked segments are parted by a 2px gap in
  `--chart-surface` and markers carry a 2px ring of it — never a stroke around a
  mark. Recharts cannot do this, so `src/patterns/chart-marks.tsx` supplies the
  shapes (`StackSegment`, `SoloBar`) a `Bar`'s `shape` prop takes.
- **Every chart has a table view.** Not a fallback — it is what lets the plots
  stay this quiet, and what carries the two series (amber flaky, grey skipped)
  that sit under 3:1 against a white card. Series colour comes from the *status*
  tokens, so a bar and the badge beside it always agree.

A number that only needs a direction gets a `Sparkline` inside a `MetricCard`,
not a chart: no axes, no hover, `aria-hidden`, and its scale is the data's own
range because a rate against a zero baseline is a flat line.

## Commands

Run from the repo root. The package manager is nub (`mise.toml` pins it).

```bash
nub exec turbo run dev --filter=@miguelfranken/storybook        # catalogue at :6006
nub exec turbo run test:unit --filter=@miguelfranken/storybook  # every story, in Chromium
nub run --filter @miguelfranken/ui check-types                  # covers stories and fixtures
nub run --filter @miguelfranken/ui test                         # node-side: helpers + boundary guard
nub exec --filter @miguelfranken/ui shadcn add <name>           # components.json lives here
```

Browser tests need Playwright's Chromium once:
`nub exec --filter @miguelfranken/storybook playwright install chromium`.

The very first Storybook run after an install can fail a handful of files with
"Failed to import test file … SyntaxError" while Vite optimises dependencies.
That is a cold start, not your change: run it again.

## Package rules

- **Consumed from source.** No `build` script. Turbopack transpiles workspace
  packages and Storybook's Vite pipeline compiles TSX natively, so there is no
  loader outside a bundler to satisfy. Keep `'use client'` directives exactly
  where they are.
- **Subpath exports, no barrel** — `@miguelfranken/ui/components/button` mirrors the file
  layout. A root barrel would pull `recharts` and `sonner` into every consumer
  and defeat the `'use client'` boundaries.
- **Imports inside the package are relative** (`../lib/cn`). There is no `@/`
  alias here, and that is what guarantees the package cannot reach into the app.
- `src/lib/boundaries.test.ts` fails the build if anything here imports
  `next/*`, `drizzle-orm`, `better-auth`, `postgres` or an `@/` path, or imports
  `@miguelfranken/protocol` as a value rather than a type.

## Writing a story

Classic CSF 3. **Not** CSF factories (`preview.meta()`) — those require
importing the Storybook config from `apps/storybook`, which would be a cycle.

```tsx
const meta = {
  title: 'Primitives/Button',
  component: Button,
  args: { children: 'Save changes', onClick: fn() },
} satisfies Meta<typeof Button>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
```

- `title` follows the layer path: `Primitives/…`, `Patterns/…`, `Views/Run/…`,
  `Pages/…`. Sidebar order is `Docs, Foundations, Primitives, Patterns, Views, Pages`.
- `satisfies Meta<typeof X>` + `StoryObj<typeof meta>` everywhere, so args are
  checked against props and fixtures against the view model.
- Callback props default to `fn()` in `meta.args` so `play` can assert on them.
- Query by role and accessible name. Never by test id.
- **Base UI portals its overlays** — query Dialog, Sheet, Select, DropdownMenu,
  Tooltip and HoverCard content with `within(document.body)`, not the canvas.
  They animate, so prefer `findBy*` / `waitFor` over `getBy*` immediately after
  opening.
- Views import fixtures from `src/fixtures`; never inline a large object.
- Anything showing relative time takes the `NOW` fixture, or assertions drift by
  the day.
- Tag Patterns and Views stories `['themed']` to have them run in dark mode too.
- Recharts measures its container: give chart stories a real width and height.

### Accessibility

The a11y addon runs on every story at `test: 'error'`, so a violation fails the
build. That is deliberate — it has already caught five real defects.

**Fix the component, don't silence the check.** Two narrow exceptions exist, both
commented where they are used:

- `PENDING_STATE_A11Y` from `src/fixtures/a11y.ts`, for `isPending` stories: the
  `opacity-60` dimming drops labels under the contrast floor, and the same
  labels at full opacity are checked by every other story of the component.
- Base UI's `aria-hidden`, tabbable focus guards around an open `Select`.

If you reach for a third, it probably means there is a real defect to fix.
