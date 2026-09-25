import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { z } from "zod";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
//#region ../../node_modules/.store/@standard-server+shared@0.9.2/node_modules/@standard-server/shared/dist/index.mjs
function toArray(value) {
	return Array.isArray(value) ? value : value === void 0 || value === null ? [] : [value];
}
var AbortError = class extends Error {
	constructor(...rest) {
		super(...rest);
		this.name = "AbortError";
	}
};
function sequential(fn) {
	let lastOperationPromise = Promise.resolve();
	return (...args) => {
		return lastOperationPromise = lastOperationPromise.catch(() => {}).then(() => {
			return fn(...args);
		});
	};
}
function isAsyncIteratorObject(maybe) {
	if (!maybe || typeof maybe !== "object") return false;
	return "next" in maybe && typeof maybe.next === "function" && Symbol.asyncIterator in maybe && typeof maybe[Symbol.asyncIterator] === "function";
}
const asyncDisposeSymbol = Symbol.asyncDispose ?? Symbol.for("asyncDispose");
var AsyncIteratorClass = class {
	isDone = false;
	isExecuteComplete = false;
	cleanup;
	next;
	constructor(next, cleanup) {
		this.cleanup = cleanup;
		this.next = sequential(async () => {
			if (this.isDone) return {
				done: true,
				value: void 0
			};
			let errorRef;
			try {
				const result = await next();
				if (result.done) this.isDone = true;
				return result;
			} catch (error) {
				errorRef = { value: error };
				this.isDone = true;
				throw error;
			} finally {
				if (this.isDone && !this.isExecuteComplete) {
					this.isExecuteComplete = true;
					await this.cleanup(errorRef ? {
						kind: "error",
						error: errorRef.value
					} : { kind: "success" });
				}
			}
		});
	}
	async return(value) {
		this.isDone = true;
		if (!this.isExecuteComplete) {
			this.isExecuteComplete = true;
			await this.cleanup({ kind: "cancelled" });
		}
		return {
			done: true,
			value
		};
	}
	async throw(error) {
		this.isDone = true;
		if (!this.isExecuteComplete) {
			this.isExecuteComplete = true;
			await this.cleanup({
				kind: "cancelled",
				error
			});
		}
		throw error;
	}
	/**
	* asyncDispose symbol only available in esnext, we should fallback to Symbol.for('asyncDispose')
	*/
	async [asyncDisposeSymbol]() {
		this.isDone = true;
		if (!this.isExecuteComplete) {
			this.isExecuteComplete = true;
			await this.cleanup({ kind: "cancelled" });
		}
	}
	[Symbol.asyncIterator]() {
		return this;
	}
};
function parseEmptyableJSON(text) {
	if (!text) return;
	return JSON.parse(text);
}
function stringifyJSON(value) {
	return JSON.stringify(value);
}
function isTypescriptObject(maybeObject) {
	if (!maybeObject) return false;
	const type = typeof maybeObject;
	return type === "object" || type === "function";
}
const GET_OR_BIND_CACHE = /* @__PURE__ */ new WeakMap();
function getOrBind(target, property, { bind = true } = {}) {
	const value = Reflect.get(target, property);
	if (!bind || typeof value !== "function") return value;
	let targetCache = GET_OR_BIND_CACHE.get(value);
	if (!targetCache) GET_OR_BIND_CACHE.set(value, targetCache = /* @__PURE__ */ new WeakMap());
	let bound = targetCache.get(target);
	if (!bound) targetCache.set(target, bound = value.bind(target));
	return bound;
}
function sleep$1(ms, { signal } = {}) {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(signal.reason);
			return;
		}
		let abortListener = null;
		const timeout = setTimeout(() => {
			if (abortListener) signal?.removeEventListener("abort", abortListener);
			resolve();
		}, ms);
		if (signal) signal.addEventListener("abort", abortListener = () => {
			clearTimeout(timeout);
			reject(signal?.reason);
		}, { once: true });
	});
}
const LONE_SURROGATE_REGEX = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
function safeEncodeURIComponent(value) {
	try {
		return encodeURIComponent(value);
	} catch {
		return encodeURIComponent(value.replace(LONE_SURROGATE_REGEX, "�"));
	}
}
function safeDecodeURIComponent(value) {
	if (!value.includes("%")) return value;
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}
//#endregion
//#region ../../node_modules/.store/@orpc+shared@2.0.0-beta.40/node_modules/@orpc/shared/dist/index.mjs
function resolveMaybeOptionalOptions(rest) {
	return rest[0] ?? {};
}
const ORPC_NAME = "orpc";
function isAbortError(error) {
	return error instanceof Error && error.name.includes("Abort");
}
Object.getPrototypeOf(async function* () {}).constructor;
function once(fn) {
	let cached;
	return () => {
		if (cached) return cached.result;
		const result = fn();
		cached = { result };
		return result;
	};
}
function pathToHttpPath(path) {
	return `/${path.map(safeEncodeURIComponent).join("/")}`;
}
function mergeHttpPath(a, b) {
	return `${a.endsWith("/") ? a.slice(0, -1) : a}${b}`;
}
const TRACER_SYMBOL = Symbol.for("ORPC_TRACER");
function getTracer() {
	return globalThis[TRACER_SYMBOL];
}
function startSpan(options) {
	const tracer = getTracer();
	if (!tracer) return;
	if (typeof options === "string") return tracer.startSpan(options);
	return tracer.startSpan(options.name, options.parent);
}
function recordSpanError(span, error) {
	if (!span) return;
	span.recordException(isAbortError(error) ? "info" : "error", toTracingException(error));
}
function toTracingException(error) {
	if (error instanceof Error) {
		const exception = {
			message: error.message,
			name: error.name,
			stack: error.stack
		};
		if ("code" in error && (typeof error.code === "string" || typeof error.code === "number")) exception.code = error.code;
		return exception;
	}
	return { message: String(error) };
}
async function runWithSpan(options, fn) {
	const tracer = getTracer();
	if (!tracer) return fn();
	const name = typeof options === "string" ? options : options.name;
	const parent = typeof options === "string" ? void 0 : options.parent;
	return tracer.startActiveSpan(name, parent, async (span) => {
		try {
			return await fn(span);
		} catch (e) {
			recordSpanError(span, e);
			throw e;
		} finally {
			span.end();
		}
	});
}
function runInSpanContext(span, fn) {
	const tracer = getTracer();
	if (!span || !tracer) return fn();
	return tracer.withActiveSpan(span, fn);
}
function wrapAsyncIterator(iterator, { runWith, mapResult, mapError, onError, onFinish }) {
	runWith ??= (run) => run();
	let isDone;
	return new AsyncIteratorClass(async () => {
		try {
			let result;
			try {
				result = await runWith(() => iterator.next());
				isDone = result.done;
			} catch (error) {
				isDone = true;
				throw error;
			}
			return mapResult ? await mapResult(result) : result;
		} catch (error) {
			await onError?.(error);
			throw mapError ? await mapError(error) : error;
		}
	}, async (_state) => {
		try {
			if (!isDone) try {
				await runWith(async () => iterator.return?.());
			} catch (error) {
				await onError?.(error);
				throw error;
			}
		} finally {
			await onFinish?.();
		}
	});
}
function traceAsyncIterator(options, iterator) {
	const getSpan = once(() => startSpan(options));
	return wrapAsyncIterator(iterator, {
		runWith: (run) => runInSpanContext(getSpan(), run),
		mapResult(result) {
			getSpan()?.addEvent(result.done ? "completed" : "yielded");
			return result;
		},
		onError(error) {
			recordSpanError(getSpan(), error);
		},
		onFinish() {
			getSpan()?.end();
		}
	});
}
function value(value2, ...args) {
	if (typeof value2 === "function") return value2(...args);
	return value2;
}
function override(target, partial) {
	return new Proxy(typeof target === "function" ? partial : target, {
		get(_, prop) {
			return getOrBind(prop in partial ? partial : value(target), prop);
		},
		has(_, prop) {
			return Reflect.has(partial, prop) || Reflect.has(value(target), prop);
		}
	});
}
function getConstructor(value) {
	if (!isTypescriptObject(value)) return null;
	return Object.getPrototypeOf(value)?.constructor;
}
function* getConstructors(value) {
	if (!isTypescriptObject(value)) return;
	let proto = Object.getPrototypeOf(value);
	while (proto != null) {
		if (proto.constructor) yield proto.constructor;
		proto = Object.getPrototypeOf(proto);
	}
}
function isPlainObject(value) {
	if (!value || typeof value !== "object") return false;
	const proto = Object.getPrototypeOf(value);
	return proto === Object.prototype || !proto || !proto.constructor;
}
function getOwn(object, key) {
	return Object.hasOwn(object, key) ? object[key] : void 0;
}
function setOwn(object, key, value) {
	if (key === "__proto__") Object.defineProperty(object, key, {
		value,
		writable: true,
		enumerable: true,
		configurable: true
	});
	else object[key] = value;
}
function copyOnWrite(parent, key, original) {
	const value = parent[key];
	if (value !== original) return value;
	let copy;
	if (Array.isArray(value)) copy = value.slice();
	else if (isPlainObject(value)) copy = { ...value };
	else return value;
	setOwn(parent, key, copy);
	return copy;
}
const NullProtoObj = /* @__PURE__ */ (() => {
	const e = function() {};
	e.prototype = /* @__PURE__ */ Object.create(null);
	Object.freeze(e.prototype);
	return e;
})();
function wrapReadableStream(stream, { runWith, mapResult, mapError, onError, onFinish }) {
	runWith ??= (run) => run();
	const reader = once(() => stream.getReader());
	const finish = once(async () => onFinish?.());
	return new ReadableStream({
		async pull(controller) {
			let result;
			try {
				const readResult = await runWith(() => reader().read());
				result = mapResult ? await mapResult(readResult) : readResult;
			} catch (error) {
				try {
					await onError?.(error);
					controller.error(mapError ? await mapError(error) : error);
				} finally {
					await finish();
				}
				return;
			}
			if (result.done) {
				controller.close();
				await finish();
			} else controller.enqueue(result.value);
		},
		async cancel(reason) {
			try {
				try {
					await runWith(() => reader().cancel(reason));
				} catch (error) {
					await onError?.(error);
					throw error;
				}
			} finally {
				await finish();
			}
		}
	});
}
function traceReadableStream(options, stream) {
	const getSpan = once(() => startSpan(options));
	return wrapReadableStream(stream, {
		runWith: (run) => runInSpanContext(getSpan(), run),
		mapResult(result) {
			getSpan()?.addEvent(result.done ? "closed" : "enqueued");
			return result;
		},
		onError(error) {
			recordSpanError(getSpan(), error);
		},
		onFinish() {
			getSpan()?.end();
		}
	});
}
function intercept(interceptors, options, main) {
	if (!interceptors?.length) return main(options);
	const next = (options2, index) => {
		const interceptor = interceptors[index];
		if (!interceptor) return main(options2);
		return interceptor({
			...options2,
			next: (newOptions = options2) => next(newOptions, index + 1)
		});
	};
	return next(options, 0);
}
function sortPlugins(plugins) {
	const pluginCount = plugins.length;
	const pluginIdToIndices = /* @__PURE__ */ new Map();
	for (let i = 0; i < pluginCount; i++) {
		const plugin = plugins[i];
		const indices = pluginIdToIndices.get(plugin.name);
		if (indices === void 0) pluginIdToIndices.set(plugin.name, [i]);
		else indices.push(i);
	}
	const dependencies = Array.from({ length: pluginCount }, () => []);
	for (let i = 0; i < pluginCount; i++) {
		const plugin = plugins[i];
		if (plugin.before !== void 0) for (const beforeId of plugin.before) {
			const beforeIndices = pluginIdToIndices.get(beforeId);
			if (beforeIndices !== void 0) for (const beforeIndex of beforeIndices) dependencies[beforeIndex].push(i);
		}
		if (plugin.after !== void 0) for (const afterId of plugin.after) {
			const afterIndices = pluginIdToIndices.get(afterId);
			if (afterIndices !== void 0) for (const afterIndex of afterIndices) dependencies[i].push(afterIndex);
		}
	}
	const sorted = [];
	const placed = /* @__PURE__ */ new Set();
	while (sorted.length < pluginCount) {
		const next = plugins.findIndex((_, i) => !placed.has(i) && dependencies[i].every((dependency) => placed.has(dependency)));
		if (next === -1) throw new Error(`Circular dependency detected involving plugin "${findCyclicPlugin(plugins, dependencies, placed).name}"`);
		placed.add(next);
		sorted.push(plugins[next]);
	}
	return sorted;
}
function findCyclicPlugin(plugins, dependencies, placed) {
	const seen = /* @__PURE__ */ new Set();
	let current = plugins.findIndex((_, i) => !placed.has(i));
	while (!seen.has(current)) {
		seen.add(current);
		current = dependencies[current].find((dependency) => !placed.has(dependency));
	}
	return plugins[current];
}
function anyAbortSignal(signals) {
	const realSignals = signals.filter((signal) => signal !== void 0);
	if (realSignals.length === 0) return;
	if (realSignals.length === 1) return realSignals[0];
	if (typeof AbortSignal !== "undefined" && typeof AbortSignal.any === "function") return AbortSignal.any(realSignals);
	const controller = new AbortController();
	for (const signal of realSignals) {
		if (signal.aborted) {
			controller.abort(signal.reason);
			break;
		}
		signal.addEventListener("abort", () => {
			controller.abort(signal.reason);
		}, {
			once: true,
			signal: controller.signal
		});
	}
	return controller.signal;
}
//#endregion
//#region ../../node_modules/.store/@standard-server+core@0.9.2/node_modules/@standard-server/core/dist/index.mjs
var EventStreamEncoderError = class extends TypeError {};
var EventStreamDecoderError = class extends TypeError {};
var ErrorEvent = class extends Error {
	constructor(data, options = {}) {
		super(options?.message ?? "Error Event", options);
		this.data = data;
	}
};
const LINE_ENDING_REGEX = /\r\n|\r(?!\n)|\n/;
const MESSAGE_DELIMITER_REGEX = /(?:\r\n|\r(?!\n)|\n){2}/;
const MESSAGE_DELIMITER_GLOBAL_REGEX = /(?:\r\n|\r(?!\n)|\n){2}/g;
const CR = 13;
const LF = 10;
const SPACE = 32;
function decodeEventStreamMessage(encoded) {
	const message = {};
	for (const line of encoded.split(LINE_ENDING_REGEX)) {
		if (line === "") continue;
		const index = line.indexOf(":");
		const value = index === -1 ? "" : line.slice(line.charCodeAt(index + 1) === SPACE ? index + 2 : index + 1);
		if (index === 0) {
			(message.comments ??= []).push(value);
			continue;
		}
		switch (index === -1 ? line : line.slice(0, index)) {
			case "data":
				message.data = message.data === void 0 ? value : `${message.data}
${value}`;
				break;
			case "event":
				message.event = value;
				break;
			case "id":
				message.id = value;
				break;
			case "retry": {
				const maybeInteger = Number.parseInt(value, 10);
				if (maybeInteger >= 0 && maybeInteger.toString() === value) message.retry = maybeInteger;
				break;
			}
		}
	}
	return message;
}
var EventStreamDecoder = class {
	constructor(onEvent) {
		this.onEvent = onEvent;
	}
	pending = [];
	tail = "";
	discardLeadingLF = false;
	feed(chunk) {
		if (chunk === "") return;
		if (this.discardLeadingLF) {
			this.discardLeadingLF = false;
			if (chunk.charCodeAt(0) === LF) {
				chunk = chunk.slice(1);
				if (chunk === "") return;
			}
		}
		const scan = this.tail + chunk;
		if (!MESSAGE_DELIMITER_REGEX.test(scan)) {
			this.pending.push(chunk);
			this.tail = scan.slice(-3);
			return;
		}
		this.pending.push(chunk);
		const buffered = this.pending.length === 1 ? chunk : this.pending.join("");
		const offset = buffered.length - scan.length;
		const parts = [];
		let start = 0;
		for (const match of scan.matchAll(MESSAGE_DELIMITER_GLOBAL_REGEX)) {
			parts.push(buffered.slice(start, offset + match.index));
			start = offset + match.index + match[0].length;
		}
		const incomplete = buffered.slice(start);
		this.pending.length = 0;
		this.tail = incomplete.slice(-3);
		if (incomplete === "") this.discardLeadingLF = chunk.charCodeAt(chunk.length - 1) === CR;
		else this.pending.push(incomplete);
		for (const encoded of parts) this.onEvent(decodeEventStreamMessage(encoded));
	}
	end() {
		if (this.pending.length !== 0) throw new EventStreamDecoderError("Event Stream ended before complete");
	}
};
var EventStreamDecoderStream = class {
	readable;
	writable;
	constructor() {
		let decoder;
		const transform = new TransformStream({
			start(controller) {
				decoder = new EventStreamDecoder((event) => {
					controller.enqueue(event);
				});
			},
			transform(chunk) {
				decoder.feed(chunk);
			},
			flush() {
				decoder.end();
			}
		});
		this.readable = transform.readable;
		this.writable = transform.writable;
	}
};
const EVENT_STREAM_LINE_ENDING_REGEX = /\r\n|[\n\r]/;
const EVENT_STREAM_LINE_ENDING_GLOBAL_REGEX = /\r\n|[\n\r]/g;
function containsEventStreamLineBreak(value) {
	return EVENT_STREAM_LINE_ENDING_REGEX.test(value);
}
function assertEventStreamMessageId(id) {
	if (containsEventStreamLineBreak(id)) throw new EventStreamEncoderError("Event's id must not contain a carriage return or newline character");
}
function assertEventStreamMessageName(event) {
	if (containsEventStreamLineBreak(event)) throw new EventStreamEncoderError("Event's event must not contain a carriage return or newline character");
}
function assertEventStreamMessageRetry(retry) {
	if (!Number.isInteger(retry) || retry < 0) throw new EventStreamEncoderError("Event's retry must be a integer and >= 0");
}
function assertEventStreamMessageComment(comment) {
	if (containsEventStreamLineBreak(comment)) throw new EventStreamEncoderError("Event's comment must not contain a carriage return or newline character");
}
function encodeEventStreamMessageData(data) {
	if (data === void 0) return "";
	return `data: ${data.replace(EVENT_STREAM_LINE_ENDING_GLOBAL_REGEX, "\ndata: ")}
`;
}
function encodeEventStreamMessageComments(comments) {
	let output = "";
	for (const comment of comments ?? []) {
		assertEventStreamMessageComment(comment);
		output += `: ${comment}
`;
	}
	return output;
}
function encodeEventStreamMessage(message) {
	let output = "";
	output += encodeEventStreamMessageComments(message.comments);
	if (message.event !== void 0) {
		assertEventStreamMessageName(message.event);
		output += `event: ${message.event}
`;
	}
	if (message.retry !== void 0) {
		assertEventStreamMessageRetry(message.retry);
		output += `retry: ${message.retry}
`;
	}
	if (message.id !== void 0) {
		assertEventStreamMessageId(message.id);
		output += `id: ${message.id}
`;
	}
	output += encodeEventStreamMessageData(message.data);
	output += "\n";
	return output;
}
const EVENT_META_SYMBOL = Symbol.for("STANDARD_SERVER_EVENT_META");
const EVENT_SOURCE_SYMBOL = Symbol.for("STANDARD_SERVER_EVENT_SOURCE");
function withEventMeta(container, meta) {
	let assertedMeta;
	if (meta.id !== void 0) {
		assertEventStreamMessageId(meta.id);
		assertedMeta ??= {};
		assertedMeta.id = meta.id;
	}
	if (meta.retry !== void 0) {
		assertEventStreamMessageRetry(meta.retry);
		assertedMeta ??= {};
		assertedMeta.retry = meta.retry;
	}
	if (meta.comments !== void 0) {
		for (const comment of meta.comments) assertEventStreamMessageComment(comment);
		assertedMeta ??= {};
		assertedMeta.comments = meta.comments;
	}
	if (!assertedMeta) return container;
	return new Proxy(container, { get(target, prop, _receiver) {
		if (prop === EVENT_SOURCE_SYMBOL) return target;
		if (prop === EVENT_META_SYMBOL) return assertedMeta;
		return getOrBind(target, prop);
	} });
}
function unwrapEvent(container) {
	if (!isTypescriptObject(container)) return [container, void 0];
	const meta = container[EVENT_META_SYMBOL];
	return [container[EVENT_SOURCE_SYMBOL] ?? container, meta];
}
function getEventMeta(container) {
	if (!isTypescriptObject(container)) return;
	return container[EVENT_META_SYMBOL];
}
function generateContentDisposition(filename, type = "inline") {
	return `${type}; filename="${filename.replace(/[^\x20-\x7E]/g, "_").replace(/[\\"]/g, "\\$&")}"; filename*=utf-8''${safeEncodeURIComponent(filename).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`).replace(/%(7C|60|5E)/g, (str, hex) => String.fromCharCode(Number.parseInt(hex, 16)))}`;
}
function getFilenameFromContentDisposition(contentDisposition) {
	const extValue = contentDisposition.match(/(?:^|;)\s*filename\*=([^;]*)/i)?.[1]?.trim();
	const extValueMatch = extValue?.match(/^([^']*)'[^']*'(.*)$/);
	if (extValueMatch) {
		const [, charset = "", encodedFilename = ""] = extValueMatch;
		if (/^(?:utf-8|us-ascii)$/i.test(charset)) return safeDecodeURIComponent(encodedFilename);
	} else if (extValue) return safeDecodeURIComponent(extValue);
	const filenameMatch = contentDisposition.match(/(?:^|;)\s*filename=(?:"((?:\\.|[^"\\])*)"|([^";]*))/i);
	if (filenameMatch?.[1] !== void 0) return filenameMatch[1].replace(/\\(.)/g, "$1");
	return filenameMatch?.[2]?.trim() || void 0;
}
function flattenStandardHeader(header) {
	if (typeof header === "string" || header === void 0) return header;
	if (header.length === 0) return;
	return header.join(", ");
}
const STANDARD_BODY_HINT_SET = /* @__PURE__ */ new Set([
	"json",
	"form-data",
	"url-search-params",
	"event-stream",
	"octet-stream",
	"file",
	"none"
]);
function resolveStandardBodyHint(headers) {
	const hint = flattenStandardHeader(headers["standard-server"]);
	if (hint !== void 0 && STANDARD_BODY_HINT_SET.has(hint)) return hint;
	const mimeType = flattenStandardHeader(headers["content-type"])?.split(";")[0]?.trim().toLowerCase();
	const contentLength = flattenStandardHeader(headers["content-length"]);
	const contentDisposition = flattenStandardHeader(headers["content-disposition"]);
	const fileName = contentDisposition !== void 0 ? getFilenameFromContentDisposition(contentDisposition) : void 0;
	if (mimeType === void 0 && (contentLength === void 0 || contentLength === "0")) return "none";
	if (mimeType === "application/json") return "json";
	if (mimeType === "multipart/form-data") return "form-data";
	if (mimeType === "application/x-www-form-urlencoded") return "url-search-params";
	if (mimeType === "text/event-stream") return "event-stream";
	if (fileName !== void 0 || contentLength !== void 0) return "file";
	return "octet-stream";
}
function mergeStandardHeaders(a, b) {
	const merged = {
		...a,
		...b
	};
	for (const key of Object.keys(b)) {
		if (!Object.hasOwn(a, key)) continue;
		const aValue = a[key];
		const bValue = b[key];
		merged[key] = aValue === void 0 || bValue === void 0 ? aValue ?? bValue : [...toArray(aValue), ...toArray(bValue)];
	}
	return merged;
}
function parseStandardUrl(url) {
	const hashStart = url.indexOf("#");
	const searchStart = url.indexOf("?");
	const hasSearchBeforeHash = searchStart !== -1 && (hashStart === -1 || searchStart < hashStart);
	const pathnameEnd = hasSearchBeforeHash ? searchStart : hashStart !== -1 ? hashStart : url.length;
	const searchEnd = hashStart !== -1 ? hashStart : url.length;
	return [
		url.slice(0, pathnameEnd),
		hasSearchBeforeHash ? url.slice(searchStart, searchEnd) : void 0,
		hashStart !== -1 ? url.slice(hashStart) : void 0
	];
}
//#endregion
//#region ../../node_modules/.store/@orpc+client@2.0.0-beta.40/node_modules/@orpc/client/dist/shared/client.Dtv1JPkU.mjs
const COMMON_ERROR_STATUS_MAP = {
	BAD_REQUEST: 400,
	UNAUTHORIZED: 401,
	PAYMENT_REQUIRED: 402,
	FORBIDDEN: 403,
	NOT_FOUND: 404,
	METHOD_NOT_SUPPORTED: 405,
	NOT_ACCEPTABLE: 406,
	TIMEOUT: 408,
	CONFLICT: 409,
	GONE: 410,
	PRECONDITION_FAILED: 412,
	PAYLOAD_TOO_LARGE: 413,
	UNSUPPORTED_MEDIA_TYPE: 415,
	UNPROCESSABLE_CONTENT: 422,
	PRECONDITION_REQUIRED: 428,
	TOO_MANY_REQUESTS: 429,
	CLIENT_CLOSED_REQUEST: 499,
	INTERNAL_SERVER_ERROR: 500,
	NOT_IMPLEMENTED: 501,
	BAD_GATEWAY: 502,
	SERVICE_UNAVAILABLE: 503,
	GATEWAY_TIMEOUT: 504
};
let ORPCErrorConstructors;
var ORPCError = class ORPCError extends Error {
	static {
		const ORPC_ERROR_CONSTRUCTORS_SYMBOL = Symbol.for("ORPC_ERROR_CONSTRUCTORS");
		globalThis[ORPC_ERROR_CONSTRUCTORS_SYMBOL] ??= /* @__PURE__ */ new WeakSet();
		ORPCErrorConstructors = globalThis[ORPC_ERROR_CONSTRUCTORS_SYMBOL];
		ORPCErrorConstructors.add(ORPCError);
	}
	/**
	* @remarks
	* **Note**: The `__branch` property is used for type branding, helping TypeScript distinguish
	* an `ORPCError` instance from plain objects with a similar structure.
	*/
	name = "ORPCError";
	/**
	* Indicates whether the error matches a definition in the procedure's `.errors` map,
	* which makes its type inferable on the client.
	*/
	defined = false;
	code;
	data;
	constructor(code, ...rest) {
		const options = resolveMaybeOptionalOptions(rest);
		const message = options.message ?? code.split("_").map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(" ");
		super(message, options);
		this.code = code;
		this.data = options.data;
	}
	toJSON() {
		return {
			defined: this.defined,
			code: this.code,
			message: this.message,
			data: this.data
		};
	}
	/**
	* Workaround for Next.js where different contexts use separate
	* dependency graphs, causing multiple ORPCError constructors existing and breaking
	* `instanceof` checks across contexts.
	*
	* This is particularly problematic with "Optimized SSR", where orpc-client
	* executes in one context but is invoked from another. When an error is thrown
	* in the execution context, `instanceof ORPCError` checks fail in the
	* invocation context due to separate class constructors.
	*
	* @todo Remove this and related code if Next.js resolves the multiple dependency graph issue.
	*/
	static [Symbol.hasInstance](instance) {
		if (!ORPCErrorConstructors.has(this)) return super[Symbol.hasInstance](instance);
		for (const constructor of getConstructors(instance)) if (ORPCErrorConstructors.has(constructor)) return true;
		return false;
	}
};
var MalformedResponseError = class extends Error {
	name = "MalformedResponseError";
	response;
	constructor(options) {
		super(options.message, options);
		this.response = options.response;
	}
};
//#endregion
//#region ../../node_modules/.store/@orpc+client@2.0.0-beta.40/node_modules/@orpc/client/dist/shared/client.BYHnU_Z3.mjs
function toORPCError(error) {
	return error instanceof ORPCError ? error : new ORPCError("INTERNAL_SERVER_ERROR", { cause: error });
}
function isORPCErrorJson(json) {
	if (!isPlainObject(json)) return false;
	const validKeys = [
		"defined",
		"code",
		"message",
		"data"
	];
	if (Object.keys(json).some((k) => !validKeys.includes(k))) return false;
	return "defined" in json && typeof json.defined === "boolean" && "code" in json && typeof json.code === "string" && "message" in json && typeof json.message === "string";
}
function createORPCErrorFromJson(json, options = {}) {
	const error = new ORPCError(json.code, {
		...json,
		...options
	});
	error.defined = json.defined;
	return error;
}
function createORPCErrorFromMalformedResponse(options) {
	const error = new ORPCError("MALFORMED_ORPC_RESPONSE", {
		message: options.message ?? inferMalformedResponseMessage(options.response),
		data: options.response
	});
	error.cause = new MalformedResponseError({
		...options,
		message: error.message
	});
	return error;
}
const INFERRED_MESSAGE_MIN_LENGTH = 1;
const INFERRED_MESSAGE_MAX_LENGTH = 256;
function isInferableMessage(text) {
	return text.length >= INFERRED_MESSAGE_MIN_LENGTH && text.length <= INFERRED_MESSAGE_MAX_LENGTH;
}
function inferMalformedResponseMessage(response) {
	if (typeof response.body === "string" && isInferableMessage(response.body)) return response.body;
	if (isPlainObject(response.body) && typeof response.body.message === "string" && isInferableMessage(response.body.message)) return response.body.message;
	return (Object.entries(COMMON_ERROR_STATUS_MAP).find(([, status]) => status === response.status)?.[0])?.split("_").map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(" ");
}
function wrapAsyncIteratorPreservingEventMeta(iterator, { mapResult, mapError, ...rest }) {
	return wrapAsyncIterator(iterator, {
		...rest,
		mapResult: mapResult && (async (result) => {
			const mapped = await mapResult(result);
			if (mapped.value !== result.value) {
				const meta = getEventMeta(result.value);
				if (meta && isTypescriptObject(mapped.value)) return {
					done: mapped.done,
					value: withEventMeta(mapped.value, meta)
				};
			}
			return mapped;
		}),
		mapError: mapError && (async (error) => {
			const mapped = await mapError(error);
			if (mapped !== error) {
				const meta = getEventMeta(error);
				if (meta && isTypescriptObject(mapped)) return withEventMeta(mapped, meta);
			}
			return mapped;
		})
	});
}
//#endregion
//#region ../../node_modules/.store/@orpc+client@2.0.0-beta.40/node_modules/@orpc/client/dist/index.mjs
const RECURSIVE_CLIENT_UNWRAP_KEYS = /* @__PURE__ */ new Set([
	"then",
	"bind",
	"call",
	"apply",
	"valueOf",
	"toString",
	"toJSON"
]);
function resolveFriendlyClientOptions(options) {
	return {
		...options,
		context: options.context ?? {}
	};
}
function resolveClientRest(rest) {
	return [rest[0], resolveFriendlyClientOptions(rest[1] ?? {})];
}
function createORPCClient(link, { path = [], ...options } = {}) {
	const procedureClient = (...rest) => {
		const [input, callOptions] = resolveClientRest(rest);
		return intercept([...toArray(options.interceptors), ...toArray(options.scoped?.interceptors)], {
			...callOptions,
			input,
			path
		}, ({ path: path2, input: input2, ...callOptions2 }) => link.call(path2, input2, callOptions2));
	};
	const cache = /* @__PURE__ */ new Map();
	return new Proxy(procedureClient, { get(target, key) {
		if (typeof key !== "string" || RECURSIVE_CLIENT_UNWRAP_KEYS.has(key)) return Reflect.get(target, key);
		let client = cache.get(key);
		if (client === void 0) {
			client = createORPCClient(link, {
				...options,
				path: [...path, key],
				scoped: options.scoped?.[key]
			});
			cache.set(key, client);
		}
		return client;
	} });
}
//#endregion
//#region ../../node_modules/.store/@standard-server+fetch@0.9.2/node_modules/@standard-server/fetch/dist/index.mjs
function toAsyncIteratorObject(stream) {
	const reader = (stream?.pipeThrough(new TextDecoderStream()).pipeThrough(new EventStreamDecoderStream()))?.getReader();
	let isCancelled = false;
	return new AsyncIteratorClass(async () => {
		while (true) {
			if (reader === void 0) return {
				done: true,
				value: void 0
			};
			const { done, value } = await reader.read();
			if (done) {
				if (isCancelled) throw new AbortError("Stream was cancelled");
				return {
					done: true,
					value: void 0
				};
			}
			switch (value.event) {
				case "message": {
					let message = parseEmptyableJSON(value.data);
					if (isTypescriptObject(message)) message = withEventMeta(message, value);
					return {
						done: false,
						value: message
					};
				}
				case "error": {
					let error = new ErrorEvent(parseEmptyableJSON(value.data));
					error = withEventMeta(error, value);
					throw error;
				}
				case "close": {
					let close = parseEmptyableJSON(value.data);
					if (isTypescriptObject(close)) close = withEventMeta(close, value);
					return {
						done: true,
						value: close
					};
				}
			}
		}
	}, async (state) => {
		if (state.kind === "cancelled") isCancelled = true;
		await reader?.cancel();
	});
}
function toEventStream(iterator, options = {}) {
	const keepAliveEnabled = options.keepAlive?.enabled ?? true;
	const keepAliveInterval = options.keepAlive?.interval ?? 15e3;
	const keepAliveComment = options.keepAlive?.comment ?? "";
	const initialCommentEnabled = options.initialComment?.enabled ?? true;
	const initialComment = options.initialComment?.comment ?? "";
	const emptyCloseEventEnabled = options.emptyCloseEventEnabled ?? true;
	let cancelled = false;
	let timeout;
	return new ReadableStream({
		start(controller) {
			if (initialCommentEnabled) controller.enqueue(encodeEventStreamMessage({ comments: [initialComment] }));
		},
		async pull(controller) {
			try {
				if (keepAliveEnabled) timeout = setInterval(() => {
					controller.enqueue(encodeEventStreamMessage({ comments: [keepAliveComment] }));
				}, keepAliveInterval);
				const result = await iterator.next();
				clearInterval(timeout);
				if (cancelled) return;
				const [data, meta] = unwrapEvent(result.value);
				if (!result.done || data !== void 0 || meta !== void 0 || emptyCloseEventEnabled) {
					const event = result.done ? "close" : "message";
					controller.enqueue(encodeEventStreamMessage({
						...meta,
						event,
						data: stringifyJSON(data)
					}));
				}
				if (result.done) controller.close();
			} catch (err) {
				clearInterval(timeout);
				if (cancelled) return;
				if (err instanceof ErrorEvent) {
					controller.enqueue(encodeEventStreamMessage({
						...getEventMeta(err),
						event: "error",
						data: stringifyJSON(err.data)
					}));
					controller.close();
				} else controller.error(err);
			}
		},
		async cancel() {
			cancelled = true;
			clearInterval(timeout);
			await iterator.return?.();
		}
	}).pipeThrough(new TextEncoderStream());
}
async function toStandardBody(re, options) {
	const hint = options?.hint ?? resolveStandardBodyHint({
		"standard-server": re.headers.get("standard-server") ?? void 0,
		"content-type": re.headers.get("content-type") ?? void 0,
		"content-length": re.headers.get("content-length") ?? void 0,
		"content-disposition": re.headers.get("content-disposition") ?? void 0
	});
	if (hint === "none") return;
	if (re.bodyUsed) throw new TypeError("Failed to read body: body stream already read");
	if (hint === "json") return parseEmptyableJSON(await re.text());
	if (hint === "form-data") return await re.formData();
	if (hint === "url-search-params") {
		const text = await re.text();
		return new URLSearchParams(text);
	}
	if (hint === "event-stream") return toAsyncIteratorObject(re.body);
	if (hint === "file") {
		const contentDisposition = re.headers.get("content-disposition");
		const fileName = contentDisposition !== null ? getFilenameFromContentDisposition(contentDisposition) : void 0;
		const blob = await re.blob();
		return new File([blob], fileName ?? "blob", { type: blob.type });
	}
	return re.body ?? new ReadableStream({ start(controller) {
		controller.close();
	} });
}
function toFetchBody(body, headers, options = {}) {
	headers = { ...headers };
	if (body instanceof ReadableStream) {
		headers["standard-server"] ??= "octet-stream";
		headers["content-type"] ??= "application/octet-stream";
		return [body, headers];
	}
	if (body instanceof Blob) {
		headers["standard-server"] ??= "file";
		headers["content-type"] = body.type;
		headers["content-disposition"] ??= generateContentDisposition(body instanceof File ? body.name ?? "" : "blob");
		if (Number.isFinite(body.size)) {
			headers["content-length"] = body.size.toString();
			return [body, headers];
		}
		return [body.stream(), headers];
	}
	headers["standard-server"] = void 0;
	headers["content-length"] = void 0;
	if (body === void 0) {
		headers["content-type"] = void 0;
		return [void 0, headers];
	}
	if (body instanceof FormData) {
		headers["content-type"] = void 0;
		return [body, headers];
	}
	if (body instanceof URLSearchParams) {
		headers["content-type"] = void 0;
		return [body, headers];
	}
	if (isAsyncIteratorObject(body)) {
		headers["content-type"] = "text/event-stream";
		return [toEventStream(body, options.eventStream), headers];
	}
	headers["content-type"] = "application/json";
	return [stringifyJSON(body), headers];
}
function toStandardHeaders(headers) {
	const standardHeaders = /* @__PURE__ */ Object.create(null);
	headers.forEach((value, key) => {
		if (Array.isArray(standardHeaders[key])) standardHeaders[key].push(value);
		else if (standardHeaders[key] !== void 0) standardHeaders[key] = [standardHeaders[key], value];
		else standardHeaders[key] = value;
	});
	return standardHeaders;
}
function toFetchHeaders(standardHeaders) {
	const headers = new Headers();
	for (const key of Object.keys(standardHeaders)) {
		const value = standardHeaders[key];
		if (Array.isArray(value)) for (const v of value) headers.append(key, v);
		else if (value !== void 0) headers.append(key, value);
	}
	return headers;
}
function toStandardLazyResponse(response) {
	return {
		resolveBody: (hint) => toStandardBody(response, { hint }),
		status: response.status,
		get headers() {
			const headers = toStandardHeaders(response.headers);
			Object.defineProperty(this, "headers", {
				value: headers,
				writable: true
			});
			return headers;
		},
		set headers(value) {
			Object.defineProperty(this, "headers", {
				value,
				writable: true
			});
		}
	};
}
//#endregion
//#region ../../node_modules/.store/@orpc+client@2.0.0-beta.40/node_modules/@orpc/client/dist/plugins/index.mjs
var RetryLinkPlugin = class {
	defaultRetry;
	defaultRetryDelay;
	defaultShouldRetry;
	defaultOnRetry;
	name = "~retry";
	constructor(options = {}) {
		this.defaultRetry = options.default?.retry ?? 0;
		this.defaultRetryDelay = options.default?.retryDelay ?? ((o) => o.lastEventRetry ?? 2e3);
		this.defaultShouldRetry = options.default?.shouldRetry ?? true;
		this.defaultOnRetry = options.default?.onRetry;
	}
	init(options) {
		const interceptor = async (interceptorOptions) => {
			const { next, ...callOptions } = interceptorOptions;
			const maxAttempts = await value(callOptions.context.retry ?? this.defaultRetry, callOptions);
			const retryDelay = callOptions.context.retryDelay ?? this.defaultRetryDelay;
			const shouldRetry = callOptions.context.shouldRetry ?? this.defaultShouldRetry;
			const onRetry = callOptions.context.onRetry ?? this.defaultOnRetry;
			if (maxAttempts <= 0) return next(callOptions);
			let lastEventId = callOptions.lastEventId;
			let lastEventRetry;
			let callback;
			let attempt = 1;
			const callNext = async (initialError) => {
				let currentError = initialError;
				while (true) {
					const updatedCallOptions = {
						...callOptions,
						lastEventId
					};
					if (currentError) {
						if (attempt > maxAttempts) throw currentError.error;
						const attemptOptions = {
							...updatedCallOptions,
							attempt,
							error: currentError.error,
							lastEventRetry
						};
						if (!await value(shouldRetry, attemptOptions)) throw currentError.error;
						callback = onRetry?.(attemptOptions);
					}
					try {
						if (currentError) {
							await sleep$1(await value(retryDelay, {
								...updatedCallOptions,
								attempt,
								error: currentError.error,
								lastEventRetry
							}), { signal: updatedCallOptions.signal });
							attempt++;
						}
						currentError = void 0;
						return await next(updatedCallOptions);
					} catch (error) {
						currentError = { error };
						if (updatedCallOptions.signal?.aborted) throw error;
					} finally {
						callback?.(!currentError);
						callback = void 0;
					}
				}
			};
			const output = await callNext();
			if (!isAsyncIteratorObject(output)) return output;
			let current = output;
			let isIteratorAborted = false;
			return override(() => current, new AsyncIteratorClass(async () => {
				while (true) try {
					const item = await current.next();
					const meta = getEventMeta(item.value);
					lastEventId = meta?.id ?? lastEventId;
					lastEventRetry = meta?.retry ?? lastEventRetry;
					return item;
				} catch (error) {
					const meta = getEventMeta(error);
					lastEventId = meta?.id ?? lastEventId;
					lastEventRetry = meta?.retry ?? lastEventRetry;
					const asyncIteratorObject = await callNext({ error });
					if (!isAsyncIteratorObject(asyncIteratorObject)) throw new TypeError("RetryLinkPlugin: Expected an AsyncIteratorObject, got a different type.");
					current = asyncIteratorObject;
					if (isIteratorAborted) {
						await current.return?.();
						throw error;
					}
				}
			}, async ({ kind }) => {
				isIteratorAborted = true;
				if (kind === "cancelled") await current.return?.();
			}));
		};
		return {
			...options,
			interceptors: [interceptor, ...toArray(options.interceptors)]
		};
	}
};
var TimeoutLinkPlugin = class {
	timeout;
	name = "~timeout";
	/**
	* Should abort if the total retry time exceeds the configured timeout
	*/
	after = ["~retry"];
	constructor(options) {
		this.timeout = options.timeout;
	}
	init(options) {
		const interceptor = async (interceptorOptions) => {
			const timeoutMs = value(this.timeout, interceptorOptions);
			if (timeoutMs === null || timeoutMs === void 0) return interceptorOptions.next();
			const controller = new AbortController();
			const timeoutId = setTimeout(() => {
				controller.abort(new AbortError(`Request timed out after ${timeoutMs}ms`));
			}, timeoutMs);
			const signal = anyAbortSignal([interceptorOptions.signal, controller.signal]);
			try {
				return await interceptorOptions.next({
					...interceptorOptions,
					signal
				});
			} finally {
				clearTimeout(timeoutId);
			}
		};
		return {
			...options,
			interceptors: [interceptor, ...toArray(options.interceptors)]
		};
	}
};
//#endregion
//#region ../../node_modules/.store/@orpc+contract@2.0.0-beta.40/node_modules/@orpc/contract/dist/shared/contract.g7AqmB1o.mjs
function mergeErrorMap(errorMap1, errorMap2) {
	return {
		...errorMap1,
		...errorMap2
	};
}
function resolveMetaPlugins(baseMeta, existingPlugins, incomingPlugins) {
	existingPlugins = toArray(existingPlugins);
	incomingPlugins = toArray(incomingPlugins);
	let meta = baseMeta;
	for (const plugin of incomingPlugins) if (plugin.init) meta = plugin.init(meta);
	const plugins = [...existingPlugins, ...incomingPlugins];
	for (const plugin of plugins) if (plugin.apply) meta = plugin.apply(meta);
	return [meta, plugins];
}
var ProcedureContract = class ProcedureContract {
	"~orpc";
	constructor(def) {
		this["~orpc"] = def;
	}
	/**
	* Checks if the given instance satisfies the {@link ProcedureContract} class/interface.
	*/
	static [Symbol.hasInstance](instance) {
		if (this !== ProcedureContract) return Function.prototype[Symbol.hasInstance].call(this, instance);
		if (getConstructor(instance) === ProcedureContract) return true;
		return isTypescriptObject(instance) && isTypescriptObject(instance["~orpc"]) && isTypescriptObject(instance["~orpc"].errorMap) && isTypescriptObject(instance["~orpc"].meta) && (instance["~orpc"].inputSchemas === void 0 || Array.isArray(instance["~orpc"].inputSchemas)) && (instance["~orpc"].outputSchemas === void 0 || Array.isArray(instance["~orpc"].outputSchemas));
	}
};
function augmentContractRouter(router, options) {
	if (router instanceof ProcedureContract) {
		const [meta, metaPlugins] = resolveMetaPlugins(options.meta, options.metaPlugins, router["~orpc"].metaPlugins);
		return new ProcedureContract({
			...router["~orpc"],
			errorMap: mergeErrorMap(options.errorMap, router["~orpc"].errorMap),
			meta,
			metaPlugins
		});
	}
	if (!isTypescriptObject(router)) return router;
	const enhanced = {};
	for (const key of Object.keys(router)) enhanced[key] = augmentContractRouter(router[key], options);
	return enhanced;
}
function getRouterContract(router, path) {
	let current = router;
	for (let i = 0; i < path.length; i++) {
		const segment = path[i];
		if (!isTypescriptObject(current)) return;
		if (current instanceof ProcedureContract) return;
		current = current[segment];
	}
	if (!isTypescriptObject(current)) return;
	return current;
}
//#endregion
//#region ../../node_modules/.store/@orpc+contract@2.0.0-beta.40/node_modules/@orpc/contract/dist/index.mjs
const HIDDEN_META_PLUGINS_SYMBOL = Symbol.for("ORPC_HIDDEN_META_PLUGINS");
function getHiddenMetaPlugins(container) {
	if (!isTypescriptObject(container)) return;
	return container[HIDDEN_META_PLUGINS_SYMBOL];
}
const oc = class ContractBuilder extends ProcedureContract {
	/**
	* Private constructor to prevent direct instantiation.
	* Use the static `create` method to initialize a new instance with a safe initial definition.
	*/
	constructor(definition) {
		super(definition);
	}
	/**
	* Creates a fresh contract builder with an empty definition.
	* Prefer the exported `oc` instance over calling this directly.
	*
	* @see {@link https://orpc.dev/docs/contract/procedure | Procedure Contract}
	*/
	static create() {
		return new ContractBuilder({
			errorMap: {},
			meta: {}
		});
	}
	/**
	* Applies metadata plugins to contracts built from this builder.
	*
	* @see {@link https://orpc.dev/docs/contract/procedure#metadata | Procedure Contract - Metadata}
	*/
	meta(...plugins) {
		const [meta, metaPlugins] = resolveMetaPlugins(this["~orpc"].meta, this["~orpc"].metaPlugins, plugins);
		return new ContractBuilder({
			...this["~orpc"],
			meta,
			metaPlugins
		});
	}
	/**
	* Defines typesafe errors that implementations of this contract can throw.
	*
	* @see {@link https://orpc.dev/docs/contract/procedure#typesafe-errors | Procedure Contract - Typesafe Errors}
	*/
	errors(errors) {
		let result = new ContractBuilder({
			...this["~orpc"],
			errorMap: mergeErrorMap(this["~orpc"].errorMap, errors)
		});
		const plugins = getHiddenMetaPlugins(errors);
		if (plugins) result = result.meta(...plugins);
		return result;
	}
	/**
	* Defines the input schema used to validate and type the procedure input.
	*
	* @see {@link https://orpc.dev/docs/contract/procedure#inputoutput-validation | Procedure Contract - Input/Output Validation}
	*/
	input(schema) {
		let result = new ContractBuilder({
			...this["~orpc"],
			inputSchemas: [...toArray(this["~orpc"].inputSchemas), schema]
		});
		const plugins = getHiddenMetaPlugins(schema);
		if (plugins) result = result.meta(...plugins);
		return result;
	}
	/**
	* Defines the output schema used to validate and type the procedure output.
	*
	* @see {@link https://orpc.dev/docs/contract/procedure#inputoutput-validation | Procedure Contract - Input/Output Validation}
	*/
	output(schema) {
		let result = new ContractBuilder({
			...this["~orpc"],
			outputSchemas: [...toArray(this["~orpc"].outputSchemas), schema]
		});
		const plugins = getHiddenMetaPlugins(schema);
		if (plugins) result = result.meta(...plugins);
		return result;
	}
	/**
	* Applies the builder's errors and metadata to every procedure contract in
	* the given router contract.
	*
	* @see {@link https://orpc.dev/docs/contract/router#extending-router | Router Contract - Extending Router}
	*/
	router(router) {
		return augmentContractRouter(router, this["~orpc"]);
	}
}.create();
//#endregion
//#region ../../node_modules/.store/@orpc+server@2.0.0-beta.40/node_modules/@orpc/server/dist/shared/server.Djb_ebJT.mjs
var Lazy = class Lazy {
	"~orpc";
	constructor(def) {
		this["~orpc"] = def;
	}
	/**
	* Checks if the given instance satisfies the {@link Lazy} class/interface.
	*/
	static [Symbol.hasInstance](instance) {
		if (this !== Lazy) return Function.prototype[Symbol.hasInstance].call(this, instance);
		if (getConstructor(instance) === Lazy) return true;
		return isTypescriptObject(instance) && isTypescriptObject(instance["~orpc"]) && isTypescriptObject(instance["~orpc"].meta) && (instance["~orpc"].metaPlugins === void 0 || Array.isArray(instance["~orpc"].metaPlugins)) && typeof instance["~orpc"].loader === "function";
	}
};
function unlazy(maybeLazy) {
	return maybeLazy instanceof Lazy ? maybeLazy["~orpc"].loader() : Promise.resolve({ default: maybeLazy });
}
//#endregion
//#region ../../node_modules/.store/@orpc+openapi@2.0.0-beta.40/node_modules/@orpc/openapi/dist/shared/openapi.B2G-HeFn.mjs
var BracketNotationSerializer = class {
	maxExplicitDeserializingArrayIndex;
	constructor(options = {}) {
		this.maxExplicitDeserializingArrayIndex = options.maxExplicitDeserializingArrayIndex ?? 999;
	}
	serialize(data) {
		const result = [];
		this.internalSerialize(data, "", true, result);
		return result;
	}
	internalSerialize(data, path, isRoot, result) {
		if (Array.isArray(data)) data.forEach((item, i) => {
			this.internalSerialize(item, isRoot ? i.toString() : `${path}[${i}]`, false, result);
		});
		else if (isPlainObject(data)) for (const key of Object.keys(data)) this.internalSerialize(data[key], isRoot ? key : `${path}[${key}]`, false, result);
		else result.push([path, data]);
	}
	deserialize(serialized) {
		const arrayPushStyles = /* @__PURE__ */ new WeakSet();
		const root = new NullProtoObj();
		for (const [path, value] of serialized) {
			const segments = this.parsePath(path);
			let currentRef = root;
			let nextSegment = segments[0];
			for (let i = 1; i < segments.length; i++) {
				const segment = segments[i];
				const isLast = i === segments.length - 1;
				const existing = getOwn(currentRef, nextSegment);
				let child = existing;
				if (!Array.isArray(child) && !isPlainObject(child)) child = [];
				if (Array.isArray(child)) {
					const isPushStyle = arrayPushStyles.has(child);
					if (!(segment === "" ? isLast && (isPushStyle || child.length === 0) : internalIsValidArrayIndex(segment, this.maxExplicitDeserializingArrayIndex) && !(isLast && isPushStyle))) {
						arrayPushStyles.delete(child);
						child = isPushStyle ? internalPushStyleArrayToObject(child) : internalArrayToObject(child);
					}
				}
				if (child !== existing) setOwn(currentRef, nextSegment, child);
				currentRef = child;
				nextSegment = segment;
			}
			if (Array.isArray(currentRef) && nextSegment === "") {
				arrayPushStyles.add(currentRef);
				currentRef.push(value);
			} else if (Object.hasOwn(currentRef, nextSegment)) {
				const current = currentRef[nextSegment];
				if (Array.isArray(current)) current.push(value);
				else setOwn(currentRef, nextSegment, [current, value]);
			} else setOwn(currentRef, nextSegment, value);
		}
		return root;
	}
	stringifyPath(segments) {
		if (segments.length === 0) return "";
		let result = segments[0].toString();
		for (let i = 1; i < segments.length; i++) result += `[${segments[i]}]`;
		return result;
	}
	parsePath(path) {
		const segments = [];
		let inBrackets = false;
		let currentSegment = "";
		for (let i = 0; i < path.length; i++) {
			const char = path[i];
			const nextChar = path[i + 1];
			if (inBrackets && char === "]" && (nextChar === void 0 || nextChar === "[")) {
				if (nextChar === void 0) inBrackets = false;
				segments.push(currentSegment);
				currentSegment = "";
				i++;
			} else if (segments.length === 0 && char === "[") {
				inBrackets = true;
				segments.push(currentSegment);
				currentSegment = "";
			} else currentSegment += char;
		}
		return inBrackets || segments.length === 0 ? [path] : segments;
	}
};
const INTEGER_PATTERN = /^0$|^[1-9]\d*$/;
function internalIsValidArrayIndex(value, maxIndex) {
	return INTEGER_PATTERN.test(value) && Number(value) <= maxIndex;
}
function internalArrayToObject(array) {
	const obj = new NullProtoObj();
	array.forEach((item, i) => {
		obj[i] = item;
	});
	return obj;
}
function internalPushStyleArrayToObject(array) {
	const obj = new NullProtoObj();
	obj[""] = array.length === 1 ? array[0] : array;
	return obj;
}
const DEFAULT_OPEN_API_JSON_SERIALIZER_HANDLERS = {
	undefined: {
		condition(data) {
			return data === void 0;
		},
		serialize() {
			return null;
		},
		isTerminal: true
	},
	bigint: {
		condition(data) {
			return typeof data === "bigint";
		},
		serialize(data) {
			return data.toString();
		},
		isTerminal: true
	},
	date: {
		condition(data) {
			return data instanceof Date;
		},
		serialize(data) {
			if (Number.isNaN(data.getTime())) return null;
			return data.toISOString();
		},
		isTerminal: true
	},
	nan: {
		condition(data) {
			return typeof data === "number" && Number.isNaN(data);
		},
		serialize() {
			return null;
		},
		isTerminal: true
	},
	url: {
		condition(data) {
			return data instanceof URL;
		},
		serialize(data) {
			return data.toString();
		},
		isTerminal: true
	},
	set: {
		condition(data) {
			return data instanceof Set;
		},
		serialize(data) {
			return Array.from(data);
		}
	},
	map: {
		condition(data) {
			return data instanceof Map;
		},
		serialize(data) {
			return Array.from(data.entries());
		}
	}
};
var OpenAPIJsonSerializer = class {
	inlineBuiltInHandlers;
	handlerEntries;
	omitUndefinedProperties;
	constructor(options = {}) {
		this.omitUndefinedProperties = options.omitUndefinedProperties !== false;
		const customHandlers = options.handlers;
		if (customHandlers === void 0) {
			this.inlineBuiltInHandlers = true;
			return;
		}
		let inlineBuiltInHandlers = true;
		let handlerEntries = [];
		for (const key of Object.keys(customHandlers)) {
			const handler = customHandlers[key];
			if (inlineBuiltInHandlers && key in DEFAULT_OPEN_API_JSON_SERIALIZER_HANDLERS) {
				inlineBuiltInHandlers = false;
				break;
			}
			if (handler !== void 0) handlerEntries.push(handler);
		}
		if (!inlineBuiltInHandlers) {
			handlerEntries = [];
			for (const handler of Object.values({
				...DEFAULT_OPEN_API_JSON_SERIALIZER_HANDLERS,
				...customHandlers
			})) if (handler !== void 0) handlerEntries.push(handler);
		}
		this.inlineBuiltInHandlers = inlineBuiltInHandlers;
		this.handlerEntries = handlerEntries;
	}
	serialize(data) {
		const maps = [];
		const blobs = [];
		return {
			json: this.serializeValue(data, [], maps, blobs),
			maps,
			blobs
		};
	}
	/**
	* `segments` is a shared mutable stack (push/pop while walking),
	* so it must be copied before being stored in `maps`.
	*/
	serializeValue(data, segments, maps, blobs) {
		if (this.inlineBuiltInHandlers) switch (typeof data) {
			case "string":
			case "boolean": return data;
			case "number": return Number.isNaN(data) ? null : data;
			case "undefined": return null;
			case "bigint": return data.toString();
			case "object":
				if (data === null) return data;
				if (data instanceof Date) return Number.isNaN(data.getTime()) ? null : data.toISOString();
				if (data instanceof URL) return data.toString();
				if (data instanceof Set) return this.serializeValue(Array.from(data), segments, maps, blobs);
				if (data instanceof Map) return this.serializeValue(Array.from(data.entries()), segments, maps, blobs);
		}
		const handlerEntries = this.handlerEntries;
		if (handlerEntries) for (let i = 0; i < handlerEntries.length; i++) {
			const handler = handlerEntries[i];
			if (handler.condition(data)) {
				const serialized = handler.serialize(data);
				if (handler.isTerminal) {
					if (serialized instanceof Blob) {
						maps.push(segments.slice());
						blobs.push(serialized);
					}
					return serialized;
				}
				return this.serializeValue(serialized, segments, maps, blobs);
			}
		}
		if (data instanceof Blob) {
			maps.push(segments.slice());
			blobs.push(data);
			return data;
		}
		if (Array.isArray(data)) {
			const json = [];
			for (let i = 0; i < data.length; i++) {
				segments.push(i);
				json.push(this.serializeValue(data[i], segments, maps, blobs));
				segments.pop();
			}
			return json;
		}
		if (isPlainObject(data)) {
			const json = new NullProtoObj();
			for (const k of Object.keys(data)) {
				const v = data[k];
				if (k === "toJSON" && typeof v === "function") continue;
				if (v === void 0 && this.omitUndefinedProperties) continue;
				segments.push(k);
				json[k] = this.serializeValue(v, segments, maps, blobs);
				segments.pop();
			}
			return json;
		}
		return data;
	}
	deserialize(serialized) {
		const ref = { json: serialized.json };
		if (serialized.blobs?.length) for (let i = 0; i < serialized.maps.length; i++) {
			const blob = serialized.blobs[i];
			if (!(blob instanceof Blob)) throw new TypeError(`Invalid OpenAPI serialized data: blob ${i} is not a Blob.`);
			const segments = serialized.maps[i];
			let original = serialized;
			let currentRef = ref;
			let preSegment = "json";
			for (let j = 0; j < segments.length; j++) {
				original = original[preSegment];
				currentRef = copyOnWrite(currentRef, preSegment, original);
				preSegment = segments[j];
				if (!Object.hasOwn(currentRef, preSegment)) throw new TypeError(`Invalid OpenAPI serialized data: segment "${preSegment}" does not exist.`);
			}
			currentRef[preSegment] = blob;
		}
		return ref.json;
	}
};
var OpenAPISerializer = class {
	jsonSerializer;
	bracketNotation;
	defaultSerializeOptions;
	constructor({ bracketNotation, serialize, ...options } = {}) {
		this.jsonSerializer = new OpenAPIJsonSerializer(options);
		this.bracketNotation = new BracketNotationSerializer(bracketNotation);
		this.defaultSerializeOptions = serialize;
	}
	serialize(data, options = {}) {
		if (!options.asFormData) {
			if (data === void 0 || data instanceof ReadableStream || data instanceof Blob) return data;
			if (isAsyncIteratorObject(data)) return wrapAsyncIteratorPreservingEventMeta(data, {
				mapResult: (result) => {
					if (result.value === void 0) return result;
					return {
						done: result.done,
						value: this.serializeValue(result.value, false, false)
					};
				},
				mapError: (e) => new ErrorEvent(this.serializeValue(toORPCError(e).toJSON(), false, false), { cause: e })
			});
		}
		const useFormDataForBlobFields = options.useFormDataForBlobFields ?? this.defaultSerializeOptions?.useFormDataForBlobFields ?? true;
		const asFormData = options.asFormData ?? this.defaultSerializeOptions?.asFormData ?? false;
		return this.serializeValue(data, useFormDataForBlobFields, asFormData);
	}
	serializeValue(value, useFormDataForBlobFields, asFormData) {
		const { json, blobs } = this.jsonSerializer.serialize(value);
		if (!asFormData && (json instanceof Blob || json === void 0 || !blobs?.length || !useFormDataForBlobFields)) return json;
		const form = new FormData();
		for (const [path, value2] of this.bracketNotation.serialize(json)) if (value2 instanceof Blob) form.append(path, value2);
		else if (value2 !== void 0 && value2 !== null) form.append(path, String(value2));
		return form;
	}
	deserialize(data) {
		if (data === void 0 || data instanceof ReadableStream || data instanceof Blob) return data;
		if (isAsyncIteratorObject(data)) return wrapAsyncIteratorPreservingEventMeta(data, {
			mapResult: (result) => {
				if (result.value === void 0) return result;
				return {
					done: result.done,
					value: this.jsonSerializer.deserialize({ json: result.value })
				};
			},
			mapError: (e) => {
				if (e instanceof ErrorEvent) {
					const deserialized = this.jsonSerializer.deserialize({ json: e.data });
					if (isORPCErrorJson(deserialized)) return createORPCErrorFromJson(deserialized, { cause: e });
				}
				return e;
			}
		});
		if (data instanceof URLSearchParams || data instanceof FormData) data = this.bracketNotation.deserialize(Array.from(data.entries()));
		return this.jsonSerializer.deserialize({ json: data });
	}
};
function isBodylessMethod(method) {
	return method === "GET" || method === "HEAD";
}
const PARAMETER_NAME_REGEX = /^[\w-]+$/;
function getDynamicPathParams(path) {
	if (!path.includes("{")) return;
	const len = path.length;
	let params;
	let index = 1;
	while (index < len) {
		const segmentStart = index;
		const slashPos = path.indexOf("/", index);
		const segmentEnd = slashPos === -1 ? len : slashPos;
		if (segmentEnd > segmentStart && path.charCodeAt(segmentStart) === 123 && path.charCodeAt(segmentEnd - 1) === 125) {
			let parameterStart = segmentStart + 1;
			let allowsSlash = false;
			if (path.charCodeAt(parameterStart) === 43) {
				allowsSlash = true;
				parameterStart++;
			}
			const parameterName = path.slice(parameterStart, segmentEnd - 1);
			if (PARAMETER_NAME_REGEX.test(parameterName)) {
				params ??= [];
				params.push({
					segment: path.slice(segmentStart, segmentEnd),
					startIndex: segmentStart,
					parameterName,
					allowsSlash
				});
			}
		}
		index = segmentEnd + 1;
	}
	return params;
}
//#endregion
//#region ../../node_modules/.store/@orpc+openapi@2.0.0-beta.40/node_modules/@orpc/openapi/dist/shared/openapi.B9PQzqBn.mjs
const openapi = (incoming) => ({
	name: "~openapi",
	init(meta) {
		const existing = meta["~openapi"];
		const tags = existing?.tags && incoming.tags ? [...existing.tags, ...incoming.tags] : "tags" in incoming ? incoming.tags : existing?.tags;
		const queryStyles = existing?.queryStyles && incoming.queryStyles ? {
			...existing.queryStyles,
			...incoming.queryStyles
		} : "queryStyles" in incoming ? incoming.queryStyles : existing?.queryStyles;
		const paramsStyles = existing?.paramsStyles && incoming.paramsStyles ? {
			...existing.paramsStyles,
			...incoming.paramsStyles
		} : "paramsStyles" in incoming ? incoming.paramsStyles : existing?.paramsStyles;
		const existingSpec = existing?.spec;
		const incomingSpec = incoming.spec;
		const spec = typeof existingSpec === "function" && typeof incomingSpec === "function" ? (current) => incomingSpec(existingSpec(current)) : typeof existingSpec === "function" && typeof incomingSpec === "object" ? existingSpec(incomingSpec) : typeof existingSpec === "object" && typeof incomingSpec === "function" ? incomingSpec(existingSpec) : "spec" in incoming ? incomingSpec : existingSpec;
		const prefix = existing?.prefix && incoming.prefix ? mergeHttpPath(existing.prefix, incoming.prefix) : "prefix" in incoming ? incoming.prefix : existing?.prefix;
		const merged = {
			...existing,
			...incoming,
			tags,
			queryStyles,
			paramsStyles,
			spec,
			prefix
		};
		return {
			...meta,
			"~openapi": merged
		};
	}
});
openapi.method = (method) => ({
	...openapi({ method }),
	name: "~openapi/method"
});
openapi.path = (path) => ({
	...openapi({ path }),
	name: "~openapi/path"
});
openapi.spec = (spec) => ({
	...openapi({ spec }),
	name: "~openapi/spec"
});
openapi.prefix = (prefix) => ({
	...openapi({ prefix }),
	name: "~openapi/prefix"
});
function getOpenAPIMeta(procedureOrLazy) {
	return procedureOrLazy["~orpc"].meta["~openapi"];
}
//#endregion
//#region ../../node_modules/.store/@orpc+openapi@2.0.0-beta.40/node_modules/@orpc/openapi/dist/shared/openapi.wQKxWEI2.mjs
function serializeHeaders(headers, serializer) {
	const result = new NullProtoObj();
	for (const [key, value] of Object.entries(headers)) {
		if (Array.isArray(value)) {
			const lines = [];
			for (const item of value) {
				const line2 = serializeHeaderValue(item, serializer);
				if (line2 !== void 0) lines.push(line2);
			}
			result[key] = lines;
			continue;
		}
		const line = serializeHeaderValue(value, serializer);
		if (line !== void 0) result[key] = line;
	}
	return result;
}
function serializeHeaderValue(value, serializer) {
	const serialized = serializer.serialize(value);
	if (Array.isArray(serialized)) return serialized.filter((item) => item !== void 0 && item !== null).map(String).join(",");
	if (isTypescriptObject(serialized)) return Object.entries(serialized).filter(([, val]) => val !== void 0 && val !== null).map(([key, val]) => `${String(key)},${String(val)}`).join(",");
	if (serialized !== void 0 && serialized !== null) return String(serialized);
}
//#endregion
//#region ../../node_modules/.store/@orpc+client@2.0.0-beta.40/node_modules/@orpc/client/dist/shared/client.VXsLhJtT.mjs
var CompositeStandardLinkPlugin = class {
	name = "~composite";
	plugins;
	constructor(plugins = []) {
		this.plugins = sortPlugins(plugins);
	}
	init(options) {
		for (const plugin of this.plugins) if (plugin.init) options = plugin.init(options);
		return options;
	}
};
var StandardLink = class {
	constructor(codec, transport, options = {}) {
		this.codec = codec;
		this.transport = transport;
		options = new CompositeStandardLinkPlugin(options.plugins).init(options);
		this.interceptors = options.interceptors;
		this.transportInterceptors = options.transportInterceptors;
	}
	interceptors;
	transportInterceptors;
	/**
	* @throws ORPCError, transport-level errors (network failures, timeouts, etc.)
	*/
	call(path, input, options) {
		return runWithSpan(`${ORPC_NAME}.${path.join("/")}`, (span) => {
			span?.setAttribute("rpc.system", ORPC_NAME);
			span?.setAttribute("rpc.method", path.join("."));
			if (getTracer() && isAsyncIteratorObject(input)) input = override(input, traceAsyncIterator("consume_async_iterator_object_input", input));
			else if (getTracer() && input instanceof ReadableStream) input = override(input, traceReadableStream("consume_octet_stream_input", input));
			return intercept(this.interceptors, {
				...options,
				path,
				input
			}, async ({ path: path2, input: input2, ...options2 }) => {
				const tracer = getTracer();
				const activeSpan = tracer?.getActiveSpan() ?? span;
				let request = await runWithSpan({
					name: "encode_input",
					parent: activeSpan
				}, () => this.codec.encodeInput(input2, path2, options2));
				if (activeSpan && tracer?.inject) {
					const headers = { ...request.headers };
					tracer.inject(activeSpan, headers);
					request = {
						...request,
						headers
					};
				}
				const response = await intercept(this.transportInterceptors, {
					...options2,
					path: path2,
					request
				}, ({ path: path3, request: request2, ...options3 }) => {
					return runWithSpan({
						name: "send_request",
						parent: tracer?.getActiveSpan() ?? activeSpan
					}, () => this.transport.send(request2, path3, options3));
				});
				const decodedResult = await runWithSpan({
					name: "decode_response",
					parent: activeSpan
				}, () => this.codec.decodeResponse(response, path2, options2));
				if (decodedResult.kind === "error") throw decodedResult.error;
				const output = decodedResult.output;
				if (getTracer() && isAsyncIteratorObject(output)) return override(output, traceAsyncIterator("consume_async_iterator_object_output", output));
				else if (getTracer() && output instanceof ReadableStream) return override(output, traceReadableStream("consume_octet_stream_output", output));
				return output;
			});
		});
	}
};
//#endregion
//#region ../../node_modules/.store/@orpc+client@2.0.0-beta.40/node_modules/@orpc/client/dist/adapters/fetch/index.mjs
const GET_SUPPORTED_DUPLEX_MODE = once(() => {
	try {
		let duplex;
		new Request("https://example.com", {
			method: "POST",
			body: new ReadableStream(),
			get duplex() {
				duplex = "half";
				return "half";
			}
		});
		return duplex;
	} catch {
		return;
	}
});
var FetchLinkTransport = class {
	origin;
	fetch;
	toFetchRequestOptions;
	constructor(options) {
		this.origin = options.origin;
		this.fetch = options.fetch ?? ((url, init) => globalThis.fetch(url, init));
		this.toFetchRequestOptions = options.toFetchRequest;
	}
	async send(standardRequest, path, options) {
		let origin = await value(this.origin, options, path);
		if (origin?.endsWith("/")) origin = origin.slice(0, -1);
		const url = `${origin ?? ""}${standardRequest.url}`;
		const [body, standardHeaders] = toFetchBody(standardRequest.body, standardRequest.headers, this.toFetchRequestOptions);
		const init = {
			body,
			headers: toFetchHeaders(standardHeaders),
			method: standardRequest.method,
			signal: options.signal,
			redirect: "manual"
		};
		if (body instanceof ReadableStream) {
			const duplex = GET_SUPPORTED_DUPLEX_MODE();
			if (duplex !== void 0) init.duplex = duplex;
		}
		return toStandardLazyResponse(await this.fetch(url, init, options, path));
	}
};
//#endregion
//#region ../../node_modules/.store/@orpc+openapi@2.0.0-beta.40/node_modules/@orpc/openapi/dist/shared/openapi.BdClbrwk.mjs
const END_SLASH_REGEX = /\/$/;
var OpenAPILinkCodec = class {
	constructor(router, options = {}) {
		this.router = router;
		this.baseUrl = options.url ?? "/";
		this.headers = options.headers ?? {};
		this.serializer = options.serializer ?? new OpenAPISerializer();
		this.customErrorResponseBodyDecoder = options.customErrorResponseBodyDecoder;
	}
	baseUrl;
	headers;
	serializer;
	customErrorResponseBodyDecoder;
	async encodeInput(input, path, options) {
		let headers = toResolvedStandardHeaders(await value(this.headers, options, path, input));
		if (options.lastEventId !== void 0) headers = mergeStandardHeaders(headers, { "last-event-id": options.lastEventId });
		const baseUrl = await value(this.baseUrl, options, path, input);
		const meta = getOpenAPIMeta(await this.resolveProcedure(path));
		const method = meta?.method ?? "POST";
		const inputStructure = meta?.inputStructure ?? "compact";
		let pathname = meta?.path ?? pathToHttpPath(path);
		if (meta?.prefix) pathname = mergeHttpPath(meta.prefix, pathname);
		const [basePathname, baseSearch, baseHash] = parseStandardUrl(baseUrl);
		const dynamicParams = getDynamicPathParams(pathname);
		if (inputStructure === "compact") {
			let data = input;
			if (dynamicParams?.length) {
				if (!isTypescriptObject(input)) throw new TypeError(`Input must be an object with "compact" input structure when the path has dynamic params (${dynamicParams.map((p) => p.parameterName).join(", ")}) in call to procedure (${path.join(".")}).`);
				const remaining = { ...input };
				for (let i = dynamicParams.length - 1; i >= 0; i--) {
					const param = dynamicParams[i];
					const encoded = this.encodePathParam(input[param.parameterName], param, meta?.paramsStyles?.[param.parameterName], path);
					pathname = `${pathname.slice(0, param.startIndex)}${encoded}${pathname.slice(param.startIndex + param.segment.length)}`;
					delete remaining[param.parameterName];
				}
				data = Object.keys(remaining).length > 0 ? remaining : void 0;
			}
			pathname = `${basePathname.replace(END_SLASH_REGEX, "")}${pathname}`;
			if (isBodylessMethod(method)) {
				const search2 = combineSearch(baseSearch, this.serializeQueryString(data, meta?.queryStyles));
				const url3 = `${pathname}${search2 ?? ""}${baseHash ?? ""}`;
				return {
					body: void 0,
					method,
					headers,
					url: url3,
					signal: options.signal
				};
			}
			return {
				url: `${pathname}${baseSearch ?? ""}${baseHash ?? ""}`,
				method,
				headers,
				body: this.serializer.serialize(data),
				signal: options.signal
			};
		}
		if (!isValidDetailedInput(input)) throw new TypeError(`
        Invalid "detailed" input structure in call to procedure (${path.join(".")}):
        \u2022 Expected an object or undefined with optional properties:
          - params (object, required when the path has dynamic params)
          - query (object)
          - headers (object)
          - body (any)

        Actual value:
          ${stringifyJSON(input)}
      `);
		if (dynamicParams?.length) {
			if (!input?.params) throw new TypeError(`The "params" property is required for "detailed" input when the path has dynamic params (${dynamicParams.map((p) => p.parameterName).join(", ")}) in call to procedure (${path.join(".")}).`);
			for (let i = dynamicParams.length - 1; i >= 0; i--) {
				const param = dynamicParams[i];
				const val = input.params[param.parameterName];
				const encoded = this.encodePathParam(val, param, meta?.paramsStyles?.[param.parameterName], path);
				pathname = `${pathname.slice(0, param.startIndex)}${encoded}${pathname.slice(param.startIndex + param.segment.length)}`;
			}
		}
		if (input?.headers) headers = mergeStandardHeaders(headers, serializeHeaders(input.headers, this.serializer));
		pathname = `${basePathname.replace(END_SLASH_REGEX, "")}${pathname}`;
		const search = combineSearch(baseSearch, this.serializeQueryString(input?.query, meta?.queryStyles));
		const url = `${pathname}${search ?? ""}${baseHash ?? ""}`;
		if (isBodylessMethod(method)) return {
			body: void 0,
			method,
			headers,
			url,
			signal: options.signal
		};
		return {
			url,
			method,
			headers,
			body: this.serializer.serialize(input?.body),
			signal: options.signal
		};
	}
	encodePathParam(val, param, style, path) {
		let encoded;
		if (style === "comma-delimited-array" && Array.isArray(val)) encoded = val.map((val2) => this.serializer.serialize(val2)).filter((val2) => val2 !== void 0 && val2 !== null).map((val2) => safeEncodeURIComponent(String(val2))).join(",");
		else if (style === "comma-delimited-object" && isTypescriptObject(val)) encoded = Object.entries(val).map(([key, val2]) => [key, this.serializer.serialize(val2)]).filter(([, val2]) => val2 !== void 0 && val2 !== null).map(([key, val2]) => `${safeEncodeURIComponent(String(key))},${safeEncodeURIComponent(String(val2))}`).join(",");
		else {
			const serialized = this.serializer.serialize(val);
			if (serialized !== void 0 && serialized !== null) {
				if (param.allowsSlash) encoded = String(serialized).split("/").map(safeEncodeURIComponent).join("/");
				else encoded = safeEncodeURIComponent(String(serialized));
			}
		}
		if (!encoded) throw new TypeError(`Path param "${param.parameterName}" cannot be empty in call to procedure (${path.join(".")}).`);
		return encoded;
	}
	serializeQueryString(data, queryStyles) {
		if (!queryStyles || !isTypescriptObject(data)) return toURLSearchParams(this.serializer.serialize(data, { asFormData: true })).toString();
		const remaining = { ...data };
		let query = "";
		Object.entries(queryStyles).forEach(([key, style]) => {
			if (style === void 0) return;
			const value2 = remaining[key];
			delete remaining[key];
			if (style === "primitive") {
				const serialized = this.serializer.serialize(value2);
				if (serialized !== void 0 && serialized !== null) query += `&${encodeURLSearchParamComponent(key)}=${encodeURLSearchParamComponent(String(serialized))}`;
			} else if (style === "array" && Array.isArray(value2)) {
				const encodedKey = encodeURLSearchParamComponent(key);
				value2.forEach((v) => {
					const s = this.serializer.serialize(v);
					if (s !== void 0 && s !== null) query += `&${encodedKey}=${encodeURLSearchParamComponent(String(s))}`;
				});
			} else if (style === "json") {
				const serialized = this.serializer.serialize(value2);
				if (serialized !== void 0) query += `&${encodeURLSearchParamComponent(key)}=${encodeURLSearchParamComponent(stringifyJSON(serialized))}`;
			} else if (style === "comma-delimited-array" && Array.isArray(value2)) {
				const encodedValue = encodeDelimitedArray(value2.map((v) => this.serializer.serialize(v)), ",");
				if (encodedValue !== void 0) query += `&${encodeURLSearchParamComponent(key)}=${encodedValue}`;
			} else if (style === "comma-delimited-object" && isTypescriptObject(value2)) {
				const encodedValue = encodeDelimitedObject(Object.entries(value2).map(([key2, value3]) => [key2, this.serializer.serialize(value3)]), ",");
				if (encodedValue !== void 0) query += `&${encodeURLSearchParamComponent(key)}=${encodedValue}`;
			} else if (style === "pipe-delimited-array" && Array.isArray(value2)) {
				const encodedValue = encodeDelimitedArray(value2.map((v) => this.serializer.serialize(v)), "%7C");
				if (encodedValue !== void 0) query += `&${encodeURLSearchParamComponent(key)}=${encodedValue}`;
			} else if (style === "pipe-delimited-object" && isTypescriptObject(value2)) {
				const encodedValue = encodeDelimitedObject(Object.entries(value2).map(([key2, value3]) => [key2, this.serializer.serialize(value3)]), "%7C");
				if (encodedValue !== void 0) query += `&${encodeURLSearchParamComponent(key)}=${encodedValue}`;
			} else if (style === "space-delimited-array" && Array.isArray(value2)) {
				const encodedValue = encodeDelimitedArray(value2.map((v) => this.serializer.serialize(v)), "%20");
				if (encodedValue !== void 0) query += `&${encodeURLSearchParamComponent(key)}=${encodedValue}`;
			} else if (style === "space-delimited-object" && isTypescriptObject(value2)) {
				const encodedValue = encodeDelimitedObject(Object.entries(value2).map(([key2, value3]) => [key2, this.serializer.serialize(value3)]), "%20");
				if (encodedValue !== void 0) query += `&${encodeURLSearchParamComponent(key)}=${encodedValue}`;
			} else {
				const serialized = this.serializer.serialize(value2);
				if (serialized !== void 0 && serialized !== null) query += `&${encodeURLSearchParamComponent(key)}=${encodeURLSearchParamComponent(String(serialized))}`;
			}
		});
		query = `${toURLSearchParams(this.serializer.serialize(remaining, { asFormData: true })).toString()}${query}`;
		if (query.startsWith("&")) query = query.slice(1);
		return query || void 0;
	}
	async decodeResponse(response, path, _options) {
		const isOk = response.status < 400;
		const meta = getOpenAPIMeta(await this.resolveProcedure(path));
		const body = await response.resolveBody(meta?.responseBodyHint);
		const deserialized = await (async () => {
			try {
				return this.serializer.deserialize(body);
			} catch (error) {
				throw createORPCErrorFromMalformedResponse({
					message: "Invalid OpenAPI response format.",
					response: {
						status: response.status,
						headers: response.headers,
						body
					},
					cause: error
				});
			}
		})();
		if (!isOk) {
			const customError = this.customErrorResponseBodyDecoder?.(deserialized, response);
			if (customError !== void 0 && customError !== null) return {
				kind: "error",
				error: customError
			};
			if (isORPCErrorJson(deserialized)) return {
				kind: "error",
				error: createORPCErrorFromJson(deserialized)
			};
			return {
				kind: "error",
				error: createORPCErrorFromMalformedResponse({ response: {
					headers: response.headers,
					status: response.status,
					body
				} })
			};
		}
		return (meta?.outputStructure ?? "compact") === "compact" ? {
			kind: "output",
			output: deserialized
		} : {
			kind: "output",
			output: {
				status: response.status,
				headers: response.headers,
				body: deserialized
			}
		};
	}
	async resolveProcedure(path) {
		const { default: maybeProcedure } = await unlazy(getRouterContract(this.router, path));
		if (!(maybeProcedure instanceof ProcedureContract)) throw new TypeError(`Expected a procedure or contract at path (${path.join(".")})`);
		return maybeProcedure;
	}
};
function combineSearch(baseSearch, additionalSearch) {
	if (!baseSearch && !additionalSearch) return;
	if (!additionalSearch) return baseSearch;
	if (!baseSearch) return `?${additionalSearch}`;
	return `${baseSearch}&${additionalSearch}`;
}
function toResolvedStandardHeaders(headers) {
	if (typeof headers.forEach === "function") return toStandardHeaders(headers);
	return headers;
}
function isValidDetailedInput(input) {
	if (!isTypescriptObject(input)) return input === void 0;
	if (input.params !== void 0 && !isTypescriptObject(input.params)) return false;
	if (input.query !== void 0 && !isTypescriptObject(input.query)) return false;
	if (input.headers !== void 0 && !isTypescriptObject(input.headers)) return false;
	return true;
}
function encodeURLSearchParamComponent(value2) {
	return new URLSearchParams({ "": value2 }).toString().slice(1);
}
function toURLSearchParams(form) {
	const params = new URLSearchParams();
	for (const [key, value2] of form) params.append(key, String(value2));
	return params;
}
function encodeDelimitedArray(serializedValues, encodedDelimiter) {
	const strings = serializedValues.filter((v) => v !== null && v !== void 0).map(String);
	if (!strings.length) return;
	return strings.map(encodeURLSearchParamComponent).join(encodedDelimiter);
}
function encodeDelimitedObject(entries, encodedDelimiter) {
	const strings = entries.filter(([v]) => v !== null && v !== void 0).map(([k, v]) => [k, String(v)]);
	if (!strings.length) return;
	return strings.map(([key, value2]) => `${encodeURLSearchParamComponent(key)}${encodedDelimiter}${encodeURLSearchParamComponent(value2)}`).join(encodedDelimiter);
}
//#endregion
//#region ../../node_modules/.store/@orpc+openapi@2.0.0-beta.40/node_modules/@orpc/openapi/dist/adapters/fetch/index.mjs
var OpenAPILink = class extends StandardLink {
	constructor(router, options = {}) {
		const codec = new OpenAPILinkCodec(router, options);
		const transport = new FetchLinkTransport(options);
		super(codec, transport, options);
	}
};
//#endregion
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
//#endregion
//#region ../protocol/dist/contract.mjs
/**
* The ingest API as an oRPC contract: every endpoint the reporter calls, with
* its method, path, input and output. The reporter builds its client from it
* (`OpenAPILink`), so a URL, a body or a response shape cannot be mistyped on
* that side, and the app checks its route handlers against it.
*
* The wire format is plain REST, the one the route handlers under
* `app/api/ingest` have always spoken: path parameters in the URL, the rest of
* the input as the JSON body, the output as the JSON response. Released
* reporters and older servers keep working with each other.
*
* Paths are relative to `/api/ingest` (`INGEST_PREFIX`).
*/
const INGEST_PREFIX = "/api/ingest";
const runId = { runId: z.string().describe("The run id `POST /runs` answered with.") };
const ingestContract = {
	runs: {
		start: oc.meta(openapi({
			method: "POST",
			path: "/runs",
			successStatus: 201,
			summary: "Start a run, or join it as another shard"
		})).input(runStartSchema).output(runStartResponseSchema),
		events: oc.meta(openapi({
			method: "POST",
			path: "/runs/{runId}/events",
			summary: "Send a batch of test events"
		})).input(eventBatchSchema.extend(runId)).output(eventBatchResponseSchema),
		heartbeat: oc.meta(openapi({
			method: "POST",
			path: "/runs/{runId}/heartbeat",
			summary: "Tell the server the run is alive"
		})).input(runHeartbeatSchema.extend(runId)).output(runHeartbeatResponseSchema),
		finish: oc.meta(openapi({
			method: "POST",
			path: "/runs/{runId}/finish",
			summary: "Finish a shard of the run"
		})).input(runFinishSchema.extend(runId)).output(runFinishResponseSchema)
	},
	attachments: {
		uploadUrls: oc.meta(openapi({
			method: "POST",
			path: "/runs/{runId}/attachments/upload-urls",
			summary: "Where to upload attachments"
		})).input(uploadUrlsRequestSchema.extend(runId)).output(uploadUrlsResponseSchema),
		complete: oc.meta(openapi({
			method: "POST",
			path: "/runs/{runId}/attachments/{attachmentId}/complete",
			summary: "Confirm a presigned upload"
		})).input(completeUploadRequestSchema.extend({
			...runId,
			attachmentId: z.string()
		})).output(completeUploadResponseSchema)
	}
};
//#endregion
//#region src/client.ts
/** A non-2xx answer from the server, with its status. */
var HttpError = class extends ORPCError {
	status;
	constructor(status, message) {
		super(`HTTP_${status}`, {
			message,
			data: { status }
		});
		this.status = status;
	}
};
/** JSON bodies above this are gzipped; the server inflates them. */
const GZIP_THRESHOLD = 32768;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const backoff = (retry) => Math.min(8e3, 500 * 2 ** retry);
function isRetryable(err) {
	if (!(err instanceof HttpError)) return true;
	return err.status >= 500 || err.status === 408 || err.status === 429;
}
/** The server's error text: `{ error }` from the ingest routes, or whatever a proxy in front of them sent. */
function errorDetail(body) {
	if (typeof body === "string") return body;
	if (body && typeof body === "object" && "error" in body && typeof body.error === "string") return body.error;
	return body === void 0 ? "" : JSON.stringify(body);
}
function gzipLargeBody(init) {
	if (typeof init.body !== "string" || init.body.length <= GZIP_THRESHOLD) return init;
	const headers = new Headers(init.headers);
	headers.set("content-encoding", "gzip");
	return {
		...init,
		headers,
		body: new Blob([new Uint8Array(gzipSync(init.body))])
	};
}
function createIngestApi(opts, log) {
	return createORPCClient(new OpenAPILink(ingestContract, {
		origin: opts.serverUrl,
		url: INGEST_PREFIX,
		headers: {
			authorization: `Bearer ${opts.token}`,
			[PROTOCOL_HEADER]: String(1)
		},
		fetch: (url, init) => globalThis.fetch(url, {
			...gzipLargeBody(init),
			redirect: "follow"
		}),
		customErrorResponseBodyDecoder: (body, response) => new HttpError(response.status, `${response.status}: ${errorDetail(body).slice(0, 500)}`),
		plugins: [new RetryLinkPlugin({ default: {
			retry: opts.maxRetries,
			shouldRetry: ({ error }) => isRetryable(error),
			retryDelay: ({ attempt }) => backoff(attempt - 1),
			onRetry: ({ path, error, attempt }) => {
				log(`request ${path.join(".")} failed (${error.message}); retrying in ${backoff(attempt - 1)}ms`);
			}
		} }), new TimeoutLinkPlugin({ timeout: ({ context }) => context.timeoutMs })]
	}));
}
/**
* The reporter's side of the ingest API. Calls go through the typed client;
* this class adds the per-call policy (the heartbeat's single attempt) and the
* attachment upload, which goes to whatever URL the server handed out.
*/
var IngestClient = class {
	opts;
	api;
	constructor(opts, log) {
		this.opts = opts;
		this.api = createIngestApi(opts, log);
	}
	startRun(body) {
		return this.api.runs.start(body);
	}
	sendEvents(runId, body) {
		return this.api.runs.events({
			runId,
			...body
		});
	}
	uploadUrls(runId, attachmentIds) {
		return this.api.attachments.uploadUrls({
			runId,
			attachmentIds
		});
	}
	completeUpload(runId, attachmentId, size) {
		return this.api.attachments.complete({
			runId,
			attachmentId,
			size
		});
	}
	finishRun(runId, body) {
		return this.api.runs.finish({
			runId,
			...body
		});
	}
	/** One attempt, bounded: the next beat is the retry. */
	heartbeat(runId, body) {
		return this.api.runs.heartbeat({
			runId,
			...body
		}, { context: {
			retry: 0,
			timeoutMs: 1e4
		} });
	}
	/**
	* Not part of the contract: the target is the app's proxy route or a
	* presigned storage URL, as the upload instruction says.
	*/
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
			await sleep(backoff(attempt));
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
		const title = JSON.parse(readFileSync(path, "utf8"))?.pull_request?.title;
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
		ciRunId: opts.ciRunId ?? env.PW_REPORTER_CI_RUN_ID ?? detectCiRunId(env) ?? randomUUID(),
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
			if (err instanceof HttpError && err.status === 404) {
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