/**
 * The S3 stub for the integration run, once per `vitest run`: a RustFS
 * container, an Apache-2.0 S3-compatible server, so the S3 adapter is tested
 * against the real S3 API without an AWS account. RustFS checks request
 * signatures the way S3 does, so a presigned upload with tampered headers is
 * refused here too. Buckets are made by the test files themselves, one each,
 * so parallel workers never see each other's objects.
 *
 * `TEST_S3_ENDPOINT` points the suite at a stub that is already running
 * instead (CI starts one as a service container), with `TEST_S3_ACCESS_KEY_ID`
 * and `TEST_S3_SECRET_ACCESS_KEY` if it was started with other credentials.
 * Without either — no Docker locally — the S3 suites are skipped with a
 * notice; on CI that is an error.
 */
const IMAGE = process.env.TEST_S3_IMAGE ?? 'rustfs/rustfs:1.0.0';
const PORT = 9000;

export interface TestS3 {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
}

declare module 'vitest' {
  interface ProvidedContext {
    /** The S3 stub, or `null` when none could be started. */
    testS3: TestS3 | null;
  }
}

const credentials = {
  accessKeyId: process.env.TEST_S3_ACCESS_KEY_ID ?? 'pwr-test-access-key',
  secretAccessKey: process.env.TEST_S3_SECRET_ACCESS_KEY ?? 'pwr-test-secret-key',
};

type StartedContainer = { getHost(): string; getMappedPort(port: number): number; stop(): Promise<unknown> };

async function startContainer(): Promise<StartedContainer> {
  const { GenericContainer, Wait } = await import('testcontainers');
  return new GenericContainer(IMAGE)
    .withEnvironment({ RUSTFS_ACCESS_KEY: credentials.accessKeyId, RUSTFS_SECRET_KEY: credentials.secretAccessKey })
    .withExposedPorts(PORT)
    .withWaitStrategy(Wait.forHttp('/health/ready', PORT).forStatusCode(200))
    .start();
}

type Provide = <K extends 'testS3'>(key: K, value: TestS3 | null) => void;

export default async function setup({ provide }: { provide: Provide }) {
  let container: StartedContainer | undefined;
  let endpoint = process.env.TEST_S3_ENDPOINT?.replace(/\/+$/, '');
  if (!endpoint) {
    try {
      container = await startContainer();
      endpoint = `http://${container.getHost()}:${container.getMappedPort(PORT)}`;
    } catch (error) {
      const reason = `Could not start the S3 stub (${IMAGE}): ${(error as Error).message}`;
      if (process.env.CI) throw new Error(reason);
      console.warn(
        `\n${reason}\nThe S3 storage tests are skipped. Start Docker, or run a stub yourself:\n` +
          `  docker run -d -p 9000:9000 -e RUSTFS_ACCESS_KEY=${credentials.accessKeyId} -e RUSTFS_SECRET_KEY=${credentials.secretAccessKey} ${IMAGE}\n` +
          '  TEST_S3_ENDPOINT=http://localhost:9000 nub run test:integration\n',
      );
    }
  }
  provide('testS3', endpoint ? { endpoint, ...credentials } : null);

  return async () => {
    await container?.stop();
  };
}
