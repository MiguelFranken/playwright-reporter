import { z } from "zod";
//#region ../protocol/dist/index.d.mts
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
declare const CHECKPOINT_CONTENT_TYPE = "application/vnd.pw-reporter.checkpoint+json";
declare const checkpointKindSchema: z.ZodEnum<{
  component: "component";
  dialog: "dialog";
  email: "email";
  other: "other";
  page: "page";
}>;
type CheckpointKind = z.infer<typeof checkpointKindSchema>;
/** What the capture helper attaches: variants name their images by attachment name. */
declare const checkpointRecordSchema: z.ZodObject<{
  name: z.ZodString;
  title: z.ZodOptional<z.ZodString>;
  description: z.ZodOptional<z.ZodString>;
  sequence: z.ZodNumber;
  capturedAt: z.ZodOptional<z.ZodString>;
  stepPath: z.ZodOptional<z.ZodArray<z.ZodString>>;
  url: z.ZodOptional<z.ZodString>;
  pageTitle: z.ZodOptional<z.ZodString>;
  kind: z.ZodOptional<z.ZodEnum<{
    component: "component";
    dialog: "dialog";
    email: "email";
    other: "other";
    page: "page";
  }>>;
  flow: z.ZodOptional<z.ZodString>;
  tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
  v: z.ZodLiteral<1>;
  variants: z.ZodArray<z.ZodObject<{
    variant: z.ZodString;
    viewport: z.ZodOptional<z.ZodObject<{
      width: z.ZodNumber;
      height: z.ZodNumber;
    }, z.core.$strip>>;
    deviceScaleFactor: z.ZodOptional<z.ZodNumber>;
    isMobile: z.ZodOptional<z.ZodBoolean>;
    fullPage: z.ZodOptional<z.ZodBoolean>;
    width: z.ZodOptional<z.ZodNumber>;
    height: z.ZodOptional<z.ZodNumber>;
    sha256: z.ZodOptional<z.ZodString>;
    attachment: z.ZodString;
    thumbnail: z.ZodOptional<z.ZodString>;
  }, z.core.$strip>>;
}, z.core.$strip>;
type CheckpointRecord = z.infer<typeof checkpointRecordSchema>;
declare const uploadInstructionSchema: z.ZodObject<{
  attachmentId: z.ZodString;
  strategy: z.ZodEnum<{
    presigned: "presigned";
    proxy: "proxy";
  }>;
  method: z.ZodLiteral<"PUT">;
  url: z.ZodString;
  headers: z.ZodRecord<z.ZodString, z.ZodString>;
}, z.core.$strip>;
type UploadInstruction = z.infer<typeof uploadInstructionSchema>;
//#endregion
export { UploadInstruction as i, CheckpointKind as n, CheckpointRecord as r, CHECKPOINT_CONTENT_TYPE as t };
//# sourceMappingURL=index-C4OzotD2.d.cts.map