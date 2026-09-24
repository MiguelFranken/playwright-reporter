import { createCn } from 'cn/config';

/**
 * Semantic typography roles (see `src/styles/globals.css` and `TYPOGRAPHY.md`).
 *
 * Each one is a complete style — size, line-height, weight, tracking and, for
 * some roles, case and family — so the merger has to treat it as replacing all
 * of those, not just the font size. Without this, `cn("text-headline-m",
 * "text-muted-foreground")` would drop the role, because an unknown `text-*`
 * class is assumed to be a colour.
 */
const TYPOGRAPHY_ROLES = [
  'display-xl',
  'display-l',
  'display-m',
  'lead',
  'title-l',
  'title-m',
  'headline-m',
  'headline-s',
  'body-m',
  'body-s',
  'body-xs',
  'label-m',
  'label-s',
  'label-xs',
  'eyebrow',
  'metric',
  'metric-s',
  'code-s',
  'code-xs',
] as const;

export const cn = createCn({
  extend: {
    classGroups: {
      typography: [{ text: [...TYPOGRAPHY_ROLES] }],
    },
    conflictingClassGroups: {
      // A role replaces every property it owns…
      typography: ['font-size', 'font-weight', 'leading', 'tracking', 'text-transform', 'font-family', 'fvn-figure'],
      // …and a plain size class replaces the role, rather than half-overriding it.
      'font-size': ['typography'],
    },
  },
});

export type { ClassValue } from 'cn';
