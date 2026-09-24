// semantic-release, run by .github/workflows/release.yml after the reporter is
// built. It reads the Conventional Commits since the last tag, publishes
// @miguelfranken/reporter to GitHub Packages and commits the version bump and
// CHANGELOG.md back, together with a tag and a GitHub release.

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
      prepareCmd: 'npm pkg set version=${nextRelease.version} --workspace=packages/reporter',
      // The registry comes from publishConfig; the workflow provides the token.
      publishCmd: 'npm publish ./packages/reporter --tag ${nextRelease.channel || "latest"}',
    }],
    ['@semantic-release/git', {
      assets: ['CHANGELOG.md', 'packages/reporter/package.json'],
      message: 'chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
    }],
    ['@semantic-release/github', {
      successComment: false,
      failComment: false,
      releasedLabels: false,
    }],
  ],
}
