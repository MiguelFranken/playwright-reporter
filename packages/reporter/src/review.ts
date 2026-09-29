/**
 * Review checkpoints: named, human-review screenshots of a test's milestones,
 * taken once per variant (desktop and mobile by default) and sent to the
 * reporter app, where they are reviewed as a storyboard, compared with the
 * approved baseline and approved.
 *
 * ```ts
 * import { test as base } from '@playwright/test';
 * import { reviewFixtures } from '@miguelfranken/reporter/review';
 *
 * export const test = base.extend(reviewFixtures());
 *
 * test('books a workshop', async ({ page, review }) => {
 *   // …fill in the form, assert it is complete…
 *   await review('booking-ready', { title: 'Booking form filled in' });
 * });
 * ```
 *
 * Each checkpoint attaches its images (`review:<name>:<variant>`), a small
 * preview of each (`…:thumb`), and a record describing them. The reporter
 * reads the record; any other reporter sees ordinary attachments, and
 * `readCheckpoints` gives them the record too.
 */
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import type { Locator, Page, TestInfo } from '@playwright/test';
import { test } from '@playwright/test';
import {
  CHECKPOINT_CONTENT_TYPE,
  DEFAULT_VARIANT,
  REVIEW_ATTACHMENT_PREFIX,
  type CheckpointKind,
  type CheckpointRecord,
} from '@miguelfranken/protocol';

export type { CheckpointKind, CheckpointRecord };
export { CHECKPOINT_CONTENT_TYPE };

/** The step every capture runs in, so it shows in the report and the trace. */
export const REVIEW_STEP_PREFIX = 'Review checkpoint: ';

export interface ReviewVariant {
  /** `desktop`, `mobile`… — part of the checkpoint's identity, so keep it stable. */
  name: string;
  /** The CSS viewport the page is resized to for this variant. */
  viewport: { width: number; height: number };
}

export const DEFAULT_VARIANTS: readonly ReviewVariant[] = [
  { name: 'desktop', viewport: { width: 1280, height: 720 } },
  { name: 'mobile', viewport: { width: 390, height: 844 } },
];

/** What a hook gets: the page, the checkpoint and the variant about to be captured. */
export interface CaptureContext {
  page: Page;
  testInfo: TestInfo;
  name: string;
  variant: string;
  fullPage: boolean;
}

export interface ReviewConfig {
  /**
   * The variants each checkpoint is captured in. An array resizes the page to
   * each viewport in turn (fast, and the page keeps its state). `'project'`
   * captures once, as the running Playwright project — use it to review real
   * device emulation (touch, mobile user agent) with one project per device.
   * Default: desktop 1280 × 720 and mobile 390 × 844.
   */
  variants?: readonly ReviewVariant[] | 'project';
  /** Capture the whole scrollable page. Overlays (dialogs, drawers) want `false`. Default `true`. */
  fullPage?: boolean;
  /** `device` keeps the device scale factor's pixels (2× on a retina config); `css` one pixel per CSS pixel. Default `device`. */
  scale?: 'device' | 'css';
  /** Scroll a full-page capture through the document first, so lazy and scroll-revealed content loads. Default `true`. */
  scrollThrough?: boolean;
  /** Also attach a small JPEG of the first viewport, for overviews. Default `true`. */
  thumbnails?: boolean;
  /**
   * CSS applied while the screenshot is taken (Playwright's `style` option):
   * hide a cookie banner, pin a sticky header. A function decides per page.
   */
  style?: string | ((ctx: CaptureContext) => string | undefined | Promise<string | undefined>);
  /** Elements painted over in the image, such as generated ids or timestamps. */
  mask?: (ctx: CaptureContext) => Locator[];
  /** Runs after the resize and before the capture of every variant: reopen a menu that closed at the new breakpoint. */
  beforeCapture?: (ctx: CaptureContext) => Promise<void>;
  /** Wraps each capture in a `test.step`. Default `true`. */
  step?: boolean;
  /**
   * Captures nothing when false. Default: on, unless the environment sets
   * `PW_REVIEW_SCREENSHOTS` to `0`, `false` or `off`.
   */
  enabled?: boolean;
}

export interface CaptureOptions {
  /** A human title; the name stays the identity. */
  title?: string;
  /** What a reviewer should look at. */
  description?: string;
  kind?: CheckpointKind;
  /** Groups the checkpoints of several tests into one journey. */
  flow?: string;
  tags?: string[];
  fullPage?: boolean;
  variants?: readonly ReviewVariant[] | 'project';
  /** Per capture, in addition to the config's `beforeCapture`. */
  prepareViewport?: (ctx: CaptureContext) => Promise<void>;
  mask?: (ctx: CaptureContext) => Locator[];
  style?: ReviewConfig['style'];
}

export interface HtmlCaptureOptions extends CaptureOptions {
  /** How long to wait for images in the document. Default 5000 ms. */
  imageTimeoutMs?: number;
}

export interface Review {
  /** Captures the page's current state as a checkpoint named `name`. */
  capture(page: Page, testInfo: TestInfo, name: string, options?: CaptureOptions): Promise<CheckpointRecord | null>;
  /**
   * Renders an HTML document — an email as delivered, say — into `page` and
   * captures it. The page's current document is replaced.
   */
  html(page: Page, testInfo: TestInfo, name: string, html: string, options?: HtmlCaptureOptions): Promise<CheckpointRecord | null>;
}

/** Per attempt: how many checkpoints were taken and which names are used. */
const attempts = new WeakMap<TestInfo, { sequence: number; names: Set<string> }>();

function envEnabled(env: NodeJS.ProcessEnv = process.env) {
  const v = env.PW_REVIEW_SCREENSHOTS?.trim().toLowerCase();
  return !(v === '0' || v === 'false' || v === 'off' || v === 'no');
}

/** kebab-case for file names; the attachment name keeps the checkpoint's own. */
export function fileSafeName(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'checkpoint'
  );
}

/** A PNG's width and height, from its header. */
export function pngSize(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47 || buf.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/** Waits for web fonts and two frames at the top of the document, after a resize. */
async function settle(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    window.scrollTo({ left: 0, top: 0, behavior: 'instant' });
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  });
}

/** Scrolls through the document so scroll-revealed sections and lazy media load, then back to the top. */
async function scrollThrough(page: Page) {
  await page.evaluate(async () => {
    const frame = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    const height = document.documentElement.scrollHeight;
    const step = Math.max(200, Math.floor(window.innerHeight * 0.8));
    for (let top = 0; top < height; top += step) {
      window.scrollTo({ top, behavior: 'instant' });
      await frame();
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
    await frame();
  });
}

/** Scrolls open dialogs and everything inside them back to the top, so a viewport capture shows their heading. */
async function resetDialogScroll(page: Page) {
  await page.evaluate(async () => {
    const frame = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    const dialogs = [...document.querySelectorAll<HTMLElement>('[role="dialog"], dialog[open]')].filter((d) => d.offsetParent !== null || getComputedStyle(d).position === 'fixed');
    if (dialogs.length && document.activeElement instanceof HTMLElement) document.activeElement.blur();
    for (const dialog of dialogs) {
      for (const el of [dialog, ...dialog.querySelectorAll<HTMLElement>('*')]) if (el.scrollHeight > el.clientHeight) el.scrollTop = 0;
    }
    await frame();
  });
}

async function resolveStyle(style: ReviewConfig['style'], ctx: CaptureContext) {
  if (!style) return undefined;
  return typeof style === 'function' ? await style(ctx) : style;
}

/**
 * A checkpoint helper with its own settings. The steps a capture runs inside
 * are not visible from here; the reporter, which sees them, fills them in.
 */
export function defineReview(config: ReviewConfig = {}): Review {
  const enabled = () => config.enabled ?? envEnabled();

  async function captureOnce(page: Page, testInfo: TestInfo, name: string, options: CaptureOptions) {
    const state = attempts.get(testInfo) ?? { sequence: 0, names: new Set<string>() };
    attempts.set(testInfo, state);
    // A name used twice in one test would make two checkpoints one; the second gets a suffix.
    let unique = name;
    for (let n = 2; state.names.has(unique); n++) unique = `${name}-${n}`;
    state.names.add(unique);
    const sequence = state.sequence++;

    const fullPage = options.fullPage ?? config.fullPage ?? true;
    const variantSpec = options.variants ?? config.variants ?? DEFAULT_VARIANTS;
    const original = page.viewportSize();
    const capturedAt = new Date().toISOString();
    const url = page.url();
    const pageTitle = await page.title().catch(() => '');
    const variants: CheckpointRecord['variants'] = [];
    // Smooth scrolling would race the scroll-through and the return to the top.
    const smooth = await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' }).catch(() => null);

    try {
      const plan =
        variantSpec === 'project'
          ? [{ name: testInfo.project.name || DEFAULT_VARIANT, viewport: original ?? undefined, resize: false }]
          : variantSpec.map((v) => ({ ...v, resize: true }));
      for (const variant of plan) {
        if (variant.resize && variant.viewport) await page.setViewportSize(variant.viewport);
        const ctx: CaptureContext = { page, testInfo, name: unique, variant: variant.name, fullPage };
        await settle(page);
        await config.beforeCapture?.(ctx);
        await options.prepareViewport?.(ctx);
        if (fullPage && (config.scrollThrough ?? true)) await scrollThrough(page);
        if (!fullPage) await resetDialogScroll(page);

        const style = [await resolveStyle(config.style, ctx), await resolveStyle(options.style, ctx)].filter(Boolean).join('\n') || undefined;
        const mask = [...(config.mask?.(ctx) ?? []), ...(options.mask?.(ctx) ?? [])];
        const shot = { animations: 'disabled' as const, caret: 'hide' as const, style, mask: mask.length ? mask : undefined };
        const image = await page.screenshot({ ...shot, fullPage, scale: config.scale ?? 'device', type: 'png' });

        const base = `review-${String(sequence + 1).padStart(2, '0')}-${fileSafeName(unique)}-${fileSafeName(variant.name)}`;
        const attachment = `${REVIEW_ATTACHMENT_PREFIX}${unique}:${variant.name}`;
        const imagePath = testInfo.outputPath(`${base}.png`);
        await writeFile(imagePath, image);
        await testInfo.attach(attachment, { path: imagePath, contentType: 'image/png' });

        let thumbnail: string | undefined;
        if (config.thumbnails ?? true) {
          const preview = await page.screenshot({ ...shot, fullPage: false, scale: 'css', type: 'jpeg', quality: 70 });
          const previewPath = testInfo.outputPath(`${base}.thumb.jpg`);
          await writeFile(previewPath, preview);
          thumbnail = `${attachment}:thumb`;
          await testInfo.attach(thumbnail, { path: previewPath, contentType: 'image/jpeg' });
        }

        const size = pngSize(image);
        const use = testInfo.project.use as { deviceScaleFactor?: number; isMobile?: boolean };
        variants.push({
          variant: variant.name,
          attachment,
          thumbnail,
          viewport: variant.viewport ?? undefined,
          deviceScaleFactor: config.scale === 'css' ? 1 : (use.deviceScaleFactor ?? 1),
          isMobile: variantSpec === 'project' ? Boolean(use.isMobile) : undefined,
          fullPage,
          width: size?.width,
          height: size?.height,
          sha256: createHash('sha256').update(image).digest('hex'),
        });
      }
    } finally {
      if (original && variantSpec !== 'project') await page.setViewportSize(original).catch(() => undefined);
      await smooth?.evaluate((el) => (el as Element).remove()).catch(() => undefined);
    }

    const record: CheckpointRecord = {
      v: 1,
      name: unique.slice(0, 200),
      title: options.title,
      description: options.description,
      sequence,
      capturedAt,
      url: url && url !== 'about:blank' && !url.startsWith('data:') ? url.slice(0, 2000) : undefined,
      pageTitle: pageTitle ? pageTitle.slice(0, 500) : undefined,
      kind: options.kind,
      flow: options.flow,
      tags: options.tags,
      variants,
    };
    await testInfo.attach(`pw-reporter:checkpoint:${unique}`, { body: JSON.stringify(record), contentType: CHECKPOINT_CONTENT_TYPE });
    return record;
  }

  const capture: Review['capture'] = async (page, testInfo, name, options = {}) => {
    if (!enabled()) return null;
    if (!name.trim()) throw new Error('A review checkpoint needs a name.');
    const run = () => captureOnce(page, testInfo, name.trim(), options);
    if (config.step === false) return run();
    return test.step(`${REVIEW_STEP_PREFIX}${options.title ?? name}`, run, { box: true });
  };

  const html: Review['html'] = async (page, testInfo, name, doc, options = {}) => {
    if (!enabled()) return null;
    if (!doc.trim()) throw new Error(`Cannot capture review checkpoint "${name}": the HTML is empty.`);
    await page.setContent(doc, { waitUntil: 'load' });
    await page
      .waitForFunction(() => Array.from(document.images).every((img) => img.complete), undefined, { timeout: options.imageTimeoutMs ?? 5000 })
      .catch(() => undefined);
    return capture(page, testInfo, name, { kind: 'email', ...options });
  };

  return { capture, html };
}

/** The checkpoint helper with the default settings. */
export const review: Review = defineReview();

/** `review(name, options)`: a capture bound to the test's page. */
export type ReviewFixture = ((name: string, options?: CaptureOptions) => Promise<CheckpointRecord | null>) & {
  html(name: string, html: string, options?: HtmlCaptureOptions): Promise<CheckpointRecord | null>;
};

/**
 * Fixtures for `test.extend`: `review` captures a checkpoint of the test's `page`.
 *
 * ```ts
 * export const test = base.extend(reviewFixtures({ fullPage: true }));
 * ```
 */
export function reviewFixtures(config: ReviewConfig = {}) {
  const helper = defineReview(config);
  return {
    review: async ({ page }: { page: Page }, use: (r: ReviewFixture) => Promise<void>, testInfo: TestInfo) => {
      const bound = Object.assign((name: string, options?: CaptureOptions) => helper.capture(page, testInfo, name, options), {
        html: (name: string, doc: string, options?: HtmlCaptureOptions) => helper.html(page, testInfo, name, doc, options),
      });
      await use(bound);
    },
  };
}

/** A test result's checkpoint records, in capture order: for reporters other than this one. */
export function readCheckpoints(result: { attachments: readonly { name: string; contentType: string; body?: Buffer }[] }): CheckpointRecord[] {
  const out: CheckpointRecord[] = [];
  for (const a of result.attachments) {
    if (a.contentType !== CHECKPOINT_CONTENT_TYPE || !a.body) continue;
    try {
      const record = JSON.parse(a.body.toString('utf8')) as CheckpointRecord;
      if (record && record.v === 1 && Array.isArray(record.variants)) out.push(record);
    } catch {
      // A malformed record is skipped; the images are still attachments.
    }
  }
  return out.sort((a, b) => a.sequence - b.sequence);
}
