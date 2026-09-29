import { n as CheckpointKind, r as CheckpointRecord, t as CHECKPOINT_CONTENT_TYPE } from "./index-C4OzotD2.mjs";
import { Locator, Page, TestInfo } from "@playwright/test";
//#region src/review.d.ts
/** The step every capture runs in, so it shows in the report and the trace. */
export declare const REVIEW_STEP_PREFIX = "Review checkpoint: ";
export interface ReviewVariant {
  /** `desktop`, `mobile`… — part of the checkpoint's identity, so keep it stable. */
  name: string;
  /** The CSS viewport the page is resized to for this variant. */
  viewport: {
    width: number;
    height: number;
  };
}
export declare const DEFAULT_VARIANTS: readonly ReviewVariant[];
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
/** kebab-case for file names; the attachment name keeps the checkpoint's own. */
export declare function fileSafeName(name: string): string;
/** A PNG's width and height, from its header. */
export declare function pngSize(buf: Buffer): {
  width: number;
  height: number;
} | null;
/**
 * A checkpoint helper with its own settings. The steps a capture runs inside
 * are not visible from here; the reporter, which sees them, fills them in.
 */
export declare function defineReview(config?: ReviewConfig): Review;
/** The checkpoint helper with the default settings. */
export declare const review: Review;
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
export declare function reviewFixtures(config?: ReviewConfig): {
  review: ({ page }: {
    page: Page;
  }, use: (r: ReviewFixture) => Promise<void>, testInfo: TestInfo) => Promise<void>;
};
/** A test result's checkpoint records, in capture order: for reporters other than this one. */
export declare function readCheckpoints(result: {
  attachments: readonly {
    name: string;
    contentType: string;
    body?: Buffer;
  }[];
}): CheckpointRecord[];
//#endregion
export { CHECKPOINT_CONTENT_TYPE, type CheckpointKind, type CheckpointRecord };
//# sourceMappingURL=review.d.mts.map