import { describe, expect, it } from 'vitest';
import { artifactsLine, executorLine, isCiFlagOnly, uncommittedLabel, workingTreeLine } from './provenance';

describe('provenance', () => {
  it('flags a CI label that only a CI variable backs, for new and old runs alike', () => {
    expect(isCiFlagOnly({ executor: 'ci', ciProvider: 'unknown', executorDetectedBy: 'ci-env' })).toBe(true);
    expect(isCiFlagOnly({ executor: 'ci', ciProvider: 'unknown' })).toBe(true);
    expect(isCiFlagOnly({ executor: 'ci', ciProvider: 'unknown', executorDetectedBy: 'option' })).toBe(false);
    expect(isCiFlagOnly({ executor: 'ci', ciProvider: 'github-actions', executorDetectedBy: 'provider' })).toBe(false);
    expect(isCiFlagOnly({ executor: 'local', ciProvider: null })).toBe(false);
  });

  it('describes the working tree only when the reporter said', () => {
    expect(workingTreeLine({ executor: 'local', ciProvider: null }, 'abc1234')).toBeNull();
    expect(workingTreeLine({ executor: 'local', ciProvider: null, dirty: false, dirtyFiles: 0 }, 'abc1234')).toBe('clean at abc1234');
    expect(workingTreeLine({ executor: 'local', ciProvider: null, dirty: true, dirtyFiles: 3 }, 'abc1234')).toBe(
      '3 uncommitted files at abc1234 — results may not match the commit',
    );
    expect(uncommittedLabel({ executor: 'local', ciProvider: null, dirty: true, dirtyFiles: 1 })).toBe('Uncommitted changes (1 file)');
    expect(uncommittedLabel({ executor: 'local', ciProvider: null, dirty: false })).toBeNull();
    expect(uncommittedLabel({ executor: 'local', ciProvider: null })).toBeNull();
  });

  it('says how the executor was decided', () => {
    expect(executorLine({ executor: 'ci', ciProvider: 'unknown', executorDetectedBy: 'ci-env' })).toBe('ci (CI flag set, provider unknown)');
    expect(executorLine({ executor: 'local', ciProvider: null, executorDetectedBy: 'option' })).toBe('local (set explicitly by the reporter option)');
    expect(executorLine({ executor: 'local', ciProvider: null })).toBe('local');
  });

  it('summarises artifact uploads and missing review images', () => {
    const none = { total: 0, uploaded: 0, pending: 0, failed: 0, expired: 0, reviewCaptures: 0, reviewCapturesMissing: 0 };
    expect(artifactsLine(none)).toBeNull();
    expect(artifactsLine({ ...none, total: 42, uploaded: 42 })).toBe('42 uploaded');
    expect(artifactsLine({ ...none, total: 44, uploaded: 42, failed: 2, reviewCaptures: 12, reviewCapturesMissing: 1 })).toBe(
      '42 uploaded, 2 failed; 1 of 12 review images missing',
    );
  });
});
