let zod = require("zod");
//#region ../protocol/dist/index.mjs
const PROTOCOL_HEADER = "x-pw-reporter-protocol";
const attemptStatusSchema = zod.z.enum([
	"passed",
	"failed",
	"timedOut",
	"skipped",
	"interrupted"
]);
const testOutcomeSchema = zod.z.enum([
	"skipped",
	"expected",
	"unexpected",
	"flaky"
]);
const runStatusSchema = zod.z.enum([
	"passed",
	"failed",
	"timedout",
	"interrupted"
]);
const executorSchema = zod.z.enum(["ci", "local"]);
const shardSchema = zod.z.object({
	current: zod.z.number().int().min(1),
	total: zod.z.number().int().min(1)
});
const locationSchema = zod.z.object({
	file: zod.z.string(),
	line: zod.z.number().int(),
	column: zod.z.number().int()
});
const annotationSchema = zod.z.object({
	type: zod.z.string(),
	description: zod.z.string().optional()
});
const testErrorSchema = zod.z.object({
	message: zod.z.string().optional(),
	stack: zod.z.string().optional(),
	value: zod.z.string().optional(),
	snippet: zod.z.string().optional(),
	location: locationSchema.optional()
});
const stepSchema = zod.z.object({
	title: zod.z.string(),
	category: zod.z.string(),
	durationMs: zod.z.number(),
	depth: zod.z.number().int().min(0),
	startedAt: zod.z.string(),
	error: zod.z.string().optional(),
	location: locationSchema.optional()
});
zod.z.enum([
	"screenshot",
	"video",
	"trace",
	"image",
	"text",
	"other"
]);
const attachmentRefSchema = zod.z.object({
	/** Client-generated UUID; becomes the attachment id on the server. */
	id: zod.z.string().uuid(),
	name: zod.z.string(),
	contentType: zod.z.string(),
	size: zod.z.number().int().nonnegative().optional()
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
const checkpointKindSchema = zod.z.enum([
	"page",
	"dialog",
	"email",
	"component",
	"other"
]);
const viewportSchema = zod.z.object({
	width: zod.z.number().int().positive(),
	height: zod.z.number().int().positive()
});
const sha256Schema = zod.z.string().regex(/^[0-9a-f]{64}$/);
/** How one variant of a checkpoint was taken; everything but the name is optional. */
const variantFields = {
	/** `desktop`, `mobile`, a Playwright project name… */
	variant: zod.z.string().min(1).max(60),
	viewport: viewportSchema.optional(),
	deviceScaleFactor: zod.z.number().positive().max(10).optional(),
	isMobile: zod.z.boolean().optional(),
	fullPage: zod.z.boolean().optional(),
	/** The image's size in pixels. */
	width: zod.z.number().int().positive().optional(),
	height: zod.z.number().int().positive().optional(),
	/** Of the image bytes: equal hashes are identical pictures. */
	sha256: sha256Schema.optional()
};
const checkpointFields = {
	/** Stable within a test: identifies the checkpoint across runs. kebab-case by convention. */
	name: zod.z.string().min(1).max(200),
	title: zod.z.string().max(300).optional(),
	description: zod.z.string().max(4e3).optional(),
	/** Order within the attempt, from 0. */
	sequence: zod.z.number().int().nonnegative(),
	capturedAt: zod.z.string().optional(),
	/** Titles of the `test.step`s the capture ran inside, outermost first. */
	stepPath: zod.z.array(zod.z.string().max(500)).max(20).optional(),
	url: zod.z.string().max(2e3).optional(),
	pageTitle: zod.z.string().max(500).optional(),
	kind: checkpointKindSchema.optional(),
	/** Groups checkpoints of several tests into one journey; defaults to the test. */
	flow: zod.z.string().max(200).optional(),
	tags: zod.z.array(zod.z.string().max(100)).max(20).optional()
};
const checkpointVariantSchema = zod.z.object({
	...variantFields,
	attachmentId: zod.z.string().uuid(),
	/** A small, above-the-fold preview of the image, for overviews. */
	thumbnailAttachmentId: zod.z.string().uuid().optional()
});
const checkpointSchema = zod.z.object({
	...checkpointFields,
	variants: zod.z.array(checkpointVariantSchema).min(1).max(20)
});
/** What the capture helper attaches: variants name their images by attachment name. */
const checkpointRecordSchema = zod.z.object({
	v: zod.z.literal(1),
	...checkpointFields,
	variants: zod.z.array(zod.z.object({
		...variantFields,
		attachment: zod.z.string(),
		thumbnail: zod.z.string().optional()
	})).min(1).max(20)
});
const gitInfoSchema = zod.z.object({
	branch: zod.z.string().optional(),
	sha: zod.z.string().optional(),
	shortSha: zod.z.string().optional(),
	message: zod.z.string().optional(),
	authorName: zod.z.string().optional(),
	authorEmail: zod.z.string().optional(),
	repoUrl: zod.z.string().optional(),
	/** The pull or merge request the run belongs to: its number (GitLab's IID), link and title. */
	prNumber: zod.z.number().int().optional(),
	prUrl: zod.z.string().optional(),
	prTitle: zod.z.string().optional()
});
const ciInfoSchema = zod.z.object({
	provider: zod.z.string().optional(),
	buildUrl: zod.z.string().optional(),
	buildNumber: zod.z.string().optional(),
	job: zod.z.string().optional()
});
const systemInfoSchema = zod.z.object({
	os: zod.z.string().optional(),
	osRelease: zod.z.string().optional(),
	arch: zod.z.string().optional(),
	cpus: zod.z.number().int().optional(),
	memoryBytes: zod.z.number().optional(),
	node: zod.z.string().optional(),
	hostname: zod.z.string().optional(),
	timezone: zod.z.string().optional()
});
const playwrightProjectInfoSchema = zod.z.object({
	name: zod.z.string(),
	browserName: zod.z.string().optional(),
	viewport: zod.z.object({
		width: zod.z.number(),
		height: zod.z.number()
	}).nullable().optional(),
	retries: zod.z.number().int(),
	timeout: zod.z.number(),
	baseURL: zod.z.string().optional(),
	headless: zod.z.boolean().optional()
});
const playwrightInfoSchema = zod.z.object({
	version: zod.z.string().optional(),
	workers: zod.z.number().int().optional(),
	configFile: zod.z.string().optional(),
	projects: zod.z.array(playwrightProjectInfoSchema)
});
const runStartSchema = zod.z.object({
	ciRunId: zod.z.string().min(1).max(200),
	shard: shardSchema.nullable(),
	expectedTests: zod.z.number().int().nonnegative(),
	startedAt: zod.z.string(),
	executor: executorSchema,
	environment: zod.z.string().max(100).optional(),
	tags: zod.z.array(zod.z.string().max(100)).max(50),
	git: gitInfoSchema,
	ci: ciInfoSchema,
	system: systemInfoSchema,
	playwright: playwrightInfoSchema
});
const runStartResponseSchema = zod.z.object({
	runId: zod.z.string(),
	runNumber: zod.z.number().int(),
	shardIndex: zod.z.number().int(),
	url: zod.z.string()
});
const baseEvent = { seq: zod.z.number().int().nonnegative() };
const testBeginEventSchema = zod.z.object({
	...baseEvent,
	type: zod.z.literal("test.begin"),
	testKey: zod.z.string(),
	pwTestId: zod.z.string(),
	title: zod.z.string(),
	titlePath: zod.z.array(zod.z.string()),
	file: zod.z.string(),
	line: zod.z.number().int(),
	column: zod.z.number().int(),
	project: zod.z.string(),
	tags: zod.z.array(zod.z.string()),
	annotations: zod.z.array(annotationSchema),
	expectedStatus: attemptStatusSchema,
	retries: zod.z.number().int(),
	retry: zod.z.number().int(),
	workerIndex: zod.z.number().int(),
	startedAt: zod.z.string()
});
const attemptEndEventSchema = zod.z.object({
	...baseEvent,
	type: zod.z.literal("attempt.end"),
	testKey: zod.z.string(),
	retry: zod.z.number().int(),
	status: attemptStatusSchema,
	durationMs: zod.z.number(),
	startedAt: zod.z.string(),
	workerIndex: zod.z.number().int(),
	parallelIndex: zod.z.number().int(),
	errors: zod.z.array(testErrorSchema),
	steps: zod.z.array(stepSchema),
	stdout: zod.z.string(),
	stderr: zod.z.string(),
	annotations: zod.z.array(annotationSchema),
	attachments: zod.z.array(attachmentRefSchema),
	/** Review checkpoints, in capture order. Absent from reporters that predate them. */
	checkpoints: zod.z.array(checkpointSchema).max(500).optional(),
	/** Playwright's outcome() for the test after this attempt. */
	outcome: testOutcomeSchema,
	/** True when no further retry will follow. */
	isFinal: zod.z.boolean()
});
const runLogEventSchema = zod.z.object({
	...baseEvent,
	type: zod.z.literal("run.log"),
	level: zod.z.enum([
		"info",
		"warn",
		"error"
	]),
	message: zod.z.string()
});
const ingestEventSchema = zod.z.discriminatedUnion("type", [
	testBeginEventSchema,
	attemptEndEventSchema,
	runLogEventSchema
]);
const eventBatchSchema = zod.z.object({
	shardIndex: zod.z.number().int(),
	events: zod.z.array(ingestEventSchema).max(1e3)
});
const eventBatchResponseSchema = zod.z.object({
	accepted: zod.z.number().int(),
	lastSeq: zod.z.number().int()
});
const uploadUrlsRequestSchema = zod.z.object({ attachmentIds: zod.z.array(zod.z.string().uuid()).min(1).max(100) });
const uploadInstructionSchema = zod.z.object({
	attachmentId: zod.z.string(),
	strategy: zod.z.enum(["proxy", "presigned"]),
	method: zod.z.literal("PUT"),
	url: zod.z.string(),
	headers: zod.z.record(zod.z.string(), zod.z.string())
});
const uploadUrlsResponseSchema = zod.z.object({ uploads: zod.z.array(uploadInstructionSchema) });
/** Confirms a presigned upload; proxy uploads are confirmed by the upload itself. */
const completeUploadRequestSchema = zod.z.object({ size: zod.z.number().int().nonnegative().optional() });
const completeUploadResponseSchema = zod.z.object({ ok: zod.z.boolean() });
const runFinishSchema = zod.z.object({
	shardIndex: zod.z.number().int(),
	status: runStatusSchema,
	durationMs: zod.z.number(),
	finishedAt: zod.z.string()
});
const runFinishResponseSchema = zod.z.object({
	runStatus: zod.z.enum([
		"running",
		"passed",
		"failed",
		"timedout",
		"interrupted",
		"incomplete"
	]),
	url: zod.z.string()
});
/**
* `POST /api/ingest/runs/:runId/heartbeat`, sent on its own while tests run so
* a silent stretch (a long test) is not taken for a dead reporter. Never part
* of an event batch: a server without it would reject the whole batch. A
* server without the endpoint answers 404, and the reporter stops sending.
*/
const runHeartbeatSchema = zod.z.object({ shardIndex: zod.z.number().int() });
const runHeartbeatResponseSchema = zod.z.object({ runStatus: zod.z.enum([
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
Object.defineProperty(exports, "CHECKPOINT_CONTENT_TYPE", {
	enumerable: true,
	get: function() {
		return CHECKPOINT_CONTENT_TYPE;
	}
});
Object.defineProperty(exports, "DEFAULT_VARIANT", {
	enumerable: true,
	get: function() {
		return DEFAULT_VARIANT;
	}
});
Object.defineProperty(exports, "PROTOCOL_HEADER", {
	enumerable: true,
	get: function() {
		return PROTOCOL_HEADER;
	}
});
Object.defineProperty(exports, "REVIEW_ATTACHMENT_PREFIX", {
	enumerable: true,
	get: function() {
		return REVIEW_ATTACHMENT_PREFIX;
	}
});
Object.defineProperty(exports, "checkpointRecordSchema", {
	enumerable: true,
	get: function() {
		return checkpointRecordSchema;
	}
});
Object.defineProperty(exports, "completeUploadRequestSchema", {
	enumerable: true,
	get: function() {
		return completeUploadRequestSchema;
	}
});
Object.defineProperty(exports, "completeUploadResponseSchema", {
	enumerable: true,
	get: function() {
		return completeUploadResponseSchema;
	}
});
Object.defineProperty(exports, "eventBatchResponseSchema", {
	enumerable: true,
	get: function() {
		return eventBatchResponseSchema;
	}
});
Object.defineProperty(exports, "eventBatchSchema", {
	enumerable: true,
	get: function() {
		return eventBatchSchema;
	}
});
Object.defineProperty(exports, "legacyCheckpoints", {
	enumerable: true,
	get: function() {
		return legacyCheckpoints;
	}
});
Object.defineProperty(exports, "runFinishResponseSchema", {
	enumerable: true,
	get: function() {
		return runFinishResponseSchema;
	}
});
Object.defineProperty(exports, "runFinishSchema", {
	enumerable: true,
	get: function() {
		return runFinishSchema;
	}
});
Object.defineProperty(exports, "runHeartbeatResponseSchema", {
	enumerable: true,
	get: function() {
		return runHeartbeatResponseSchema;
	}
});
Object.defineProperty(exports, "runHeartbeatSchema", {
	enumerable: true,
	get: function() {
		return runHeartbeatSchema;
	}
});
Object.defineProperty(exports, "runStartResponseSchema", {
	enumerable: true,
	get: function() {
		return runStartResponseSchema;
	}
});
Object.defineProperty(exports, "runStartSchema", {
	enumerable: true,
	get: function() {
		return runStartSchema;
	}
});
Object.defineProperty(exports, "uploadUrlsRequestSchema", {
	enumerable: true,
	get: function() {
		return uploadUrlsRequestSchema;
	}
});
Object.defineProperty(exports, "uploadUrlsResponseSchema", {
	enumerable: true,
	get: function() {
		return uploadUrlsResponseSchema;
	}
});

//# sourceMappingURL=dist-DdBwzinA.cjs.map