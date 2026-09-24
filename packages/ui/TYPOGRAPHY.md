# Typography

Typography in this app is a **set of named roles**, not a set of font sizes.
A role carries its whole style — size, line-height, weight, tracking and, where
the role demands it, case and family — so a component names what the text *is*,
never how it currently looks.

```tsx
// yes
<h3 className="text-headline-m">Pass/Fail trend</h3>

// no
<h3 className="text-[0.9375rem] leading-snug font-semibold tracking-[-0.01em]">…</h3>
```

## Why `@utility` and not `--text-*` theme tokens

Tailwind 4 lets you add `--text-headline-m` to `@theme`, which would generate a
`text-headline-m` utility — but only for the **font size** (plus an optional
paired line-height). Weight and tracking would still have to be repeated at
every call site, which is the problem we are solving.

`@utility` (Tailwind ≥ 4.0; this project is on 4.3) declares a real custom
utility whose body is arbitrary CSS, so one class can own every property of the
role. It also participates in the normal cascade, so variants compose as usual:

```tsx
<h1 className="text-title-m md:text-title-l">…</h1>
```

Definitions live in [`src/styles/globals.css`](src/styles/globals.css), under the
"Typography" heading, next to the colour tokens.

## The scale

Sizes come from the `--type-*` primitives in the same file, so the numbers exist
in exactly one place.

| Role              | Size | Line-height | Weight | Tracking | Use for                                                    |
| ----------------- | ---- | ----------- | ------ | -------- | ---------------------------------------------------------- |
| `text-display-xl` | 56px | 1.05        | 600    | −0.03em  | Hero headline from `md` up — **marketing only**            |
| `text-display-l`  | 40px | 1.1         | 600    | −0.025em | Hero on mobile, section headings from `md` up — marketing  |
| `text-display-m`  | 32px | 1.15        | 600    | −0.021em | Section headings on mobile, showcase headings — marketing  |
| `text-lead`       | 18px | 1.55        | 400    | 0        | Hero lead, section intros — marketing                      |
| `text-title-l`    | 24px | 1.2         | 600    | −0.021em | Page `h1` from `md` up                                     |
| `text-title-m`    | 20px | 1.25        | 600    | −0.021em | Page `h1` on small screens, major section heads            |
| `text-headline-m` | 15px | 1.35        | 600    | −0.011em | Card titles                                                |
| `text-headline-s` | 13px | 1.4         | 500    | 0        | Row and list-item titles                                   |
| `text-body-m`     | 14px | 1.5         | 400    | 0        | The interface default: menus, controls, prose              |
| `text-body-s`     | 13px | 1.55        | 400    | 0        | Secondary copy, card descriptions, table cells             |
| `text-body-xs`    | 12px | 1.45        | 400    | 0        | Captions, timestamps, meta rows                            |
| `text-label-m`    | 14px | 1.25        | 500    | 0        | Buttons, tabs, form labels                                 |
| `text-label-s`    | 12px | 1.25        | 500    | 0        | Badges, compact labels                                     |
| `text-label-xs`   | 10px | 1.3         | 500    | 0.02em   | Micro tags (`CI`, environment chips)                       |
| `text-eyebrow`    | 11px | 1.3         | 600    | 0.055em  | Table heads, metric captions, sidebar group labels — **sets `uppercase`** |
| `text-metric`     | 24px | 1.1         | 600    | −0.021em | Headline numbers — **sets `tabular-nums`**                  |
| `text-metric-s`   | 18px | 1.15        | 600    | −0.011em | Inline numbers inside a card                               |
| `text-code-s`     | 12px | 1.55        | 400    | —        | SHAs, file paths, stack traces — **sets the mono family**   |
| `text-code-xs`    | 11px | 1.5         | 400    | —        | Dense code inside tables and badges                        |

The four display roles exist for `src/marketing/` and the website that consumes
it. The reporter app tops out at `text-title-l` (24px): a dashboard headline
that size would shout over the data it is introducing. Nothing under `views/`
should reach for them.

Two roles carry more than type metrics, and that is deliberate:

- `text-eyebrow` sets `text-transform: uppercase`. Copy is written in natural
  case and the role does the shouting, so a redesign never means rewriting
  strings. Follow it with `normal-case` in the rare case you need the exception.
- `text-code-*` and `text-metric*` set `font-variant-numeric: tabular-nums`,
  because values that change must not reflow the layout around them.

## When to use a role, and when not to

**Use a role** for anything that belongs to the design system: headings, body
copy, labels, table chrome, numbers, code. If you find yourself writing
`text-sm font-medium tracking-tight`, the answer is a role.

**Plain Tailwind is fine** for genuinely one-off text that no design decision
depends on — a debug string, a one-of-a-kind marketing line, a size tweak inside
a third-party embed. Do not invent a role for a single call site, and do not
force an existing role onto text it does not describe.

**Adding a role** is the right move once the same combination appears three or
more times. Add the `@utility`, add the row above, and register the name in
`TYPOGRAPHY_ROLES` in [`src/lib/cn.ts`](src/lib/cn.ts).

## The `cn` registration (important)

`cn` merges Tailwind classes, and it has to be told that these names are
typography rather than colours. Without registration, `cn("text-headline-m",
"text-muted-foreground")` silently **drops the role**, because an unrecognised
`text-*` class is assumed to be a text colour and the last one wins.

`src/lib/cn.ts` therefore builds `cn` with `createCn` from `cn/config`, listing
every role and declaring that a role replaces `font-size`, `font-weight`,
`leading`, `tracking`, `text-transform`, `font-family` and the numeric-figure
group. Any new role must be added to that list, or it will disappear the first
time someone passes a `className` through.

Note that components import `cn` from `@repo/ui/lib/cn` (relatively, from inside this package), not from the bare `cn`
package. Components added later by the shadcn CLI import `from "cn"` and must be
repointed.
