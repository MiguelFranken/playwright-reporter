import { CopyButton } from '../../patterns/copy-button';

const CONFIG_SNIPPET = `reporter: [
  ['list'],
  ['@miguelfranken/reporter', { token: process.env.PW_REPORTER_TOKEN, serverUrl: process.env.PW_REPORTER_URL }],
],`;

export function ReporterSetup({ baseUrl }: { baseUrl: string }) {
  const envSnippet = `PW_REPORTER_URL=${baseUrl}\nPW_REPORTER_TOKEN=pwr_…`;
  return (
    <div className="flex flex-col gap-4 text-sm">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <p className="font-medium">
            1. Add the reporter to <code className="rounded bg-muted px-1 py-0.5 text-code-s">playwright.config.ts</code>
          </p>
          <CopyButton value={CONFIG_SNIPPET} label="Copy config snippet" successMessage="Config snippet copied" />
        </div>
        <CodeBlock code={CONFIG_SNIPPET} />
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <p className="font-medium">2. Set the environment variables</p>
          <CopyButton value={envSnippet} label="Copy env vars" successMessage="Env vars copied" />
        </div>
        <CodeBlock code={envSnippet} />
        <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
          <EnvRow name="PW_REPORTER_URL" required>
            Base URL of this server (<code className="font-mono">{baseUrl}</code>).
          </EnvRow>
          <EnvRow name="PW_REPORTER_TOKEN" required>
            An API token generated above.
          </EnvRow>
          <EnvRow name="PW_REPORTER_CI_RUN_ID">Stable id shared by all shards of one CI run; defaults to the CI provider's run id.</EnvRow>
          <EnvRow name="PW_REPORTER_TAGS">Comma-separated run tags, e.g. <code className="font-mono">smoke,nightly</code>.</EnvRow>
          <EnvRow name="PW_REPORTER_ENVIRONMENT">Environment label shown on runs, e.g. <code className="font-mono">staging</code>.</EnvRow>
        </dl>
      </div>
    </div>
  );
}

function EnvRow({ name, required, children }: { name: string; required?: boolean; children: React.ReactNode }) {
  return (
    <>
      <dt className="font-mono">
        {name}
        {required ? <span className="ml-1 text-destructive">*</span> : <span className="ml-1 text-muted-foreground">(optional)</span>}
      </dt>
      <dd className="text-muted-foreground">{children}</dd>
    </>
  );
}

function CodeBlock({ code }: { code: string }) {
  return (
    <pre tabIndex={0} className="overflow-x-auto rounded-md border bg-muted/50 p-3 text-code-s focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
      <code>{code}</code>
    </pre>
  );
}
