阶段 5交接：DSH-Desktop-EAC Skin manager bypass

分支
- DSH-Desktop-EAC: feat/stage-5-skin-manager-bypass
- manager artifact CI 分支: feat/stage-5-manager-artifact
- EAC 基线: origin/dev

实现范围
- manager path is the v6 default; `DSH_UI_SKIN_MANAGER_ROLLBACK=1` is the one-release emergency fallback switch.
- rollback selects host-embedded recovery styles only; it never restores the removed registry or EAC default source tree.
- EAC consumes a verified manager snapshot, resolved assets, generation, fault state, and host profile.
- main.rs 消费已验证的 snapshot、resolved assets、generation、fault，并保留 HTTP 白名单与路径穿越防护。
- sidecar bridge 按 slot 注入带 generation 的 style 节点；同一 generation 不重复注入。
- stage-resources.mjs 校验 lock 指定 artifact 的 SHA-256 后，将资源装配到 ui-skin-manager/；tauri.conf.json 显式映射该资源根。
- exit overlay 与 loading/died 页面继续使用 data-region、data-control-name、data-state 结构化锚点。

不可变输入
- manager commit: a023b018c3751f731370917d74a40bed79e28342
- manager CI run: 35560125000 (success)
- manager artifact: dsh-eac-ui-skin-manager-0.1.0-preview.1.tgz
- manager SHA-256: 13a4c5dbd1a31c9512f535a9c14f5072f933f284634f6763e569e65614a63378
- default-skins commit: 01774c0026338a376b3644c622a581f575387edc
- default-skins CI run: 35552771052 (success)
- default artifact: system.default-2.0.0.dshpack.tar
- default SHA-256: 0b3eca8493f83306fb1b8f40c0c4d2d4b368f5453b2456c5e5d942a751c483b6

改动文件
- .github/workflows/ci.yml
- tauri-shell/build.rs
- tauri-shell/sidecar/bridge.ts
- tauri-shell/src/main.rs
- tauri-shell/stage-resources.mjs
- tauri-shell/tauri.conf.json
- tauri-shell/artifacts/*

验证
- 两个远端 CI run 均已查询为 completed/success。
- 本地 manager payload 已装配，运行时不依赖来源 lock 或固定 digest。
- git diff --check 通过。
- Node --check 对 stage-resources.mjs 通过；bridge.ts 含 TypeScript 类型标注，未将 Node 原生语法检查结果误报为通过。
- 按任务限制未运行 cargo build/test、npm build/test、typecheck 或 WebView smoke。
- rustfmt/cargo-fmt 仅执行 format check，不执行编译。

回退
- 不设置 DSH_UI_SKIN_MANAGER 或删除/损坏 snapshot 时，使用原 registry 静态资源链。
- 删除本阶段 EAC 提交及其 lock/artifacts 即可回到 origin/dev 的静态路径。
