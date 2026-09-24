import { describe, expect, it } from 'vitest';
import { connectionOptions, normalizeRepoUrl } from './context';

describe('normalizeRepoUrl', () => {
  it('reduces ssh, https and git+ remotes to one form', () => {
    for (const url of ['git@github.com:Acme/App.git', 'https://github.com/acme/app', 'https://user@github.com/acme/app.git/', 'git+ssh://git@github.com/acme/app.git']) {
      expect(normalizeRepoUrl(url)).toBe('github.com/acme/app');
    }
  });

  it('keeps a port as part of the host', () => {
    expect(normalizeRepoUrl('ssh://git@gitlab.example.com:2222/team/app.git')).toBe('gitlab.example.com:2222/team/app');
  });
});

describe('connectionOptions', () => {
  it('reads the default project and toolsets from the query or headers', () => {
    expect(connectionOptions(new Request('http://x/api/mcp?project=acme/web&toolsets=core'))).toMatchObject({ defaultProject: 'acme/web', toolsets: ['core'] });
    const fromHeaders = connectionOptions(
      new Request('http://x/api/mcp', { headers: { 'x-pw-reporter-project': 'acme/api', 'x-pw-reporter-repo': 'git@github.com:acme/api.git' } }),
    );
    expect(fromHeaders).toMatchObject({ defaultProject: 'acme/api', repo: 'git@github.com:acme/api.git', toolsets: ['core', 'debug'] });
  });

  it('ignores unknown toolsets and never grants write through the URL', () => {
    expect(connectionOptions(new Request('http://x/api/mcp?toolsets=write,bogus')).toolsets).toEqual(['core', 'debug']);
  });
});
