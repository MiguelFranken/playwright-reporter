import { register } from 'node:module';

/**
 * `@workflow/vitest` builds its step bundle from every file under the app,
 * `vitest.config.ts` and the test files included. Following their imports it
 * reaches `@workflow/builders/dist/serde-checker.js`, whose regex source looks
 * like a serializable class to the SDK's discovery, so the checker lands in the
 * *runtime* bundle — with its dependency `builtin-modules`, which does
 * `import list from './builtin-modules.json'`. The bundle keeps that import
 * external and without `with { type: 'json' }`, and Node 24's native loader
 * (which runs the bundle, not Vite) rejects it: ERR_IMPORT_ATTRIBUTE_MISSING.
 *
 * Next's builder only scans the app's sources, so production bundles are not
 * affected. Until the SDK stops treating its own checker as user code, this
 * hook gives an attribute-less JSON import the attribute it needs, in the
 * workflow test workers only.
 */
const hook = `
export async function load(url, context, nextLoad) {
  if (url.startsWith('file:') && url.endsWith('.json') && !context.importAttributes?.type) {
    return nextLoad(url, { ...context, importAttributes: { ...context.importAttributes, type: 'json' } });
  }
  return nextLoad(url, context);
}`;

register(`data:text/javascript,${encodeURIComponent(hook)}`);
