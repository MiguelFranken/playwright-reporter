import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { z } from "zod";
import os from "node:os";
import { execFileSync } from "node:child_process";
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
const gitInfoSchema = z.object({
	branch: z.string().optional(),
	sha: z.string().optional(),
	shortSha: z.string().optional(),
	message: z.string().optional(),
	authorName: z.string().optional(),
	authorEmail: z.string().optional(),
	repoUrl: z.string().optional(),
	prNumber: z.number().int().optional(),
	prUrl: z.string().optional()
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
z.object({
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
z.object({
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
z.object({
	shardIndex: z.number().int(),
	events: z.array(ingestEventSchema).max(1e3)
});
z.object({
	accepted: z.number().int(),
	lastSeq: z.number().int()
});
z.object({ attachmentIds: z.array(z.string().uuid()).min(1).max(100) });
const uploadInstructionSchema = z.object({
	attachmentId: z.string(),
	strategy: z.enum(["proxy", "presigned"]),
	method: z.literal("PUT"),
	url: z.string(),
	headers: z.record(z.string(), z.string())
});
z.object({ uploads: z.array(uploadInstructionSchema) });
z.object({
	shardIndex: z.number().int(),
	status: runStatusSchema,
	durationMs: z.number(),
	finishedAt: z.string()
});
z.object({
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
//#endregion
//#region src/client.ts
var HttpError = class extends Error {
	status;
	constructor(status, message) {
		super(message);
		this.status = status;
	}
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function isRetryable(err) {
	if (!(err instanceof HttpError)) return true;
	return err.status >= 500 || err.status === 408 || err.status === 429;
}
var IngestClient = class {
	opts;
	log;
	constructor(opts, log) {
		this.opts = opts;
		this.log = log;
	}
	async request(path, body, attempt = 0) {
		const url = `${this.opts.serverUrl}${path}`;
		const json = JSON.stringify(body);
		let payload = json;
		const headers = {
			"content-type": "application/json",
			authorization: `Bearer ${this.opts.token}`,
			[PROTOCOL_HEADER]: String(1)
		};
		if (json.length > 32768) {
			payload = new Blob([new Uint8Array(gzipSync(json))]);
			headers["content-encoding"] = "gzip";
		}
		try {
			const res = await fetch(url, {
				method: "POST",
				headers,
				body: payload
			});
			if (!res.ok) {
				const text = await res.text().catch(() => "");
				throw new HttpError(res.status, `${res.status} ${path}: ${text.slice(0, 500)}`);
			}
			return await res.json();
		} catch (err) {
			if (isRetryable(err) && attempt < this.opts.maxRetries) {
				const delay = Math.min(8e3, 500 * 2 ** attempt);
				this.log(`request ${path} failed (${err.message}); retrying in ${delay}ms`);
				await sleep(delay);
				return this.request(path, body, attempt + 1);
			}
			throw err;
		}
	}
	startRun(body) {
		return this.request("/api/ingest/runs", body);
	}
	sendEvents(runId, body) {
		return this.request(`/api/ingest/runs/${runId}/events`, body);
	}
	uploadUrls(runId, attachmentIds) {
		return this.request(`/api/ingest/runs/${runId}/attachments/upload-urls`, { attachmentIds });
	}
	completeUpload(runId, attachmentId, size) {
		return this.request(`/api/ingest/runs/${runId}/attachments/${attachmentId}/complete`, { size });
	}
	finishRun(runId, body) {
		return this.request(`/api/ingest/runs/${runId}/finish`, body);
	}
	async upload(instruction, source, contentType) {
		const data = source.body ?? (source.path ? await readFile(source.path) : void 0);
		if (!data) throw new Error("attachment has neither path nor body");
		const headers = {
			"content-type": contentType,
			...instruction.headers
		};
		if (instruction.strategy === "proxy") headers.authorization = `Bearer ${this.opts.token}`;
		for (let attempt = 0;; attempt++) try {
			const res = await fetch(instruction.url, {
				method: instruction.method,
				headers,
				body: new Blob([new Uint8Array(data)])
			});
			if (!res.ok) throw new HttpError(res.status, `upload failed with ${res.status}`);
			return data.byteLength;
		} catch (err) {
			if (!isRetryable(err) || attempt >= this.opts.maxRetries) throw err;
			await sleep(Math.min(8e3, 500 * 2 ** attempt));
		}
	}
};
//#endregion
//#region src/metadata.ts
function git(args, cwd) {
	try {
		return execFileSync("git", args, {
			cwd,
			stdio: [
				"ignore",
				"pipe",
				"ignore"
			],
			timeout: 3e3
		}).toString().trim() || void 0;
	} catch {
		return;
	}
}
function num(v) {
	if (!v) return void 0;
	const n = Number.parseInt(v, 10);
	return Number.isFinite(n) ? n : void 0;
}
function detectExecutor(env) {
	return env.CI && !["false", "0"].includes(env.CI.toLowerCase()) ? "ci" : "local";
}
function collectCiInfo(env) {
	if (env.GITHUB_ACTIONS) {
		const base = `${env.GITHUB_SERVER_URL ?? "https://github.com"}/${env.GITHUB_REPOSITORY}`;
		return {
			provider: "github-actions",
			buildUrl: env.GITHUB_RUN_ID ? `${base}/actions/runs/${env.GITHUB_RUN_ID}` : void 0,
			buildNumber: env.GITHUB_RUN_NUMBER,
			job: env.GITHUB_JOB
		};
	}
	if (env.GITLAB_CI) return {
		provider: "gitlab-ci",
		buildUrl: env.CI_JOB_URL,
		buildNumber: env.CI_PIPELINE_IID,
		job: env.CI_JOB_NAME
	};
	if (env.CIRCLECI) return {
		provider: "circleci",
		buildUrl: env.CIRCLE_BUILD_URL,
		buildNumber: env.CIRCLE_BUILD_NUM,
		job: env.CIRCLE_JOB
	};
	if (env.BUILDKITE) return {
		provider: "buildkite",
		buildUrl: env.BUILDKITE_BUILD_URL,
		buildNumber: env.BUILDKITE_BUILD_NUMBER,
		job: env.BUILDKITE_LABEL
	};
	if (env.TF_BUILD) return {
		provider: "azure-pipelines",
		buildNumber: env.BUILD_BUILDNUMBER,
		job: env.SYSTEM_JOBDISPLAYNAME
	};
	if (env.JENKINS_URL) return {
		provider: "jenkins",
		buildUrl: env.BUILD_URL,
		buildNumber: env.BUILD_NUMBER,
		job: env.JOB_NAME
	};
	if (env.CI) return { provider: "unknown" };
	return {};
}
function collectGitInfo(config, env) {
	const info = {};
	const meta = config.metadata ?? {};
	const gc = meta.gitCommit;
	if (gc) {
		info.sha = gc.hash;
		info.shortSha = gc.shortHash;
		info.message = gc.subject;
		info.authorName = gc.author?.name;
		info.authorEmail = gc.author?.email;
		info.branch = gc.branch;
	}
	const ci = meta.ci;
	if (ci) {
		info.branch ??= ci.branch;
		info.prUrl ??= ci.prHref;
		if (ci.commitHref && !info.repoUrl) info.repoUrl = String(ci.commitHref).replace(/\/(commit|-\/commit)\/.*$/, "");
	}
	if (env.GITHUB_ACTIONS) {
		info.sha ??= env.GITHUB_SHA;
		info.branch ??= env.GITHUB_HEAD_REF || env.GITHUB_REF_NAME;
		info.repoUrl ??= `${env.GITHUB_SERVER_URL ?? "https://github.com"}/${env.GITHUB_REPOSITORY}`;
		if (env.GITHUB_EVENT_NAME?.startsWith("pull_request") && env.GITHUB_REF) {
			const m = /refs\/pull\/(\d+)\//.exec(env.GITHUB_REF);
			if (m) {
				info.prNumber = num(m[1]);
				info.prUrl ??= `${info.repoUrl}/pull/${m[1]}`;
			}
		}
	} else if (env.GITLAB_CI) {
		info.sha ??= env.CI_COMMIT_SHA;
		info.branch ??= env.CI_MERGE_REQUEST_SOURCE_BRANCH_NAME || env.CI_COMMIT_REF_NAME;
		info.message ??= env.CI_COMMIT_MESSAGE?.split("\n")[0];
		info.repoUrl ??= env.CI_PROJECT_URL;
		info.prNumber ??= num(env.CI_MERGE_REQUEST_IID);
	}
	const cwd = config.rootDir || process.cwd();
	info.sha ??= git(["rev-parse", "HEAD"], cwd);
	info.branch ??= git([
		"rev-parse",
		"--abbrev-ref",
		"HEAD"
	], cwd);
	info.message ??= git([
		"log",
		"-1",
		"--pretty=%s"
	], cwd);
	info.authorName ??= git([
		"log",
		"-1",
		"--pretty=%an"
	], cwd);
	info.authorEmail ??= git([
		"log",
		"-1",
		"--pretty=%ae"
	], cwd);
	if (!info.repoUrl) {
		const remote = git([
			"config",
			"--get",
			"remote.origin.url"
		], cwd);
		if (remote) info.repoUrl = normalizeRemote(remote);
	}
	if (info.sha && !info.shortSha) info.shortSha = info.sha.slice(0, 7);
	if (info.branch === "HEAD") info.branch = void 0;
	return info;
}
function normalizeRemote(remote) {
	let r = remote.trim().replace(/\.git$/, "");
	const ssh = /^git@([^:]+):(.+)$/.exec(r);
	if (ssh) r = `https://${ssh[1]}/${ssh[2]}`;
	r = r.replace(/^ssh:\/\/git@/, "https://");
	return r;
}
function collectSystemInfo() {
	return {
		os: os.platform(),
		osRelease: os.release(),
		arch: os.arch(),
		cpus: os.cpus().length,
		memoryBytes: os.totalmem(),
		node: process.version,
		hostname: os.hostname(),
		timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
	};
}
function collectPlaywrightInfo(config) {
	return {
		version: config.version,
		workers: config.workers,
		configFile: config.configFile,
		projects: config.projects.map((p) => {
			const use = p.use ?? {};
			return {
				name: p.name,
				browserName: use.browserName ?? use.defaultBrowserType,
				viewport: use.viewport ?? null,
				retries: p.retries,
				timeout: p.timeout,
				baseURL: use.baseURL,
				headless: use.headless
			};
		})
	};
}
//#endregion
//#region src/options.ts
function envBool(v) {
	if (v === void 0) return void 0;
	return ![
		"false",
		"0",
		"no",
		"off",
		""
	].includes(v.toLowerCase());
}
function detectCiRunId(env) {
	if (env.GITHUB_RUN_ID) return `gh-${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT ?? "1"}`;
	if (env.CI_PIPELINE_ID) return `gl-${env.CI_PIPELINE_ID}`;
	if (env.CIRCLE_WORKFLOW_ID) return `circle-${env.CIRCLE_WORKFLOW_ID}`;
	if (env.BUILDKITE_BUILD_ID) return `bk-${env.BUILDKITE_BUILD_ID}`;
	if (env.BUILD_BUILDID) return `azp-${env.BUILD_BUILDID}`;
	if (env.BUILD_NUMBER && env.JENKINS_URL) return `jenkins-${env.JOB_NAME ?? "job"}-${env.BUILD_NUMBER}`;
}
function resolveOptions(opts = {}, env = process.env) {
	const token = opts.token ?? env.PW_REPORTER_TOKEN;
	const serverUrl = (opts.serverUrl ?? env.PW_REPORTER_URL)?.replace(/\/+$/, "");
	if (!token || !serverUrl) return null;
	const tags = opts.tags ?? (env.PW_REPORTER_TAGS ? env.PW_REPORTER_TAGS.split(",").map((t) => t.trim()).filter(Boolean) : []);
	return {
		token,
		serverUrl,
		ciRunId: opts.ciRunId ?? env.PW_REPORTER_CI_RUN_ID ?? detectCiRunId(env) ?? randomUUID(),
		tags,
		environment: opts.environment ?? env.PW_REPORTER_ENVIRONMENT,
		artifacts: opts.artifacts ?? envBool(env.PW_REPORTER_ARTIFACTS) ?? true,
		debug: opts.debug ?? envBool(env.PW_REPORTER_DEBUG) ?? false,
		batchSize: opts.batch?.size ?? 50,
		batchIntervalMs: opts.batch?.intervalMs ?? 1e3,
		uploadTimeoutMs: opts.uploadTimeoutMs ?? 12e4,
		maxRetries: 5
	};
}
//#endregion
//#region src/queue.ts
/**
* Batches events and flushes them when the batch is full or the interval elapses.
* Flushes are serialized so the server always sees increasing sequence numbers.
*/
var EventQueue = class {
	size;
	intervalMs;
	send;
	pending = [];
	timer;
	chain = Promise.resolve();
	seq = 0;
	constructor(size, intervalMs, send) {
		this.size = size;
		this.intervalMs = intervalMs;
		this.send = send;
	}
	nextSeq() {
		return this.seq++;
	}
	push(event) {
		this.pending.push(event);
		if (this.pending.length >= this.size) this.flush();
		else if (!this.timer) {
			this.timer = setTimeout(() => void this.flush(), this.intervalMs);
			this.timer.unref?.();
		}
	}
	flush() {
		if (this.timer) {
			clearTimeout(this.timer);
			this.timer = void 0;
		}
		if (this.pending.length === 0) return this.chain;
		const batch = this.pending;
		this.pending = [];
		this.chain = this.chain.then(() => this.send(batch)).catch(() => void 0);
		return this.chain;
	}
	/** Flushes everything and waits for all in-flight sends. */
	async drain() {
		await this.flush();
		await this.chain;
	}
};
//#endregion
//#region src/index.ts
const MAX_TEXT = 65536;
const MAX_STEPS = 2e3;
const UPLOAD_CONCURRENCY = 4;
var PlaywrightReporterApp = class {
	opts;
	client;
	queue;
	config;
	runId;
	shardIndex = 0;
	runUrl;
	startedAt = /* @__PURE__ */ new Date();
	startPromise = Promise.resolve();
	uploads = [];
	uploadPromises = [];
	uploadedBytes = 0;
	disabled = false;
	constructor(options = {}) {
		this.opts = resolveOptions(options);
		if (!this.opts) {
			this.disabled = true;
			console.warn("[pw-reporter] token or serverUrl missing (PW_REPORTER_TOKEN / PW_REPORTER_URL); reporter disabled.");
		}
	}
	printsToStdio() {
		return false;
	}
	log(msg) {
		if (this.opts?.debug) console.log(`[pw-reporter] ${msg}`);
	}
	warn(msg) {
		console.warn(`[pw-reporter] ${msg}`);
	}
	onBegin(config, suite) {
		if (this.disabled || !this.opts) return;
		const opts = this.opts;
		this.config = config;
		this.startedAt = /* @__PURE__ */ new Date();
		this.client = new IngestClient(opts, (m) => this.log(m));
		this.queue = new EventQueue(opts.batchSize, opts.batchIntervalMs, (events) => this.sendBatch(events));
		const env = process.env;
		const body = {
			ciRunId: opts.ciRunId,
			shard: config.shard ? {
				current: config.shard.current,
				total: config.shard.total
			} : null,
			expectedTests: suite.allTests().length,
			startedAt: this.startedAt.toISOString(),
			executor: detectExecutor(env),
			environment: opts.environment,
			tags: opts.tags,
			git: collectGitInfo(config, env),
			ci: collectCiInfo(env),
			system: collectSystemInfo(),
			playwright: collectPlaywrightInfo(config)
		};
		this.startPromise = this.client.startRun(body).then((res) => {
			this.runId = res.runId;
			this.shardIndex = res.shardIndex;
			this.runUrl = res.url;
			this.log(`run #${res.runNumber} started (${res.runId})`);
		}).catch((err) => {
			this.disabled = true;
			this.warn(`could not start run, reporter disabled: ${err.message}`);
		});
	}
	onTestBegin(test, result) {
		if (this.disabled || !this.opts) return;
		const project = test.parent.project();
		const ev = {
			seq: this.queue.nextSeq(),
			type: "test.begin",
			testKey: this.testKey(test),
			pwTestId: test.id,
			title: test.title,
			titlePath: this.titlePath(test),
			file: this.relFile(test.location.file),
			line: test.location.line,
			column: test.location.column,
			project: project?.name ?? "",
			tags: test.tags,
			annotations: test.annotations.map((a) => ({
				type: a.type,
				description: a.description
			})),
			expectedStatus: test.expectedStatus,
			retries: test.retries,
			retry: result.retry,
			workerIndex: result.workerIndex,
			startedAt: result.startTime.toISOString()
		};
		this.queue.push(ev);
	}
	onTestEnd(test, result) {
		if (this.disabled || !this.opts) return;
		const willRetry = (result.status === "failed" || result.status === "timedOut") && result.retry < test.retries;
		const attachments = [];
		if (this.opts.artifacts) for (const a of result.attachments) {
			if (!a.path && !a.body) continue;
			const ref = {
				id: randomUUID(),
				name: a.name,
				contentType: a.contentType,
				size: a.body?.byteLength
			};
			attachments.push(ref);
			this.uploads.push({
				ref,
				source: {
					path: a.path,
					body: a.body
				}
			});
		}
		const ev = {
			seq: this.queue.nextSeq(),
			type: "attempt.end",
			testKey: this.testKey(test),
			retry: result.retry,
			status: result.status,
			durationMs: result.duration,
			startedAt: result.startTime.toISOString(),
			workerIndex: result.workerIndex,
			parallelIndex: result.parallelIndex,
			errors: result.errors.map(mapError),
			steps: flattenSteps(result.steps),
			stdout: joinChunks(result.stdout),
			stderr: joinChunks(result.stderr),
			annotations: (result.annotations ?? test.annotations).map((a) => ({
				type: a.type,
				description: a.description
			})),
			attachments,
			outcome: test.outcome(),
			isFinal: !willRetry
		};
		this.queue.push(ev);
		if (attachments.length) this.scheduleUploads();
	}
	onError(error) {
		if (this.disabled || !this.opts) return;
		this.queue.push({
			seq: this.queue.nextSeq(),
			type: "run.log",
			level: "error",
			message: (error.message ?? error.value ?? "unknown error").slice(0, 4e3)
		});
	}
	async onEnd(result) {
		if (this.disabled || !this.opts) return;
		await this.startPromise;
		if (!this.runId) return;
		try {
			await this.queue.drain();
			this.scheduleUploads();
			await withTimeout(Promise.all(this.uploadPromises), this.opts.uploadTimeoutMs, "uploads");
			const res = await this.client.finishRun(this.runId, {
				shardIndex: this.shardIndex,
				status: result.status,
				durationMs: result.duration,
				finishedAt: (/* @__PURE__ */ new Date()).toISOString()
			});
			this.runUrl = res.url;
			console.log(`\n[pw-reporter] Run report: ${this.runUrl} (${formatBytes(this.uploadedBytes)} of artifacts uploaded)`);
		} catch (err) {
			this.warn(`finishing run failed: ${err.message}`);
		}
	}
	async onExit() {
		if (this.disabled || !this.runId) return;
		await this.queue.drain().catch(() => void 0);
	}
	async sendBatch(events) {
		await this.startPromise;
		if (!this.runId) return;
		try {
			await this.client.sendEvents(this.runId, {
				shardIndex: this.shardIndex,
				events
			});
			this.log(`sent ${events.length} events`);
		} catch (err) {
			this.warn(`dropping ${events.length} events: ${err.message}`);
		}
	}
	scheduleUploads() {
		if (this.uploads.length === 0) return;
		const batch = this.uploads.splice(0, this.uploads.length);
		const p = this.uploadBatch(batch).catch((err) => this.warn(`upload batch failed: ${err.message}`));
		this.uploadPromises.push(p);
	}
	async uploadBatch(batch) {
		await this.startPromise;
		await this.queue.drain();
		if (!this.runId) return;
		const runId = this.runId;
		const { uploads } = await this.client.uploadUrls(runId, batch.map((b) => b.ref.id));
		const byId = new Map(uploads.map((u) => [u.attachmentId, u]));
		let i = 0;
		const worker = async () => {
			while (i < batch.length) {
				const item = batch[i++];
				const instr = byId.get(item.ref.id);
				if (!instr) continue;
				try {
					const size = await this.client.upload(instr, item.source, item.ref.contentType);
					this.uploadedBytes += size;
					await this.client.completeUpload(runId, item.ref.id, size);
				} catch (err) {
					this.warn(`upload of ${item.ref.name} failed: ${err.message}`);
				}
			}
		};
		await Promise.all(Array.from({ length: UPLOAD_CONCURRENCY }, worker));
	}
	relFile(file) {
		return path.relative(this.config.rootDir, file).split(path.sep).join("/");
	}
	titlePath(test) {
		const full = test.titlePath().filter(Boolean);
		const project = test.parent.project()?.name;
		const rel = this.relFile(test.location.file);
		return full.filter((t) => t !== project && t !== rel);
	}
	testKey(test) {
		const key = [
			test.parent.project()?.name ?? "",
			this.relFile(test.location.file),
			...this.titlePath(test)
		].join("\0");
		return createHash("sha1").update(key).digest("hex");
	}
};
function mapError(e) {
	return {
		message: e.message?.slice(0, 2e4),
		stack: e.stack?.slice(0, 2e4),
		value: e.value,
		snippet: e.snippet,
		location: e.location ? {
			file: e.location.file,
			line: e.location.line,
			column: e.location.column
		} : void 0
	};
}
function flattenSteps(steps) {
	const out = [];
	const walk = (list, depth) => {
		for (const s of list) {
			if (out.length >= MAX_STEPS) return;
			out.push({
				title: s.title,
				category: s.category,
				durationMs: s.duration,
				depth,
				startedAt: s.startTime.toISOString(),
				error: s.error?.message?.slice(0, 2e3),
				location: s.location ? {
					file: s.location.file,
					line: s.location.line,
					column: s.location.column
				} : void 0
			});
			if (s.steps.length) walk(s.steps, depth + 1);
		}
	};
	walk(steps, 0);
	return out;
}
function joinChunks(chunks) {
	const text = chunks.map((c) => typeof c === "string" ? c : c.toString("utf8")).join("");
	return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}\n[truncated]` : text;
}
function withTimeout(p, ms, label) {
	return Promise.race([p, new Promise((resolve) => {
		setTimeout(() => {
			console.warn(`[pw-reporter] timed out waiting for ${label}`);
			resolve(void 0);
		}, ms).unref?.();
	})]);
}
function formatBytes(n) {
	if (n < 1024) return `${n} B`;
	if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
	return `${(n / 1024 ** 2).toFixed(1)} MB`;
}
//#endregion
export { PlaywrightReporterApp as default };

//# sourceMappingURL=index.mjs.map