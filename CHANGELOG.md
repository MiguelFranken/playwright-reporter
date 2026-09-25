# Changelog

## [0.0.16](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.15...v0.0.16) (2026-09-25)

### Performance Improvements

* **web:** cut proxy invocations, runs-page queries and unneeded builds ([#21](https://github.com/MiguelFranken/playwright-reporter/issues/21)) ([f003add](https://github.com/MiguelFranken/playwright-reporter/commit/f003add78f9c1ec0043e8045b63fe1d9068c4d12))

## [0.0.15](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.14...v0.0.15) (2026-09-24)

### Bug Fixes

* **mcp:** rank a test once in project_health's fix-first list ([#19](https://github.com/MiguelFranken/playwright-reporter/issues/19)) ([b875c54](https://github.com/MiguelFranken/playwright-reporter/commit/b875c542e99b0c61b63efe9a668d0be74f3ceb49))

## [0.0.14](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.13...v0.0.14) (2026-09-24)

### Features

* an MCP server so AI assistants can read test results and debug failures ([#18](https://github.com/MiguelFranken/playwright-reporter/issues/18)) ([257fff0](https://github.com/MiguelFranken/playwright-reporter/commit/257fff01376a783a72aa1820a8af99e55efa2aff))

## [0.0.13](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.12...v0.0.13) (2026-09-24)

### Features

* a live demo with passwordless viewer sign-in and a scheduled suite that feeds it ([#17](https://github.com/MiguelFranken/playwright-reporter/issues/17)) ([920ac73](https://github.com/MiguelFranken/playwright-reporter/commit/920ac73b575ed6e477106cce73260fc31c61e9f3))

## [0.0.12](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.11...v0.0.12) (2026-09-24)

### Features

* delete expired test artifacts by a retention policy superadmins configure ([#15](https://github.com/MiguelFranken/playwright-reporter/issues/15)) ([39d70c9](https://github.com/MiguelFranken/playwright-reporter/commit/39d70c993cc8b596474abac4e1ff02493b6fa674))

## [0.0.11](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.10...v0.0.11) (2026-09-24)

### Features

* add a branches page and a page per branch with its runs and trends ([#13](https://github.com/MiguelFranken/playwright-reporter/issues/13)) ([c7b695e](https://github.com/MiguelFranken/playwright-reporter/commit/c7b695e8b288ea5469b94bd162f0f56dd42a8ec4))

## [0.0.10](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.9...v0.0.10) (2026-09-24)

### Features

* browser push notifications when a run starts or finishes ([#12](https://github.com/MiguelFranken/playwright-reporter/issues/12)) ([9219ff8](https://github.com/MiguelFranken/playwright-reporter/commit/9219ff8ca2d6f18adf8c3c39fb450349c19afb35))

## [0.0.9](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.8...v0.0.9) (2026-09-24)

### Features

* close runs of dead reporters as abandoned, with a Workflow SDK watchdog ([#9](https://github.com/MiguelFranken/playwright-reporter/issues/9)) ([43eb43f](https://github.com/MiguelFranken/playwright-reporter/commit/43eb43f571db5358a7eebf498dd6d0906503d62b))

## [0.0.8](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.7...v0.0.8) (2026-09-24)

### Features

* make the whole run row clickable, even out badge sizes and list active runs above the filters ([5a1aa7b](https://github.com/MiguelFranken/playwright-reporter/commit/5a1aa7b7ce698516ea6d97e1ae2e8c60f0b71c7c))

### Bug Fixes

* name a run's commit by its hash when no message was reported ([#11](https://github.com/MiguelFranken/playwright-reporter/issues/11)) ([9b554c0](https://github.com/MiguelFranken/playwright-reporter/commit/9b554c06c527472437db3784a1f1b218b4ebe719))

## [0.0.7](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.6...v0.0.7) (2026-09-24)

### Features

* profile images for users and teams ([#10](https://github.com/MiguelFranken/playwright-reporter/issues/10)) ([ee89d44](https://github.com/MiguelFranken/playwright-reporter/commit/ee89d4464809cc9570328426895bf1e945d89102))

## [0.0.6](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.5...v0.0.6) (2026-09-24)

### Features

* git and CI overrides for runs outside CI ([#7](https://github.com/MiguelFranken/playwright-reporter/issues/7)) ([e74a4b9](https://github.com/MiguelFranken/playwright-reporter/commit/e74a4b9ad6a5591872857c424f1d0897aad695ba))

## [0.0.5](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.4...v0.0.5) (2026-09-24)

### Performance Improvements

* apply run starts and finishes in place, never refresh the route ([#6](https://github.com/MiguelFranken/playwright-reporter/issues/6)) ([9146205](https://github.com/MiguelFranken/playwright-reporter/commit/91462052b06e365f8eb638a0d152a5e0f95e64e1))

## [0.0.4](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.3...v0.0.4) (2026-09-24)

### Performance Improvements

* fewer ingest, upload and backfill requests per run ([#5](https://github.com/MiguelFranken/playwright-reporter/issues/5)) ([0cd0b35](https://github.com/MiguelFranken/playwright-reporter/commit/0cd0b350c71dfe9d613d319e1e1d0c6b9ccab153))

## [0.0.3](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.2...v0.0.3) (2026-09-24)

### Performance Improvements

* apply live run updates in the browser instead of re-rendering the route ([#4](https://github.com/MiguelFranken/playwright-reporter/issues/4)) ([6beb389](https://github.com/MiguelFranken/playwright-reporter/commit/6beb389aa64707b10de8047a12c160756cf0e229))

## [0.0.2](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.1...v0.0.2) (2026-09-24)

### Features

* publish @miguelfranken/reporter to GitHub Packages with semantic-release ([#2](https://github.com/MiguelFranken/playwright-reporter/issues/2)) ([569debe](https://github.com/MiguelFranken/playwright-reporter/commit/569debeb07ad11ae2aa2bb9f9ef14451e3fc1c68))
