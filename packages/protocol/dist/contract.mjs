import { completeUploadRequestSchema, completeUploadResponseSchema, eventBatchResponseSchema, eventBatchSchema, runFinishResponseSchema, runFinishSchema, runHeartbeatResponseSchema, runHeartbeatSchema, runStartResponseSchema, runStartSchema, uploadUrlsRequestSchema, uploadUrlsResponseSchema } from "./index.mjs";
import { z } from "zod";
import { oc } from "@orpc/contract";
import { openapi } from "@orpc/openapi";
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
export { INGEST_PREFIX, ingestContract };

//# sourceMappingURL=contract.mjs.map