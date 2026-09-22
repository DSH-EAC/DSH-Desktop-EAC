import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(testDir, "..");
const promptRoot = join(desktopRoot, "assets", "skin-prompts");

function readJson(path: string): Record<string, any> {
  return JSON.parse(readFileSync(path, "utf8"));
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function validateSchema(
  schema: Record<string, any>,
  value: unknown,
  path = "$",
): string[] {
  const errors: string[] = [];

  if ("const" in schema && !sameJson(value, schema.const)) {
    errors.push(`${path} 必须等于 ${JSON.stringify(schema.const)}`);
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((item: unknown) => sameJson(item, value))) {
    errors.push(`${path} 不属于允许的枚举值`);
  }

  if (schema.type === "object") {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return [...errors, `${path} 必须是对象`];
    }
    const record = value as Record<string, unknown>;
    for (const key of schema.required ?? []) {
      if (!(key in record)) {
        errors.push(`${path}.${key} 是必填字段`);
      }
    }
    if (schema.additionalProperties === false) {
      const allowed = new Set(Object.keys(schema.properties ?? {}));
      for (const key of Object.keys(record)) {
        if (!allowed.has(key)) {
          errors.push(`${path}.${key} 是未声明字段`);
        }
      }
    }
    for (const [key, childSchema] of Object.entries(schema.properties ?? {})) {
      if (key in record) {
        errors.push(
          ...validateSchema(
            childSchema as Record<string, any>,
            record[key],
            `${path}.${key}`,
          ),
        );
      }
    }
  }

  if (schema.type === "array") {
    if (!Array.isArray(value)) {
      return [...errors, `${path} 必须是数组`];
    }
    if (typeof schema.minItems === "number" && value.length < schema.minItems) {
      errors.push(`${path} 至少需要 ${schema.minItems} 项`);
    }
    if (schema.uniqueItems === true) {
      const unique = new Set(value.map((item) => JSON.stringify(item)));
      if (unique.size !== value.length) {
        errors.push(`${path} 不允许重复项`);
      }
    }
    if (schema.items) {
      value.forEach((item, index) => {
        errors.push(
          ...validateSchema(
            schema.items as Record<string, any>,
            item,
            `${path}[${index}]`,
          ),
        );
      });
    }
  }

  if (schema.type === "string") {
    if (typeof value !== "string") {
      return [...errors, `${path} 必须是字符串`];
    }
    if (typeof schema.minLength === "number" && value.length < schema.minLength) {
      errors.push(`${path} 长度不能小于 ${schema.minLength}`);
    }
    if (typeof schema.pattern === "string" && !new RegExp(schema.pattern).test(value)) {
      errors.push(`${path} 不符合格式 ${schema.pattern}`);
    }
  }

  return errors;
}

test("Prompt 包基础文件完整", () => {
  for (const relativePath of [
    "README.md",
    "inventory.json",
    "schema/manifest.schema.json",
    "packages/miku/manifest.json",
    "packages/miku/prompt.md",
    "packages/miku/README.md",
  ]) {
    assert.equal(existsSync(join(promptRoot, relativePath)), true, relativePath);
  }
});

test("清单覆盖 EAC 与 AIO 的全部自定义皮肤", () => {
  const inventory = readJson(join(promptRoot, "inventory.json"));
  const inventoryIds = inventory.skins.map((skin: any) => skin.id).sort();

  assert.equal(inventory.schemaVersion, 1);
  assert.deepEqual(inventoryIds, [
    "blue-fantasy",
    "dragon-heir",
    "maid-atelier",
    "miku",
    "minecraft",
    "qq98",
    "ths",
    "trading",
    "whale-song",
    "xp",
  ]);
  assert.match(inventory.generatedFrom.EAC.revision, /^[0-9a-f]{40}$/);
  assert.match(inventory.generatedFrom.AIO.revision, /^[0-9a-f]{40}$/);

  for (const skin of inventory.skins) {
    assert.match(skin.eacTree, /^[0-9a-f]{40}$/);
    assert.match(skin.aioTree, /^[0-9a-f]{40}$/);

  }
});

test("每套皮肤都有符合版本 1 契约的完整 Prompt 包", () => {
  const inventory = readJson(join(promptRoot, "inventory.json"));
  const schema = readJson(join(promptRoot, "schema", "manifest.schema.json"));

  for (const skin of inventory.skins) {
    assert.equal(typeof skin.promptPackage, "string", skin.id);
    const packageRoot = join(promptRoot, skin.promptPackage);
    const manifestPath = join(packageRoot, "manifest.json");
    const readmePath = join(packageRoot, "README.md");

    assert.equal(existsSync(manifestPath), true, `${skin.id}/manifest.json`);
    assert.equal(existsSync(readmePath), true, `${skin.id}/README.md`);

    const manifest = readJson(manifestPath);
    const schemaErrors = validateSchema(schema, manifest);
    assert.deepEqual(schemaErrors, [], `${skin.id} 不符合 Manifest Schema`);
    assert.equal(manifest.schemaVersion, 1, skin.id);
    assert.equal(manifest.kind, "skin-prompt-package", skin.id);
    assert.equal(manifest.id, skin.id);
    assert.equal(manifest.prompt, "prompt.md", skin.id);
    assert.equal(manifest.target.surface, "dsh-client-web-ui", skin.id);
    assert.equal(manifest.target.preserveBehavior, true, skin.id);
    assert.deepEqual(manifest.target.themes.sort(), ["dark", "light"]);
    assert.deepEqual(
      manifest.sources.map((source: any) => source.project).sort(),
      ["AIO", "EAC"],
    );

    for (const source of manifest.sources) {
      assert.match(source.revision, /^[0-9a-f]{40}$/, skin.id);
      assert.match(source.tree, /^[0-9a-f]{40}$/, skin.id);
      const inventorySource =
        source.project === "EAC"
          ? {
              revision: inventory.generatedFrom.EAC.revision,
              root: inventory.generatedFrom.EAC.root,
              tree: skin.eacTree,
            }
          : {
              revision: inventory.generatedFrom.AIO.revision,
              root: inventory.generatedFrom.AIO.root,
              tree: skin.aioTree,
            };
      assert.equal(source.revision, inventorySource.revision, skin.id);
      assert.equal(source.repositoryPath, `${inventorySource.root}/${skin.id}`, skin.id);
      assert.equal(source.tree, inventorySource.tree, skin.id);
    }

    const references = [
      ...manifest.references.implementation,
      ...Object.values(manifest.references.previews),
      manifest.references.license.path,
    ];
    for (const reference of references) {
      assert.equal(typeof reference, "string", `${skin.id}: 引用必须是字符串`);
      assert.equal(reference.startsWith("../"), true, `${skin.id}: 引用必须指向仓库资源`);
      assert.equal(reference.includes("..\\..\\..\\assets\\shell-skin"), false);
      assert.equal(reference.includes("/shell-skin/"), false);
    }

    const prompt = readFileSync(join(packageRoot, manifest.prompt), "utf8");
    for (const section of manifest.requiredPromptSections) {
      assert.match(prompt, new RegExp(`^## ${section}$`, "m"), skin.id);
    }

    assert.doesNotMatch(prompt, /assets[\\/]shell-skin/, skin.id);
    assert.doesNotMatch(JSON.stringify(manifest), /assets[\\/]shell-skin/, skin.id);
  }
});
