import { ResolvedOptions } from "./types.cjs";
import { z } from "zod";
//#region ../../node_modules/.store/type-fest@5.10.0/node_modules/type-fest/source/promisable.d.ts
/**
Create a type that represents either the value or the value wrapped in `PromiseLike`.

Use-cases:
- A function accepts a callback that may either return a value synchronously or may return a promised value.
- This type could be the return type of `Promise#then()`, `Promise#catch()`, and `Promise#finally()` callbacks.

Please upvote [this issue](https://github.com/microsoft/TypeScript/issues/31394) if you want to have this type as a built-in in TypeScript.

@example
```
import type {Promisable} from 'type-fest';

async function logger(getLogEntry: () => Promisable<string>): Promise<void> {
	const entry = await getLogEntry();
	console.log(entry);
}

await logger(() => 'foo');
await logger(() => Promise.resolve('bar'));
```

@category Async
*/
type Promisable<T> = T | PromiseLike<T>;
//#endregion
//#region ../../node_modules/.store/@orpc+shared@2.0.0-beta.40/node_modules/@orpc/shared/dist/index.d.mts
type MaybeOptionalOptions<TOptions> = object extends TOptions ? [options?: TOptions] : [options: TOptions];
type PromiseWithError<T, TError> = Promise<T> & {
  __error?: {
    type: TError;
  };
};
/**
 * The place where you can config the orpc types.
 *
 * - `ThrowableError` the error type that represent throwable errors should be `Error` or `null | undefined | {}` if you want more strict.
 */
interface Registry {}
type ThrowableError = Registry extends {
  ThrowableError: infer T;
} ? T : Error;
type Value<T, TArgs extends any[] = []> = T | ((...args: TArgs) => T);
//#endregion
//#region ../../node_modules/.store/@orpc+client@2.0.0-beta.40/node_modules/@orpc/client/dist/shared/client.BoXZCzuS.d.mts
interface ClientContext {
  [key: PropertyKey]: any;
}
interface ClientOptions<T extends ClientContext> {
  signal?: AbortSignal | undefined;
  lastEventId?: string | undefined;
  context: T;
}
type FriendlyClientOptions<T extends ClientContext> = Omit<ClientOptions<T>, 'context'> & (object extends T ? {
  context?: T;
} : {
  context: T;
});
type ClientRest<TClientContext extends ClientContext, TInput> = object extends TClientContext ? undefined extends TInput ? [input?: TInput, options?: FriendlyClientOptions<TClientContext>] : [input: TInput, options?: FriendlyClientOptions<TClientContext>] : [input: TInput, options: FriendlyClientOptions<TClientContext>];
interface Client<TClientContext extends ClientContext, TInput, TOutput, TError> {
  (...rest: ClientRest<TClientContext, TInput>): PromiseWithError<TOutput, TError>;
}
/**
 * Default mapping between common oRPC error codes and HTTP status codes.
 * Handlers use it to determine response status codes; spread it to build a custom `errorStatusMap`.
 *
 * @see {@link https://orpc.dev/docs/rpc/handler#custom-error-response | RPC Handler - Custom Error Response}
 * @see {@link https://orpc.dev/docs/openapi/handler#custom-error-response | OpenAPI Handler - Custom Error Response}
 */
declare const COMMON_ERROR_STATUS_MAP: {
  BAD_REQUEST: number;
  UNAUTHORIZED: number;
  PAYMENT_REQUIRED: number;
  FORBIDDEN: number;
  NOT_FOUND: number;
  METHOD_NOT_SUPPORTED: number;
  NOT_ACCEPTABLE: number;
  TIMEOUT: number;
  CONFLICT: number;
  GONE: number;
  PRECONDITION_FAILED: number;
  PAYLOAD_TOO_LARGE: number;
  UNSUPPORTED_MEDIA_TYPE: number;
  UNPROCESSABLE_CONTENT: number;
  PRECONDITION_REQUIRED: number;
  TOO_MANY_REQUESTS: number;
  CLIENT_CLOSED_REQUEST: number;
  INTERNAL_SERVER_ERROR: number;
  NOT_IMPLEMENTED: number;
  BAD_GATEWAY: number;
  SERVICE_UNAVAILABLE: number;
  GATEWAY_TIMEOUT: number;
};
type ORPCErrorCode = Registry extends {
  ORPCErrorCode: infer T extends string;
} ? T : (keyof typeof COMMON_ERROR_STATUS_MAP) | (string & {});
type ORPCErrorOptions<TData> = ErrorOptions & {
  message?: string;
} & (undefined extends TData ? {
  data?: TData;
} : {
  data: TData;
});
/**
 * Typed error carrying a `code`, a `message`, and optional `data`.
 * Throw it from handlers or middleware to produce typed error responses on the client.
 *
 * @see {@link https://orpc.dev/docs/error-handling#orpcerror-class | Error Handling - ORPCError Class}
 */
declare class ORPCError<TCode extends ORPCErrorCode, TData> extends Error {
  /**
   * @remarks
   * **Note**: The `__branch` property is used for type branding, helping TypeScript distinguish
   * an `ORPCError` instance from plain objects with a similar structure.
   */
  readonly name: "ORPCError" & {
    __branch: "ORPCError";
  };
  /**
   * Indicates whether the error matches a definition in the procedure's `.errors` map,
   * which makes its type inferable on the client.
   */
  readonly defined: boolean;
  code: TCode;
  data: TData;
  constructor(code: TCode, ...rest: MaybeOptionalOptions<ORPCErrorOptions<TData>>);
  toJSON(): ORPCErrorJSON<TCode, TData>;
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
  static [Symbol.hasInstance](instance: unknown): boolean;
}
interface ORPCErrorJSON<TCode extends string, TData> extends Pick<ORPCError<TCode, TData>, 'code' | 'message' | 'data'> {
  /**
   * remove readonly
   */
  defined: boolean;
}
//#endregion
//#region ../../node_modules/.store/@orpc+client@2.0.0-beta.40/node_modules/@orpc/client/dist/shared/client.BWkR2vPU.d.mts
interface StandardLinkInterceptorOptions<T extends ClientContext> extends ClientOptions<T> {
  path: string[];
  input: unknown;
}
//#endregion
//#region ../../node_modules/.store/@orpc+client@2.0.0-beta.40/node_modules/@orpc/client/dist/plugins/index.d.mts
interface RetryLinkPluginAttemptOptions<T extends RetryLinkPluginContext> extends StandardLinkInterceptorOptions<T> {
  /**
   * Latest retry delay advertised by the server via event metadata.
   */
  lastEventRetry: number | undefined;
  /**
   * Current retry attempt number, starting at 1.
   */
  attempt: number;
  /**
   * Error that triggered this retry attempt.
   */
  error: unknown;
}
/**
 * Client context options that control retry behavior per call
 * when the `RetryLinkPlugin` is enabled.
 *
 * @see {@link https://orpc.dev/docs/plugins/retry | Retry Plugin}
 */
interface RetryLinkPluginContext {
  /**
   * Maximum retry attempts before throwing.
   * Use `Number.POSITIVE_INFINITY` for infinite retries (e.g. for AsyncIteratorObject).
   *
   * @default 0
   */
  retry?: Value<Promisable<number>, [Omit<StandardLinkInterceptorOptions<RetryLinkPluginContext>, 'next'>]>;
  /**
   * Delay (in ms) before retrying.
   *
   * @remarks
   * **Note**: Why 2000ms? The EventSource spec suggests a default retry delay of 2 seconds if it doesn't specify
   *
   * @default (o) => o.lastEventRetry ?? 2000
   */
  retryDelay?: Value<Promisable<number>, [RetryLinkPluginAttemptOptions<RetryLinkPluginContext>]>;
  /**
   * Determine whether to retry.
   *
   * @default true
   */
  shouldRetry?: Value<Promisable<boolean>, [RetryLinkPluginAttemptOptions<RetryLinkPluginContext>]>;
  /**
   * Hook called before each retry. Can return a cleanup callback.
   */
  onRetry?: (options: RetryLinkPluginAttemptOptions<RetryLinkPluginContext>) => void | ((isSuccess: boolean) => void);
}
//#endregion
//#region ../../node_modules/.store/@standard-schema+spec@1.1.0/node_modules/@standard-schema/spec/dist/index.d.ts
/** The Standard Typed interface. This is a base type extended by other specs. */
interface StandardTypedV1<Input = unknown, Output = Input> {
  /** The Standard properties. */
  readonly "~standard": StandardTypedV1.Props<Input, Output>;
}
declare namespace StandardTypedV1 {
  /** The Standard Typed properties interface. */
  interface Props<Input = unknown, Output = Input> {
    /** The version number of the standard. */
    readonly version: 1;
    /** The vendor name of the schema library. */
    readonly vendor: string;
    /** Inferred types associated with the schema. */
    readonly types?: Types<Input, Output> | undefined;
  }
  /** The Standard Typed types interface. */
  interface Types<Input = unknown, Output = Input> {
    /** The input type of the schema. */
    readonly input: Input;
    /** The output type of the schema. */
    readonly output: Output;
  }
  /** Infers the input type of a Standard Typed. */
  type InferInput<Schema extends StandardTypedV1> = NonNullable<Schema["~standard"]["types"]>["input"];
  /** Infers the output type of a Standard Typed. */
  type InferOutput<Schema extends StandardTypedV1> = NonNullable<Schema["~standard"]["types"]>["output"];
}
/** The Standard Schema interface. */
interface StandardSchemaV1<Input = unknown, Output = Input> {
  /** The Standard Schema properties. */
  readonly "~standard": StandardSchemaV1.Props<Input, Output>;
}
declare namespace StandardSchemaV1 {
  /** The Standard Schema properties interface. */
  interface Props<Input = unknown, Output = Input> extends StandardTypedV1.Props<Input, Output> {
    /** Validates unknown input values. */
    readonly validate: (value: unknown, options?: StandardSchemaV1.Options | undefined) => Result<Output> | Promise<Result<Output>>;
  }
  /** The result interface of the validate function. */
  type Result<Output> = SuccessResult<Output> | FailureResult;
  /** The result interface if validation succeeds. */
  interface SuccessResult<Output> {
    /** The typed output value. */
    readonly value: Output;
    /** A falsy value for `issues` indicates success. */
    readonly issues?: undefined;
  }
  interface Options {
    /** Explicit support for additional vendor-specific parameters, if needed. */
    readonly libraryOptions?: Record<string, unknown> | undefined;
  }
  /** The result interface if validation fails. */
  interface FailureResult {
    /** The issues of failed validation. */
    readonly issues: ReadonlyArray<Issue>;
  }
  /** The issue interface of the failure output. */
  interface Issue {
    /** The error message of the issue. */
    readonly message: string;
    /** The path of the issue, if any. */
    readonly path?: ReadonlyArray<PropertyKey | PathSegment> | undefined;
  }
  /** The path segment interface of the issue. */
  interface PathSegment {
    /** The key representing a path segment. */
    readonly key: PropertyKey;
  }
  /** The Standard types interface. */
  interface Types<Input = unknown, Output = Input> extends StandardTypedV1.Types<Input, Output> {}
  /** Infers the input type of a Standard. */
  type InferInput<Schema extends StandardTypedV1> = StandardTypedV1.InferInput<Schema>;
  /** Infers the output type of a Standard. */
  type InferOutput<Schema extends StandardTypedV1> = StandardTypedV1.InferOutput<Schema>;
}
//#endregion
//#region ../../node_modules/.store/@orpc+contract@2.0.0-beta.40/node_modules/@orpc/contract/dist/shared/contract.CQzrFGcD.d.mts
/**
 * TOutput default = TInput for better readability (shorter) in-case both TInput, TOutput is equal
 */
type Schema<TInput, TOutput = TInput> = StandardSchemaV1<TInput, TOutput>;
/**
 * Any Standard Schema compatible schema, regardless of its input and output types.
 *
 * @see {@link https://orpc.dev/docs/integrations/standard-schema | Standard Schema Integration}
 */
type AnySchema = Schema<any>;
/**
 * Infers the input type of a schema.
 *
 * @see {@link https://orpc.dev/docs/metadata | Metadata}
 */
type InferSchemaInput<T extends AnySchema> = T extends StandardSchemaV1<infer UInput, any> ? UInput : never;
/**
 * Infers the output type of a schema.
 *
 * @see {@link https://orpc.dev/docs/metadata | Metadata}
 */
type InferSchemaOutput<T extends AnySchema> = T extends StandardSchemaV1<any, infer UOutput> ? UOutput : never;
type MergedSchema<T extends AnySchema, U extends AnySchema> = T extends Schema<infer TInput, infer TOutput> ? U extends Schema<infer UInput, infer UOutput> ? Schema<TInput & UInput, TOutput & UOutput> : never : never;
interface ErrorMapItem {
  /**
   * Default message, can be overridden when constructing an error.
   */
  message?: undefined | string;
  /**
   * Schema used to type and validate the error data.
   */
  data?: undefined | AnySchema;
}
/**
 * Map of error codes to their definitions, as passed to `.errors(...)`.
 * Errors defined here remain properly typed on the client.
 *
 * @see {@link https://orpc.dev/docs/metadata | Metadata}
 */
type ErrorMap = { [key in ORPCErrorCode]?: ErrorMapItem; };
type ORPCErrorFromErrorMap<TErrorMap extends ErrorMap> = { [K in keyof TErrorMap]: TErrorMap[K] extends ErrorMapItem ? ORPCError<K & ORPCErrorCode, TErrorMap[K]['data'] extends AnySchema ? InferSchemaOutput<TErrorMap[K]['data']> : unknown> : never; }[keyof TErrorMap];
/**
 * Arbitrary metadata attached to a procedure.
 * Middleware, plugins, and tooling can read it later to control behavior.
 *
 * @see {@link https://orpc.dev/docs/metadata | Metadata}
 */
interface Meta {
  [key: PropertyKey]: unknown;
}
interface MetaPluginDefinition<TInputSchema extends AnySchema, TOutputSchema extends AnySchema, TErrorMap extends ErrorMap> {
  __TInputSchema?: {
    type: TInputSchema;
  };
  __TOutputSchema?: {
    type: TOutputSchema;
  };
  __TErrorMap?: {
    type: TErrorMap;
  };
}
/**
 * A metadata plugin passed to `.meta(...)`.
 * Defines how metadata is initialized and merged, and can infer or restrict procedure types.
 *
 * @see {@link https://orpc.dev/docs/metadata | Metadata}
 */
interface MetaPlugin<TInputSchema extends AnySchema, TOutputSchema extends AnySchema, TErrorMap extends ErrorMap> {
  /** This only for types, so it should be optional */
  '~orpc'?: MetaPluginDefinition<TInputSchema, TOutputSchema, TErrorMap> | undefined;
  /** Unique name of the plugin, used for identification. */
  'name': string;
  /**
   * Runs once when this plugin is first added to the builder.
   * Use this to set up initial metadata values.
   */
  'init'?: (meta: Meta) => Meta;
  /**
   * Runs every time metadata is updated.
   * This is called for all plugins in the chain whenever a new plugin is added.
   */
  'apply'?: (meta: Meta) => Meta;
}
/**
 * A `MetaPlugin` with all type parameters relaxed to `any`.
 *
 * @see {@link https://orpc.dev/docs/contract/procedure | Procedure Contract}
 * @see {@link https://orpc.dev/docs/procedure | Procedure}
 */
type AnyMetaPlugin = MetaPlugin<any, any, any>;
interface ProcedureContractDefinition<TInputSchema extends AnySchema, TOutputSchema extends AnySchema, TErrorMap extends ErrorMap> {
  __TInputSchema?: {
    type: TInputSchema;
  };
  __TOutputSchema?: {
    type: TOutputSchema;
  };
  /**
   * Non-serializable should be optional
   */
  inputSchemas?: AnySchema[] | undefined;
  outputSchemas?: AnySchema[] | undefined;
  metaPlugins?: AnyMetaPlugin[] | undefined;
  errorMap: TErrorMap;
  meta: Meta;
}
declare class ProcedureContract<TInputSchema extends AnySchema, TOutputSchema extends AnySchema, TErrorMap extends ErrorMap> {
  '~orpc': ProcedureContractDefinition<TInputSchema, TOutputSchema, TErrorMap>;
  constructor(def: ProcedureContractDefinition<TInputSchema, TOutputSchema, TErrorMap>);
  /**
   * Checks if the given instance satisfies the {@link ProcedureContract} class/interface.
   */
  static [Symbol.hasInstance](instance: unknown): boolean;
}
type AnyProcedureContract = ProcedureContract<any, any, any>;
/**
 * A router contract: a single procedure contract or a nested record of them.
 *
 * @see {@link https://orpc.dev/docs/contract/client-factory | Contract Client Factory}
 */
type RouterContract = AnyProcedureContract | {
  [k: string]: RouterContract;
};
/**
 * Infer the input types for each procedure-contract, preserving the router-contract shape.
 *
 * @see {@link https://orpc.dev/docs/contract/router#infer-router-contract-inputs | Router Contract - Infer Router Contract Inputs}
 */
type InferRouterContractInputs<T extends RouterContract> = T extends ProcedureContract<infer UInputSchema, any, any> ? InferSchemaInput<UInputSchema> : { [K in keyof T]: T[K] extends RouterContract ? InferRouterContractInputs<T[K]> : never; };
//#endregion
//#region ../../node_modules/.store/@orpc+contract@2.0.0-beta.40/node_modules/@orpc/contract/dist/index.d.mts
type MergedErrorMap<T1 extends ErrorMap, T2 extends ErrorMap> = keyof T1 extends never | keyof T2 ? T2 : Omit<T1, keyof T2> & T2;
/**
 * The contract builder variant returned after both `.input` and `.output`
 * are called. It is already a complete procedure contract that can still be
 * refined.
 *
 * @see {@link https://orpc.dev/docs/contract/procedure | Procedure Contract}
 */
interface ProcedureContractBuilderWithInputOutput<TInputSchema extends AnySchema, TOutputSchema extends AnySchema, TErrorMap extends ErrorMap> extends ProcedureContract<TInputSchema, TOutputSchema, TErrorMap> {
  /**
   * Applies metadata plugins to contracts built from this builder.
   *
   * @see {@link https://orpc.dev/docs/contract/procedure#metadata | Procedure Contract - Metadata}
   */
  meta(...plugins: MetaPlugin<TInputSchema, TOutputSchema, TErrorMap>[]): ProcedureContractBuilderWithInputOutput<TInputSchema, TOutputSchema, TErrorMap>;
  /**
   * Defines typesafe errors that implementations of this contract can throw.
   *
   * @see {@link https://orpc.dev/docs/contract/procedure#typesafe-errors | Procedure Contract - Typesafe Errors}
   */
  errors<T extends ErrorMap>(errors: T): ProcedureContractBuilderWithInputOutput<TInputSchema, TOutputSchema, MergedErrorMap<TErrorMap, T>>;
  /**
   * Adds an additional input schema, merged with the previously defined one.
   *
   * @see {@link https://orpc.dev/docs/contract/procedure#multiple-schemas | Procedure Contract - Multiple Schemas}
   */
  input<T extends AnySchema>(schema: T): ProcedureContractBuilderWithInputOutput<MergedSchema<T, TInputSchema>, TOutputSchema, TErrorMap>;
  /**
   * Adds an additional output schema, merged with the previously defined one.
   *
   * @see {@link https://orpc.dev/docs/contract/procedure#multiple-schemas | Procedure Contract - Multiple Schemas}
   */
  output<T extends AnySchema>(schema: T): ProcedureContractBuilderWithInputOutput<TInputSchema, MergedSchema<T, TOutputSchema>, TErrorMap>;
}
type ProcedureContractClient<TClientContext extends ClientContext, TInputSchema extends AnySchema, TOutputSchema extends AnySchema, TErrorMap extends ErrorMap> = Client<TClientContext, InferSchemaInput<TInputSchema>, InferSchemaOutput<TOutputSchema>, ORPCErrorFromErrorMap<TErrorMap> | ThrowableError>;
/**
 * Client type inferred from a router contract, preserving its shape.
 * Useful for typing a client without importing the server router.
 *
 * @see {@link https://orpc.dev/docs/client/client-side | Client-Side Clients}
 */
type RouterContractClient<TRouter extends RouterContract, TClientContext extends ClientContext = object> = TRouter extends ProcedureContract<infer UInputSchema, infer UOutputSchema, infer UErrorMap> ? ProcedureContractClient<TClientContext, UInputSchema, UOutputSchema, UErrorMap> : { [K in keyof TRouter]: TRouter[K] extends RouterContract ? RouterContractClient<TRouter[K], TClientContext> : never; };
//#endregion
//#region ../protocol/dist/index.d.mts
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
//#region ../protocol/dist/contract.d.mts
declare const ingestContract: {
  runs: {
    start: ProcedureContractBuilderWithInputOutput<z.ZodObject<{
      ciRunId: z.ZodString;
      shard: z.ZodNullable<z.ZodObject<{
        current: z.ZodNumber;
        total: z.ZodNumber;
      }, z.core.$strip>>;
      expectedTests: z.ZodNumber;
      startedAt: z.ZodString;
      executor: z.ZodEnum<{
        ci: "ci";
        local: "local";
      }>;
      environment: z.ZodOptional<z.ZodString>;
      tags: z.ZodArray<z.ZodString>;
      git: z.ZodObject<{
        branch: z.ZodOptional<z.ZodString>;
        sha: z.ZodOptional<z.ZodString>;
        shortSha: z.ZodOptional<z.ZodString>;
        message: z.ZodOptional<z.ZodString>;
        authorName: z.ZodOptional<z.ZodString>;
        authorEmail: z.ZodOptional<z.ZodString>;
        repoUrl: z.ZodOptional<z.ZodString>;
        prNumber: z.ZodOptional<z.ZodNumber>;
        prUrl: z.ZodOptional<z.ZodString>;
        prTitle: z.ZodOptional<z.ZodString>;
      }, z.core.$strip>;
      ci: z.ZodObject<{
        provider: z.ZodOptional<z.ZodString>;
        buildUrl: z.ZodOptional<z.ZodString>;
        buildNumber: z.ZodOptional<z.ZodString>;
        job: z.ZodOptional<z.ZodString>;
      }, z.core.$strip>;
      system: z.ZodObject<{
        os: z.ZodOptional<z.ZodString>;
        osRelease: z.ZodOptional<z.ZodString>;
        arch: z.ZodOptional<z.ZodString>;
        cpus: z.ZodOptional<z.ZodNumber>;
        memoryBytes: z.ZodOptional<z.ZodNumber>;
        node: z.ZodOptional<z.ZodString>;
        hostname: z.ZodOptional<z.ZodString>;
        timezone: z.ZodOptional<z.ZodString>;
      }, z.core.$strip>;
      playwright: z.ZodObject<{
        version: z.ZodOptional<z.ZodString>;
        workers: z.ZodOptional<z.ZodNumber>;
        configFile: z.ZodOptional<z.ZodString>;
        projects: z.ZodArray<z.ZodObject<{
          name: z.ZodString;
          browserName: z.ZodOptional<z.ZodString>;
          viewport: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            width: z.ZodNumber;
            height: z.ZodNumber;
          }, z.core.$strip>>>;
          retries: z.ZodNumber;
          timeout: z.ZodNumber;
          baseURL: z.ZodOptional<z.ZodString>;
          headless: z.ZodOptional<z.ZodBoolean>;
        }, z.core.$strip>>;
      }, z.core.$strip>;
    }, z.core.$strip>, z.ZodObject<{
      runId: z.ZodString;
      runNumber: z.ZodNumber;
      shardIndex: z.ZodNumber;
      url: z.ZodString;
    }, z.core.$strip>, object>;
    events: ProcedureContractBuilderWithInputOutput<z.ZodObject<{
      shardIndex: z.ZodNumber;
      events: z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
        seq: z.ZodNumber;
        type: z.ZodLiteral<"test.begin">;
        testKey: z.ZodString;
        pwTestId: z.ZodString;
        title: z.ZodString;
        titlePath: z.ZodArray<z.ZodString>;
        file: z.ZodString;
        line: z.ZodNumber;
        column: z.ZodNumber;
        project: z.ZodString;
        tags: z.ZodArray<z.ZodString>;
        annotations: z.ZodArray<z.ZodObject<{
          type: z.ZodString;
          description: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        expectedStatus: z.ZodEnum<{
          failed: "failed";
          interrupted: "interrupted";
          passed: "passed";
          skipped: "skipped";
          timedOut: "timedOut";
        }>;
        retries: z.ZodNumber;
        retry: z.ZodNumber;
        workerIndex: z.ZodNumber;
        startedAt: z.ZodString;
      }, z.core.$strip>, z.ZodObject<{
        seq: z.ZodNumber;
        type: z.ZodLiteral<"attempt.end">;
        testKey: z.ZodString;
        retry: z.ZodNumber;
        status: z.ZodEnum<{
          failed: "failed";
          interrupted: "interrupted";
          passed: "passed";
          skipped: "skipped";
          timedOut: "timedOut";
        }>;
        durationMs: z.ZodNumber;
        startedAt: z.ZodString;
        workerIndex: z.ZodNumber;
        parallelIndex: z.ZodNumber;
        errors: z.ZodArray<z.ZodObject<{
          message: z.ZodOptional<z.ZodString>;
          stack: z.ZodOptional<z.ZodString>;
          value: z.ZodOptional<z.ZodString>;
          snippet: z.ZodOptional<z.ZodString>;
          location: z.ZodOptional<z.ZodObject<{
            file: z.ZodString;
            line: z.ZodNumber;
            column: z.ZodNumber;
          }, z.core.$strip>>;
        }, z.core.$strip>>;
        steps: z.ZodArray<z.ZodObject<{
          title: z.ZodString;
          category: z.ZodString;
          durationMs: z.ZodNumber;
          depth: z.ZodNumber;
          startedAt: z.ZodString;
          error: z.ZodOptional<z.ZodString>;
          location: z.ZodOptional<z.ZodObject<{
            file: z.ZodString;
            line: z.ZodNumber;
            column: z.ZodNumber;
          }, z.core.$strip>>;
        }, z.core.$strip>>;
        stdout: z.ZodString;
        stderr: z.ZodString;
        annotations: z.ZodArray<z.ZodObject<{
          type: z.ZodString;
          description: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        attachments: z.ZodArray<z.ZodObject<{
          id: z.ZodString;
          name: z.ZodString;
          contentType: z.ZodString;
          size: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>;
        outcome: z.ZodEnum<{
          expected: "expected";
          flaky: "flaky";
          skipped: "skipped";
          unexpected: "unexpected";
        }>;
        isFinal: z.ZodBoolean;
      }, z.core.$strip>, z.ZodObject<{
        seq: z.ZodNumber;
        type: z.ZodLiteral<"run.log">;
        level: z.ZodEnum<{
          error: "error";
          info: "info";
          warn: "warn";
        }>;
        message: z.ZodString;
      }, z.core.$strip>], "type">>;
      runId: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
      accepted: z.ZodNumber;
      lastSeq: z.ZodNumber;
    }, z.core.$strip>, object>;
    heartbeat: ProcedureContractBuilderWithInputOutput<z.ZodObject<{
      shardIndex: z.ZodNumber;
      runId: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
      runStatus: z.ZodEnum<{
        failed: "failed";
        incomplete: "incomplete";
        interrupted: "interrupted";
        passed: "passed";
        running: "running";
        timedout: "timedout";
      }>;
    }, z.core.$strip>, object>;
    finish: ProcedureContractBuilderWithInputOutput<z.ZodObject<{
      shardIndex: z.ZodNumber;
      status: z.ZodEnum<{
        failed: "failed";
        interrupted: "interrupted";
        passed: "passed";
        timedout: "timedout";
      }>;
      durationMs: z.ZodNumber;
      finishedAt: z.ZodString;
      runId: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
      runStatus: z.ZodEnum<{
        failed: "failed";
        incomplete: "incomplete";
        interrupted: "interrupted";
        passed: "passed";
        running: "running";
        timedout: "timedout";
      }>;
      url: z.ZodString;
    }, z.core.$strip>, object>;
  };
  attachments: {
    uploadUrls: ProcedureContractBuilderWithInputOutput<z.ZodObject<{
      attachmentIds: z.ZodArray<z.ZodString>;
      runId: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
      uploads: z.ZodArray<z.ZodObject<{
        attachmentId: z.ZodString;
        strategy: z.ZodEnum<{
          presigned: "presigned";
          proxy: "proxy";
        }>;
        method: z.ZodLiteral<"PUT">;
        url: z.ZodString;
        headers: z.ZodRecord<z.ZodString, z.ZodString>;
      }, z.core.$strip>>;
    }, z.core.$strip>, object>;
    complete: ProcedureContractBuilderWithInputOutput<z.ZodObject<{
      size: z.ZodOptional<z.ZodNumber>;
      runId: z.ZodString;
      attachmentId: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
      ok: z.ZodBoolean;
    }, z.core.$strip>, object>;
  };
};
type IngestContract = typeof ingestContract;
//#endregion
//#endregion
//#region src/client.d.ts
/** A non-2xx answer from the server, with its status. */
export declare class HttpError extends ORPCError<string, {
  status: number;
}> {
  readonly status: number;
  constructor(status: number, message: string);
}
/** What each call can say about its own retries and timeout. */
export interface CallContext extends RetryLinkPluginContext {
  /** Aborts the call, retries included, after this long. */
  timeoutMs?: number;
}
/** The ingest API, typed from its contract. */
export type IngestApi = RouterContractClient<IngestContract, CallContext>;
type Inputs = InferRouterContractInputs<IngestContract>;
/** What a client of the ingest API needs to know. */
export type IngestApiOptions = Pick<ResolvedOptions, 'serverUrl' | 'token' | 'maxRetries'>;
/**
 * The typed ingest API: `api.runs.start(…)`, `api.runs.events({ runId, … })`.
 * Retries what can be retried (network errors, 5xx, 408, 429) up to
 * `maxRetries` times with exponential backoff; a call can override it with
 * `{ context: { retry, timeoutMs } }`.
 */
export declare function createIngestApi(opts: IngestApiOptions, log?: (msg: string) => void): IngestApi;
/**
 * The reporter's side of the ingest API. Calls go through the typed client;
 * this class adds the per-call policy (the heartbeat's single attempt) and the
 * attachment upload, which goes to whatever URL the server handed out.
 */
export declare class IngestClient {
  private readonly opts;
  readonly api: IngestApi;
  constructor(opts: ResolvedOptions, log: (msg: string) => void);
  startRun(body: Inputs['runs']['start']): PromiseWithError<{
    runId: string;
    runNumber: number;
    shardIndex: number;
    url: string;
  }, Error>;
  sendEvents(runId: string, body: Omit<Inputs['runs']['events'], 'runId'>): PromiseWithError<{
    accepted: number;
    lastSeq: number;
  }, Error>;
  uploadUrls(runId: string, attachmentIds: string[]): PromiseWithError<{
    uploads: {
      attachmentId: string;
      strategy: "presigned" | "proxy";
      method: "PUT";
      url: string;
      headers: Record<string, string>;
    }[];
  }, Error>;
  completeUpload(runId: string, attachmentId: string, size: number): PromiseWithError<{
    ok: boolean;
  }, Error>;
  finishRun(runId: string, body: Omit<Inputs['runs']['finish'], 'runId'>): PromiseWithError<{
    runStatus: "failed" | "incomplete" | "interrupted" | "passed" | "running" | "timedout";
    url: string;
  }, Error>;
  /** One attempt, bounded: the next beat is the retry. */
  heartbeat(runId: string, body: Omit<Inputs['runs']['heartbeat'], 'runId'>): PromiseWithError<{
    runStatus: "failed" | "incomplete" | "interrupted" | "passed" | "running" | "timedout";
  }, Error>;
  /**
   * Not part of the contract: the target is the app's proxy route or a
   * presigned storage URL, as the upload instruction says.
   */
  upload(instruction: UploadInstruction, source: {
    path?: string;
    body?: Buffer;
  }, contentType: string): Promise<number>;
}
//#endregion
//# sourceMappingURL=client.d.cts.map