//#region \0rolldown/runtime.js
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
		key = keys[i];
		if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
			get: ((k) => from[k]).bind(null, key),
			enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
		});
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule || !__hasOwnProp.call(mod, "default") ? __defProp(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));
//#endregion
const require_client = require("./client-DUP9QqLj.cjs");
let node_crypto = require("node:crypto");
let node_path = require("node:path");
node_path = __toESM(node_path, 1);
let node_os = require("node:os");
node_os = __toESM(node_os, 1);
let node_child_process = require("node:child_process");
let node_fs = require("node:fs");
//#region src/metadata.ts
function git(args, cwd) {
	try {
		return (0, node_child_process.execFileSync)("git", args, {
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
/** Explicit overrides win over what was detected; see `ReporterOptions.git` / `.ci`. */
function collectCiInfo(env, overrides = {}) {
	return {
		...detectCiInfo(env),
		...overrides
	};
}
function detectCiInfo(env) {
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
function collectGitInfo(config, env, overrides = {}) {
	const info = detectGitInfo(config, env);
	const merged = {
		...info,
		...overrides
	};
	if (overrides.sha) merged.shortSha = overrides.sha.slice(0, 7);
	if (overrides.prNumber !== void 0 && overrides.prNumber !== info.prNumber) {
		merged.prUrl = overrides.prUrl;
		merged.prTitle = overrides.prTitle;
	}
	if (merged.prNumber !== void 0 && !merged.prUrl && merged.repoUrl) merged.prUrl = pullRequestUrl(merged.repoUrl, merged.prNumber);
	return merged;
}
/**
* The web page of pull request `number` on the host of `repoUrl`, for the two
* hosts whose shape is known: GitLab (`/-/merge_requests/`, also self-hosted)
* and GitHub (`/pull/`). Anything else gets no link rather than a wrong one.
*/
function pullRequestUrl(repoUrl, number) {
	const base = repoUrl.replace(/\.git$/, "").replace(/\/+$/, "");
	if (/gitlab/i.test(base)) return `${base}/-/merge_requests/${number}`;
	if (/github/i.test(base)) return `${base}/pull/${number}`;
}
/** A pull request's number from its link: GitHub's `/pull/42`, GitLab's `/-/merge_requests/42`. */
function numberFromPrUrl(url) {
	const m = /\/(?:pull|merge_requests)\/(\d+)/.exec(String(url ?? ""));
	return m ? num(m[1]) : void 0;
}
/** GitHub keeps the pull request's title only in the event payload, a JSON file on the runner. */
function githubEventPrTitle(path) {
	if (!path) return void 0;
	try {
		const title = JSON.parse((0, node_fs.readFileSync)(path, "utf8"))?.pull_request?.title;
		return typeof title === "string" && title.trim() ? title.trim() : void 0;
	} catch {
		return;
	}
}
function detectGitInfo(config, env) {
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
		info.prTitle ??= ci.prTitle;
		info.prNumber ??= numberFromPrUrl(ci.prHref);
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
				info.prTitle ??= githubEventPrTitle(env.GITHUB_EVENT_PATH);
			}
		}
	} else if (env.GITLAB_CI) {
		info.sha ??= env.CI_COMMIT_SHA;
		info.branch ??= env.CI_MERGE_REQUEST_SOURCE_BRANCH_NAME || env.CI_COMMIT_REF_NAME;
		info.message ??= env.CI_COMMIT_MESSAGE?.split("\n")[0];
		info.repoUrl ??= env.CI_PROJECT_URL;
		info.prNumber ??= num(env.CI_MERGE_REQUEST_IID);
		if (env.CI_MERGE_REQUEST_IID) {
			info.prUrl ??= env.CI_MERGE_REQUEST_PROJECT_URL ? `${env.CI_MERGE_REQUEST_PROJECT_URL}/-/merge_requests/${env.CI_MERGE_REQUEST_IID}` : void 0;
			info.prTitle ??= env.CI_MERGE_REQUEST_TITLE || void 0;
		}
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
		os: node_os.default.platform(),
		osRelease: node_os.default.release(),
		arch: node_os.default.arch(),
		cpus: node_os.default.cpus().length,
		memoryBytes: node_os.default.totalmem(),
		node: process.version,
		hostname: node_os.default.hostname(),
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
function envNumber(v) {
	if (v === void 0 || v.trim() === "") return void 0;
	const n = Number(v);
	return Number.isFinite(n) && n >= 0 ? n : void 0;
}
function detectCiRunId(env) {
	if (env.GITHUB_RUN_ID) return `gh-${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT ?? "1"}`;
	if (env.CI_PIPELINE_ID) return `gl-${env.CI_PIPELINE_ID}`;
	if (env.CIRCLE_WORKFLOW_ID) return `circle-${env.CIRCLE_WORKFLOW_ID}`;
	if (env.BUILDKITE_BUILD_ID) return `bk-${env.BUILDKITE_BUILD_ID}`;
	if (env.BUILD_BUILDID) return `azp-${env.BUILD_BUILDID}`;
	if (env.BUILD_NUMBER && env.JENKINS_URL) return `jenkins-${env.JOB_NAME ?? "job"}-${env.BUILD_NUMBER}`;
}
/** A pull request number as typed in an env var or option (`42`, `#42`, `!42`); anything else is none. */
function prNumber(v) {
	if (typeof v === "number") return Number.isInteger(v) && v > 0 ? v : void 0;
	const m = /^[#!]?(\d+)$/.exec(v?.trim() ?? "");
	return m ? Number(m[1]) : void 0;
}
/** Drops unset and blank values, so an empty env var (`E2E_COMMIT_SHA: ""`) overrides nothing. */
function defined(values) {
	return Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v?.trim()]).filter(([, v]) => v));
}
function resolveOptions(opts = {}, env = process.env) {
	const token = opts.token ?? env.PW_REPORTER_TOKEN;
	const serverUrl = (opts.serverUrl ?? env.PW_REPORTER_URL)?.replace(/\/+$/, "");
	if (!token || !serverUrl) return null;
	const tags = opts.tags ?? (env.PW_REPORTER_TAGS ? env.PW_REPORTER_TAGS.split(",").map((t) => t.trim()).filter(Boolean) : []);
	return {
		token,
		serverUrl,
		ciRunId: opts.ciRunId ?? env.PW_REPORTER_CI_RUN_ID ?? detectCiRunId(env) ?? (0, node_crypto.randomUUID)(),
		tags,
		environment: opts.environment ?? env.PW_REPORTER_ENVIRONMENT,
		artifacts: opts.artifacts ?? envBool(env.PW_REPORTER_ARTIFACTS) ?? true,
		debug: opts.debug ?? envBool(env.PW_REPORTER_DEBUG) ?? false,
		batchSize: opts.batch?.size ?? 50,
		batchIntervalMs: opts.batch?.intervalMs ?? 2e3,
		uploadTimeoutMs: opts.uploadTimeoutMs ?? 12e4,
		heartbeatIntervalMs: opts.heartbeatIntervalMs ?? envNumber(env.PW_REPORTER_HEARTBEAT_MS) ?? 3e4,
		maxRetries: 5,
		git: withPrNumber(defined({
			branch: opts.git?.branch ?? env.PW_REPORTER_GIT_BRANCH,
			sha: opts.git?.sha ?? env.PW_REPORTER_GIT_SHA,
			message: opts.git?.message ?? env.PW_REPORTER_GIT_MESSAGE,
			repoUrl: opts.git?.repoUrl ?? env.PW_REPORTER_GIT_REPO_URL,
			authorName: opts.git?.authorName ?? env.PW_REPORTER_GIT_AUTHOR,
			prUrl: opts.git?.prUrl ?? env.PW_REPORTER_PR_URL,
			prTitle: opts.git?.prTitle ?? env.PW_REPORTER_PR_TITLE
		}), prNumber(opts.git?.prNumber ?? env.PW_REPORTER_PR_NUMBER)),
		ci: defined({
			provider: opts.ci?.provider ?? env.PW_REPORTER_CI_PROVIDER,
			buildUrl: opts.ci?.buildUrl ?? env.PW_REPORTER_BUILD_URL,
			buildNumber: opts.ci?.buildNumber ?? env.PW_REPORTER_BUILD_NUMBER,
			job: opts.ci?.job ?? env.PW_REPORTER_CI_JOB
		})
	};
}
function withPrNumber(git, number) {
	return number === void 0 ? git : {
		...git,
		prNumber: number
	};
}
/** Whether Playwright was started to list the tests rather than run them. */
function isListMode(argv = process.argv) {
	return argv.includes("--list");
}
//#endregion
//#region src/queue.ts
/** Per request, however far behind the sender is. The server accepts 1000 events and 4 MB. */
const MAX_BATCH_EVENTS = 250;
const MAX_BATCH_BYTES = 1048576;
/**
* Batches events and flushes them when the batch is full or the interval elapses.
* Flushes are serialized so the server always sees increasing sequence numbers.
*
* A batch is cut when its send *starts*, not when the flush is asked for: while
* one request is in flight, everything that arrives joins the next one. A slow
* server then gets fewer, larger requests instead of a growing line of small ones.
*/
var EventQueue = class {
	size;
	intervalMs;
	send;
	maxBatch;
	pending = [];
	timer;
	chain = Promise.resolve();
	seq = 0;
	constructor(size, intervalMs, send, maxBatch = Math.max(size, MAX_BATCH_EVENTS)) {
		this.size = size;
		this.intervalMs = intervalMs;
		this.send = send;
		this.maxBatch = maxBatch;
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
		this.chain = this.chain.then(() => this.sendPending()).catch(() => void 0);
		return this.chain;
	}
	/** Sends what is pending now, in as few requests as the limits allow. */
	async sendPending() {
		while (this.pending.length) {
			let bytes = 0;
			let count = 0;
			while (count < this.pending.length && count < this.maxBatch) {
				bytes += JSON.stringify(this.pending[count]).length;
				if (count > 0 && bytes > MAX_BATCH_BYTES) break;
				count++;
			}
			const batch = this.pending.splice(0, count);
			await this.send(batch).catch(() => void 0);
		}
	}
	/** Flushes everything and waits for all in-flight sends. */
	async drain() {
		await this.flush();
		await this.chain;
	}
};
//#endregion
//#region src/heartbeat.ts
/**
* Tells the server the run is alive while no events flow — a long test, a
* slow global setup — so it is not closed as abandoned. One beat at a time; a
* failed beat is not retried, the next one is. A server without the endpoint
* (404) stops it for good.
*/
var Heartbeat = class {
	intervalMs;
	beat;
	log;
	timer;
	inFlight = false;
	constructor(intervalMs, beat, log) {
		this.intervalMs = intervalMs;
		this.beat = beat;
		this.log = log;
	}
	start() {
		if (this.intervalMs <= 0 || this.timer) return;
		this.timer = setInterval(() => void this.tick(), this.intervalMs);
		this.timer.unref?.();
	}
	stop() {
		if (this.timer) clearInterval(this.timer);
		this.timer = void 0;
	}
	async tick() {
		if (this.inFlight) return;
		this.inFlight = true;
		try {
			await this.beat();
		} catch (err) {
			if (err instanceof require_client.HttpError && err.status === 404) {
				this.log("server does not accept heartbeats; stopping them");
				this.stop();
			} else this.log(`heartbeat failed: ${err.message}`);
		} finally {
			this.inFlight = false;
		}
	}
};
//#endregion
//#region src/index.ts
const MAX_TEXT = 65536;
const MAX_STEPS = 2e3;
const UPLOAD_CONCURRENCY = 4;
const UPLOAD_DEBOUNCE_MS = 2e3;
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
	uploadTimer;
	heartbeat;
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
		if (isListMode()) {
			this.disabled = true;
			return;
		}
		const opts = this.opts;
		this.config = config;
		this.startedAt = /* @__PURE__ */ new Date();
		this.client = new require_client.IngestClient(opts, (m) => this.log(m));
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
			git: collectGitInfo(config, env, opts.git),
			ci: collectCiInfo(env, opts.ci),
			system: collectSystemInfo(),
			playwright: collectPlaywrightInfo(config)
		};
		this.startPromise = this.client.startRun(body).then((res) => {
			this.runId = res.runId;
			this.shardIndex = res.shardIndex;
			this.runUrl = res.url;
			this.log(`run #${res.runNumber} started (${res.runId})`);
			const runId = res.runId;
			this.heartbeat = new Heartbeat(opts.heartbeatIntervalMs, () => this.client.heartbeat(runId, { shardIndex: this.shardIndex }), (m) => this.log(m));
			this.heartbeat.start();
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
				id: (0, node_crypto.randomUUID)(),
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
		this.heartbeat?.stop();
		try {
			await this.queue.drain();
			this.scheduleUploads(true);
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
		this.heartbeat?.stop();
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
	/**
	* Uploads start a moment after a test ends, so the attachments of tests that
	* end close together share one upload-urls request. `onEnd` passes `now`.
	*/
	scheduleUploads(now = false) {
		if (this.uploadTimer) clearTimeout(this.uploadTimer);
		this.uploadTimer = void 0;
		if (this.uploads.length === 0) return;
		if (!now) {
			this.uploadTimer = setTimeout(() => this.scheduleUploads(true), UPLOAD_DEBOUNCE_MS);
			this.uploadTimer.unref?.();
			return;
		}
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
					if (instr.strategy !== "proxy") await this.client.completeUpload(runId, item.ref.id, size);
				} catch (err) {
					this.warn(`upload of ${item.ref.name} failed: ${err.message}`);
				}
			}
		};
		await Promise.all(Array.from({ length: UPLOAD_CONCURRENCY }, worker));
	}
	relFile(file) {
		return node_path.default.relative(this.config.rootDir, file).split(node_path.default.sep).join("/");
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
		return (0, node_crypto.createHash)("sha1").update(key).digest("hex");
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
module.exports = PlaywrightReporterApp;

//# sourceMappingURL=index.cjs.map