import { z } from "zod";
//#region ../protocol/dist/index.mjs
const PROTOCOL_HEADER = "x-pw-reporter-protocol";
const attemptStatusSchema = z.enum([
	"passed",
	"failed",
	"timedOut",
	"skipped",
	"interrupted"
]);
const testOutcomeSchema = z.enum([
	"skipped",
	"expected",
	"unexpected",
	"flaky"
]);
const runStatusSchema = z.enum([
	"passed",
	"failed",
	"timedout",
	"interrupted"
]);
const executorSchema = z.enum(["ci", "local"]);
const executorSourceSchema = z.enum([
	"provider",
	"ci-env",
	"option"
]);
const shardSchema = z.object({
	current: z.number().int().min(1),
	total: z.number().int().min(1)
});
const locationSchema = z.object({
	file: z.string(),
	line: z.number().int(),
	column: z.number().int()
});
const annotationSchema = z.object({
	type: z.string(),
	description: z.string().optional()
});
const testErrorSchema = z.object({
	message: z.string().optional(),
	stack: z.string().optional(),
	value: z.string().optional(),
	snippet: z.string().optional(),
	location: locationSchema.optional()
});
const stepSchema = z.object({
	title: z.string(),
	category: z.string(),
	durationMs: z.number(),
	depth: z.number().int().min(0),
	startedAt: z.string(),
	error: z.string().optional(),
	location: locationSchema.optional()
});
z.enum([
	"screenshot",
	"video",
	"trace",
	"image",
	"text",
	"other"
]);
const attachmentRefSchema = z.object({
	/** Client-generated UUID; becomes the attachment id on the server. */
	id: z.string().uuid(),
	name: z.string(),
	contentType: z.string(),
	size: z.number().int().nonnegative().optional()
});
/**
* A review checkpoint is a named, human-review milestone of a test: the same
* moment captured once per variant (a desktop and a mobile viewport, say).
* The images travel as ordinary attachments; the checkpoint says what they
* show, in which order, and how they were taken.
*
* The capture helper (`@miguelfranken/reporter/review`) attaches one
* `CheckpointRecord` per checkpoint, as JSON with `CHECKPOINT_CONTENT_TYPE`,
* naming its images by attachment name. The reporter resolves those names to
* the attachment ids it sends and puts the result on `attempt.end` as
* `checkpoints`. Older suites name their images `review:<name>:<variant>` and
* nothing else; `legacyCheckpoints` reads that convention.
*/
const CHECKPOINT_CONTENT_TYPE = "application/vnd.pw-reporter.checkpoint+json";
const REVIEW_ATTACHMENT_PREFIX = "review:";
/** The variant name of a checkpoint captured once, without variants. */
const DEFAULT_VARIANT = "default";
const checkpointKindSchema = z.enum([
	"page",
	"dialog",
	"email",
	"component",
	"other"
]);
const viewportSchema = z.object({
	width: z.number().int().positive(),
	height: z.number().int().positive()
});
const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
/** How one variant of a checkpoint was taken; everything but the name is optional. */
const variantFields = {
	/** `desktop`, `mobile`, a Playwright project name… */
	variant: z.string().min(1).max(60),
	viewport: viewportSchema.optional(),
	deviceScaleFactor: z.number().positive().max(10).optional(),
	isMobile: z.boolean().optional(),
	fullPage: z.boolean().optional(),
	/** The image's size in pixels. */
	width: z.number().int().positive().optional(),
	height: z.number().int().positive().optional(),
	/** Of the image bytes: equal hashes are identical pictures. */
	sha256: sha256Schema.optional()
};
const checkpointFields = {
	/** Stable within a test: identifies the checkpoint across runs. kebab-case by convention. */
	name: z.string().min(1).max(200),
	title: z.string().max(300).optional(),
	description: z.string().max(4e3).optional(),
	/** Order within the attempt, from 0. */
	sequence: z.number().int().nonnegative(),
	capturedAt: z.string().optional(),
	/** Titles of the `test.step`s the capture ran inside, outermost first. */
	stepPath: z.array(z.string().max(500)).max(20).optional(),
	url: z.string().max(2e3).optional(),
	pageTitle: z.string().max(500).optional(),
	kind: checkpointKindSchema.optional(),
	/** Groups checkpoints of several tests into one journey; defaults to the test. */
	flow: z.string().max(200).optional(),
	tags: z.array(z.string().max(100)).max(20).optional()
};
const checkpointVariantSchema = z.object({
	...variantFields,
	attachmentId: z.string().uuid(),
	/** A small, above-the-fold preview of the image, for overviews. */
	thumbnailAttachmentId: z.string().uuid().optional()
});
const checkpointSchema = z.object({
	...checkpointFields,
	variants: z.array(checkpointVariantSchema).min(1).max(20)
});
/** What the capture helper attaches: variants name their images by attachment name. */
const checkpointRecordSchema = z.object({
	v: z.literal(1),
	...checkpointFields,
	variants: z.array(z.object({
		...variantFields,
		attachment: z.string(),
		thumbnail: z.string().optional()
	})).min(1).max(20)
});
const gitInfoSchema = z.object({
	branch: z.string().optional(),
	sha: z.string().optional(),
	shortSha: z.string().optional(),
	message: z.string().optional(),
	authorName: z.string().optional(),
	authorEmail: z.string().optional(),
	repoUrl: z.string().optional(),
	/** The pull or merge request the run belongs to: its number (GitLab's IID), link and title. */
	prNumber: z.number().int().optional(),
	prUrl: z.string().optional(),
	prTitle: z.string().optional(),
	/**
	* Whether the checkout had uncommitted changes to tracked files when the run
	* started, so the results may not match `sha`. Absent when unknown (an older
	* reporter, no checkout). Only the state and a count travel, never paths or contents.
	*/
	dirty: z.boolean().optional(),
	/** How many tracked files had uncommitted changes. */
	dirtyFiles: z.number().int().nonnegative().optional()
});
const ciInfoSchema = z.object({
	provider: z.string().optional(),
	buildUrl: z.string().optional(),
	buildNumber: z.string().optional(),
	job: z.string().optional(),
	/**
	* How the run's `executor` was decided: `provider` from a known CI
	* provider's variables, `ci-env` from the bare `CI` variable alone (a local
	* wrapper may set it), `option` from an explicit reporter option or
	* `PW_REPORTER_EXECUTOR`. Absent when unknown.
	*/
	detectedBy: executorSourceSchema.optional()
});
const systemInfoSchema = z.object({
	os: z.string().optional(),
	osRelease: z.string().optional(),
	arch: z.string().optional(),
	cpus: z.number().int().optional(),
	memoryBytes: z.number().optional(),
	node: z.string().optional(),
	hostname: z.string().optional(),
	timezone: z.string().optional()
});
const playwrightProjectInfoSchema = z.object({
	name: z.string(),
	browserName: z.string().optional(),
	viewport: z.object({
		width: z.number(),
		height: z.number()
	}).nullable().optional(),
	retries: z.number().int(),
	timeout: z.number(),
	baseURL: z.string().optional(),
	headless: z.boolean().optional()
});
const playwrightInfoSchema = z.object({
	version: z.string().optional(),
	workers: z.number().int().optional(),
	configFile: z.string().optional(),
	projects: z.array(playwrightProjectInfoSchema)
});
const runStartSchema = z.object({
	ciRunId: z.string().min(1).max(200),
	shard: shardSchema.nullable(),
	expectedTests: z.number().int().nonnegative(),
	startedAt: z.string(),
	executor: executorSchema,
	environment: z.string().max(100).optional(),
	tags: z.array(z.string().max(100)).max(50),
	git: gitInfoSchema,
	ci: ciInfoSchema,
	system: systemInfoSchema,
	playwright: playwrightInfoSchema
});
const runStartResponseSchema = z.object({
	runId: z.string(),
	runNumber: z.number().int(),
	shardIndex: z.number().int(),
	url: z.string()
});
const baseEvent = { seq: z.number().int().nonnegative() };
const testBeginEventSchema = z.object({
	...baseEvent,
	type: z.literal("test.begin"),
	testKey: z.string(),
	pwTestId: z.string(),
	title: z.string(),
	titlePath: z.array(z.string()),
	file: z.string(),
	line: z.number().int(),
	column: z.number().int(),
	project: z.string(),
	tags: z.array(z.string()),
	annotations: z.array(annotationSchema),
	expectedStatus: attemptStatusSchema,
	retries: z.number().int(),
	retry: z.number().int(),
	workerIndex: z.number().int(),
	startedAt: z.string()
});
const attemptEndEventSchema = z.object({
	...baseEvent,
	type: z.literal("attempt.end"),
	testKey: z.string(),
	retry: z.number().int(),
	status: attemptStatusSchema,
	durationMs: z.number(),
	startedAt: z.string(),
	workerIndex: z.number().int(),
	parallelIndex: z.number().int(),
	errors: z.array(testErrorSchema),
	steps: z.array(stepSchema),
	stdout: z.string(),
	stderr: z.string(),
	annotations: z.array(annotationSchema),
	attachments: z.array(attachmentRefSchema),
	/** Review checkpoints, in capture order. Absent from reporters that predate them. */
	checkpoints: z.array(checkpointSchema).max(500).optional(),
	/** Playwright's outcome() for the test after this attempt. */
	outcome: testOutcomeSchema,
	/** True when no further retry will follow. */
	isFinal: z.boolean()
});
const runLogEventSchema = z.object({
	...baseEvent,
	type: z.literal("run.log"),
	level: z.enum([
		"info",
		"warn",
		"error"
	]),
	message: z.string()
});
const ingestEventSchema = z.discriminatedUnion("type", [
	testBeginEventSchema,
	attemptEndEventSchema,
	runLogEventSchema
]);
const eventBatchSchema = z.object({
	shardIndex: z.number().int(),
	events: z.array(ingestEventSchema).max(1e3)
});
const eventBatchResponseSchema = z.object({
	accepted: z.number().int(),
	lastSeq: z.number().int()
});
const uploadUrlsRequestSchema = z.object({ attachmentIds: z.array(z.string().uuid()).min(1).max(100) });
const uploadInstructionSchema = z.object({
	attachmentId: z.string(),
	strategy: z.enum(["proxy", "presigned"]),
	method: z.literal("PUT"),
	url: z.string(),
	headers: z.record(z.string(), z.string())
});
const uploadUrlsResponseSchema = z.object({ uploads: z.array(uploadInstructionSchema) });
/** Confirms a presigned upload; proxy uploads are confirmed by the upload itself. */
const completeUploadRequestSchema = z.object({ size: z.number().int().nonnegative().optional() });
const completeUploadResponseSchema = z.object({ ok: z.boolean() });
const runFinishSchema = z.object({
	shardIndex: z.number().int(),
	status: runStatusSchema,
	durationMs: z.number(),
	finishedAt: z.string()
});
const runFinishResponseSchema = z.object({
	runStatus: z.enum([
		"running",
		"passed",
		"failed",
		"timedout",
		"interrupted",
		"incomplete"
	]),
	url: z.string()
});
/**
* `POST /api/ingest/runs/:runId/heartbeat`, sent on its own while tests run so
* a silent stretch (a long test) is not taken for a dead reporter. Never part
* of an event batch: a server without it would reject the whole batch. A
* server without the endpoint answers 404, and the reporter stops sending.
*/
const runHeartbeatSchema = z.object({ shardIndex: z.number().int() });
const runHeartbeatResponseSchema = z.object({ runStatus: z.enum([
	"running",
	"passed",
	"failed",
	"timedout",
	"interrupted",
	"incomplete"
]) });
/**
* Reads the `review:<name>:<variant>` naming convention; a trailing `:thumb`
* marks the variant's preview. A name without a variant is the default one.
*/
function parseReviewAttachmentName(name) {
	if (!name.startsWith("review:")) return null;
	const parts = name.slice(7).split(":");
	const thumbnail = parts.length > 2 && parts[parts.length - 1] === "thumb";
	if (thumbnail) parts.pop();
	if (parts.length === 1) return parts[0] ? {
		name: parts[0],
		variant: DEFAULT_VARIANT,
		thumbnail
	} : null;
	const variant = parts.pop();
	const base = parts.join(":");
	return base && variant ? {
		name: base,
		variant,
		thumbnail
	} : null;
}
/**
* Checkpoints from image attachments named `review:<name>:<variant>`, for
* suites that attach review screenshots without a checkpoint record. Order is
* the order the first image of each checkpoint was attached in.
*/
function legacyCheckpoints(attachments) {
	const byName = /* @__PURE__ */ new Map();
	const thumbs = /* @__PURE__ */ new Map();
	for (const a of attachments) {
		if (!a.contentType.startsWith("image/")) continue;
		const parsed = parseReviewAttachmentName(a.name);
		if (!parsed) continue;
		if (parsed.thumbnail) {
			thumbs.set(`${parsed.name}\u0000${parsed.variant}`, a.id);
			continue;
		}
		let cp = byName.get(parsed.name);
		if (!cp) {
			cp = {
				name: parsed.name.slice(0, 200),
				sequence: byName.size,
				variants: []
			};
			byName.set(parsed.name, cp);
		}
		if (cp.variants.length < 20 && !cp.variants.some((v) => v.variant === parsed.variant)) cp.variants.push({
			variant: parsed.variant.slice(0, 60),
			attachmentId: a.id
		});
	}
	for (const [key, cp] of byName) for (const v of cp.variants) {
		const thumb = thumbs.get(`${key}\u0000${v.variant}`);
		if (thumb) v.thumbnailAttachmentId = thumb;
	}
	return [...byName.values()].slice(0, 500);
}
//#endregion
export { uploadUrlsRequestSchema as _, checkpointRecordSchema as a, eventBatchResponseSchema as c, runFinishResponseSchema as d, runFinishSchema as f, runStartSchema as g, runStartResponseSchema as h, REVIEW_ATTACHMENT_PREFIX as i, eventBatchSchema as l, runHeartbeatSchema as m, DEFAULT_VARIANT as n, completeUploadRequestSchema as o, runHeartbeatResponseSchema as p, PROTOCOL_HEADER as r, completeUploadResponseSchema as s, CHECKPOINT_CONTENT_TYPE as t, legacyCheckpoints as u, uploadUrlsResponseSchema as v };

//# sourceMappingURL=dist-D7tL4Myv.mjs.map