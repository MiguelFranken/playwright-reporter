import { describe, expect, it } from 'vitest';
import { TRACE_VIEWER_PATH, traceViewerUrl } from './url';

describe('traceViewerUrl', () => {
  it('opens a same-origin artifact path in the self-hosted viewer', () => {
    expect(traceViewerUrl('/api/artifacts/abc')).toBe('/trace/index.html?trace=%2Fapi%2Fartifacts%2Fabc');
  });

  it('builds an absolute link, keeping a signed URL intact', () => {
    const signed = 'https://app.test/api/artifacts/abc?exp=1&sig=x-y_z';
    const url = new URL(traceViewerUrl(signed, 'https://app.test'));
    expect(url.origin + url.pathname).toBe(`https://app.test${TRACE_VIEWER_PATH}`);
    expect(url.searchParams.get('trace')).toBe(signed);
  });
});
