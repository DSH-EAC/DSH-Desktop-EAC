阶段 5交接：DSH-Desktop-EAC Skin manager bypass

分支
- DSH-Desktop-EAC: feat/stage-5-skin-manager-bypass
- manager artifact CI 分支: feat/stage-5-manager-artifact
- EAC 基线: origin/dev

实现范围
- manager path is the v6 default; `DSH_UI_SKIN_MANAGER_ROLLBACK=1` is the one-release emergency fallback switch.
- rollback selects host-embedded recovery styles only; it never restores the removed registry or EAC default source tree.
- EAC consumes a locally supplied manager snapshot, resolved assets, generation, fault state, and host profile.
- main.rs 消费 snapshot、resolved assets、generation、fault，并保留 HTTP 白名单与路径穿越防护；不锁定来源、版本或 digest。
- sidecar bridge 按 slot 注入带 generation 的 style 节点；同一 generation 不重复注入。
- stage-resources.mjs 将本地 manager payload 装配到 ui-skin-manager/；tauri.conf.json 显式映射该资源根。
- exit overlay 与 loading/died 页面继续使用 data-region、data-control-name、data-state 结构化锚点。

不可变输入
- manager/default payloads are local build inputs; no source commit, CI run,
  version, or SHA-256 provenance is required by EAC.

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
- 本地 manager payload 已按目录装配，未执行来源或 provenance 锁定。
- git diff --check 通过。
- Node --check 对 stage-resources.mjs 通过；bridge.ts 含 TypeScript 类型标注，未将 Node 原生语法检查结果误报为通过。
- 按任务限制未运行 cargo build/test、npm build/test、typecheck 或 WebView smoke。
- rustfmt/cargo-fmt 仅执行 format check，不执行编译。

回退
- 不设置 DSH_UI_SKIN_MANAGER 或删除/损坏 snapshot 时，使用原 registry 静态资源链。
- 删除本阶段 EAC 提交及其 artifacts 即可回到 origin/dev 的静态路径。
