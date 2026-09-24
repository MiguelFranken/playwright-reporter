Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
let zod = require("zod");
//#region src/index.ts
const PROTOCOL_VERSION = 1;
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
const attachmentKindSchema = zod.z.enum([
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
const gitInfoSchema = zod.z.object({
	branch: zod.z.string().optional(),
	sha: zod.z.string().optional(),
	shortSha: zod.z.string().optional(),
	message: zod.z.string().optional(),
	authorName: zod.z.string().optional(),
	authorEmail: zod.z.string().optional(),
	repoUrl: zod.z.string().optional(),
	prNumber: zod.z.number().int().optional(),
	prUrl: zod.z.string().optional()
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
/** Classifies a Playwright attachment by name and content type. */
function classifyAttachment(name, contentType) {
	const n = name.toLowerCase();
	if (n === "trace" || n.endsWith(".zip") && n.includes("trace")) return "trace";
	if (n === "video" || contentType.startsWith("video/")) return "video";
	if (n === "screenshot" || n.startsWith("screenshot")) return "screenshot";
	if (contentType.startsWith("image/")) return "image";
	if (contentType.startsWith("text/") || contentType.includes("json") || contentType.includes("xml")) return "text";
	return "other";
}
//#endregion
exports.PROTOCOL_HEADER = PROTOCOL_HEADER;
exports.PROTOCOL_VERSION = PROTOCOL_VERSION;
exports.annotationSchema = annotationSchema;
exports.attachmentKindSchema = attachmentKindSchema;
exports.attachmentRefSchema = attachmentRefSchema;
exports.attemptEndEventSchema = attemptEndEventSchema;
exports.attemptStatusSchema = attemptStatusSchema;
exports.ciInfoSchema = ciInfoSchema;
exports.classifyAttachment = classifyAttachment;
exports.eventBatchResponseSchema = eventBatchResponseSchema;
exports.eventBatchSchema = eventBatchSchema;
exports.executorSchema = executorSchema;
exports.gitInfoSchema = gitInfoSchema;
exports.ingestEventSchema = ingestEventSchema;
exports.locationSchema = locationSchema;
exports.playwrightInfoSchema = playwrightInfoSchema;
exports.playwrightProjectInfoSchema = playwrightProjectInfoSchema;
exports.runFinishResponseSchema = runFinishResponseSchema;
exports.runFinishSchema = runFinishSchema;
exports.runLogEventSchema = runLogEventSchema;
exports.runStartResponseSchema = runStartResponseSchema;
exports.runStartSchema = runStartSchema;
exports.runStatusSchema = runStatusSchema;
exports.shardSchema = shardSchema;
exports.stepSchema = stepSchema;
exports.systemInfoSchema = systemInfoSchema;
exports.testBeginEventSchema = testBeginEventSchema;
exports.testErrorSchema = testErrorSchema;
exports.testOutcomeSchema = testOutcomeSchema;
exports.uploadInstructionSchema = uploadInstructionSchema;
exports.uploadUrlsRequestSchema = uploadUrlsRequestSchema;
exports.uploadUrlsResponseSchema = uploadUrlsResponseSchema;

//# sourceMappingURL=index.cjs.map