# Changelog

## [0.0.95](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.94...v0.0.95) (2026-10-05)

### Features

* **review:** show the areas left out on the image and every comparison ([#100](https://github.com/MiguelFranken/playwright-reporter/issues/100)) ([67c1748](https://github.com/MiguelFranken/playwright-reporter/commit/67c17484bd7a20ab4b911a5bd94498c8a4ac6a3a))

### Bug Fixes

* **review:** keep the stage to the image while leaving areas out; the rules move to the side panel ([#97](https://github.com/MiguelFranken/playwright-reporter/issues/97)) ([09ff487](https://github.com/MiguelFranken/playwright-reporter/commit/09ff487ece6be4aede8f7b29805c86202fad9de6))
* **review:** let the measured pixels decide every status, and make comparing two runs read clearly ([#99](https://github.com/MiguelFranken/playwright-reporter/issues/99)) ([7c64a06](https://github.com/MiguelFranken/playwright-reporter/commit/7c64a060b4002ca11d7abdd0747e3a6ac06d7635)), closes [#112](https://github.com/MiguelFranken/playwright-reporter/issues/112) [#98](https://github.com/MiguelFranken/playwright-reporter/issues/98)
* **review:** the comment bar grows along its run, from its own size ([#98](https://github.com/MiguelFranken/playwright-reporter/issues/98)) ([0e7a70b](https://github.com/MiguelFranken/playwright-reporter/commit/0e7a70ba5435cc2d365634c830f22ab92c1da89f))

## [0.0.94](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.93...v0.0.94) (2026-10-05)

### Bug Fixes

* **review:** tell new screens from changed and unchanged ones, and follow the run a review is compared with ([#96](https://github.com/MiguelFranken/playwright-reporter/issues/96)) ([27c9bb2](https://github.com/MiguelFranken/playwright-reporter/commit/27c9bb2408c71520d6bd14f7e35fa0aa32e5ad46))

## [0.0.93](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.92...v0.0.93) (2026-10-04)

### Performance Improvements

* **review:** drag the comment bar without rendering or easing behind the pointer ([#95](https://github.com/MiguelFranken/playwright-reporter/issues/95)) ([0732fb1](https://github.com/MiguelFranken/playwright-reporter/commit/0732fb167afb4eab05edd6072eb5b7b3f45333b5))

## [0.0.92](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.91...v0.0.92) (2026-10-04)

### Features

* **review:** compare a whole run's visual review with the run before or any other run ([#94](https://github.com/MiguelFranken/playwright-reporter/issues/94)) ([0342651](https://github.com/MiguelFranken/playwright-reporter/commit/03426519fdea6b3de97357a96de58f3680ad942f))

## [0.0.91](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.90...v0.0.91) (2026-10-04)

### Features

* **review:** dock the comment bar upright against the left or right edge ([#93](https://github.com/MiguelFranken/playwright-reporter/issues/93)) ([a786e0f](https://github.com/MiguelFranken/playwright-reporter/commit/a786e0fbbb03e9649fd447637af85adbafab7915))

## [0.0.90](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.89...v0.0.90) (2026-10-04)

### Features

* **review:** manage visual ignore rules from MCP/API — add on many screens, review and prune stale ones ([#92](https://github.com/MiguelFranken/playwright-reporter/issues/92)) ([0609fdc](https://github.com/MiguelFranken/playwright-reporter/commit/0609fdceb8fa21e9b8e1ec301fa8bc47a4b51471))

## [0.0.89](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.88...v0.0.89) (2026-10-04)

### Bug Fixes

* **review:** stop AI analyses failing when the model's answer is cut off ([#91](https://github.com/MiguelFranken/playwright-reporter/issues/91)) ([f8ef159](https://github.com/MiguelFranken/playwright-reporter/commit/f8ef159977f886861bbf845bd515e5eafcb68663))

## [0.0.88](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.87...v0.0.88) (2026-10-04)

### Bug Fixes

* **review:** compare only with runs that still have their image, and load them when the list opens ([#90](https://github.com/MiguelFranken/playwright-reporter/issues/90)) ([e01cd03](https://github.com/MiguelFranken/playwright-reporter/commit/e01cd03b2e11da2c4a5b89fbcdecdea5c127fc92))

## [0.0.87](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.86...v0.0.87) (2026-10-02)

### Features

* **review:** preview a change in a close-up when hovering its mark on the strip ([#89](https://github.com/MiguelFranken/playwright-reporter/issues/89)) ([a63d907](https://github.com/MiguelFranken/playwright-reporter/commit/a63d9070d38811236ca286f8a52e782f61307dc8))

## [0.0.86](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.85...v0.0.86) (2026-10-02)

### Features

* **mcp:** list, detail and picture visual differences between two runs ([1d83858](https://github.com/MiguelFranken/playwright-reporter/commit/1d8385826bea344b2f0609a1273ec621810ac195))
* **review:** ask a model what a visual difference is, within a budget ([c5d7ec8](https://github.com/MiguelFranken/playwright-reporter/commit/c5d7ec87adbd38003208627d4a37c33e439cb865))
* **review:** edit rules with reasons and a preview, filter by them, set policies ([7e5ad33](https://github.com/MiguelFranken/playwright-reporter/commit/7e5ad33d746ccb2814cf33f7a12c99b5b730c6d2))
* **review:** hand a visual difference to an AI assistant from the viewer ([6aa2e4b](https://github.com/MiguelFranken/playwright-reporter/commit/6aa2e4b607481a4cb731a5ad4a77486328d53239))
* **review:** name a pair of captures and measure it raw and effective ([d49c88f](https://github.com/MiguelFranken/playwright-reporter/commit/d49c88f08d240e0f5c7b9a213a66b9dd22aabb07))
* **review:** rules that leave areas out, with a reason, a history and a revision ([fa959a6](https://github.com/MiguelFranken/playwright-reporter/commit/fa959a6df4591a5d812c394aab0b4d9083f7a8bb))

### Bug Fixes

* **review:** keep the order drawings were made in when several are saved at once ([1e9f6f1](https://github.com/MiguelFranken/playwright-reporter/commit/1e9f6f1dce5a1992cd4c003d1129cfab6f13a3a1))
* **review:** keep the screens' size container from changing with the mode ([00a84df](https://github.com/MiguelFranken/playwright-reporter/commit/00a84dfbba2924349d62bacfb7352843e8747d29))
* **review:** no tooltips flash while the comment bar grows ([fb29b03](https://github.com/MiguelFranken/playwright-reporter/commit/fb29b036ce40c58eb968af064551b979e6715980))
* **review:** open a pin's thread on click, not hover ([0b8e518](https://github.com/MiguelFranken/playwright-reporter/commit/0b8e5180151c0eb8aa95a92c16837b0fd8b4a6ac))

### Performance Improvements

* **review:** lay each screenshot out once and scale it on the GPU while the stage moves ([8b125a8](https://github.com/MiguelFranken/playwright-reporter/commit/8b125a875e6aec302f00d3b08689afded2c51945))

## [0.0.85](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.84...v0.0.85) (2026-10-02)

### Performance Improvements

* **review:** size the screens by CSS from the stage, so every motion lays them out right ([a1a60d4](https://github.com/MiguelFranken/playwright-reporter/commit/a1a60d444ca0cd1101f3efc81961367f263bdfa6))

## [0.0.84](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.83...v0.0.84) (2026-10-02)

### Performance Improvements

* **review:** drag the side panel's edge without a render, and slide it open and closed ([997c7db](https://github.com/MiguelFranken/playwright-reporter/commit/997c7db364ba7e21b3aa5d34f37560aca25db574))
* **review:** scale the screens on the compositor while the stage moves, and fit them once it stands ([40b939f](https://github.com/MiguelFranken/playwright-reporter/commit/40b939fec6c367c7c119af633ac476a5e3cb2cdf))

## [0.0.83](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.82...v0.0.83) (2026-10-02)

### Features

* **review:** draw on review images without a comment, and erase drawings ([#88](https://github.com/MiguelFranken/playwright-reporter/issues/88)) ([77d9861](https://github.com/MiguelFranken/playwright-reporter/commit/77d98619d4b152e33b5410398f9b9333d46796cd))
* **review:** move the comment bar by its grip, and ease its width ([458e795](https://github.com/MiguelFranken/playwright-reporter/commit/458e79580e9e745807ef60f4db7b4e3293c49466))

### Bug Fixes

* **review:** drop the blue border around the stage while commenting ([c63ac11](https://github.com/MiguelFranken/playwright-reporter/commit/c63ac113caf77e2c49698df0f458d2d7bc4e24e3))
* **ui:** drop the outline every image carried ([6b2e71a](https://github.com/MiguelFranken/playwright-reporter/commit/6b2e71a4789f14f31fd2b9a92bff708669c9df98))

## [0.0.82](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.81...v0.0.82) (2026-10-02)

### Bug Fixes

* **review:** keep Image or Compare until the reviewer switches ([c989805](https://github.com/MiguelFranken/playwright-reporter/commit/c989805e630f3f40b51838516d03e2effd5351d9))

## [0.0.81](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.80...v0.0.81) (2026-10-02)

### Features

* **review:** feedback is resolved in the side panel, the screens get the stage ([#87](https://github.com/MiguelFranken/playwright-reporter/issues/87)) ([ed7d91b](https://github.com/MiguelFranken/playwright-reporter/commit/ed7d91b295c75af0cbc0c0dc3820ca894bed34a8))

## [0.0.80](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.79...v0.0.80) (2026-10-02)

### Features

* **review:** choose what the viewer compares an image with ([#86](https://github.com/MiguelFranken/playwright-reporter/issues/86)) ([31193f2](https://github.com/MiguelFranken/playwright-reporter/commit/31193f2b4e73b635657b3862fdbfb721af33a065))

## [0.0.79](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.78...v0.0.79) (2026-10-02)

### Features

* **review:** the checkpoint previews float over the screen ([#85](https://github.com/MiguelFranken/playwright-reporter/issues/85)) ([063596e](https://github.com/MiguelFranken/playwright-reporter/commit/063596ee4443e814fe690025581f5adea4e36843))

## [0.0.78](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.77...v0.0.78) (2026-10-02)

### Features

* **review:** a foldable, resizable side panel and a floating comment bar ([#84](https://github.com/MiguelFranken/playwright-reporter/issues/84)) ([d7f09b0](https://github.com/MiguelFranken/playwright-reporter/commit/d7f09b0dc74ebdd14a49a45ef0ac3a9e75fca295))

## [0.0.77](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.76...v0.0.77) (2026-10-02)

### Features

* **review:** the viewer's screen scrolls on under blurred bars ([#83](https://github.com/MiguelFranken/playwright-reporter/issues/83)) ([34e5d93](https://github.com/MiguelFranken/playwright-reporter/commit/34e5d93d45e50dd49cc9ff36e9156261f51a82a3))

## [0.0.76](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.75...v0.0.76) (2026-10-01)

### Features

* **review:** choose image or compare first, and compare every variant at once ([#81](https://github.com/MiguelFranken/playwright-reporter/issues/81)) ([f69a43f](https://github.com/MiguelFranken/playwright-reporter/commit/f69a43fb57391f0c0ab5d0c39ce86237b5e889a4))
* **review:** draw on review images with a pen, highlighter, arrows and shapes ([#80](https://github.com/MiguelFranken/playwright-reporter/issues/80)) ([e36ce3b](https://github.com/MiguelFranken/playwright-reporter/commit/e36ce3bf86664aeb7f99aa0c562db3fd7207c92c))

## [0.0.75](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.74...v0.0.75) (2026-10-01)

### Features

* **library:** count flows, not images, and let the counts follow the filters ([#79](https://github.com/MiguelFranken/playwright-reporter/issues/79)) ([d0dae7a](https://github.com/MiguelFranken/playwright-reporter/commit/d0dae7a1ba6dcc4318748515e3c266b76215fd7e))

## [0.0.74](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.73...v0.0.74) (2026-10-01)

### Features

* **review:** fit the viewer's screens into the stage, never scroll it ([#78](https://github.com/MiguelFranken/playwright-reporter/issues/78)) ([51e5aab](https://github.com/MiguelFranken/playwright-reporter/commit/51e5aabe9f5800d20c7bc7508e11fd0add6ea975))

## [0.0.73](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.72...v0.0.73) (2026-10-01)

### Bug Fixes

* **auth:** send an ended session to /login before the page renders ([49a7694](https://github.com/MiguelFranken/playwright-reporter/commit/49a7694077952b00567b596e8987a3ab80f2acdf))

## [0.0.72](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.71...v0.0.72) (2026-10-01)

### Bug Fixes

* **library:** the close button closes feedback opened from a link ([a2d3c43](https://github.com/MiguelFranken/playwright-reporter/commit/a2d3c43cba6abdb8beef9ce5244aae008bc90add))

## [0.0.71](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.70...v0.0.71) (2026-10-01)

### Features

* **library:** resolve feedback one item at a time, verify without a click ([#77](https://github.com/MiguelFranken/playwright-reporter/issues/77)) ([6bc8904](https://github.com/MiguelFranken/playwright-reporter/commit/6bc890478231ecf4f58ae8dcbd1d57380d584010))

## [0.0.70](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.69...v0.0.70) (2026-10-01)

### Features

* **review:** show dictated words while they are said ([#76](https://github.com/MiguelFranken/playwright-reporter/issues/76)) ([41b45fe](https://github.com/MiguelFranken/playwright-reporter/commit/41b45feca40b57e033e8485c78cb90e4b327f323))

## [0.0.69](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.68...v0.0.69) (2026-10-01)

### Features

* **review:** dictate comments with speech to text ([#75](https://github.com/MiguelFranken/playwright-reporter/issues/75)) ([fa9fc76](https://github.com/MiguelFranken/playwright-reporter/commit/fa9fc760a5f2538aa2333234aa412b9f79e8cd03))

## [0.0.68](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.67...v0.0.68) (2026-09-30)

### Features

* **review:** comments written by an AI agent show as the agent's ([faa7fec](https://github.com/MiguelFranken/playwright-reporter/commit/faa7feca0c0d0afbfa2bc9cf3c210d1b10af5d6c))

### Bug Fixes

* **review:** let the keyboard scroll a long comment thread ([38501bd](https://github.com/MiguelFranken/playwright-reporter/commit/38501bdc8b73ef660e44ec607280cca0b92db7cc))

## [0.0.67](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.66...v0.0.67) (2026-09-30)

### Features

* **mcp:** a work list of visual feedback, explicit comparisons and image budgets ([e8aedd5](https://github.com/MiguelFranken/playwright-reporter/commit/e8aedd53b4ced1065df0e698ac42fcf3aeeefde6))
* **reporter:** record uncommitted changes and how the executor was decided ([fdc9379](https://github.com/MiguelFranken/playwright-reporter/commit/fdc9379a8bacc1a9bc0f8b164e3c4238211d40fe))
* **review:** close-ups of the spot a comment points at ([9692530](https://github.com/MiguelFranken/playwright-reporter/commit/9692530796f7603a0f26c08b42897f37231e85b8))
* **review:** verify fixes comment by comment, pins on the image they were made on ([cea5c4b](https://github.com/MiguelFranken/playwright-reporter/commit/cea5c4b65f01974a560c3a12dc96d0adb1ee6eaf))

### Bug Fixes

* **api:** keep the re-run command's response style to its v1 values ([989727d](https://github.com/MiguelFranken/playwright-reporter/commit/989727de528d0f3a186c9bacb5716fdb7d7c1272))
* **mcp:** anchored re-run selectors with a --list preview ([49eed5f](https://github.com/MiguelFranken/playwright-reporter/commit/49eed5f35aa824b73c196f88eadd8b3a66e7bc65))
* **retention:** keep the default branch's library screens and the images views compare against ([#73](https://github.com/MiguelFranken/playwright-reporter/issues/73)) ([1f8d874](https://github.com/MiguelFranken/playwright-reporter/commit/1f8d874ba2b586fff1a6b3eaf2e825a0dd078304))

## [0.0.66](https://github.com/MiguelFranken/playwright-reporter/compare/v0.0.65...v0.0.66) (2026-09-30)

### Features

* **review:** scroll side-by-side screens together ([41ce758](https://github.com/MiguelFranken/playwright-reporter/commit/41ce758b1ab8f7c2b7d30032b70ebdc5e12b5a3b))

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
