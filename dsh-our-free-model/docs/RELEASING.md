# 发布与公告（仓库主人）

这份文档面向维护者，不属于发布内容：`package.json` 的 `files` 不含 `docs/`，所以它
不会被安装到用户机器上，也不出现在 [`README.md`](../README.md) 里——README 只讲使用者
需要知道的事。

一切通过插件仓库根目录下的 `feed/` 目录完成，**推送即发布**。

## 推送公告

编辑 [`feed/announcements.json`](../feed/announcements.json)，往 `announcements`
数组加一条：

```json
{
  "id": "2026-10-01-something",        // 全局唯一，出现过的 id 不会重复提醒
  "title": "一句话标题",
  "level": "info",                     // info | update | warn | urgent
  "pinned": false,                     // 可选，置顶
  "createdAt": "2026-10-01T00:00:00Z",
  "expiresAt": "2026-10-15T00:00:00Z", // 可选，过期自动消失
  "link": { "url": "https://…", "label": "查看详情" },  // 可选
  "html": "<p>正文，<strong>支持受限白名单的 HTML</strong></p>"
}
```

`urgent` 会触发全屏弹窗。正文 HTML 由客户端白名单渲染器解析——脚本、事件属性、
`javascript:` URL、iframe 等一律被丢弃（测试见 `scripts/sanitize-test.mjs`），
所以仓库被篡改也不会变成代码执行。

## 发布新版本

改完代码后——

```bash
# 1. 修改 package.json 的 version 与 feed/announcements.json（版本说明）
# 2. 重新生成清单（把每个发布文件的字节数与 SHA-256 写进 feed/manifest.json；
#    同一份文件清单也会写进 catalog/integrity.json，供生态目录审计用）
node scripts/build-manifest.mjs
# 3. 确认清单与实物一致（不一致就非零退出；已接进 npm test）
node scripts/build-manifest.mjs --check
# 4. 提交并推送（目录记录 revision 的两步提交见下一节），再打 tag 并创建 Release
git tag -a v1.2.3 -m "…" && git push origin v1.2.3
gh release create v1.2.3 --title "…" --notes-file …
# 5. purge CDN 缓存（不做的话 jsDelivr 上的 @main 会继续发上一版，见下一节）
curl "https://purge.jsdelivr.net/gh/zouyuxuan122/dsh-our-free-model@main/feed/manifest.json"
curl "https://purge.jsdelivr.net/gh/zouyuxuan122/dsh-our-free-model@main/feed/announcements.json"
```

第 2 步不是可选项：清单是发布者对每个文件的**字节数与 SHA-256 的承诺**，改了发布文
件却没重跑，客户端就会下到新文件、拿旧哈希去校验，校验机制会（正确地）拒绝安装——于
是这一版的一键升级对所有旧版本用户都失败。`--check` 就是让这种事在提交前失败。

摘要按 **LF 归一化后的字节**计算，不是工作区字节：`.gitattributes` 是
`* text=auto eol=lf`，用户下载到的是 blob，而编辑器可以把工作区改成 CRLF 且
`git status` 依然干净。`scripts/release-e2e.mjs` 会把全部发布文件改写成 CRLF 再跑一次
`--check`，旧算法在这一步直接失败。

已安装的插件会按 `updateCheckHours`（默认 6 小时）自动发现新版本并推送通知；
用户确认后下载、校验、备份、替换、热重载全部在应用内完成。清单会校验每个文件的
SHA-256，并在安装前重新拉取一次，避免用陈旧清单校验新文件。

## 目录记录与 revision 约定

`catalog/dsh-plugin.json`（`source.revision`）与 `catalog/provenance.json`
（`subject.sourceRevision`）记录**最近一次触及发布内容的 commit**——`package.json`
加上 `files` 清单，正是 `catalog/integrity.json` 逐字节描述的那份文件集合。
`scripts/catalog-test.mjs` 按此校验，比较对象刻意不是 HEAD：记录无法内含引入它自己
的那个 commit 的哈希，拿 HEAD 比对会让目录套件在记录真正提交的那一刻变红，事后单改
revision 再提交，HEAD 又前移——逻辑上无解。改比"最近一次触及发布内容的 commit"既
真实（单独提交目录记录不改变任何发布字节）又可满足（刷新 revision 的 commit 只碰
`catalog/`，它要匹配的指针不会因此移动）。

所以内容改动按两步提交：

1. **内容 commit**：代码、清单、目录记录一起进；
2. **刷新 commit**：紧接着单独一个 commit，只把上述两处 revision 改成第 1 步的
   哈希——不得顺带改动任何发布文件，否则校验会继续红。

只有触及发布内容的 commit 才移动这个指针：改 `docs/`、`scripts/`、`catalog/`
本身都不需要刷新。发布 tag 打在第 2 步之后（发布物不含 `catalog/`，两步的制品字节
相同，但 HEAD 处于全绿状态）。

## 关于源顺序与网络现实

真正的顺序是 `raw.githubusercontent(main) → jsDelivr(@main) → raw(master)`，全部失败时
降级到上一次的缓存并如实标注错误。以代码为准：`src/feed.js` 与 `src/updater.js` 里
`DEFAULT_*_SOURCES` 的**数组顺序**就是它（这两个文件的注释写着"jsDelivr 优先"，是旧版本
留下的说法，与数组不符）。

raw 排在前面是因为它**权威、不缓存**：推上去立刻能读到。但它在部分网络（实测本机 CN
出口 + Watt Toolkit 类加速工具）根本走不通——`git push` 正常，而 raw 对新文件返回假
404，或干脆 TLS 失败（`UNABLE_TO_VERIFY_LEAF_SIGNATURE`）。这些网络上 jsDelivr 是唯一
的源，所以下一条很要紧。

**jsDelivr 的新鲜度没有 cache-buster 那么可靠**（2026-09-26 实测）。请求确实自动带上
分钟级 `?ofm=` 参数，但 jsDelivr 把 `@main` 这类**分支引用**的"分支 → commit"解析放在
单独一层缓存里，查询串不进这一层。实测：推送 v1.2.2 之后，jsDelivr 仍返回 v1.2.1 的清单
（连 `README.md` 的字节数都是上一版的）和 v1.2.1 的公告；显式 purge 之后两者立刻变成
v1.2.2。

后果要具体说：在 raw 走不通、只能靠 jsDelivr 的网络上，旧版本用户拿到的是**过期清单**，
于是「检查更新」回答"已是最新"，一键升级根本不会出现，新公告也收不到。这与 issue #1 是
同一类失败，只是往下一层。新仓库的首次收录也有延迟（创建 Release 会触发它）。

所以发布流程的最后一步是 purge；不做就要等 CDN 自己重解析，通常数小时：

```bash
curl "https://purge.jsdelivr.net/gh/<仓库>@main/feed/manifest.json"
curl "https://purge.jsdelivr.net/gh/<仓库>@main/feed/announcements.json"
```

用 `feedUrl` 设置可把源指向任意 URL（含 `{repo}` 占位符），本地测试时指向一个静态文件
服务器即可。

---

# Releasing and announcements (repository owner)

This document is for maintainers and is not part of the release: `package.json`'s
`files` does not include `docs/`, so it never reaches an installed copy and never
appears in [`README_EN.md`](../README_EN.md). Everything lives in the repository's
`feed/` directory — **pushing is publishing**.

## Push an announcement

Edit [`feed/announcements.json`](../feed/announcements.json) and add one entry:

```json
{
  "id": "2026-10-01-something",        // unique; a seen id never re-alerts
  "title": "One-line title",
  "level": "info",                     // info | update | warn | urgent
  "pinned": false,                     // optional
  "createdAt": "2026-10-01T00:00:00Z",
  "expiresAt": "2026-10-15T00:00:00Z", // optional
  "link": { "url": "https://…", "label": "Read more" },
  "html": "<p>Body with <strong>allowlisted HTML</strong></p>"
}
```

`urgent` opens a full-screen modal. Bodies are rendered by a client-side allowlist
parser — scripts, event handlers, `javascript:` URLs, iframes and friends are all
dropped (see `scripts/sanitize-test.mjs`), so a compromised repository does not
become code execution.

## Release a new version

```bash
# 1. bump `version` in package.json, and the release note in feed/announcements.json
# 2. regenerate the manifest (size + SHA-256 of every published file; the same
#    list is written to catalog/integrity.json for ecosystem catalog audits)
node scripts/build-manifest.mjs
# 3. confirm the manifest matches the tree (non-zero exit otherwise; part of npm test)
node scripts/build-manifest.mjs --check
# 4. commit and push (see the two-step catalog revision convention below), then
#    tag and create the release
git tag -a v1.2.3 -m "…" && git push origin v1.2.3
gh release create v1.2.3 --title "…" --notes-file …
```

Step 2 is not optional. The manifest is the publisher's promise about every file's
byte count and SHA-256: edit a published file and skip the rebuild, and a client
downloads the *new* file while verifying it against the *old* hash — verification
then correctly refuses to install, and the one-click upgrade is broken for every
user on an older version. `--check` is what makes that fail before a commit
instead of in the field.

Digests are computed over **LF-normalised** bytes, not working-tree bytes:
`.gitattributes` says `* text=auto eol=lf`, so users download the blob while an
editor can leave the tree CRLF with `git status` clean. `scripts/release-e2e.mjs`
rewrites every published file to CRLF and re-runs `--check`; the old builder fails
there.

Installed plugins discover the new release automatically (every
`updateCheckHours`, 6 by default) and notify the user; the upgrade itself runs
in-app, and the manifest is re-fetched right before installing so a document
fetched hours earlier cannot be used to vouch for bytes that changed since.

## Catalog records and the revision convention

`catalog/dsh-plugin.json` (`source.revision`) and `catalog/provenance.json`
(`subject.sourceRevision`) record the **most recent commit that touched the
release content** — `package.json` plus the `files` list, exactly the set
`catalog/integrity.json` describes byte by byte. `scripts/catalog-test.mjs`
checks it against that, deliberately not against HEAD: a record cannot contain
the hash of the commit that introduces it, so a revision compared against HEAD
turns red the moment the records are actually committed, and re-pointing it in
a follow-up commit moves HEAD again — logically unsatisfiable. "Last commit
that touched the release content" is both truthful (committing the records
alone changes no published byte) and satisfiable (the refresh commit touches
only `catalog/`, so the pointer it must match does not move under it).

Content changes therefore go in as two commits:

1. **The content commit**: code, manifest and catalog records together;
2. **The refresh commit**: immediately after, a commit that only rewrites the
   two revision fields to the first commit's hash — it must not touch any
   published file, or the check stays red.

Only commits that touch the release content move the pointer: `docs/`,
`scripts/` and `catalog/` changes need no refresh. Tag the release after step 2
(the published artifact excludes `catalog/`, so both commits produce identical
artifact bytes — but HEAD sits at all-green there).

## Source order and network reality

The actual order is `raw.githubusercontent(main) → jsDelivr(@main) → raw(master)`,
falling back to the last cached copy with the error reported honestly when all
fail. Take the **array order** in `src/feed.js` and `src/updater.js` as the truth:
their comments still say "jsDelivr first", which is an older claim the arrays do
not match.

raw leads because it is authoritative and uncached — push, and it is immediately
readable. But on some networks (measured: a CN egress with a Watt Toolkit-style
accelerator) raw does not work at all: `git push` succeeds while raw answers a
false 404 for a new file, or fails TLS outright
(`UNABLE_TO_VERIFY_LEAF_SIGNATURE`). On those networks jsDelivr is the only
source, which makes the next part matter.

**jsDelivr's freshness is not as reliable as the cache-buster suggests** (measured
2026-09-26). Requests do carry a minute-resolution `?ofm=`, but jsDelivr caches
the *branch → commit* resolution for a branch ref like `@main` in a separate
layer that the query string does not reach. Measured: after pushing v1.2.2,
jsDelivr still served the v1.2.1 manifest (down to the previous `README.md` byte
count) and the v1.2.1 announcement; an explicit purge changed both to v1.2.2
immediately.

What that costs, concretely: on a network where raw is unreachable and jsDelivr is
all there is, an older user fetches the **stale manifest**, so "check for updates"
answers "already latest" — the one-click upgrade never even appears, and a new
announcement never arrives. That is the same class of failure issue #1 was about,
one layer down. A new repository's first index lags too (creating a Release
triggers it).

So the last step of a release is a purge; skip it and the CDN re-resolves on its
own in a matter of hours:

```bash
curl "https://purge.jsdelivr.net/gh/<repo>@main/feed/manifest.json"
curl "https://purge.jsdelivr.net/gh/<repo>@main/feed/announcements.json"
```

The `feedUrl` setting can point the source at any URL (with a `{repo}`
placeholder) — point it at a static file server for local testing.
