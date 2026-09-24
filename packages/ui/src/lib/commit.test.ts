import { describe, expect, it } from 'vitest';
import { commitTitle } from './commit';

describe('commitTitle', () => {
  it('uses the first line of the message', () => {
    expect(commitTitle({ gitMessage: 'Add footer\n\nLonger body', gitShortSha: 'abc1234' })).toEqual({ text: 'Add footer', muted: false });
  });

  it('names the commit by its hash when no message was reported', () => {
    expect(commitTitle({ gitMessage: null, gitShortSha: '6ef52e9' })).toEqual({ text: 'Commit 6ef52e9', muted: true });
    expect(commitTitle({ gitMessage: '  ', gitShortSha: '6ef52e9' }).text).toBe('Commit 6ef52e9');
  });

  it('says so when there is no commit at all', () => {
    expect(commitTitle({ gitMessage: null, gitShortSha: null })).toEqual({ text: 'No commit information', muted: true });
  });
});
