/**
 * 工作区皮肤包清单完整性闸门（M1 发布前自检，failing-first）。
 *
 * 背景：M1 迁移把皮肤包从 5 款扩到 12 款，每个包的清单（package.json / cordis.patch.yml /
 * 许可文件 / 皮肤自有 body marker）都是**发布契约**的一部分——单包测试只看得到自己，
 * 跨包不变量（重名、重 id、重 marker、许可文件缺件）没有任何测试覆盖，而这些恰恰是
 * 「本地多出一个半成品包」时最先被破坏的东西。本文件把这几条不变量固化为可执行断言：
 *
 * 1. 工作区内的皮肤包名与公约 §3 皮肤 id **全局唯一**（重复 → 加载器登记表冲突）；
 * 2. 每个包的 `files` 必须显式包含 LICENSE / NOTICE / THIRD-PARTY-NOTICES.md
 *    （npm 只自动收 README/LICENSE，NOTICE 与第三方声明不会自动入包）；
 * 3. `license` 字段必须是合法 SPDX 表达式形态（SPDX id 内不得含空格——
 *    `CC BY-NC-SA-4.0` 这类写法不是合法表达式，`CC-BY-NC-SA-4.0` 才是）；
 * 4. 皮肤自有 body marker 全局唯一且不占用加载器保留面（公约 R2/R3）；
 * 5. 行 id（settings 命名空间）与 cordis.patch.yml 实际插入的行一致。
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

const skinsRoot = fileURLToPath(new URL("../../skins/", import.meta.url));
const loaderDir = fileURLToPath(new URL("../", import.meta.url));
const CONVENTION_ID = "dsh.ecosystem.ui-skin-loader/v1";

interface SkinPackage {
  dir: string;
  name: string;
  version: string;
  license?: string;
  files: string[];
  skinId: string;
  skinVersion: string;
  apiVersion: string;
  entryId: string;
  marker?: string;
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

/** 皮肤自有 body marker：`src/markers.ts` 的导出或 session.ts 的模块常量。 */
function readBodyMarker(dir: string): string | undefined {
  const candidates = [
    `${dir}/src/markers.ts`,
    `${dir}/src/client/session.ts`,
  ];
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    const match = /(?:ACTIVE_BODY_MARKER|BODY_MARKER)\s*=\s*"([^"]+)"/.exec(readFileSync(candidate, "utf8"));
    if (match) return match[1];
  }
  return undefined;
}

function listSkinPackages(): SkinPackage[] {
  return readdirSync(skinsRoot)
    .filter((name) => statSync(`${skinsRoot}/${name}`).isDirectory())
    .map((dir) => {
      const pkg = readJson(`${skinsRoot}/${dir}/package.json`);
      const dsh = (pkg.dsh ?? {}) as Record<string, unknown>;
      const skin = (dsh.skin ?? {}) as Record<string, unknown>;
      return {
        dir,
        name: String(pkg.name),
        version: String(pkg.version),
        license: pkg.license === undefined ? undefined : String(pkg.license),
        files: (pkg.files as string[] | undefined) ?? [],
        skinId: String(skin.id),
        skinVersion: String(skin.version),
        apiVersion: String(skin.apiVersion),
        // 行 id == settings 命名空间（api-notes §8.1）；本仓 12 款皮肤统一为 dsh-eac-skin-<dir>，
        // 与各包 src/identity.ts 的 ENTRY_ID/SETTINGS_NAMESPACE 常量、cordis.patch.yml 插入行三处一致。
        entryId: `dsh-eac-skin-${dir}`,
        marker: readBodyMarker(`${skinsRoot}/${dir}`),
      };
    });
}

const skinPackages = listSkinPackages();

test("workspace has at least the twelve migrated/built-in skin packages", () => {
  assert.ok(skinPackages.length >= 12, `expected >= 12 skin packages, found ${skinPackages.length}`);
});

test("skin package names are globally unique (a duplicate breaks release artifacts)", () => {
  const seen = new Map<string, string[]>();
  for (const pkg of skinPackages) {
    seen.set(pkg.name, [...(seen.get(pkg.name) ?? []), pkg.dir]);
  }
  const duplicates = [...seen.entries()].filter(([, dirs]) => dirs.length > 1);
  assert.deepEqual(duplicates, [], `duplicate package names: ${JSON.stringify(duplicates)}`);
});

test("covenant skin ids are globally unique", () => {
  const seen = new Map<string, string[]>();
  for (const pkg of skinPackages) {
    seen.set(pkg.skinId, [...(seen.get(pkg.skinId) ?? []), pkg.dir]);
  }
  const duplicates = [...seen.entries()].filter(([, dirs]) => dirs.length > 1);
  assert.deepEqual(duplicates, [], `duplicate skin ids: ${JSON.stringify(duplicates)}`);
});

test("every skin manifest declares the covenant apiVersion and a matching version", () => {
  for (const pkg of skinPackages) {
    assert.equal(pkg.apiVersion, CONVENTION_ID, `${pkg.dir}: apiVersion`);
    assert.match(pkg.skinId, /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/, `${pkg.dir}: skin id pattern`);
    assert.notEqual(pkg.skinId, "default", `${pkg.dir}: skin id must not be the reserved default`);
    assert.equal(pkg.skinVersion, pkg.version, `${pkg.dir}: dsh.skin.version must equal package version`);
  }
});

test("every skin ships LICENSE, NOTICE and THIRD-PARTY-NOTICES.md in its tarball", () => {
  for (const pkg of skinPackages) {
    for (const required of ["LICENSE", "NOTICE", "THIRD-PARTY-NOTICES.md"]) {
      assert.ok(
        pkg.files.includes(required),
        `${pkg.dir}: package.json "files" must list ${required}`,
      );
      assert.ok(
        existsSync(`${skinsRoot}/${pkg.dir}/${required}`),
        `${pkg.dir}: ${required} must exist on disk`,
      );
    }
  }
});

test("every license field is a well-formed SPDX expression", () => {
  for (const pkg of skinPackages) {
    assert.ok(pkg.license, `${pkg.dir}: license field is required`);
    assert.match(
      pkg.license!,
      /^[A-Za-z0-9.+-]+(?: (?:AND|OR|WITH) [A-Za-z0-9.+-]+)*$/,
      `${pkg.dir}: "${pkg.license}" is not a well-formed SPDX expression (ids must not contain spaces)`,
    );
  }
});

test("skin body markers are unique and never inside the loader namespace (R2/R3)", () => {
  const seen = new Map<string, string[]>();
  for (const pkg of skinPackages) {
    if (pkg.marker === undefined) continue;
    assert.ok(!pkg.marker.startsWith("data-usl-"), `${pkg.dir}: marker must not use the loader namespace`);
    assert.ok(pkg.marker.startsWith("data-dsh-"), `${pkg.dir}: marker must stay in the data-dsh- namespace`);
    seen.set(pkg.marker, [...(seen.get(pkg.marker) ?? []), pkg.dir]);
  }
  const collisions = [...seen.entries()].filter(([, dirs]) => dirs.length > 1);
  assert.deepEqual(collisions, [], `body markers collide across skins: ${JSON.stringify(collisions)}`);
});

test("each skin's settings row id matches its cordis.patch.yml insert row and its source constant", () => {
  for (const pkg of skinPackages) {
    const patch = readFileSync(`${skinsRoot}/${pkg.dir}/cordis.patch.yml`, "utf8");
    const rowId = new RegExp(`^\\s*-\\s*id:\\s*${pkg.entryId}\\s*$`, "m");
    assert.match(patch, rowId, `${pkg.dir}: cordis.patch.yml must insert row id ${pkg.entryId}`);
    const identity = readFileSync(`${skinsRoot}/${pkg.dir}/src/identity.ts`, "utf8");
    assert.ok(
      identity.includes(pkg.entryId),
      `${pkg.dir}: src/identity.ts must carry the settings row id ${pkg.entryId}`,
    );
  }
});

test("the loader package declares a license and ships its text", () => {
  const pkg = readJson(`${loaderDir}/package.json`);
  assert.ok(pkg.license, "packages/loader/package.json must declare a license");
  assert.equal(pkg.license, "MIT");
  const files = (pkg.files as string[] | undefined) ?? [];
  assert.ok(files.includes("LICENSE"), "packages/loader/package.json files must list LICENSE");
  assert.ok(existsSync(`${loaderDir}/LICENSE`), "packages/loader/LICENSE must exist");
});
