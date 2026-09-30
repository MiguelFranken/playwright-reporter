# Changelog

## [0.0.65](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.64...v0.0.65) (2026-09-30)

### Bug Fixes

* **review:** keep the slider comparison's labels and handle in view while it scrolls ([f59b479](https://github.com/MiguelFranken/playwright-reporter/commit/f59b479887a9818503e9c88835be70646bcbec92))

## [0.0.64](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.63...v0.0.64) (2026-09-30)

### Features

* **review:** drag the slider comparison's line itself ([3730dcb](https://github.com/MiguelFranken/playwright-reporter/commit/3730dcb4e65f71c9c3ac181d0cdad24ec218f377))

## [0.0.63](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.62...v0.0.63) (2026-09-30)

### Features

* **library:** approve and request changes from the library's viewer ([e35258e](https://github.com/MiguelFranken/playwright-reporter/commit/e35258e3af75744c2723d4df728f900eab9a684a))

## [0.0.62](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.61...v0.0.62) (2026-09-30)

### Features

* **review:** a right-click menu on the folder tree, with bulk approval ([54fa771](https://github.com/MiguelFranken/playwright-reporter/commit/54fa7718cf2355b153c01f2b80dda6b96ab8ba1d))

## [0.0.61](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.60...v0.0.61) (2026-09-30)

### Bug Fixes

* **review:** scroll the checkpoint viewer as a page below the side-panel width ([86c5654](https://github.com/MiguelFranken/playwright-reporter/commit/86c56545dd294e019a51aeabd771b57474449c24))

## [0.0.60](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.59...v0.0.60) (2026-09-30)

### Features

* **library:** one toolbar row, with Filter and Display beside search and feedback ([a2a4253](https://github.com/MiguelFranken/playwright-reporter/commit/a2a4253aa73068f1b05110974e742710a4b63055))

### Bug Fixes

* **library:** even spacing in the Display panel and a visually hidden title ([86e2af9](https://github.com/MiguelFranken/playwright-reporter/commit/86e2af9c75c64129adb0df6d2b3230408a8ffacc))

## [0.0.59](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.58...v0.0.59) (2026-09-30)

### Performance Improvements

* **cases:** keep filters across suites and serve seen lists from the query cache ([#71](https://github.com/MiguelFranken/playwright-reporter/issues/71)) ([272f046](https://github.com/MiguelFranken/playwright-reporter/commit/272f046c6aec84a8037e78919cf22349901ecd55))

## [0.0.58](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.57...v0.0.58) (2026-09-30)

### Performance Improvements

* **filters:** show filter changes on the click, with skeletons in the results ([#70](https://github.com/MiguelFranken/playwright-reporter/issues/70)) ([beb89ec](https://github.com/MiguelFranken/playwright-reporter/commit/beb89ec51400f70fef59fa958af7ca62bb39e714))

## [0.0.57](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.56...v0.0.57) (2026-09-30)

### Features

* **filters:** multi-select filters on test cases and additive library summary ([#69](https://github.com/MiguelFranken/playwright-reporter/issues/69)) ([d2d4768](https://github.com/MiguelFranken/playwright-reporter/commit/d2d476873c7e10add6176142b7f6e7369a2a0ac1))

## [0.0.56](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.55...v0.0.56) (2026-09-30)

### Features

* **library:** a calmer library with a view builder, per-view folders and scroll to top ([#67](https://github.com/MiguelFranken/playwright-reporter/issues/67)) ([64e174a](https://github.com/MiguelFranken/playwright-reporter/commit/64e174af2079317b1869ad1195a63e6d61d11e70))

### Bug Fixes

* **ui:** fix the accessibility defects the Storybook check was told to ignore ([#68](https://github.com/MiguelFranken/playwright-reporter/issues/68)) ([ed69a35](https://github.com/MiguelFranken/playwright-reporter/commit/ed69a35a3a5f3c861918b249ff31cd1f802b657d))

## [0.0.55](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.54...v0.0.55) (2026-09-30)

### Features

* **library:** a complete visual library with feedback across runs, views and fast images ([#66](https://github.com/MiguelFranken/playwright-reporter/issues/66)) ([8a3304d](https://github.com/MiguelFranken/playwright-reporter/commit/8a3304d76a06984b9a9a4424d474225bd8cf349d))

## [0.0.54](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.53...v0.0.54) (2026-09-30)

### Performance Improvements

* **web:** load the AWS SDK only on S3 deployments, and time the upload completion ([#65](https://github.com/MiguelFranken/playwright-reporter/issues/65)) ([8ec329c](https://github.com/MiguelFranken/playwright-reporter/commit/8ec329c204773fb292f0943b71b5d887d4cdb627))

## [0.0.53](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.52...v0.0.53) (2026-09-30)

### Features

* **web:** add Vercel Speed Insights, only in builds made on Vercel ([#64](https://github.com/MiguelFranken/playwright-reporter/issues/64)) ([ed98b14](https://github.com/MiguelFranken/playwright-reporter/commit/ed98b1422704e6a8033a5e8b518e4433ba4ce64c))

## [0.0.52](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.51...v0.0.52) (2026-09-30)

### Features

* **retention:** keep library screens and commented flows, unless the policy lets them expire ([#63](https://github.com/MiguelFranken/playwright-reporter/issues/63)) ([ad42cb7](https://github.com/MiguelFranken/playwright-reporter/commit/ad42cb7cef61f39f4228ceba76a53185a99e0d50))

## [0.0.51](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.50...v0.0.51) (2026-09-29)

### Features

* **review:** pin comment threads on review screenshots, for people and AI assistants ([#62](https://github.com/MiguelFranken/playwright-reporter/issues/62)) ([10a765a](https://github.com/MiguelFranken/playwright-reporter/commit/10a765a017171d0e3baca731a92f85830f0a77d9))

### Performance Improvements

* **review:** virtualize the storyboard and keep a run's review in TanStack Query ([#61](https://github.com/MiguelFranken/playwright-reporter/issues/61)) ([c0bd3de](https://github.com/MiguelFranken/playwright-reporter/commit/c0bd3deec5eb98218475023bfecd94df0a165a2b))

## [0.0.50](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.49...v0.0.50) (2026-09-29)

### Bug Fixes

* **retention:** continue a sweep that ran out of time in a fresh request ([#60](https://github.com/MiguelFranken/playwright-reporter/issues/60)) ([ac8b517](https://github.com/MiguelFranken/playwright-reporter/commit/ac8b517ba27501b3f0d7370ae5b6405dc0412a6f))

## [0.0.49](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.48...v0.0.49) (2026-09-29)

### Features

* **review:** measure changed review images pixel by pixel ([#59](https://github.com/MiguelFranken/playwright-reporter/issues/59)) ([c963af7](https://github.com/MiguelFranken/playwright-reporter/commit/c963af735320251efe8227dd5a9ba9de9e2af2ad))

### Performance Improvements

* **ui:** a continuous screen-size slider that glides ([#58](https://github.com/MiguelFranken/playwright-reporter/issues/58)) ([c6870bd](https://github.com/MiguelFranken/playwright-reporter/commit/c6870bdf7bee9d5eca06c1f2a4adb057eb2d8de4))

## [0.0.48](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.47...v0.0.48) (2026-09-29)

### Bug Fixes

* **web:** keep the current team and project when opening administration ([#57](https://github.com/MiguelFranken/playwright-reporter/issues/57)) ([5708b56](https://github.com/MiguelFranken/playwright-reporter/commit/5708b561b3c4169804fdddd23963f97f29ecff7b))

## [0.0.47](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.46...v0.0.47) (2026-09-29)

### Bug Fixes

* **ui:** let sideways scrolling over a checkpoint screenshot reach the storyboard strip ([483128f](https://github.com/MiguelFranken/playwright-reporter/commit/483128f66cf41fecfb40d0745689b403c66b4e9b))

## [0.0.46](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.45...v0.0.46) (2026-09-29)

### Features

* **api:** write endpoints for test cases and visual review, and the run page's result filters ([#55](https://github.com/MiguelFranken/playwright-reporter/issues/55)) ([4af34c7](https://github.com/MiguelFranken/playwright-reporter/commit/4af34c7f95f3863504f69dc398e4472d7738cf18))
* **test-cases:** hand organizing adopted tests to an AI assistant from the adopt dialog ([#56](https://github.com/MiguelFranken/playwright-reporter/issues/56)) ([4f61c2a](https://github.com/MiguelFranken/playwright-reporter/commit/4f61c2a3124ce65afb39c8aa587d69802c7dde45))
* **ui:** a smooth screen-size slider that keeps its thumb inside the track ([#52](https://github.com/MiguelFranken/playwright-reporter/issues/52)) ([d3d7d0a](https://github.com/MiguelFranken/playwright-reporter/commit/d3d7d0a7504bf38ce6774b1755fea10003efd3f7))
* **ui:** design-system selects in the screen toolbar and run history pager ([#54](https://github.com/MiguelFranken/playwright-reporter/issues/54)) ([8601b29](https://github.com/MiguelFranken/playwright-reporter/commit/8601b2909786013ab4d91152ac0180809aa537c7))

### Bug Fixes

* **ui:** tighten the checkpoint viewer's pager and put its close button in the header row ([#53](https://github.com/MiguelFranken/playwright-reporter/issues/53)) ([aaf73bc](https://github.com/MiguelFranken/playwright-reporter/commit/aaf73bcea830d558263f417f1b0c53d6c5334de7))

## [0.0.45](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.44...v0.0.45) (2026-09-29)

### Features

* **mcp:** organize uncovered Playwright tests into test cases ([#51](https://github.com/MiguelFranken/playwright-reporter/issues/51)) ([35274e4](https://github.com/MiguelFranken/playwright-reporter/commit/35274e43e5356c8460468cab84620d69a7c514a2))

## [0.0.44](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.43...v0.0.44) (2026-09-29)

### Features

* a Library for visual documentation, and a Visual Review per pull request ([#50](https://github.com/MiguelFranken/playwright-reporter/issues/50)) ([288854e](https://github.com/MiguelFranken/playwright-reporter/commit/288854e1f7468200c8a089cbe5e2cb4a900425bb))

## [0.0.43](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.42...v0.0.43) (2026-09-29)

### Features

* browse the visual review by test case suite, on screens of the right shape ([#49](https://github.com/MiguelFranken/playwright-reporter/issues/49)) ([b30ed04](https://github.com/MiguelFranken/playwright-reporter/commit/b30ed04fa5d234c57be1f91da8c3d57768be72b1))

## [0.0.42](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.41...v0.0.42) (2026-09-29)

### Features

* visual review of review checkpoints — storyboard, baselines and approvals ([#48](https://github.com/MiguelFranken/playwright-reporter/issues/48)) ([cd36eb0](https://github.com/MiguelFranken/playwright-reporter/commit/cd36eb0bbc2d63a50fb554437db1dd9c72715bf5))

## [0.0.41](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.40...v0.0.41) (2026-09-29)

### Features

* **mcp:** delete empty test suites with delete_test_suite ([#47](https://github.com/MiguelFranken/playwright-reporter/issues/47)) ([83f64a0](https://github.com/MiguelFranken/playwright-reporter/commit/83f64a081c5532873126cb69d280a9a0c7ca81e3))

## [0.0.40](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.39...v0.0.40) (2026-09-29)

### Features

* **ui:** replace the bare file input with a drop zone ([#45](https://github.com/MiguelFranken/playwright-reporter/issues/45)) ([de34380](https://github.com/MiguelFranken/playwright-reporter/commit/de343809b9ffeffca1494cd2604e7c08e7b87873))

## [0.0.39](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.38...v0.0.39) (2026-09-29)

### Features

* **ui:** animate the counts bar as a live run's tally grows ([#44](https://github.com/MiguelFranken/playwright-reporter/issues/44)) ([bbe1a65](https://github.com/MiguelFranken/playwright-reporter/commit/bbe1a6585d4cb1ea4105581caf7cd145d2ff05b0))

### Bug Fixes

* **ui:** keep dialog content inside the dialog ([#43](https://github.com/MiguelFranken/playwright-reporter/issues/43)) ([e9b04ad](https://github.com/MiguelFranken/playwright-reporter/commit/e9b04ad8f035e34cf64a2173704a8870ddf8fb60))

## [0.0.38](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.37...v0.0.38) (2026-09-29)

### Features

* **web:** manage manual and automated test cases in one place ([#42](https://github.com/MiguelFranken/playwright-reporter/issues/42)) ([507bf4f](https://github.com/MiguelFranken/playwright-reporter/commit/507bf4ff6e388f84872c677bb5ab13ada21b818c))

## [0.0.37](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.36...v0.0.37) (2026-09-29)

### Performance Improvements

* **web:** adopt Partial Prefetching fully: prefetch whole pages on intent ([#41](https://github.com/MiguelFranken/playwright-reporter/issues/41)) ([95cf395](https://github.com/MiguelFranken/playwright-reporter/commit/95cf395ff40289a61b1ac77a39a3982ce9bc6695))

## [0.0.36](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.35...v0.0.36) (2026-09-29)

### Bug Fixes

* **web:** answer 404 for test and result pages with a malformed id ([#40](https://github.com/MiguelFranken/playwright-reporter/issues/40)) ([91f8e36](https://github.com/MiguelFranken/playwright-reporter/commit/91f8e36ac07778785d168f77f748715e92f512c5))

## [0.0.35](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.34...v0.0.35) (2026-09-29)

### Bug Fixes

* **ui:** make the filter menus' count badge a circle ([8fac225](https://github.com/MiguelFranken/playwright-reporter/commit/8fac225cc8900e75761d0999435233c3d8b78ce4))

## [0.0.34](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.33...v0.0.34) (2026-09-29)

### Features

* **web:** filter a run's detailed analysis by attachments, project, tags and retries ([630c9bd](https://github.com/MiguelFranken/playwright-reporter/commit/630c9bdf9c6b8aa79dc6d93a07e00a6228b141eb))

## [0.0.33](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.32...v0.0.33) (2026-09-29)

### Features

* **ui:** show an empty state with a call to action when a team has no projects ([becee85](https://github.com/MiguelFranken/playwright-reporter/commit/becee852e3d13410767ed986c3480eca016c6891))

## [0.0.32](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.31...v0.0.32) (2026-09-28)

### Performance Improvements

* **web:** stream every run tab with the page, prefetch App Shells, reuse recent pages ([#39](https://github.com/MiguelFranken/playwright-reporter/issues/39)) ([8ff96e5](https://github.com/MiguelFranken/playwright-reporter/commit/8ff96e5a39636f8f807970fbaa28e37919aa17e6))

## [0.0.31](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.30...v0.0.31) (2026-09-28)

### Performance Improvements

* **web:** switch run tabs, outcomes and spec files without a navigation ([#38](https://github.com/MiguelFranken/playwright-reporter/issues/38)) ([38f72cb](https://github.com/MiguelFranken/playwright-reporter/commit/38f72cb49d030bc868a86ca174dbab797001989a))

## [0.0.30](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.29...v0.0.30) (2026-09-25)

### Features

* **reporter:** call the ingest API through a typed oRPC client ([#37](https://github.com/MiguelFranken/playwright-reporter/issues/37)) ([ec5f91a](https://github.com/MiguelFranken/playwright-reporter/commit/ec5f91aab2f1659f39d1f83679580804c3a24ea5))

## [0.0.29](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.28...v0.0.29) (2026-09-25)

### Bug Fixes

* **ui:** hydration-safe numbers and dates, and remount retention forms on a new saved policy ([#36](https://github.com/MiguelFranken/playwright-reporter/issues/36)) ([7da0b26](https://github.com/MiguelFranken/playwright-reporter/commit/7da0b269ea8af013ed3606f1b8b6c96e31056303))

## [0.0.28](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.27...v0.0.28) (2026-09-25)

### Features

* **web:** preview retention policies as they are edited, and stream shared test links ([#35](https://github.com/MiguelFranken/playwright-reporter/issues/35)) ([dfdcef6](https://github.com/MiguelFranken/playwright-reporter/commit/dfdcef63bd893e3d0b1ed765dfc10c2f82ead559))

## [0.0.27](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.26...v0.0.27) (2026-09-25)

### Features

* **web:** prefetch the explorer drawer and tighten TanStack Query caching ([#34](https://github.com/MiguelFranken/playwright-reporter/issues/34)) ([4a70a76](https://github.com/MiguelFranken/playwright-reporter/commit/4a70a76eefd8e0443a70870fdc1430a0cf17be8f))

## [0.0.26](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.25...v0.0.26) (2026-09-25)

### Bug Fixes

* **docs:** put the sidebar on the page's white surface ([1a244fe](https://github.com/MiguelFranken/playwright-reporter/commit/1a244fe4bfec505d0fc20805818eac8225c27cf8))

## [0.0.25](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.24...v0.0.25) (2026-09-25)

### Features

* add tanstack query skill ([2151881](https://github.com/MiguelFranken/playwright-reporter/commit/21518819af9034667a8c976520aa39efe3b9c90b))

## [0.0.24](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.23...v0.0.24) (2026-09-25)

### Features

* public REST API over oRPC, TanStack Query for client data, and a docs site in the product's design ([#33](https://github.com/MiguelFranken/playwright-reporter/issues/33)) ([b01fbf3](https://github.com/MiguelFranken/playwright-reporter/commit/b01fbf333dd75fa4e7d58203f24c9f12c46e1f4b))

### Performance Improvements

* **web:** cut sequential database round trips on ingest and project pages ([#32](https://github.com/MiguelFranken/playwright-reporter/issues/32)) ([3e79450](https://github.com/MiguelFranken/playwright-reporter/commit/3e794500a0899b4eca80988ef454799817711855))

## [0.0.23](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.22...v0.0.23) (2026-09-25)

### Bug Fixes

* **web:** show a skeleton on every page change and paginate the remaining lists ([#31](https://github.com/MiguelFranken/playwright-reporter/issues/31)) ([1ea442b](https://github.com/MiguelFranken/playwright-reporter/commit/1ea442b4b77e097637417d80dc3249f737db9789))

## [0.0.22](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.21...v0.0.22) (2026-09-25)

### Bug Fixes

* **web:** hide superadmins from the demo account's team member list ([#30](https://github.com/MiguelFranken/playwright-reporter/issues/30)) ([dbf037b](https://github.com/MiguelFranken/playwright-reporter/commit/dbf037b04483d30d5589cfd69c3b0adf8e8f7466))

## [0.0.21](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.20...v0.0.21) (2026-09-25)

### Features

* **web:** S3-compatible artifact storage ([#29](https://github.com/MiguelFranken/playwright-reporter/issues/29)) ([3a8d7c1](https://github.com/MiguelFranken/playwright-reporter/commit/3a8d7c1c36a17e246cf8de525313052611ece74f))

## [0.0.20](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.19...v0.0.20) (2026-09-25)

### Features

* pull and merge requests: reported with each run, filterable, and a page of their own ([#28](https://github.com/MiguelFranken/playwright-reporter/issues/28)) ([e467e54](https://github.com/MiguelFranken/playwright-reporter/commit/e467e543c6d859391f045caba33f3baaf1da2414))

## [0.0.19](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.18...v0.0.19) (2026-09-25)

### Features

* **ui:** hand Debug with AI prompts to Claude Code and Codex ([#26](https://github.com/MiguelFranken/playwright-reporter/issues/26)) ([522eeb9](https://github.com/MiguelFranken/playwright-reporter/commit/522eeb949323a15983a81516f2d2cb9803fd2afb))
* **web:** database data retention policy and usage metrics ([#27](https://github.com/MiguelFranken/playwright-reporter/issues/27)) ([a24fdb8](https://github.com/MiguelFranken/playwright-reporter/commit/a24fdb8495539d42744df70b7afd085f62f170d6))

## [0.0.18](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.17...v0.0.18) (2026-09-25)

### Features

* **web:** self-host the Playwright Trace Viewer and embed it in the result page ([#25](https://github.com/MiguelFranken/playwright-reporter/issues/25)) ([c88b7be](https://github.com/MiguelFranken/playwright-reporter/commit/c88b7be6ed5cf38be8671f9bf23ebd4febcbc04c))

## [0.0.17](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.16...v0.0.17) (2026-09-25)

### Features

* **web:** force delete every stored artifact from Admin → Storage ([#23](https://github.com/MiguelFranken/playwright-reporter/issues/23)) ([4774308](https://github.com/MiguelFranken/playwright-reporter/commit/47743089f051b48b6a48b86b73226956eb86f385))

### Bug Fixes

* **ui:** align flush card tables with the card header ([#24](https://github.com/MiguelFranken/playwright-reporter/issues/24)) ([33e6b4c](https://github.com/MiguelFranken/playwright-reporter/commit/33e6b4c96b351347fdd2610876a454d84e538df7))

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
