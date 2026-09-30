Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const require_dist = require("./dist-CzpkBfkf.cjs");
let node_crypto = require("node:crypto");
let node_fs_promises = require("node:fs/promises");
let _playwright_test = require("@playwright/test");
//#region src/review.ts
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
/** The step every capture runs in, so it shows in the report and the trace. */
const REVIEW_STEP_PREFIX = "Review checkpoint: ";
const DEFAULT_VARIANTS = [{
	name: "desktop",
	viewport: {
		width: 1280,
		height: 720
	}
}, {
	name: "mobile",
	viewport: {
		width: 390,
		height: 844
	}
}];
/** Per attempt: how many checkpoints were taken and which names are used. */
const attempts = /* @__PURE__ */ new WeakMap();
function envEnabled(env = process.env) {
	const v = env.PW_REVIEW_SCREENSHOTS?.trim().toLowerCase();
	return !(v === "0" || v === "false" || v === "off" || v === "no");
}
/** kebab-case for file names; the attachment name keeps the checkpoint's own. */
function fileSafeName(name) {
	return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "checkpoint";
}
/** A PNG's width and height, from its header. */
function pngSize(buf) {
	if (buf.length < 24 || buf.readUInt32BE(0) !== 2303741511 || buf.toString("ascii", 12, 16) !== "IHDR") return null;
	return {
		width: buf.readUInt32BE(16),
		height: buf.readUInt32BE(20)
	};
}
/** Waits for web fonts and two frames at the top of the document, after a resize. */
async function settle(page) {
	await page.evaluate(async () => {
		await document.fonts.ready;
		window.scrollTo({
			left: 0,
			top: 0,
			behavior: "instant"
		});
		await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
	});
}
/** Scrolls through the document so scroll-revealed sections and lazy media load, then back to the top. */
async function scrollThrough(page) {
	await page.evaluate(async () => {
		const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
		const height = document.documentElement.scrollHeight;
		const step = Math.max(200, Math.floor(window.innerHeight * .8));
		for (let top = 0; top < height; top += step) {
			window.scrollTo({
				top,
				behavior: "instant"
			});
			await frame();
		}
		window.scrollTo({
			top: 0,
			behavior: "instant"
		});
		await frame();
	});
}
/** Scrolls open dialogs and everything inside them back to the top, so a viewport capture shows their heading. */
async function resetDialogScroll(page) {
	await page.evaluate(async () => {
		const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
		const dialogs = [...document.querySelectorAll("[role=\"dialog\"], dialog[open]")].filter((d) => d.offsetParent !== null || getComputedStyle(d).position === "fixed");
		if (dialogs.length && document.activeElement instanceof HTMLElement) document.activeElement.blur();
		for (const dialog of dialogs) for (const el of [dialog, ...dialog.querySelectorAll("*")]) if (el.scrollHeight > el.clientHeight) el.scrollTop = 0;
		await frame();
	});
}
async function resolveStyle(style, ctx) {
	if (!style) return void 0;
	return typeof style === "function" ? await style(ctx) : style;
}
/**
* A checkpoint helper with its own settings. The steps a capture runs inside
* are not visible from here; the reporter, which sees them, fills them in.
*/
function defineReview(config = {}) {
	const enabled = () => config.enabled ?? envEnabled();
	async function captureOnce(page, testInfo, name, options) {
		const state = attempts.get(testInfo) ?? {
			sequence: 0,
			names: /* @__PURE__ */ new Set()
		};
		attempts.set(testInfo, state);
		let unique = name;
		for (let n = 2; state.names.has(unique); n++) unique = `${name}-${n}`;
		state.names.add(unique);
		const sequence = state.sequence++;
		const fullPage = options.fullPage ?? config.fullPage ?? true;
		const variantSpec = options.variants ?? config.variants ?? DEFAULT_VARIANTS;
		const original = page.viewportSize();
		const capturedAt = (/* @__PURE__ */ new Date()).toISOString();
		const url = page.url();
		const pageTitle = await page.title().catch(() => "");
		const variants = [];
		const smooth = await page.addStyleTag({ content: "html { scroll-behavior: auto !important; }" }).catch(() => null);
		try {
			const plan = variantSpec === "project" ? [{
				name: testInfo.project.name || "default",
				viewport: original ?? void 0,
				resize: false
			}] : variantSpec.map((v) => ({
				...v,
				resize: true
			}));
			for (const variant of plan) {
				if (variant.resize && variant.viewport) await page.setViewportSize(variant.viewport);
				const ctx = {
					page,
					testInfo,
					name: unique,
					variant: variant.name,
					fullPage
				};
				await settle(page);
				await config.beforeCapture?.(ctx);
				await options.prepareViewport?.(ctx);
				if (fullPage && (config.scrollThrough ?? true)) await scrollThrough(page);
				if (!fullPage) await resetDialogScroll(page);
				const style = [await resolveStyle(config.style, ctx), await resolveStyle(options.style, ctx)].filter(Boolean).join("\n") || void 0;
				const mask = [...config.mask?.(ctx) ?? [], ...options.mask?.(ctx) ?? []];
				const shot = {
					animations: "disabled",
					caret: "hide",
					style,
					mask: mask.length ? mask : void 0
				};
				const image = await page.screenshot({
					...shot,
					fullPage,
					scale: config.scale ?? "device",
					type: "png"
				});
				const base = `review-${String(sequence + 1).padStart(2, "0")}-${fileSafeName(unique)}-${fileSafeName(variant.name)}`;
				const attachment = `${require_dist.REVIEW_ATTACHMENT_PREFIX}${unique}:${variant.name}`;
				const imagePath = testInfo.outputPath(`${base}.png`);
				await (0, node_fs_promises.writeFile)(imagePath, image);
				await testInfo.attach(attachment, {
					path: imagePath,
					contentType: "image/png"
				});
				let thumbnail;
				if (config.thumbnails ?? true) {
					const preview = await page.screenshot({
						...shot,
						fullPage: false,
						scale: "css",
						type: "jpeg",
						quality: 70
					});
					const previewPath = testInfo.outputPath(`${base}.thumb.jpg`);
					await (0, node_fs_promises.writeFile)(previewPath, preview);
					thumbnail = `${attachment}:thumb`;
					await testInfo.attach(thumbnail, {
						path: previewPath,
						contentType: "image/jpeg"
					});
				}
				const size = pngSize(image);
				const use = testInfo.project.use;
				variants.push({
					variant: variant.name,
					attachment,
					thumbnail,
					viewport: variant.viewport ?? void 0,
					deviceScaleFactor: config.scale === "css" ? 1 : use.deviceScaleFactor ?? 1,
					isMobile: variantSpec === "project" ? Boolean(use.isMobile) : void 0,
					fullPage,
					width: size?.width,
					height: size?.height,
					sha256: (0, node_crypto.createHash)("sha256").update(image).digest("hex")
				});
			}
		} finally {
			if (original && variantSpec !== "project") await page.setViewportSize(original).catch(() => void 0);
			await smooth?.evaluate((el) => el.remove()).catch(() => void 0);
		}
		const record = {
			v: 1,
			name: unique.slice(0, 200),
			title: options.title,
			description: options.description,
			sequence,
			capturedAt,
			url: url && url !== "about:blank" && !url.startsWith("data:") ? url.slice(0, 2e3) : void 0,
			pageTitle: pageTitle ? pageTitle.slice(0, 500) : void 0,
			kind: options.kind,
			flow: options.flow,
			tags: options.tags,
			variants
		};
		await testInfo.attach(`pw-reporter:checkpoint:${unique}`, {
			body: JSON.stringify(record),
			contentType: require_dist.CHECKPOINT_CONTENT_TYPE
		});
		return record;
	}
	const capture = async (page, testInfo, name, options = {}) => {
		if (!enabled()) return null;
		if (!name.trim()) throw new Error("A review checkpoint needs a name.");
		const run = () => captureOnce(page, testInfo, name.trim(), options);
		if (config.step === false) return run();
		return _playwright_test.test.step(`${REVIEW_STEP_PREFIX}${options.title ?? name}`, run, { box: true });
	};
	const html = async (page, testInfo, name, doc, options = {}) => {
		if (!enabled()) return null;
		if (!doc.trim()) throw new Error(`Cannot capture review checkpoint "${name}": the HTML is empty.`);
		await page.setContent(doc, { waitUntil: "load" });
		await page.waitForFunction(() => Array.from(document.images).every((img) => img.complete), void 0, { timeout: options.imageTimeoutMs ?? 5e3 }).catch(() => void 0);
		return capture(page, testInfo, name, {
			kind: "email",
			...options
		});
	};
	return {
		capture,
		html
	};
}
/** The checkpoint helper with the default settings. */
const review = defineReview();
/**
* Fixtures for `test.extend`: `review` captures a checkpoint of the test's `page`.
*
* ```ts
* export const test = base.extend(reviewFixtures({ fullPage: true }));
* ```
*/
function reviewFixtures(config = {}) {
	const helper = defineReview(config);
	return { review: async ({ page }, use, testInfo) => {
		await use(Object.assign((name, options) => helper.capture(page, testInfo, name, options), { html: (name, doc, options) => helper.html(page, testInfo, name, doc, options) }));
	} };
}
/** A test result's checkpoint records, in capture order: for reporters other than this one. */
function readCheckpoints(result) {
	const out = [];
	for (const a of result.attachments) {
		if (a.contentType !== "application/vnd.pw-reporter.checkpoint+json" || !a.body) continue;
		try {
			const record = JSON.parse(a.body.toString("utf8"));
			if (record && record.v === 1 && Array.isArray(record.variants)) out.push(record);
		} catch {}
	}
	return out.sort((a, b) => a.sequence - b.sequence);
}
//#endregion
exports.CHECKPOINT_CONTENT_TYPE = require_dist.CHECKPOINT_CONTENT_TYPE;
exports.DEFAULT_VARIANTS = DEFAULT_VARIANTS;
exports.REVIEW_STEP_PREFIX = REVIEW_STEP_PREFIX;
exports.defineReview = defineReview;
exports.fileSafeName = fileSafeName;
exports.pngSize = pngSize;
exports.readCheckpoints = readCheckpoints;
exports.review = review;
exports.reviewFixtures = reviewFixtures;

//# sourceMappingURL=review.cjs.map