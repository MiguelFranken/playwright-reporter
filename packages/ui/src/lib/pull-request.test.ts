import { describe, expect, it } from 'vitest';
import { isMergeRequest, pullRequestNoun, pullRequestRef } from './pull-request';

describe('pullRequestRef', () => {
  it('writes a GitLab merge request with a bang', () => {
    expect(pullRequestRef(1524, 'https://gitlab.example/mop/app/-/merge_requests/1524')).toBe('!1524');
    expect(pullRequestNoun('https://gitlab.example/mop/app/-/merge_requests/1524')).toBe('Merge request');
  });

  it('writes anything else, or no link at all, with a hash', () => {
    expect(pullRequestRef(9, 'https://github.com/acme/app/pull/9')).toBe('#9');
    expect(pullRequestRef(9, null)).toBe('#9');
    expect(isMergeRequest(undefined)).toBe(false);
    expect(pullRequestNoun(null)).toBe('Pull request');
  });
});
