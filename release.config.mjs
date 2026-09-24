// semantic-release, run by .github/workflows/release.yml after the published
// packages are built. It reads the Conventional Commits since the last tag,
// publishes @miguelfranken/reporter and @miguelfranken/mcp to GitHub Packages
// and commits the version bumps and CHANGELOG.md back, together with a tag and
// a GitHub release. Both packages share one version (lockstep): one tag, one
// changelog, and the reporter's release flow unchanged.

/** @type {import('semantic-release').GlobalConfig} */
export default {
  branches: ['main'],
  plugins: [
    ['@semantic-release/commit-analyzer', {
      preset: 'conventionalcommits',
      // While on 0.x: breaking changes bump the minor version, features and
      // fixes the patch version, so `^0.x.y` ranges only pick up compatible
      // releases. Remove the first two rules to release 1.0.0 with the next
      // breaking change.
      releaseRules: [
        { breaking: true, release: 'minor' },
        { type: 'feat', release: 'patch' },
      ],
    }],
    ['@semantic-release/release-notes-generator', {
      preset: 'conventionalcommits',
      presetConfig: {
        types: [
          { type: 'feat', section: 'Features' },
          { type: 'fix', section: 'Bug Fixes' },
          { type: 'perf', section: 'Performance Improvements' },
          { type: 'revert', section: 'Reverts' },
        ],
      },
    }],
    ['@semantic-release/changelog', { changelogTitle: '# Changelog' }],
    ['@semantic-release/exec', {
      // The MCP bridge stamps its version into dist at build time (its User-Agent), so it is rebuilt after the bump.
      prepareCmd: [
        'npm pkg set version=${nextRelease.version} --workspace=packages/reporter --workspace=packages/mcp',
        'npm run build --workspace=packages/mcp',
      ].join(' && '),
      // The registry comes from each publishConfig; the workflow provides the token. The reporter goes first: npm has
      // no multi-package transaction, so if the bridge's publish fails the run stops with the reporter already out,
      // and that version of @miguelfranken/mcp has to be published by hand before the next release.
      publishCmd: [
        'npm publish ./packages/reporter --tag ${nextRelease.channel || "latest"}',
        'npm publish ./packages/mcp --tag ${nextRelease.channel || "latest"}',
      ].join(' && '),
    }],
    ['@semantic-release/git', {
      assets: ['CHANGELOG.md', 'packages/reporter/package.json', 'packages/mcp/package.json'],
      message: 'chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
    }],
    ['@semantic-release/github', {
      successComment: false,
      failComment: false,
      releasedLabels: false,
    }],
  ],
}
