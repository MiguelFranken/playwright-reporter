/**
 * The S3 stub for the integration run, once per `vitest run`: a LocalStack
 * container serving only S3, so the S3 adapter is tested against the real
 * S3 API without an AWS account. Buckets are made by the test files
 * themselves, one each, so parallel workers never see each other's objects.
 *
 * `TEST_S3_ENDPOINT` points the suite at a stub that is already running
 * instead (CI starts one as a service container). Without either — no Docker
 * locally — the S3 suites are skipped with a notice; on CI that is an error.
 */
const IMAGE = process.env.TEST_S3_IMAGE ?? 'localstack/localstack:4.14.0';
/**
 * S3 only, and checking signatures the way S3 does: LocalStack otherwise
 * accepts a presigned upload whatever headers it sends.
 */
const STUB_ENV = { SERVICES: 's3', S3_SKIP_SIGNATURE_VALIDATION: '0' };

declare module 'vitest' {
  interface ProvidedContext {
    /** The S3 stub's endpoint, or `null` when none could be started. */
    testS3: { endpoint: string } | null;
  }
}

type StartedContainer = { getConnectionUri(): string; stop(): Promise<unknown> };

async function startContainer(): Promise<StartedContainer> {
  const { LocalstackContainer } = await import('@testcontainers/localstack');
  return new LocalstackContainer(IMAGE).withEnvironment(STUB_ENV).start();
}

type Provide = <K extends 'testS3'>(key: K, value: { endpoint: string } | null) => void;

export default async function setup({ provide }: { provide: Provide }) {
  let container: StartedContainer | undefined;
  let endpoint = process.env.TEST_S3_ENDPOINT?.replace(/\/+$/, '');
  if (!endpoint) {
    try {
      container = await startContainer();
      endpoint = container.getConnectionUri();
    } catch (error) {
      const reason = `Could not start the S3 stub (${IMAGE}): ${(error as Error).message}`;
      if (process.env.CI) throw new Error(reason);
      console.warn(
        `\n${reason}\nThe S3 storage tests are skipped. Start Docker, or run a stub yourself:\n` +
          `  docker run -d -p 4566:4566 -e SERVICES=s3 -e S3_SKIP_SIGNATURE_VALIDATION=0 ${IMAGE}\n` +
          '  TEST_S3_ENDPOINT=http://localhost:4566 nub run test:integration\n',
      );
    }
  }
  provide('testS3', endpoint ? { endpoint } : null);

  return async () => {
    await container?.stop();
  };
}
