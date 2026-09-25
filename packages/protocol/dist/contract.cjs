Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const require_index = require("./index.cjs");
let zod = require("zod");
let _orpc_contract = require("@orpc/contract");
let _orpc_openapi = require("@orpc/openapi");
//#region src/contract.ts
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
const runId = { runId: zod.z.string().describe("The run id `POST /runs` answered with.") };
const ingestContract = {
	runs: {
		start: _orpc_contract.oc.meta((0, _orpc_openapi.openapi)({
			method: "POST",
			path: "/runs",
			successStatus: 201,
			summary: "Start a run, or join it as another shard"
		})).input(require_index.runStartSchema).output(require_index.runStartResponseSchema),
		events: _orpc_contract.oc.meta((0, _orpc_openapi.openapi)({
			method: "POST",
			path: "/runs/{runId}/events",
			summary: "Send a batch of test events"
		})).input(require_index.eventBatchSchema.extend(runId)).output(require_index.eventBatchResponseSchema),
		heartbeat: _orpc_contract.oc.meta((0, _orpc_openapi.openapi)({
			method: "POST",
			path: "/runs/{runId}/heartbeat",
			summary: "Tell the server the run is alive"
		})).input(require_index.runHeartbeatSchema.extend(runId)).output(require_index.runHeartbeatResponseSchema),
		finish: _orpc_contract.oc.meta((0, _orpc_openapi.openapi)({
			method: "POST",
			path: "/runs/{runId}/finish",
			summary: "Finish a shard of the run"
		})).input(require_index.runFinishSchema.extend(runId)).output(require_index.runFinishResponseSchema)
	},
	attachments: {
		uploadUrls: _orpc_contract.oc.meta((0, _orpc_openapi.openapi)({
			method: "POST",
			path: "/runs/{runId}/attachments/upload-urls",
			summary: "Where to upload attachments"
		})).input(require_index.uploadUrlsRequestSchema.extend(runId)).output(require_index.uploadUrlsResponseSchema),
		complete: _orpc_contract.oc.meta((0, _orpc_openapi.openapi)({
			method: "POST",
			path: "/runs/{runId}/attachments/{attachmentId}/complete",
			summary: "Confirm a presigned upload"
		})).input(require_index.completeUploadRequestSchema.extend({
			...runId,
			attachmentId: zod.z.string()
		})).output(require_index.completeUploadResponseSchema)
	}
};
//#endregion
exports.INGEST_PREFIX = INGEST_PREFIX;
exports.ingestContract = ingestContract;

//# sourceMappingURL=contract.cjs.map