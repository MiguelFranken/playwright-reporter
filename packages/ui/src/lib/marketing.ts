import type { ReactNode } from 'react';

/**
 * The vocabulary the marketing layer speaks.
 *
 * It lives in `src/lib` rather than beside the components for two reasons: a
 * value exported from a `'use client'` module arrives in a server component as
 * a client reference, and these constants are read on the server; and keeping
 * the types here lets the website's block adapters import them without pulling
 * a component into the module graph.
 */

/** A resolved link. The host decides what `href` means; this layer just renders it. */
export interface MarketingLink {
  href: string;
  label: string;
  /** Renders `target="_blank"` and the accompanying `rel`. */
  external?: boolean;
  appearance?: LinkAppearance;
}

export const linkAppearances = ['primary', 'secondary', 'ghost', 'link'] as const;
export type LinkAppearance = (typeof linkAppearances)[number];

/** Maps an editorial appearance onto a Button variant. */
export const appearanceVariant: Record<LinkAppearance, 'default' | 'outline' | 'ghost' | 'link'> = {
  primary: 'default',
  secondary: 'outline',
  ghost: 'ghost',
  link: 'link',
};

/** One `<img>`'s worth of information, host-agnostic. */
export interface ImageSource {
  src: string;
  width?: number;
  height?: number;
}

/**
 * A light/dark pair. Product screenshots carry app chrome, so one image is
 * always wrong in one of the two themes; `dark` is optional and falls back.
 */
export interface ThemedImageSources {
  light: ImageSource;
  dark?: ImageSource | null;
  alt: string;
}

export type SectionBackground = 'default' | 'sunken' | 'accent';
export type SectionSpacing = 'normal' | 'compact';

export interface SectionSettings {
  background?: SectionBackground | null;
  spacing?: SectionSpacing | null;
  anchor?: string | null;
}

/** The three lines above a section. All optional: an empty header renders nothing. */
export interface SectionHeaderContent {
  eyebrow?: string | null;
  heading?: string | null;
  intro?: ReactNode;
  align?: 'start' | 'center' | null;
}

export type Frame = 'browser' | 'plain' | 'none';

/** Comparison-table cell states, ordered best to worst. */
export const comparisonStates = ['yes', 'partial', 'planned', 'no'] as const;
export type ComparisonState = (typeof comparisonStates)[number];

/**
 * The states reuse the product's status tones, so a check mark on the marketing
 * site is the same green as a passing test in the app.
 */
export const comparisonStateMeta: Record<ComparisonState, { label: string; tone: 'success' | 'warning' | 'info' | 'neutral' }> = {
  yes: { label: 'Yes', tone: 'success' },
  partial: { label: 'Partly', tone: 'warning' },
  planned: { label: 'Planned', tone: 'info' },
  no: { label: 'No', tone: 'neutral' },
};
