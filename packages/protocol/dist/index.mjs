import { z } from "zod";
//#region src/index.ts
const PROTOCOL_VERSION = 1;
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
const attachmentKindSchema = z.enum([
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
	prTitle: z.string().optional()
});
const ciInfoSchema = z.object({
	provider: z.string().optional(),
	buildUrl: z.string().optional(),
	buildNumber: z.string().optional(),
	job: z.string().optional()
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
export { PROTOCOL_HEADER, PROTOCOL_VERSION, annotationSchema, attachmentKindSchema, attachmentRefSchema, attemptEndEventSchema, attemptStatusSchema, ciInfoSchema, classifyAttachment, eventBatchResponseSchema, eventBatchSchema, executorSchema, gitInfoSchema, ingestEventSchema, locationSchema, playwrightInfoSchema, playwrightProjectInfoSchema, runFinishResponseSchema, runFinishSchema, runHeartbeatResponseSchema, runHeartbeatSchema, runLogEventSchema, runStartResponseSchema, runStartSchema, runStatusSchema, shardSchema, stepSchema, systemInfoSchema, testBeginEventSchema, testErrorSchema, testOutcomeSchema, uploadInstructionSchema, uploadUrlsRequestSchema, uploadUrlsResponseSchema };

//# sourceMappingURL=index.mjs.map