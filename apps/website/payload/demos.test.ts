import { describe, expect, it } from 'vitest';
import { DEMO_URLS, DEMOS, demoOptions } from './demos';

/**
 * `payload/demos.ts` is the single source for the CMS select, the browser-frame
 * URLs and (through `Record<DemoKey, …>`) the renderer map. The type system
 * covers the renderer map; these keep the data lists honest.
 */
describe('demo registry', () => {
  it('offers every demo as a select option, in declaration order', () => {
    expect(demoOptions.map((option) => option.value)).toEqual(Object.keys(DEMOS));
  });

  it('labels every option', () => {
    for (const option of demoOptions) {
      expect(option.label, option.value).toBeTruthy();
    }
  });

  it('has a frame URL for every demo and no others', () => {
    expect(Object.keys(DEMO_URLS).sort()).toEqual(Object.keys(DEMOS).sort());
  });
});
