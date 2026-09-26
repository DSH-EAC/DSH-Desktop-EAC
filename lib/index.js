// src/adapter/dsh-0.1.7-host.ts
import { spawn } from "node:child_process";
import { RemoteError, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import z from "@deepseek-ai/schemastery";

// src/protocol.ts
var CONVENTION_ID = "dsh.ecosystem.pack-installer/v1";
var SERVICE_NAME = "eacPackInstaller";
var SETTINGS_NAMESPACE = "dsh-eac-pack-installer";
var EAC_WORDMARK = "DSH\xB7EAC";
var OFFICIAL_SETTINGS_SECTION_SLOT = "settings.section";
var OFFICIAL_ACCOUNT_SECTION_ID = "account";
var OFFICIAL_ACCOUNT_NAMESPACE = "account";
var OFFICIAL_PLUGIN_MANAGER_SERVICE = "pluginManager";
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
var BRAND_LAYER_ID = "dsh-eac-brand-layer";
var BRAND_STYLE_ID = `${BRAND_LAYER_ID}-style`;

// src/core/tier-policy.ts
function tierOf(distributionClass) {
  switch (distributionClass) {
    case "builtin":
      return "L1";
    case "recommended":
      return "L2";
    case "external":
      return "L3";
    default:
      return "L3";
  }
}
function decideEnable(tier, userConsent) {
  switch (tier) {
    case "L1":
      return { tier, action: "enable", reason: "\u5185\u7F6E\uFF08L1\uFF09\uFF1A\u5B89\u88C5\u540E\u81EA\u52A8\u542F\u7528" };
    case "L2":
      return userConsent ? { tier, action: "enable", reason: "\u63A8\u8350\uFF08L2\uFF09\uFF1A\u6309\u4F60\u7684\u9009\u62E9\u542F\u7528" } : { tier, action: "leave-disabled", reason: "\u63A8\u8350\uFF08L2\uFF09\uFF1A\u672A\u52FE\u9009\u542F\u7528\uFF0C\u4FDD\u6301\u5173\u95ED" };
    case "L3":
      return { tier, action: "leave-disabled", reason: "\u4E0D\u63A8\u8350\uFF08L3\uFF09\uFF1A\u5B89\u88C5\u540E\u4FDD\u6301\u5173\u95ED\uFF0C\u53EF\u5728\u63D2\u4EF6\u7BA1\u7406\u4E2D\u624B\u52A8\u542F\u7528" };
  }
}

// src/core/catalog.ts
var CATALOG_API_VERSION = "catalog.mojobox.dev/v1alpha1";
var CatalogParseError = class extends Error {
  code = "catalog/invalid";
  constructor(message) {
    super(message);
    this.name = "CatalogParseError";
  }
};
var DISTRIBUTION_CLASSES = ["builtin", "recommended", "external"];
var PACK_CATEGORIES = ["appearance", "function", "workflow"];
function requireString(value, where) {
  if (typeof value !== "string" || value.length === 0) {
    throw new CatalogParseError(`${where} must be a non-empty string`);
  }
  return value;
}
function optionalString(value) {
  return typeof value === "string" && value.length > 0 ? value : null;
}
var TIER_SOURCES = ["desktop-sync", "installer-policy", "unmapped"];
function parsePluginRecord(raw, index) {
  if (!isRecord(raw)) throw new CatalogParseError(`plugins[${index}] must be an object`);
  const id = requireString(raw["id"], `plugins[${index}].id`);
  const name = requireString(raw["name"], `plugins[${index}].name`);
  const version = requireString(raw["version"], `plugins[${index}].version`);
  const artifact = isRecord(raw["artifact"]) ? raw["artifact"] : null;
  const maintenance = isRecord(raw["x-mojobox-maintenance"]) ? raw["x-mojobox-maintenance"] : null;
  let distributionClass = null;
  let tierSource = "unmapped";
  const distribution = isRecord(raw["x-mojobox-distribution"]) ? raw["x-mojobox-distribution"] : null;
  const rawClass = distribution?.["distributionClass"];
  if (rawClass !== void 0 && rawClass !== null) {
    if (typeof rawClass !== "string" || !DISTRIBUTION_CLASSES.includes(rawClass)) {
      throw new CatalogParseError(
        `plugins[${index}] (${id}) x-mojobox-distribution.distributionClass must be one of ${DISTRIBUTION_CLASSES.join(", ")}`
      );
    }
    distributionClass = rawClass;
    const rawSource = distribution?.["source"];
    if (rawSource === void 0) {
      tierSource = "desktop-sync";
    } else if (typeof rawSource !== "string" || !TIER_SOURCES.includes(rawSource) || rawSource === "unmapped") {
      throw new CatalogParseError(
        `plugins[${index}] (${id}) x-mojobox-distribution.source must be desktop-sync or installer-policy`
      );
    } else {
      tierSource = rawSource;
    }
  }
  return {
    id,
    name,
    version,
    artifactUrl: optionalString(artifact?.["path"]),
    artifactDigest: optionalString(artifact?.["digest"]),
    distributionClass,
    tierSource,
    maintenanceReason: optionalString(maintenance?.["reason"])
  };
}
function lockSources(packRecord, packId) {
  const sources = /* @__PURE__ */ new Map();
  const lock = packRecord["lock"];
  if (!isRecord(lock)) return sources;
  const components = lock["components"];
  if (!Array.isArray(components)) return sources;
  for (const [index, entry] of components.entries()) {
    if (!isRecord(entry)) throw new CatalogParseError(`${packId}.lock.components[${index}] must be an object`);
    const id = requireString(entry["id"], `${packId}.lock.components[${index}].id`);
    const source = requireString(entry["source"], `${packId}.lock.components[${index}].source`);
    sources.set(id, source);
  }
  return sources;
}
function registrySpecFromLockSource(source, where) {
  if (!source.startsWith("npm:")) {
    throw new CatalogParseError(`${where}: unsupported lock source ${JSON.stringify(source)} (only npm: is installable)`);
  }
  const spec = source.slice("npm:".length);
  if (!spec.includes("@", 1)) {
    throw new CatalogParseError(`${where}: lock source ${JSON.stringify(source)} names no version`);
  }
  return spec;
}
function isTarballUrl(url) {
  return /^https:\/\/\S+\.(tgz|tar\.gz)$/.test(url);
}
function parseComponent(raw, index, packId, plugins, lockByComponent) {
  if (!isRecord(raw)) throw new CatalogParseError(`${packId}.components[${index}] must be an object`);
  const id = requireString(raw["id"], `${packId}.components[${index}].id`);
  const version = requireString(raw["version"], `${packId}.components[${index}].version`);
  const required = raw["required"] === true;
  const plugin = plugins.get(id);
  if (plugin === void 0) {
    throw new CatalogParseError(`${packId}: component ${id} has no catalog plugin record`);
  }
  const where = `${packId}:${id}`;
  const lockedSource = lockByComponent.get(id);
  let installSpec = null;
  if (lockedSource !== void 0) {
    installSpec = registrySpecFromLockSource(lockedSource, where);
  } else if (plugin.artifactUrl !== null && isTarballUrl(plugin.artifactUrl)) {
    installSpec = plugin.artifactUrl;
  }
  const sourcePending = installSpec === null;
  return {
    id,
    name: plugin.name,
    version,
    installSpec,
    artifactUrl: plugin.artifactUrl,
    artifactDigest: plugin.artifactDigest,
    distributionClass: plugin.distributionClass,
    tierSource: plugin.tierSource,
    tier: tierOf(plugin.distributionClass),
    required,
    sourcePending,
    reason: sourcePending ? plugin.maintenanceReason ?? "\u76EE\u5F55\u8BB0\u5F55\u5C1A\u672A\u53D1\u5E03\u53EF\u5B89\u88C5\u7684\u5236\u54C1\uFF08source-pending\uFF09" : null
  };
}
function parseProvenance(raw, packId, components, locked) {
  if (isRecord(raw)) {
    const kind = requireString(raw["kind"], `${packId}.x-dsh-eac-provenance.kind`);
    if (kind !== "mojobox-pack" && kind !== "snapshot-derived") {
      throw new CatalogParseError(`${packId}.x-dsh-eac-provenance.kind must be mojobox-pack or snapshot-derived`);
    }
    const sources = Array.isArray(raw["sources"]) ? raw["sources"].map((entry, index) => requireString(entry, `${packId}.x-dsh-eac-provenance.sources[${index}]`)) : [];
    return {
      kind,
      locked,
      reason: requireString(raw["reason"], `${packId}.x-dsh-eac-provenance.reason`),
      sources
    };
  }
  const pending = components.filter((component) => component.sourcePending);
  return {
    kind: "mojobox-pack",
    locked,
    reason: locked ? "\u6765\u81EA Mojobox Pack \u4E0E Pack Lock" : `Mojobox \u5C1A\u65E0\u8BE5 Pack \u7684 Pack Lock\uFF08${pending.length} \u4E2A\u6210\u5458 source-pending\uFF0C\u7F3A\u771F\u5B9E npm \u5236\u54C1\uFF09`,
    sources: components.map((component) => component.id)
  };
}
function parsePack(raw, index, plugins) {
  if (!isRecord(raw)) throw new CatalogParseError(`packs[${index}] must be an object`);
  const metadata = raw["metadata"];
  if (!isRecord(metadata)) throw new CatalogParseError(`packs[${index}].metadata must be an object`);
  const id = requireString(metadata["id"], `packs[${index}].metadata.id`);
  const version = requireString(metadata["version"], `packs[${index}].metadata.version`);
  const name = requireString(metadata["name"], `packs[${index}].metadata.name`);
  const description = requireString(metadata["description"], `packs[${index}].metadata.description`);
  const rawCategory = metadata["category"];
  const category = typeof rawCategory === "string" && PACK_CATEGORIES.includes(rawCategory) ? rawCategory : "function";
  const rawComponents = raw["components"];
  if (!Array.isArray(rawComponents) || rawComponents.length === 0) {
    throw new CatalogParseError(`${id}.components must be a non-empty array`);
  }
  const lockByComponent = lockSources(raw, id);
  const components = rawComponents.map(
    (component, componentIndex) => parseComponent(component, componentIndex, id, plugins, lockByComponent)
  );
  const locked = lockByComponent.size > 0 && components.every((component) => lockByComponent.has(component.id));
  return {
    id,
    version,
    name,
    description,
    category,
    provenance: parseProvenance(raw["x-dsh-eac-provenance"], id, components, locked),
    components
  };
}
function parseCatalog(raw, options = {}) {
  if (!isRecord(raw)) throw new CatalogParseError("catalog must be an object");
  const apiVersion = requireString(raw["apiVersion"], "catalog.apiVersion");
  if (apiVersion !== CATALOG_API_VERSION) {
    throw new CatalogParseError(`catalog.apiVersion must be ${CATALOG_API_VERSION}, received ${JSON.stringify(apiVersion)}`);
  }
  const rawPlugins = raw["plugins"];
  if (!Array.isArray(rawPlugins)) throw new CatalogParseError("catalog.plugins must be an array");
  const plugins = /* @__PURE__ */ new Map();
  for (const [index, entry] of rawPlugins.entries()) {
    const record = parsePluginRecord(entry, index);
    if (plugins.has(record.id)) throw new CatalogParseError(`catalog.plugins repeats id ${record.id}`);
    plugins.set(record.id, record);
  }
  const rawPacks = raw["packs"];
  if (!Array.isArray(rawPacks)) throw new CatalogParseError("catalog.packs must be an array");
  const packs = rawPacks.map((pack, index) => parsePack(pack, index, plugins));
  return { apiVersion, generatedAt: options.generatedAt ?? "", packs };
}
function findPack(snapshot, packId) {
  return snapshot.packs.find((pack) => pack.id === packId);
}

// src/core/catalog-source.ts
var DEFAULT_ONLINE_TIMEOUT_MS = 5e3;
function describe(error) {
  return error instanceof Error ? error.message : String(error);
}
async function fetchWithDeadline(port, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (typeof timer === "object" && typeof timer.unref === "function") timer.unref();
  try {
    return await port.fetchOnline(controller.signal);
  } catch (error) {
    if (controller.signal.aborted) throw new Error(`\u5728\u7EBF\u76EE\u5F55\u8BFB\u53D6\u8D85\u65F6\uFF08${timeoutMs}ms\uFF09`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
async function loadCatalog(options) {
  const { embedded, port, enabled = true, timeoutMs = DEFAULT_ONLINE_TIMEOUT_MS, generatedAt } = options;
  const fallback = parseCatalog(embedded, generatedAt === void 0 ? {} : { generatedAt });
  if (!enabled) {
    return { source: "snapshot", degraded: false, warnings: ["\u79BB\u7EBF\u6A21\u5F0F\uFF1A\u4F7F\u7528\u5185\u5D4C\u76EE\u5F55\u5FEB\u7167"], snapshot: fallback };
  }
  if (port === null) {
    return { source: "snapshot", degraded: false, warnings: [], snapshot: fallback };
  }
  try {
    const online = parseCatalog(await fetchWithDeadline(port, timeoutMs));
    if (online.packs.length === 0) throw new Error("\u5728\u7EBF\u76EE\u5F55\u6CA1\u6709\u4EFB\u4F55 Pack");
    return { source: "online", degraded: false, warnings: [], snapshot: online };
  } catch (error) {
    return {
      source: "snapshot",
      degraded: true,
      warnings: [`\u5728\u7EBF\u76EE\u5F55\u4E0D\u53EF\u7528\uFF08${describe(error)}\uFF09\uFF0C\u5DF2\u56DE\u9000\u5230\u5185\u5D4C\u5FEB\u7167`],
      snapshot: fallback
    };
  }
}

// src/core/host-seam.ts
function describeHostSeam(facts) {
  return {
    manager: facts.managerMounted ? "pluginManager" : "cli-fallback",
    settingsShell: OFFICIAL_SETTINGS_SECTION_SLOT,
    account: facts.accountMounted ? OFFICIAL_ACCOUNT_NAMESPACE : null,
    accountSection: OFFICIAL_ACCOUNT_SECTION_ID,
    installUi: "official-plugin-manager",
    credentials: "official-account-remote",
    wordmark: EAC_WORDMARK
  };
}
function postInstallSteps(facts) {
  const steps = [];
  if (facts.installedCount === 0) {
    return [
      {
        kind: "done",
        label: "\u6CA1\u6709\u9700\u8981\u5B89\u88C5\u7684\u7EC4\u4EF6",
        detail: "\u6240\u9009\u9879\u90FD\u5DF2\u5B89\u88C5\uFF0C\u65E0\u9700\u6539\u52A8\u3002",
        target: null
      }
    ];
  }
  if (facts.unknownEnablementCount > 0) {
    steps.push({
      kind: "enable-plugins",
      label: "\u786E\u8BA4\u63D2\u4EF6\u542F\u7528\u72B6\u6001",
      detail: `${facts.unknownEnablementCount} \u4E2A\u7EC4\u4EF6\u901A\u8FC7 dsh plugin CLI \u5B89\u88C5\uFF0C\u8BE5\u8DEF\u5F84\u65E0\u6CD5\u62A5\u544A\u542F\u7528\u72B6\u6001\uFF1B\u8BF7\u5728\u5B98\u65B9\u300C\u63D2\u4EF6\u300D\u8BBE\u7F6E\u4E2D\u786E\u8BA4\u3002`,
      target: "official-plugin-settings"
    });
  }
  if (facts.restartRequired) {
    steps.push({
      kind: "restart",
      label: "\u91CD\u542F DSH",
      detail: "profile \u5DF2\u5199\u5165\uFF0C\u91CD\u542F DSH \u540E\u65B0\u63D2\u4EF6\u751F\u6548\u3002",
      target: "official-restart"
    });
  }
  if (facts.account === "signed-out") {
    steps.push({
      kind: "sign-in",
      label: "\u767B\u5F55 DeepSeek \u8D26\u53F7",
      detail: "\u767B\u5F55\u540E\u5373\u53EF\u76F4\u63A5\u4F7F\u7528\u6A21\u578B\uFF0C\u65E0\u9700\u586B\u5199 API Key\u3002\u767B\u5F55\u5165\u53E3\u4E0E\u51ED\u636E\u7531\u5B98\u65B9\u8D26\u53F7\u754C\u9762\u6301\u6709\uFF0C\u672C\u63D2\u4EF6\u4E0D\u63A5\u89E6\u4EFB\u4F55\u5BC6\u94A5\u3002",
      target: "official-account-settings"
    });
  } else if (facts.account === "unknown") {
    steps.push({
      kind: "sign-in",
      label: "\u786E\u8BA4 DeepSeek \u8D26\u53F7\u767B\u5F55\u72B6\u6001",
      detail: "\u65E0\u6CD5\u8BFB\u53D6\u5B98\u65B9\u8D26\u53F7\u72B6\u6001\uFF1B\u82E5\u5C1A\u672A\u767B\u5F55\uFF0C\u8BF7\u5728\u5B98\u65B9\u300C\u8D26\u53F7\u300D\u8BBE\u7F6E\u4E2D\u767B\u5F55\uFF0C\u767B\u5F55\u540E\u65E0\u9700 API Key \u5373\u53EF\u4F7F\u7528\u6A21\u578B\u3002",
      target: "official-account-settings"
    });
  }
  if (steps.length === 0) {
    steps.push({
      kind: "done",
      label: "\u5B89\u88C5\u5B8C\u6210",
      detail: `\u5DF2\u5B89\u88C5\u5E76\u542F\u7528 ${facts.enabledCount} \u4E2A\u7EC4\u4EF6\uFF1BDeepSeek \u8D26\u53F7\u5DF2\u767B\u5F55\uFF0C\u53EF\u76F4\u63A5\u4F7F\u7528\u6A21\u578B\u3002`,
      target: null
    });
  }
  return steps;
}

// src/core/installer.ts
var sequence = 0;
function nextRequestId() {
  sequence += 1;
  return `pack-install-${Date.now().toString(36)}-${sequence}`;
}
function freezeStep(step) {
  return Object.freeze({ ...step });
}
function freezeProgress(progress) {
  return Object.freeze({ ...progress, steps: Object.freeze(progress.steps.map(freezeStep)) });
}
function resolveRequested(pack, componentId) {
  const component = pack.components.find((candidate) => candidate.id === componentId);
  if (component === void 0) throw new Error(`install request names an unknown component: ${componentId}`);
  if (component.installSpec === null) throw new Error(`install request names a component with no install spec: ${componentId}`);
  return component;
}
function startInstall(options) {
  const { request, pack, port, onProgress } = options;
  const now = options.now ?? (() => Date.now());
  if (request.packId !== pack.id) {
    throw new Error(`install request names pack ${request.packId} but was resolved against ${pack.id}`);
  }
  const planned = request.componentIds.map((componentId) => resolveRequested(pack, componentId));
  const consented = new Set(request.enableComponentIds);
  const requestId = options.requestId ?? nextRequestId();
  const startedAt = now();
  let cancelled = false;
  let current = freezeProgress({
    requestId,
    packId: pack.id,
    state: "running",
    startedAt,
    finishedAt: null,
    error: null,
    steps: planned.map((component) => ({
      componentId: component.id,
      name: component.name,
      installSpec: component.installSpec,
      state: "pending",
      tier: component.tier,
      enableRequested: false,
      enabled: null,
      message: null
    }))
  });
  const publish = (next) => {
    current = freezeProgress(next);
    try {
      onProgress?.(current);
    } catch {
    }
  };
  publish(current);
  const settle = (state, error, fromIndex) => {
    const steps = current.steps.map(
      (step, index) => index >= fromIndex && step.state === "pending" ? { ...step, state: "skipped" } : step
    );
    publish({ ...current, state, error, finishedAt: now(), steps });
  };
  const run = async () => {
    for (const [index, component] of planned.entries()) {
      if (cancelled) {
        settle("cancelled", null, index);
        return current;
      }
      const decision = decideEnable(component.tier, consented.has(component.id));
      const activate = decision.action === "enable";
      publish({
        ...current,
        steps: current.steps.map(
          (step, stepIndex) => stepIndex === index ? { ...step, state: "installing", enableRequested: activate } : step
        )
      });
      const result = await port.install(component.installSpec, {
        requestId,
        componentId: component.id,
        name: component.name,
        activate
      });
      if (!result.ok) {
        publish({
          ...current,
          steps: current.steps.map(
            (step, stepIndex) => stepIndex === index ? { ...step, state: "failed", message: result.message ?? "\u5B89\u88C5\u5931\u8D25" } : step
          )
        });
        settle("failed", `${component.id}: ${result.message ?? "\u5B89\u88C5\u5931\u8D25"}`, index + 1);
        return current;
      }
      let state;
      let enabled = result.enabled ?? null;
      let message = decision.reason;
      if (activate) {
        const enabledResult = await port.setEnabled({ componentId: component.id, name: component.name }, true);
        if (enabledResult.ok) {
          state = "enabled";
          enabled = enabledResult.enabled ?? true;
          message = enabledResult.message ?? decision.reason;
        } else {
          state = "installed";
          enabled = enabledResult.enabled ?? false;
          message = enabledResult.message ?? "\u5DF2\u5B89\u88C5\uFF0C\u4F46\u542F\u7528\u5931\u8D25";
        }
      } else if (result.enabled === false) {
        state = "disabled";
        message = decision.reason;
      } else {
        state = "installed";
        enabled = null;
        message = result.message ?? decision.reason;
      }
      publish({
        ...current,
        steps: current.steps.map((step, stepIndex) => stepIndex === index ? { ...step, state, enabled, message } : step)
      });
    }
    if (cancelled) {
      settle("cancelled", null, planned.length);
      return current;
    }
    settle("completed", null, planned.length);
    return current;
  };
  const done = Promise.resolve().then(run);
  return {
    requestId,
    progress: () => current,
    cancel: () => {
      cancelled = true;
    },
    done
  };
}

// src/adapter/ports.ts
var SUCCESSFUL_APPLICATIONS = /* @__PURE__ */ new Set(["applied", "restart-required", "overridden"]);
function describeChange(result, fallback) {
  const diagnostic = result.error?.diagnostic;
  if (typeof diagnostic === "string" && diagnostic.length > 0) return diagnostic;
  if (result.error?.code !== void 0) return `${result.error.code}`;
  const warning = result.warnings?.[0];
  if (typeof warning === "string" && warning.length > 0) return warning;
  if (result.application === "restart-required") return "\u5DF2\u5199\u5165 profile\uFF0C\u91CD\u542F DSH \u540E\u751F\u6548";
  return result.changed === false ? fallback : null;
}
async function findEntryId(manager, component) {
  const plugins = await manager.listPlugins();
  const entry = plugins.find((candidate) => candidate.name === component.name);
  return entry?.id ?? null;
}
function createManagerPort(manager) {
  return {
    async install(spec, context) {
      try {
        const result = await manager.installBundle(spec, { enabled: context.activate, requestId: context.requestId });
        const application = result.application ?? "applied";
        if (!SUCCESSFUL_APPLICATIONS.has(application)) {
          return { ok: false, message: describeChange(result, `pluginManager \u8FD4\u56DE ${application}`) ?? `pluginManager \u8FD4\u56DE ${application}` };
        }
        return {
          ok: true,
          message: describeChange(result, `\u5DF2\u5B89\u88C5 ${spec}`),
          enabled: typeof result.enabled === "boolean" ? result.enabled : null
        };
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : String(error) };
      }
    },
    async setEnabled(component, enabled) {
      try {
        const entryId = await findEntryId(manager, component);
        if (entryId === null) {
          return { ok: false, enabled: null, message: `profile \u4E2D\u627E\u4E0D\u5230 ${component.name} \u7684\u52A0\u8F7D\u6761\u76EE\uFF0C\u672A\u542F\u7528` };
        }
        const result = await manager.setPluginEnabled(entryId, enabled);
        const application = result.application ?? "applied";
        if (!SUCCESSFUL_APPLICATIONS.has(application)) {
          return { ok: false, enabled: false, message: describeChange(result, `\u542F\u7528 ${component.name} \u5931\u8D25`) };
        }
        return {
          ok: true,
          enabled: typeof result.enabled === "boolean" ? result.enabled : enabled,
          message: describeChange(result, null) ?? null
        };
      } catch (error) {
        return { ok: false, enabled: false, message: error instanceof Error ? error.message : String(error) };
      }
    }
  };
}
function createCliPort(options) {
  const dshCommand = options.dshCommand ?? "dsh";
  const args = ["plugin", "--profile", options.profile];
  return {
    async install(spec) {
      const result = await options.runner.run(dshCommand, [...args, "add", spec]);
      if (result.exitCode !== 0) {
        return { ok: false, message: `dsh plugin add \u9000\u51FA\u7801 ${result.exitCode}\uFF1A${result.output.trim().slice(-500)}` };
      }
      return {
        ok: true,
        message: "\u5DF2\u901A\u8FC7 dsh plugin \u5B89\u88C5\uFF1B\u8BE5\u8DEF\u5F84\u65E0\u6CD5\u62A5\u544A\u542F\u7528\u72B6\u6001\uFF0C\u8BF7\u5728\u300C\u63D2\u4EF6\u300D\u8BBE\u7F6E\u4E2D\u786E\u8BA4",
        enabled: null
      };
    },
    async setEnabled(component, enabled) {
      return {
        ok: false,
        enabled: null,
        message: `\u5F53\u524D profile \u672A\u6302\u8F7D pluginManager\uFF0C\u65E0\u6CD5\u81EA\u52A8${enabled ? "\u542F\u7528" : "\u505C\u7528"} ${component.name}\uFF1B\u8BF7\u5728\u300C\u63D2\u4EF6\u300D\u8BBE\u7F6E\u4E2D\u624B\u52A8\u5207\u6362`
      };
    }
  };
}
function selectPort(manager, cliPort) {
  return manager === void 0 ? cliPort : createManagerPort(manager);
}

// src/adapter/remote-marker.ts
var REMOTE_METHOD_DESCRIPTOR = "@deepseek-ai/dsh-typert-protocol/remote-methods";
function markRemoteMethods(prototype, methods) {
  const marked = methods.map((method) => {
    if (!/^[A-Za-z0-9_$.-]+$/.test(method) || method === "." || method === "..") {
      throw new TypeError(`remote-marker: ${JSON.stringify(method)} is not a usable Remote endpoint segment`);
    }
    return Object.freeze({ method, invocation: Object.freeze({ kind: "direct" }) });
  });
  Object.defineProperty(prototype, REMOTE_METHOD_DESCRIPTOR, {
    configurable: true,
    writable: false,
    value: Object.freeze({ version: 1, methods: Object.freeze(marked) })
  });
}

// src/data/snapshot.ts
var SNAPSHOT_GENERATED_AT = "2026-09-26T17:27:18.420Z";
var snapshotDocument = {
  "apiVersion": "catalog.mojobox.dev/v1alpha1",
  "plugins": [
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.aio.dsh-drag-and-drop",
      "name": "dsh-drag-and-drop",
      "version": "0.1.6",
      "facets": {
        "host": {
          "entry": "lib/index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "BSD-3-Clause",
      "source": {
        "repository": "https://github.com/omdsh-dev/dsh-drag-and-drop",
        "revision": "0.1.6"
      },
      "artifact": {
        "digest": "sha256:d50d050373555a73d43bd0ff400028b4012b7375ec5b1134f76adaa48859b8f0",
        "algorithm": "sha256",
        "path": "https://registry.npmjs.org/dsh-drag-and-drop/-/dsh-drag-and-drop-0.1.6.tgz"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "reason": "Upstream package does not publish dsh-plugin.json"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.aio.dsh-find-plugin",
      "name": "dsh-find-plugin",
      "version": "0.3.7",
      "facets": {
        "host": {
          "entry": "lib/index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT",
      "source": {
        "repository": "https://github.com/awesome-dsh-plugin/dsh-find-plugin",
        "revision": "0.3.7"
      },
      "artifact": {
        "digest": "sha256:46c408fc9f649b90ec25b30fa02dcc0f1e783c4a269e82468b7095ce1cffa992",
        "algorithm": "sha256",
        "path": "https://registry.npmjs.org/dsh-find-plugin/-/dsh-find-plugin-0.3.7.tgz"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "reason": "Upstream package does not publish dsh-plugin.json"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.aio.dsh-meme",
      "name": "dsh-meme",
      "version": "0.1.40",
      "facets": {
        "host": {
          "entry": "index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT",
      "source": {
        "repository": "https://github.com/yyh-001/dsh-meme",
        "revision": "0.1.40"
      },
      "artifact": {
        "digest": "sha256:aa472d113bd269f9807863fdea033293b158f3b2bb72cd07797eb55ed9d9bb55",
        "algorithm": "sha256",
        "path": "https://registry.npmjs.org/dsh-meme/-/dsh-meme-0.1.40.tgz"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "reason": "Upstream package does not publish dsh-plugin.json"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.aio.dsh-navbar",
      "name": "@vlln/dsh-navbar",
      "version": "0.4.0",
      "facets": {
        "host": {
          "entry": "lib/index.mjs",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT",
      "source": {
        "repository": "https://github.com/vlln/dsh-navbar",
        "revision": "0.4.0"
      },
      "artifact": {
        "digest": "sha256:72886a2376c09e202a830029beb5503ce4710a9b208bacca8759c2d41a61c908",
        "algorithm": "sha256",
        "path": "https://registry.npmjs.org/@vlln/dsh-navbar/-/dsh-navbar-0.4.0.tgz"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "reason": "Upstream package does not publish dsh.plugin.json"
      },
      "x-mojobox-distribution": {
        "distributionClass": "recommended",
        "source": "desktop-sync"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.aio.dsh-smooth-stream",
      "name": "dsh-smooth-stream",
      "version": "0.4.3",
      "facets": {
        "host": {
          "entry": "lib/index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT",
      "source": {
        "repository": "https://github.com/Laplace-bit/dsh-smooth-stream",
        "revision": "0.4.3"
      },
      "artifact": {
        "digest": "sha256:8e1746b755d3d606d91641da9905e91647fe2a78a41d9a85f7a8b3a0b1a31038",
        "algorithm": "sha256",
        "path": "https://registry.npmjs.org/dsh-smooth-stream/-/dsh-smooth-stream-0.4.3.tgz"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "reason": "Upstream package does not publish dsh-plugin.json"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.aio.dsh-status-rotator",
      "name": "dsh-status-rotator",
      "version": "0.9.1",
      "facets": {
        "host": {
          "entry": "lib/index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT",
      "source": {
        "repository": "https://github.com/01Virex/dsh-status-rotator",
        "revision": "0.9.1"
      },
      "artifact": {
        "digest": "sha256:632723d46aae2d34fda28e588f21c628993c6f34afb4b354319661e3b13165a7",
        "algorithm": "sha256",
        "path": "https://registry.npmjs.org/dsh-status-rotator/-/dsh-status-rotator-0.9.1.tgz"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "reason": "Upstream package does not publish dsh-plugin.json"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.aio.dsh-wallpaper-engine",
      "name": "dsh-plugin-wallpaper-engine",
      "version": "0.6.8",
      "facets": {
        "host": {
          "entry": "lib/index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT",
      "source": {
        "repository": "https://github.com/elysia395/dsh-wallpaper-engine",
        "revision": "0.6.8"
      },
      "artifact": {
        "digest": "sha256:2ff76ed3b82937efe87ca829c7a4fca00b21ca521a208ffd501124f6b6f17006",
        "algorithm": "sha256",
        "path": "https://registry.npmjs.org/dsh-plugin-wallpaper-engine/-/dsh-plugin-wallpaper-engine-0.6.8.tgz"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "reason": "Upstream package does not publish dsh-plugin.json"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.aio.dsh-whale-widget",
      "name": "dsh-whale-widget",
      "version": "0.2.10",
      "facets": {
        "host": {
          "entry": "lib/index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT",
      "source": {
        "repository": "https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget",
        "revision": "0.2.10"
      },
      "artifact": {
        "digest": "sha256:c53074c8e792a7f42c8341a45063276fa194307fc3752a594848cc64aa833bc2",
        "algorithm": "sha256",
        "path": "https://registry.npmjs.org/dsh-whale-widget/-/dsh-whale-widget-0.2.10.tgz"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "reason": "Upstream package does not publish dsh-plugin.json"
      },
      "x-mojobox-distribution": {
        "distributionClass": "external",
        "source": "desktop-sync"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.eac.dsh-client-file-changes",
      "name": "@deepseek-ai/dsh-client-file-changes",
      "version": "0.1.0",
      "facets": {
        "host": {
          "entry": "lib/index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT",
      "source": {
        "repository": "https://github.com/DSH-EAC/DSH-Desktop-EAC",
        "revision": "a9b90e254800dfe84c65c01d150a8596e94f6a31"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "artifactStatus": "unpublished",
        "sourcePath": "dsh-desktop/assets/plugins/dsh-client-file-changes"
      },
      "x-mojobox-distribution": {
        "distributionClass": "builtin",
        "source": "desktop-sync"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.eac.dsh-compact",
      "name": "dsh-compact",
      "version": "1.0.0",
      "facets": {
        "host": {
          "entry": "lib/index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT",
      "source": {
        "repository": "https://github.com/lanyun077/Deepseek-Harness-EAC",
        "revision": "94304f39405cbada937b26e60c3efe754387f7d3"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "artifactStatus": "unpublished",
        "sourcePath": "dsh-desktop/assets/plugins/dsh-compact"
      },
      "x-mojobox-distribution": {
        "distributionClass": "builtin",
        "source": "desktop-sync"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.eac.dsh-eac-core-bridge",
      "name": "dsh-eac-core-bridge",
      "version": "1.0.0",
      "facets": {
        "host": {
          "entry": "index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT",
      "source": {
        "repository": "https://github.com/DSH-EAC/DSH-Desktop-EAC",
        "revision": "a9b90e254800dfe84c65c01d150a8596e94f6a31"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "artifactStatus": "unpublished",
        "sourcePath": "dsh-desktop/assets/plugins/dsh-eac-core-bridge"
      },
      "x-mojobox-distribution": {
        "distributionClass": "builtin",
        "source": "desktop-sync"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.eac.dsh-eac-locale-compat",
      "name": "dsh-eac-locale-compat",
      "version": "1.0.0",
      "facets": {
        "host": {
          "entry": "lib/index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT",
      "source": {
        "repository": "https://github.com/DSH-EAC/DSH-Desktop-EAC",
        "revision": "a9b90e254800dfe84c65c01d150a8596e94f6a31"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "artifactStatus": "unpublished",
        "sourcePath": "dsh-desktop/assets/plugins/dsh-eac-locale-compat"
      },
      "x-mojobox-distribution": {
        "distributionClass": "builtin",
        "source": "desktop-sync"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.eac.dsh-easy-setup",
      "name": "@deepseek-ai/dsh-easy-setup",
      "version": "0.1.0",
      "facets": {
        "host": {
          "entry": "lib/index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT",
      "source": {
        "repository": "https://github.com/DSH-EAC/DSH-Desktop-EAC",
        "revision": "a9b90e254800dfe84c65c01d150a8596e94f6a31"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "artifactStatus": "unpublished",
        "sourcePath": "dsh-desktop/assets/plugins/dsh-easy-setup"
      },
      "x-mojobox-distribution": {
        "distributionClass": "builtin",
        "source": "desktop-sync"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.eac.dsh-file-changes",
      "name": "@deepseek-ai/dsh-file-changes",
      "version": "0.1.0",
      "facets": {
        "host": {
          "entry": "lib/index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT",
      "source": {
        "repository": "https://github.com/DSH-EAC/DSH-Desktop-EAC",
        "revision": "a9b90e254800dfe84c65c01d150a8596e94f6a31"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "artifactStatus": "unpublished",
        "sourcePath": "dsh-desktop/assets/plugins/dsh-file-changes"
      },
      "x-mojobox-distribution": {
        "distributionClass": "builtin",
        "source": "desktop-sync"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.eac.dsh-file-drop-eac",
      "name": "dsh-file-drop-eac",
      "version": "0.1.2",
      "facets": {
        "host": {
          "entry": "lib/index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT",
      "source": {
        "repository": "https://github.com/DSH-EAC/DSH-Desktop-EAC",
        "revision": "a9b90e254800dfe84c65c01d150a8596e94f6a31"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "artifactStatus": "unpublished",
        "sourcePath": "dsh-desktop/assets/plugins/dsh-file-drop-eac"
      },
      "x-mojobox-distribution": {
        "distributionClass": "builtin",
        "source": "desktop-sync"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.eac.dsh-message-rewind",
      "name": "dsh-message-rewind",
      "version": "0.1.0",
      "facets": {
        "host": {
          "entry": "lib/host.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT",
      "source": {
        "repository": "https://github.com/lanyun077/Deepseek-Harness-EAC",
        "revision": "94304f39405cbada937b26e60c3efe754387f7d3"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "artifactStatus": "unpublished",
        "sourcePath": "dsh-desktop/assets/plugins/dsh-message-rewind"
      },
      "x-mojobox-distribution": {
        "distributionClass": "recommended",
        "source": "desktop-sync"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.eac.dsh-plugin-manager",
      "name": "@deepseek-ai/dsh-plugin-manager",
      "version": "0.1.0",
      "facets": {
        "host": {
          "entry": "lib/index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT",
      "source": {
        "repository": "https://github.com/DSH-EAC/DSH-Desktop-EAC",
        "revision": "a9b90e254800dfe84c65c01d150a8596e94f6a31"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "artifactStatus": "unpublished",
        "sourcePath": "dsh-desktop/assets/plugins/dsh-plugin-manager"
      },
      "x-mojobox-distribution": {
        "distributionClass": "builtin",
        "source": "desktop-sync"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.eac.dsh-plugin-shield",
      "name": "dsh-plugin-shield",
      "version": "0.1.0",
      "facets": {
        "host": {
          "entry": "lib/index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT",
      "source": {
        "repository": "https://github.com/DSH-EAC/DSH-Desktop-EAC",
        "revision": "a9b90e254800dfe84c65c01d150a8596e94f6a31"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "artifactStatus": "unpublished",
        "sourcePath": "dsh-desktop/assets/plugins/dsh-plugin-shield"
      },
      "x-mojobox-distribution": {
        "distributionClass": "builtin",
        "source": "desktop-sync"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.eac.dsh-settings-scroll-fix",
      "name": "dsh-settings-scroll-fix",
      "version": "2.0.2",
      "facets": {
        "host": {
          "entry": "lib/index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT",
      "source": {
        "repository": "https://github.com/DSH-EAC/DSH-Desktop-EAC",
        "revision": "a9b90e254800dfe84c65c01d150a8596e94f6a31"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "artifactStatus": "unpublished",
        "sourcePath": "dsh-desktop/assets/plugins/dsh-settings-scroll-fix"
      },
      "x-mojobox-distribution": {
        "distributionClass": "builtin",
        "source": "desktop-sync"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.eac.dsh-terminal",
      "name": "@deepseek-ai/dsh-terminal",
      "version": "0.1.0",
      "facets": {
        "host": {
          "entry": "lib/index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT",
      "source": {
        "repository": "https://github.com/DSH-EAC/DSH-Desktop-EAC",
        "revision": "a9b90e254800dfe84c65c01d150a8596e94f6a31"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "artifactStatus": "unpublished",
        "sourcePath": "dsh-desktop/assets/plugins/dsh-terminal"
      },
      "x-mojobox-distribution": {
        "distributionClass": "builtin",
        "source": "desktop-sync"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.eac.dsh-unified-market",
      "name": "dsh-unified-market",
      "version": "0.4.0",
      "facets": {
        "host": {
          "entry": "lib/host.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT",
      "source": {
        "repository": "https://github.com/DSH-EAC/DSH-Desktop-EAC",
        "revision": "a9b90e254800dfe84c65c01d150a8596e94f6a31"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "artifactStatus": "unpublished",
        "sourcePath": "dsh-desktop/assets/plugins/dsh-unified-market",
        "reason": "EAC-modified bundle; the published npm dsh-unified-market@0.4.0 (jing-hy) does not reproduce it"
      },
      "x-mojobox-distribution": {
        "distributionClass": "builtin",
        "source": "desktop-sync"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.eac.dsh-viewport-lock",
      "name": "dsh-viewport-lock",
      "version": "1.0.1",
      "facets": {
        "host": {
          "entry": "lib/index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT",
      "source": {
        "repository": "https://github.com/DSH-EAC/DSH-Desktop-EAC",
        "revision": "a9b90e254800dfe84c65c01d150a8596e94f6a31"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "artifactStatus": "unpublished",
        "sourcePath": "dsh-desktop/assets/plugins/dsh-viewport-lock"
      },
      "x-mojobox-distribution": {
        "distributionClass": "builtin",
        "source": "desktop-sync"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.eac.skin-aurora",
      "name": "@dsh-eac/skin-aurora",
      "version": "1.1.0",
      "facets": {
        "host": {
          "entry": "lib/index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT",
      "source": {
        "repository": "https://github.com/DSH-EAC/dsh-ui-skin-loader",
        "revision": "e3ac8675c51da74c5084c7bf99fc78ce6ee129ac"
      },
      "artifact": {
        "digest": "sha256:3abf546ccbea8fa106290ed0a96c77661a9620e88fadb57b76afa12aa503cd35",
        "algorithm": "sha256",
        "path": "https://github.com/DSH-EAC/dsh-ui-skin-loader/releases/download/v1.1.0/dsh-eac-skin-aurora-1.1.0.tgz"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "reason": "Reference skin authored in DSH-EAC/dsh-ui-skin-loader; no vendored third-party content. Artifact is the GitHub release tgz; digest measured from the locally verified v1.1.0 release bundle (14 tgz + SHA256SUMS.txt); GitHub Release v1.1.0 asset publication and npm publication both pending (Pack Lock source requires npm:)."
      },
      "x-mojobox-package": {
        "dsh": {
          "manifestVersion": 1,
          "bundle": {
            "patch": "./cordis.patch.yml"
          },
          "client": {
            "platform": "web",
            "inject": [],
            "external": [],
            "immediately": false
          }
        }
      },
      "x-mojobox-skin": {
        "apiVersion": "dsh.ecosystem.ui-skin-loader/v1",
        "id": "dsh-eac.skin.aurora",
        "name": "\u6781\u5149\u4E4B\u591C",
        "author": "DSH-EAC"
      },
      "x-mojobox-distribution": {
        "distributionClass": "recommended",
        "source": "installer-policy"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.eac.skin-blue-fantasy",
      "name": "@dsh-eac/skin-blue-fantasy",
      "version": "1.1.0",
      "facets": {
        "host": {
          "entry": "lib/index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT AND BSD-3-Clause",
      "source": {
        "repository": "https://github.com/DSH-EAC/dsh-ui-skin-loader",
        "revision": "e3ac8675c51da74c5084c7bf99fc78ce6ee129ac"
      },
      "artifact": {
        "digest": "sha256:b89297f957c93ce76cc9984ebfdf73d49889c89d568200ac4e06a8b90dc94a44",
        "algorithm": "sha256",
        "path": "https://github.com/DSH-EAC/dsh-ui-skin-loader/releases/download/v1.1.0/dsh-eac-skin-blue-fantasy-1.1.0.tgz"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "reason": "Appearance content is BSD-3-Clause (c) zhu1090093659 via dsh-web-ui (@linxin666/dsh-client-ui-skin-blue-fantasy 0.1.11) with DreamSkin artwork MIT (c) powerdog996, migrated from DSH-Desktop-EAC@26841f5ee83c154a9768cc0a9cec1d70078f0ddf and recorded with full source/license text in the package THIRD-PARTY-NOTICES.md. Artifact is the GitHub release tgz; digest measured from the locally verified v1.1.0 release bundle (14 tgz + SHA256SUMS.txt); GitHub Release v1.1.0 asset publication and npm publication both pending (Pack Lock source requires npm:)."
      },
      "x-mojobox-package": {
        "dsh": {
          "manifestVersion": 1,
          "bundle": {
            "patch": "./cordis.patch.yml"
          },
          "client": {
            "platform": "web",
            "inject": [],
            "external": [],
            "immediately": false
          }
        }
      },
      "x-mojobox-skin": {
        "apiVersion": "dsh.ecosystem.ui-skin-loader/v1",
        "id": "dsh-eac.skin.blue-fantasy",
        "name": "\u84DD\u8272\u5E7B\u60F3",
        "author": "powerdog996 (DreamSkin) \xB7 zhu1090093659 (dsh-web-ui) \xB7 DSH-EAC"
      },
      "x-mojobox-distribution": {
        "distributionClass": "recommended",
        "source": "installer-policy"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.eac.skin-deep-whale-day-night",
      "name": "@dsh-eac/skin-deep-whale-day-night",
      "version": "1.1.0",
      "facets": {
        "host": {
          "entry": "lib/index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "CC-BY-NC-SA-4.0",
      "source": {
        "repository": "https://github.com/DSH-EAC/dsh-ui-skin-loader",
        "revision": "e3ac8675c51da74c5084c7bf99fc78ce6ee129ac"
      },
      "artifact": {
        "digest": "sha256:8d1f42ed937e1ac84e1726e0cae5b2fc20fc2735671d2268e4f9f31c13aec7d6",
        "algorithm": "sha256",
        "path": "https://github.com/DSH-EAC/dsh-ui-skin-loader/releases/download/v1.1.0/dsh-eac-skin-deep-whale-day-night-1.1.0.tgz"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "reason": "Appearance content is CC BY-NC-SA 4.0 (non-commercial; attribution chain \u4E0A\u5584 \u2192 zipzip \u2192 Small-tailqwq), migrated from GGBond2424648901/deep-whale-day-night-theme@3f6c4f14716d1e500f585be0c0d3c139c7a8a90b. The loader's v1.1.0 release manifest defers the package (R3: residual maid-atelier body-marker strings collide with @dsh-eac/skin-maid-atelier) while the final verified bundle still carries its 1.1.0 tgz. Artifact is the GitHub release tgz; digest measured from the locally verified v1.1.0 release bundle (14 tgz + SHA256SUMS.txt); GitHub Release v1.1.0 asset publication and npm publication both pending (Pack Lock source requires npm:)."
      },
      "x-mojobox-package": {
        "dsh": {
          "manifestVersion": 1,
          "bundle": {
            "patch": "./cordis.patch.yml"
          },
          "client": {
            "platform": "web",
            "inject": [
              "uiSkinLoader",
              "theme"
            ],
            "external": [],
            "immediately": false
          }
        }
      },
      "x-mojobox-skin": {
        "apiVersion": "dsh.ecosystem.ui-skin-loader/v1",
        "id": "dsh-eac.skin.deep-whale-day-night",
        "name": "\u9CB8\u9C7C\u5A18\u663C\u591C\u5DE5\u574A",
        "author": "Small-tailqwq \xB7 \u4E0A\u5584 \xB7 zipzip \xB7 DSH-EAC"
      },
      "x-mojobox-distribution": {
        "distributionClass": "recommended",
        "source": "installer-policy"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.eac.skin-dragon-heir",
      "name": "@dsh-eac/skin-dragon-heir",
      "version": "1.1.0",
      "facets": {
        "host": {
          "entry": "lib/index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT AND BSD-3-Clause",
      "source": {
        "repository": "https://github.com/DSH-EAC/dsh-ui-skin-loader",
        "revision": "e3ac8675c51da74c5084c7bf99fc78ce6ee129ac"
      },
      "artifact": {
        "digest": "sha256:c315837b67597107612a0c663ec8e8168e6f90622017bb6735614b4a3a322ba3",
        "algorithm": "sha256",
        "path": "https://github.com/DSH-EAC/dsh-ui-skin-loader/releases/download/v1.1.0/dsh-eac-skin-dragon-heir-1.1.0.tgz"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "reason": "Appearance content is BSD-3-Clause (c) zhu1090093659 via dsh-web-ui (@linxin666/dsh-client-ui-skin-dragon-heir 0.1.11), migrated from DSH-Desktop-EAC@26841f5ee83c154a9768cc0a9cec1d70078f0ddf and recorded with full source/license text in the package THIRD-PARTY-NOTICES.md. Artifact is the GitHub release tgz; digest measured from the locally verified v1.1.0 release bundle (14 tgz + SHA256SUMS.txt); GitHub Release v1.1.0 asset publication and npm publication both pending (Pack Lock source requires npm:)."
      },
      "x-mojobox-package": {
        "dsh": {
          "manifestVersion": 1,
          "bundle": {
            "patch": "./cordis.patch.yml"
          },
          "client": {
            "platform": "web",
            "inject": [],
            "external": [],
            "immediately": false
          }
        }
      },
      "x-mojobox-skin": {
        "apiVersion": "dsh.ecosystem.ui-skin-loader/v1",
        "id": "dsh-eac.skin.dragon-heir",
        "name": "\u9F99\u7684\u4F20\u4EBA",
        "author": "zhu1090093659 (dsh-web-ui) \xB7 DSH-EAC (covenant conversion)"
      },
      "x-mojobox-distribution": {
        "distributionClass": "recommended",
        "source": "installer-policy"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.eac.skin-inkwash",
      "name": "@dsh-eac/skin-inkwash",
      "version": "1.1.0",
      "facets": {
        "host": {
          "entry": "lib/index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT",
      "source": {
        "repository": "https://github.com/DSH-EAC/dsh-ui-skin-loader",
        "revision": "e3ac8675c51da74c5084c7bf99fc78ce6ee129ac"
      },
      "artifact": {
        "digest": "sha256:775754b4354043965b19888aaee238854e7fd4d4cc9096b7bbc0826e8e2adcf3",
        "algorithm": "sha256",
        "path": "https://github.com/DSH-EAC/dsh-ui-skin-loader/releases/download/v1.1.0/dsh-eac-skin-inkwash-1.1.0.tgz"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "reason": "Reference skin authored in DSH-EAC/dsh-ui-skin-loader; no vendored third-party content. Artifact is the GitHub release tgz; digest measured from the locally verified v1.1.0 release bundle (14 tgz + SHA256SUMS.txt); GitHub Release v1.1.0 asset publication and npm publication both pending (Pack Lock source requires npm:)."
      },
      "x-mojobox-package": {
        "dsh": {
          "manifestVersion": 1,
          "bundle": {
            "patch": "./cordis.patch.yml"
          },
          "client": {
            "platform": "web",
            "inject": [],
            "external": [],
            "immediately": false
          }
        }
      },
      "x-mojobox-skin": {
        "apiVersion": "dsh.ecosystem.ui-skin-loader/v1",
        "id": "dsh-eac.skin.inkwash",
        "name": "\u6C34\u58A8\u9752\u70DF",
        "author": "DSH-EAC"
      },
      "x-mojobox-distribution": {
        "distributionClass": "recommended",
        "source": "installer-policy"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.eac.skin-maid-atelier",
      "name": "@dsh-eac/skin-maid-atelier",
      "version": "1.1.0",
      "facets": {
        "host": {
          "entry": "lib/index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT AND CC-BY-NC-SA-4.0",
      "source": {
        "repository": "https://github.com/DSH-EAC/dsh-ui-skin-loader",
        "revision": "e3ac8675c51da74c5084c7bf99fc78ce6ee129ac"
      },
      "artifact": {
        "digest": "sha256:e1cc9c348d6f3d2ab34f7d31ca5cb89f3c9820d92086b136d2b64137a8376971",
        "algorithm": "sha256",
        "path": "https://github.com/DSH-EAC/dsh-ui-skin-loader/releases/download/v1.1.0/dsh-eac-skin-maid-atelier-1.1.0.tgz"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "reason": "Appearance content is CC BY-NC-SA 4.0 (non-commercial, attribution chain \u4E0A\u5584 \u2192 zipzip \u2192 Small-tailqwq; upstream @dsh-external/dsh-client-ui-skin-maid-atelier 0.0.1), migrated from DSH-Desktop-EAC@26841f5ee83c154a9768cc0a9cec1d70078f0ddf and recorded with full source/license text in the package THIRD-PARTY-NOTICES.md. Artifact is the GitHub release tgz; digest measured from the locally verified v1.1.0 release bundle (14 tgz + SHA256SUMS.txt); GitHub Release v1.1.0 asset publication and npm publication both pending (Pack Lock source requires npm:)."
      },
      "x-mojobox-package": {
        "dsh": {
          "manifestVersion": 1,
          "bundle": {
            "patch": "./cordis.patch.yml"
          },
          "client": {
            "platform": "web",
            "inject": [],
            "external": [],
            "immediately": false
          }
        }
      },
      "x-mojobox-skin": {
        "apiVersion": "dsh.ecosystem.ui-skin-loader/v1",
        "id": "dsh-eac.skin.maid-atelier",
        "name": "\u6DF1\u6D77\u5973\u4EC6\u5DE5\u574A",
        "author": "Small-tailqwq \xB7 \u4E0A\u5584 \xB7 zipzip \xB7 DSH-EAC"
      },
      "x-mojobox-distribution": {
        "distributionClass": "recommended",
        "source": "installer-policy"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.eac.skin-miku",
      "name": "@dsh-eac/skin-miku",
      "version": "1.1.0",
      "facets": {
        "host": {
          "entry": "lib/index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT AND BSD-3-Clause",
      "source": {
        "repository": "https://github.com/DSH-EAC/dsh-ui-skin-loader",
        "revision": "e3ac8675c51da74c5084c7bf99fc78ce6ee129ac"
      },
      "artifact": {
        "digest": "sha256:699c4ebbaefbb29b6012ea14ccdd6357934a2f5e582f157dacc1ee783601143f",
        "algorithm": "sha256",
        "path": "https://github.com/DSH-EAC/dsh-ui-skin-loader/releases/download/v1.1.0/dsh-eac-skin-miku-1.1.0.tgz"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "reason": "Appearance content is BSD-3-Clause (c) zhu1090093659 via dsh-web-ui (@linxin666/dsh-client-ui-skin-miku 0.1.11), migrated from DSH-Desktop-EAC@26841f5ee83c154a9768cc0a9cec1d70078f0ddf and recorded with full source/license text in the package THIRD-PARTY-NOTICES.md. Artifact is the GitHub release tgz; digest measured from the locally verified v1.1.0 release bundle (14 tgz + SHA256SUMS.txt); GitHub Release v1.1.0 asset publication and npm publication both pending (Pack Lock source requires npm:)."
      },
      "x-mojobox-package": {
        "dsh": {
          "manifestVersion": 1,
          "bundle": {
            "patch": "./cordis.patch.yml"
          },
          "client": {
            "platform": "web",
            "inject": [],
            "external": [],
            "immediately": false
          }
        }
      },
      "x-mojobox-skin": {
        "apiVersion": "dsh.ecosystem.ui-skin-loader/v1",
        "id": "dsh-eac.skin.miku",
        "name": "\u521D\u97F3\u672A\u6765 \xB7 \u7535\u5B50\u6B4C\u59EC",
        "author": "\u6D82\u5C71\u82CF\u82CF \xB7 zhu1090093659 (dsh-web-ui) \xB7 DSH-EAC"
      },
      "x-mojobox-distribution": {
        "distributionClass": "recommended",
        "source": "installer-policy"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.eac.skin-minecraft",
      "name": "@dsh-eac/skin-minecraft",
      "version": "1.1.0",
      "facets": {
        "host": {
          "entry": "lib/index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT AND BSD-3-Clause",
      "source": {
        "repository": "https://github.com/DSH-EAC/dsh-ui-skin-loader",
        "revision": "e3ac8675c51da74c5084c7bf99fc78ce6ee129ac"
      },
      "artifact": {
        "digest": "sha256:a163eae0e8772ffd955b84e863e1a31eaa338ad531d6feaaf683725d04a1230f",
        "algorithm": "sha256",
        "path": "https://github.com/DSH-EAC/dsh-ui-skin-loader/releases/download/v1.1.0/dsh-eac-skin-minecraft-1.1.0.tgz"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "reason": "Appearance content is BSD-3-Clause (c) zhu1090093659 via dsh-web-ui (@linxin666/dsh-client-ui-skin-minecraft 0.1.11), migrated from DSH-Desktop-EAC@26841f5ee83c154a9768cc0a9cec1d70078f0ddf and recorded with full source/license text in the package THIRD-PARTY-NOTICES.md. Artifact is the GitHub release tgz; digest measured from the locally verified v1.1.0 release bundle (14 tgz + SHA256SUMS.txt); GitHub Release v1.1.0 asset publication and npm publication both pending (Pack Lock source requires npm:)."
      },
      "x-mojobox-package": {
        "dsh": {
          "manifestVersion": 1,
          "bundle": {
            "patch": "./cordis.patch.yml"
          },
          "client": {
            "platform": "web",
            "inject": [],
            "external": [],
            "immediately": false
          }
        }
      },
      "x-mojobox-skin": {
        "apiVersion": "dsh.ecosystem.ui-skin-loader/v1",
        "id": "dsh-eac.skin.minecraft",
        "name": "Minecraft \u65B9\u5757\u4E16\u754C",
        "author": "zhu1090093659 (dsh-web-ui) \xB7 DSH-EAC"
      },
      "x-mojobox-distribution": {
        "distributionClass": "recommended",
        "source": "installer-policy"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.eac.skin-qq98",
      "name": "@dsh-eac/skin-qq98",
      "version": "1.1.0",
      "facets": {
        "host": {
          "entry": "lib/index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT AND BSD-3-Clause",
      "source": {
        "repository": "https://github.com/DSH-EAC/dsh-ui-skin-loader",
        "revision": "e3ac8675c51da74c5084c7bf99fc78ce6ee129ac"
      },
      "artifact": {
        "digest": "sha256:ac135b64eca54d4d4f571129abdad72f763536d7facaa6bbe0bedb1c35ae8235",
        "algorithm": "sha256",
        "path": "https://github.com/DSH-EAC/dsh-ui-skin-loader/releases/download/v1.1.0/dsh-eac-skin-qq98-1.1.0.tgz"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "reason": "Appearance content is BSD-3-Clause (c) zhu1090093659 via dsh-web-ui (@linxin666/dsh-client-ui-skin-qq98 0.1.11), migrated from DSH-Desktop-EAC@26841f5ee83c154a9768cc0a9cec1d70078f0ddf and recorded with full source/license text in the package THIRD-PARTY-NOTICES.md. Artifact is the GitHub release tgz; digest measured from the locally verified v1.1.0 release bundle (14 tgz + SHA256SUMS.txt); GitHub Release v1.1.0 asset publication and npm publication both pending (Pack Lock source requires npm:)."
      },
      "x-mojobox-package": {
        "dsh": {
          "manifestVersion": 1,
          "bundle": {
            "patch": "./cordis.patch.yml"
          },
          "client": {
            "platform": "web",
            "inject": [],
            "external": [],
            "immediately": false
          }
        }
      },
      "x-mojobox-skin": {
        "apiVersion": "dsh.ecosystem.ui-skin-loader/v1",
        "id": "dsh-eac.skin.qq98",
        "name": "QQ2008 \u6000\u65E7\u7248",
        "author": "zhu1090093659 (dsh-web-ui) \xB7 DSH-EAC"
      },
      "x-mojobox-distribution": {
        "distributionClass": "recommended",
        "source": "installer-policy"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.eac.skin-ths",
      "name": "@dsh-eac/skin-ths",
      "version": "1.1.0",
      "facets": {
        "host": {
          "entry": "lib/index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT AND BSD-3-Clause",
      "source": {
        "repository": "https://github.com/DSH-EAC/dsh-ui-skin-loader",
        "revision": "e3ac8675c51da74c5084c7bf99fc78ce6ee129ac"
      },
      "artifact": {
        "digest": "sha256:885d55967b35f4273c35da27bf5722e85e2dbe68656aaa2721d8cd55239f8512",
        "algorithm": "sha256",
        "path": "https://github.com/DSH-EAC/dsh-ui-skin-loader/releases/download/v1.1.0/dsh-eac-skin-ths-1.1.0.tgz"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "reason": "Appearance content is BSD-3-Clause (c) zhu1090093659 via dsh-web-ui (@linxin666/dsh-client-ui-skin-ths 0.1.11), migrated from DSH-Desktop-EAC@26841f5ee83c154a9768cc0a9cec1d70078f0ddf and recorded with full source/license text in the package THIRD-PARTY-NOTICES.md. Artifact is the GitHub release tgz; digest measured from the locally verified v1.1.0 release bundle (14 tgz + SHA256SUMS.txt); GitHub Release v1.1.0 asset publication and npm publication both pending (Pack Lock source requires npm:)."
      },
      "x-mojobox-package": {
        "dsh": {
          "manifestVersion": 1,
          "bundle": {
            "patch": "./cordis.patch.yml"
          },
          "client": {
            "platform": "web",
            "inject": [],
            "external": [],
            "immediately": false
          }
        }
      },
      "x-mojobox-skin": {
        "apiVersion": "dsh.ecosystem.ui-skin-loader/v1",
        "id": "dsh-eac.skin.ths",
        "name": "\u540C\u82B1\u987A\u98CE\u683C",
        "author": "zhu1090093659 (dsh-web-ui) \xB7 DSH-EAC"
      },
      "x-mojobox-distribution": {
        "distributionClass": "recommended",
        "source": "installer-policy"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.eac.skin-trading",
      "name": "@dsh-eac/skin-trading",
      "version": "1.1.0",
      "facets": {
        "host": {
          "entry": "lib/index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT AND BSD-3-Clause",
      "source": {
        "repository": "https://github.com/DSH-EAC/dsh-ui-skin-loader",
        "revision": "e3ac8675c51da74c5084c7bf99fc78ce6ee129ac"
      },
      "artifact": {
        "digest": "sha256:f77b0a06dccf595d02208e290875381a97705cea434eb05936aab6fe0120fb0e",
        "algorithm": "sha256",
        "path": "https://github.com/DSH-EAC/dsh-ui-skin-loader/releases/download/v1.1.0/dsh-eac-skin-trading-1.1.0.tgz"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "reason": "Appearance content is BSD-3-Clause (c) zhu1090093659 via dsh-web-ui (@linxin666/dsh-client-ui-skin-trading 0.1.11), migrated from DSH-Desktop-EAC@26841f5ee83c154a9768cc0a9cec1d70078f0ddf and recorded with full source/license text in the package THIRD-PARTY-NOTICES.md. Artifact is the GitHub release tgz; digest measured from the locally verified v1.1.0 release bundle (14 tgz + SHA256SUMS.txt); GitHub Release v1.1.0 asset publication and npm publication both pending (Pack Lock source requires npm:)."
      },
      "x-mojobox-package": {
        "dsh": {
          "manifestVersion": 1,
          "bundle": {
            "patch": "./cordis.patch.yml"
          },
          "client": {
            "platform": "web",
            "inject": [],
            "external": [],
            "immediately": false
          }
        }
      },
      "x-mojobox-skin": {
        "apiVersion": "dsh.ecosystem.ui-skin-loader/v1",
        "id": "dsh-eac.skin.trading",
        "name": "\u4EA4\u6613\u7EC8\u7AEF",
        "author": "zhu1090093659 (dsh-web-ui) \xB7 DSH-EAC (covenant conversion)"
      },
      "x-mojobox-distribution": {
        "distributionClass": "recommended",
        "source": "installer-policy"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.eac.skin-whale-song",
      "name": "@dsh-eac/skin-whale-song",
      "version": "1.1.0",
      "facets": {
        "host": {
          "entry": "lib/index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT AND BSD-3-Clause",
      "source": {
        "repository": "https://github.com/DSH-EAC/dsh-ui-skin-loader",
        "revision": "e3ac8675c51da74c5084c7bf99fc78ce6ee129ac"
      },
      "artifact": {
        "digest": "sha256:7becbd60588e67b0974e7524c3adbbdc3f986b4b2c6ccef0c54bf0741a70f5ce",
        "algorithm": "sha256",
        "path": "https://github.com/DSH-EAC/dsh-ui-skin-loader/releases/download/v1.1.0/dsh-eac-skin-whale-song-1.1.0.tgz"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "reason": "Appearance content is BSD-3-Clause (c) zhu1090093659 via dsh-web-ui (@linxin666/dsh-client-ui-skin-whale-song 0.1.11; upstream figurative artwork removed per IP ruling R13), migrated from DSH-Desktop-EAC@26841f5ee83c154a9768cc0a9cec1d70078f0ddf and recorded with full source/license text in the package THIRD-PARTY-NOTICES.md. Artifact is the GitHub release tgz; digest measured from the locally verified v1.1.0 release bundle (14 tgz + SHA256SUMS.txt); GitHub Release v1.1.0 asset publication and npm publication both pending (Pack Lock source requires npm:)."
      },
      "x-mojobox-package": {
        "dsh": {
          "manifestVersion": 1,
          "bundle": {
            "patch": "./cordis.patch.yml"
          },
          "client": {
            "platform": "web",
            "inject": [],
            "external": [],
            "immediately": false
          }
        }
      },
      "x-mojobox-skin": {
        "apiVersion": "dsh.ecosystem.ui-skin-loader/v1",
        "id": "dsh-eac.skin.whale-song",
        "name": "\u9CB8\u541F",
        "author": "zhu1090093659 (dsh-web-ui) \xB7 DSH-EAC (covenant conversion)"
      },
      "x-mojobox-distribution": {
        "distributionClass": "recommended",
        "source": "installer-policy"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.eac.skin-xp",
      "name": "@dsh-eac/skin-xp",
      "version": "1.1.0",
      "facets": {
        "host": {
          "entry": "lib/index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT AND BSD-3-Clause",
      "source": {
        "repository": "https://github.com/DSH-EAC/dsh-ui-skin-loader",
        "revision": "e3ac8675c51da74c5084c7bf99fc78ce6ee129ac"
      },
      "artifact": {
        "digest": "sha256:7ba298308484104719bbbf4257a39d32ed616a775cf6dd70e17d7afc9e803b0c",
        "algorithm": "sha256",
        "path": "https://github.com/DSH-EAC/dsh-ui-skin-loader/releases/download/v1.1.0/dsh-eac-skin-xp-1.1.0.tgz"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "reason": "Appearance content is BSD-3-Clause (c) zhu1090093659 via dsh-web-ui (@linxin666/dsh-client-ui-skin-xp 0.1.11), migrated from DSH-Desktop-EAC@26841f5ee83c154a9768cc0a9cec1d70078f0ddf and recorded with full source/license text in the package THIRD-PARTY-NOTICES.md. Artifact is the GitHub release tgz; digest measured from the locally verified v1.1.0 release bundle (14 tgz + SHA256SUMS.txt); GitHub Release v1.1.0 asset publication and npm publication both pending (Pack Lock source requires npm:)."
      },
      "x-mojobox-package": {
        "dsh": {
          "manifestVersion": 1,
          "bundle": {
            "patch": "./cordis.patch.yml"
          },
          "client": {
            "platform": "web",
            "inject": [],
            "external": [],
            "immediately": false
          }
        }
      },
      "x-mojobox-skin": {
        "apiVersion": "dsh.ecosystem.ui-skin-loader/v1",
        "id": "dsh-eac.skin.xp",
        "name": "Windows XP (Luna)",
        "author": "zhu1090093659 (dsh-web-ui) \xB7 DSH-EAC"
      },
      "x-mojobox-distribution": {
        "distributionClass": "recommended",
        "source": "installer-policy"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.eac.ui-skin-loader",
      "name": "@dsh-eac/ui-skin-loader",
      "version": "1.1.0",
      "facets": {
        "host": {
          "entry": "lib/index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT",
      "source": {
        "repository": "https://github.com/DSH-EAC/dsh-ui-skin-loader",
        "revision": "e3ac8675c51da74c5084c7bf99fc78ce6ee129ac"
      },
      "artifact": {
        "digest": "sha256:b926aad7d312c9573226414867049a48b6825e2bb15d8ba76a3d707095ef1ba6",
        "algorithm": "sha256",
        "path": "https://github.com/DSH-EAC/dsh-ui-skin-loader/releases/download/v1.1.0/dsh-eac-ui-skin-loader-1.1.0.tgz"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "reason": "Maintained in DSH-EAC/dsh-ui-skin-loader (loader release v1.1.0). Artifact is the GitHub release tgz; digest measured from the locally verified v1.1.0 release bundle (14 tgz + SHA256SUMS.txt); GitHub Release v1.1.0 asset publication and npm publication both pending (Pack Lock source requires npm:)."
      },
      "x-mojobox-package": {
        "dsh": {
          "manifestVersion": 1,
          "bundle": {
            "patch": "./cordis.patch.yml"
          },
          "client": {
            "platform": "web",
            "inject": [],
            "external": [],
            "immediately": false
          }
        }
      },
      "x-mojobox-distribution": {
        "distributionClass": "recommended",
        "source": "installer-policy"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.jing-hy.computer-user",
      "name": "computer-user",
      "version": "0.3.6",
      "facets": {
        "host": {
          "entry": "src/index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT",
      "source": {
        "repository": "https://github.com/jing-hy/computer-user",
        "revision": "0.3.6"
      },
      "artifact": {
        "digest": "sha256:cf6e505c7ff76fec961cea757796b07b79e524b4c8b4403aa1319f74526b655b",
        "algorithm": "sha256",
        "path": "https://registry.npmjs.org/computer-user/-/computer-user-0.3.6.tgz"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "reason": "Upstream package does not publish dsh-plugin.json"
      },
      "x-mojobox-distribution": {
        "distributionClass": "external",
        "source": "desktop-sync"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.jing-hy.picturereader",
      "name": "picturereader",
      "version": "3.3.1",
      "facets": {
        "host": {
          "entry": "src/index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT",
      "source": {
        "repository": "https://github.com/jing-hy/picturereader",
        "revision": "3.3.1"
      },
      "artifact": {
        "digest": "sha256:0a04a1cfbb1f630bbedb867f876636b16637697f4107fe6356ce38b5ce8d9728",
        "algorithm": "sha256",
        "path": "https://registry.npmjs.org/picturereader/-/picturereader-3.3.1.tgz"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "reason": "Upstream package does not publish dsh-plugin.json"
      },
      "x-mojobox-distribution": {
        "distributionClass": "recommended",
        "source": "desktop-sync"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.liliucourier.dsh-chat-outline",
      "name": "dsh-chat-outline",
      "version": "0.1.10",
      "facets": {
        "host": {
          "entry": "lib/index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT",
      "source": {
        "repository": "https://github.com/liliuCourier/dsh-chat-outline",
        "revision": "0.1.10"
      },
      "artifact": {
        "digest": "sha256:645d7cb30a84130019dc50f922d254aebf5f85002c1942a5d2174c0f8e0fe20a",
        "algorithm": "sha256",
        "path": "https://registry.npmjs.org/dsh-chat-outline/-/dsh-chat-outline-0.1.10.tgz"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "reason": "Upstream package does not publish dsh-plugin.json"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.luaphes.dsh-web-attention-badge",
      "name": "dsh-web-attention-badge",
      "version": "0.3.2",
      "facets": {
        "host": {
          "entry": "lib/index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT",
      "source": {
        "repository": "https://github.com/Luaphes/dsh-web-attention-badge",
        "revision": "0.3.2"
      },
      "artifact": {
        "digest": "sha256:bdb93b1e49821725d075f8ce4af24e01fe50f4bf73d09c8805b8ed942b07aa21",
        "algorithm": "sha256",
        "path": "https://registry.npmjs.org/dsh-web-attention-badge/-/dsh-web-attention-badge-0.3.2.tgz"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "reason": "Upstream package does not publish dsh-plugin.json"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.nwflower.dsh-file-claim",
      "name": "dsh-file-claim",
      "version": "0.2.0",
      "facets": {
        "host": {
          "entry": "index.mjs",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT",
      "source": {
        "repository": "https://github.com/Nwflower/dsh-file-claim",
        "revision": "0.2.0"
      },
      "artifact": {
        "digest": "sha256:45bd87bc6cbb566278f3c8b1510ecd028817f8bb5365b1a8c8bd7e6b741a61db",
        "algorithm": "sha256",
        "path": "https://registry.npmjs.org/dsh-file-claim/-/dsh-file-claim-0.2.0.tgz"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "reason": "Upstream package does not publish dsh-plugin.json"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.omdsh.dsh-better-sidebar",
      "name": "dsh-better-sidebar",
      "version": "0.12.2",
      "facets": {
        "host": {
          "entry": "lib/index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT",
      "source": {
        "repository": "https://github.com/omdsh-dev/DSH-better-sidebar",
        "revision": "0.12.2"
      },
      "artifact": {
        "digest": "sha256:5f80d9cfd7f250a675cf9bc7f951ca246c047f09607200831733f845c8255d0f",
        "algorithm": "sha256",
        "path": "https://registry.npmjs.org/dsh-better-sidebar/-/dsh-better-sidebar-0.12.2.tgz"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "reason": "Upstream package does not publish dsh-plugin.json"
      },
      "x-mojobox-distribution": {
        "distributionClass": "recommended",
        "source": "desktop-sync"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.phant0meow.meow-smooth",
      "name": "meow-smooth",
      "version": "0.5.0",
      "facets": {
        "host": {
          "entry": "lib/index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT",
      "source": {
        "repository": "https://github.com/Phant0Meow/dsh-meow-smooth",
        "revision": "c7bbe6f0419a5a2ca9f3e9eb62003d693735cdd6"
      },
      "artifact": {
        "digest": "sha256:52fda95a198e84639a821031de69d1137acb5b4d3db53cc84fdb72223e9dea55",
        "algorithm": "sha256",
        "path": "https://registry.npmjs.org/meow-smooth/-/meow-smooth-0.5.0.tgz"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained"
      },
      "x-mojobox-distribution": {
        "distributionClass": "external",
        "source": "desktop-sync"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.scorp1o117.dsh-soul-md",
      "name": "dsh-soul-md",
      "version": "0.2.8",
      "facets": {
        "host": {
          "entry": "index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT",
      "source": {
        "repository": "https://github.com/Scorp1o117/dsh-soul-md",
        "revision": "0.2.8"
      },
      "artifact": {
        "digest": "sha256:a3117a55e31c3594542f3c7c113b0620ab50de3867cef7ede36a59158cbc3dbd",
        "algorithm": "sha256",
        "path": "https://registry.npmjs.org/dsh-soul-md/-/dsh-soul-md-0.2.8.tgz"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "reason": "Upstream package does not publish dsh-plugin.json"
      },
      "x-mojobox-distribution": {
        "distributionClass": "recommended",
        "source": "desktop-sync"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.tt-a1i.archify-dsh",
      "name": "@tt-a1i/archify-dsh",
      "version": "0.1.0",
      "facets": {
        "host": {
          "entry": "lib/index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT",
      "source": {
        "repository": "https://github.com/tt-a1i/archify",
        "revision": "fc6e8aca1829a02af0f0efdc193a87c3754d373c"
      },
      "artifact": {
        "digest": "sha256:3192afe54949da6494acea3bd2bf5113a58ea78651113b1289bcc7212130df38",
        "algorithm": "sha256",
        "path": "https://registry.npmjs.org/@tt-a1i/archify-dsh/-/archify-dsh-0.1.0.tgz"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "reason": "Upstream package does not publish dsh-plugin.json"
      },
      "x-mojobox-package": {
        "dsh": {
          "bundle": {
            "patch": "./cordis.patch.yml"
          }
        }
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.wine-red.dsh-prompt-stash",
      "name": "dsh-prompt-stash",
      "version": "0.2.5",
      "facets": {
        "host": {
          "entry": "lib/index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT",
      "source": {
        "repository": "https://github.com/Wine-Red/dsh-prompt-stash",
        "revision": "0.2.5"
      },
      "artifact": {
        "digest": "sha256:126153c3a112d36f4d48ea1f08334a3176a01945bc142e4544353a6d804dce18",
        "algorithm": "sha256",
        "path": "https://registry.npmjs.org/dsh-prompt-stash/-/dsh-prompt-stash-0.2.5.tgz"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "reason": "Upstream package does not publish dsh-plugin.json"
      }
    },
    {
      "$schema": "https://raw.githubusercontent.com/Yan-Zero/dsh-std/3df054302468d2091859db4b3bd079042d33f100/packages/manifest/schema/dsh-plugin-0.15.schema.json",
      "manifestVersion": "0.15",
      "id": "dev.zouyuxuan122.dsh-our-free-model",
      "name": "dsh-our-free-model",
      "version": "1.3.0",
      "facets": {
        "host": {
          "entry": "index.js",
          "apiVersion": "v1alpha1"
        }
      },
      "license": "MIT",
      "source": {
        "repository": "https://github.com/zouyuxuan122/dsh-our-free-model",
        "revision": "73e057d783e6002582395dd476b24cc4ee959bfd"
      },
      "x-ecosystem-packaging": {
        "adapterIsolation": "adapter/kernel.js is the only module that may import @deepseek-ai/*; enforced by the source catalog gate",
        "managedInstallation": "set distribution=managed to stand down the self-updater, announcement feed and hot reload",
        "integrityRecord": "upstream catalog/integrity.json is generated from the release manifest"
      },
      "x-mojobox-maintenance": {
        "source": "registry-maintained",
        "artifactStatus": "unpublished",
        "reason": "package.json is private and no npm artifact is published; upstream release channel is its in-app upgrader feed"
      }
    }
  ],
  "packs": [
    {
      "$schema": "https://mojobox.dev/schemas/pack-v1alpha1.json",
      "apiVersion": "packs.mojobox.dev/v1alpha1",
      "kind": "Pack",
      "metadata": {
        "id": "dev.aio.appearance",
        "version": "0.1.0",
        "name": "AIO \u5916\u89C2\u5305",
        "description": "\u4ECE DSHEAC AIO v1.1.0 \u63D0\u70BC\u7684\u5BFC\u822A\u3001\u58C1\u7EB8\u548C\u9CB8\u9C7C\u6302\u4EF6\u5916\u89C2\u7EC4\u4EF6\uFF0C\u4E0D\u5305\u542B\u529F\u80FD\u5305\u4F9D\u8D56\u3002",
        "category": "appearance"
      },
      "components": [
        {
          "id": "dev.aio.dsh-navbar",
          "version": "0.4.0",
          "required": true
        },
        {
          "id": "dev.aio.dsh-wallpaper-engine",
          "version": "0.6.8",
          "required": true
        },
        {
          "id": "dev.aio.dsh-whale-widget",
          "version": "0.2.10",
          "required": true
        }
      ],
      "requires": {
        "hostCapabilities": [
          "host.snapshot",
          "host.trial-boot"
        ],
        "platforms": [
          {
            "os": "win32",
            "arch": [
              "x64"
            ]
          }
        ]
      },
      "lock": {
        "$schema": "https://mojobox.dev/schemas/pack-lock-v1alpha1.json",
        "apiVersion": "packs.mojobox.dev/v1alpha1",
        "kind": "PackLock",
        "pack": "dev.aio.appearance@0.1.0",
        "components": [
          {
            "id": "dev.aio.dsh-navbar",
            "version": "0.4.0",
            "source": "npm:@vlln/dsh-navbar@0.4.0",
            "manifest": "catalog/plugins/dev.aio.dsh-navbar.json",
            "manifestDigest": "sha256:a56f9272bb05658d9a76ae3d7cb2a444996fd803d5cdae526dc5ca26091fdff3",
            "artifactDigest": "sha256:72886a2376c09e202a830029beb5503ce4710a9b208bacca8759c2d41a61c908"
          },
          {
            "id": "dev.aio.dsh-wallpaper-engine",
            "version": "0.6.8",
            "source": "npm:dsh-plugin-wallpaper-engine@0.6.8",
            "manifest": "catalog/plugins/dev.aio.dsh-wallpaper-engine.json",
            "manifestDigest": "sha256:0fb6106192f9c0a582984d1b2e5b483d6fd7ff88c0bb37918b728a15b2868fa9",
            "artifactDigest": "sha256:2ff76ed3b82937efe87ca829c7a4fca00b21ca521a208ffd501124f6b6f17006"
          },
          {
            "id": "dev.aio.dsh-whale-widget",
            "version": "0.2.10",
            "source": "npm:dsh-whale-widget@0.2.10",
            "manifest": "catalog/plugins/dev.aio.dsh-whale-widget.json",
            "manifestDigest": "sha256:f2325d8a50d17161fa931a66934eedfe0f9c0e4f563f7935b22f6e1a7835db78",
            "artifactDigest": "sha256:c53074c8e792a7f42c8341a45063276fa194307fc3752a594848cc64aa833bc2"
          }
        ]
      }
    },
    {
      "$schema": "https://mojobox.dev/schemas/pack-v1alpha1.json",
      "apiVersion": "packs.mojobox.dev/v1alpha1",
      "kind": "Pack",
      "metadata": {
        "id": "dev.aio.function",
        "version": "0.1.0",
        "name": "AIO \u529F\u80FD\u5305",
        "description": "\u4ECE DSHEAC AIO v1.1.0 \u63D0\u70BC\u7684\u529F\u80FD\u589E\u5F3A\u7EC4\u4EF6\uFF0C\u4E0D\u5305\u542B\u5916\u89C2\u4E3B\u9898\u3002",
        "category": "function"
      },
      "components": [
        {
          "id": "dev.aio.dsh-drag-and-drop",
          "version": "0.1.6",
          "required": true
        },
        {
          "id": "dev.aio.dsh-find-plugin",
          "version": "0.3.7",
          "required": true
        },
        {
          "id": "dev.aio.dsh-meme",
          "version": "0.1.40",
          "required": true
        },
        {
          "id": "dev.aio.dsh-smooth-stream",
          "version": "0.4.3",
          "required": true
        },
        {
          "id": "dev.aio.dsh-status-rotator",
          "version": "0.9.1",
          "required": true
        }
      ],
      "requires": {
        "hostCapabilities": [
          "host.snapshot",
          "host.trial-boot"
        ],
        "platforms": [
          {
            "os": "win32",
            "arch": [
              "x64"
            ]
          }
        ]
      },
      "lock": {
        "$schema": "https://mojobox.dev/schemas/pack-lock-v1alpha1.json",
        "apiVersion": "packs.mojobox.dev/v1alpha1",
        "kind": "PackLock",
        "pack": "dev.aio.function@0.1.0",
        "components": [
          {
            "id": "dev.aio.dsh-drag-and-drop",
            "version": "0.1.6",
            "source": "npm:dsh-drag-and-drop@0.1.6",
            "manifest": "catalog/plugins/dev.aio.dsh-drag-and-drop.json",
            "manifestDigest": "sha256:c1c2e28880034d81e7744a7015f373d547b4f5c398fc6577d6c319904124be64",
            "artifactDigest": "sha256:d50d050373555a73d43bd0ff400028b4012b7375ec5b1134f76adaa48859b8f0"
          },
          {
            "id": "dev.aio.dsh-find-plugin",
            "version": "0.3.7",
            "source": "npm:dsh-find-plugin@0.3.7",
            "manifest": "catalog/plugins/dev.aio.dsh-find-plugin.json",
            "manifestDigest": "sha256:b2506d0a66aacbd0f97566b140989254fd5e8b866f65590fd2782f5732ee39cc",
            "artifactDigest": "sha256:46c408fc9f649b90ec25b30fa02dcc0f1e783c4a269e82468b7095ce1cffa992"
          },
          {
            "id": "dev.aio.dsh-meme",
            "version": "0.1.40",
            "source": "npm:dsh-meme@0.1.40",
            "manifest": "catalog/plugins/dev.aio.dsh-meme.json",
            "manifestDigest": "sha256:675fde5094ef329747dbc5f2c24d89fa85e40310399ad67024a40b2aa88d497a",
            "artifactDigest": "sha256:aa472d113bd269f9807863fdea033293b158f3b2bb72cd07797eb55ed9d9bb55"
          },
          {
            "id": "dev.aio.dsh-smooth-stream",
            "version": "0.4.3",
            "source": "npm:dsh-smooth-stream@0.4.3",
            "manifest": "catalog/plugins/dev.aio.dsh-smooth-stream.json",
            "manifestDigest": "sha256:e812ca7dd7636858adb13834293349713c8baaf539c8b734912a84bd4ba75221",
            "artifactDigest": "sha256:8e1746b755d3d606d91641da9905e91647fe2a78a41d9a85f7a8b3a0b1a31038"
          },
          {
            "id": "dev.aio.dsh-status-rotator",
            "version": "0.9.1",
            "source": "npm:dsh-status-rotator@0.9.1",
            "manifest": "catalog/plugins/dev.aio.dsh-status-rotator.json",
            "manifestDigest": "sha256:8254ed4a8cab46d1dd39502c5ef6a3d4732619a70f3758bb05ebefeae0cc8848",
            "artifactDigest": "sha256:632723d46aae2d34fda28e588f21c628993c6f34afb4b354319661e3b13165a7"
          }
        ]
      }
    },
    {
      "$schema": "https://mojobox.dev/schemas/pack-v1alpha1.json",
      "apiVersion": "packs.mojobox.dev/v1alpha1",
      "kind": "Pack",
      "metadata": {
        "id": "dev.dsh-eac.recommended.v1",
        "version": "0.1.0",
        "name": "EAC \u63A8\u8350\u63D2\u4EF6\u5305",
        "description": "EAC \u63A8\u8350\u63D2\u4EF6\uFF08L2\uFF09\u6574\u5408\u5305\uFF1A\u6210\u5458\u6765\u81EA DSH-Desktop-EAC \u5185\u7F6E\u7EDF\u4E00\u5E02\u573A\u7684 eacRecommended \u540D\u5355\u3002\u4EC5\u6536\u5F55\u5DF2\u53D1\u5E03\u4E14\u6458\u8981\u53EF\u9A8C\u8BC1\u7684 npm artifact\uFF1B\u5176\u4F59\u63A8\u8350\u6210\u5458\uFF08dsh-our-free-model\uFF09\u5C1A\u672A\u53D1\u5E03\uFF0C\u5904\u4E8E source-pending\uFF0C\u89C1 docs/eac-pack-coverage.md\u3002",
        "category": "function"
      },
      "components": [
        {
          "id": "dev.tt-a1i.archify-dsh",
          "version": "0.1.0",
          "required": false
        },
        {
          "id": "dev.phant0meow.meow-smooth",
          "version": "0.5.0",
          "required": false
        }
      ],
      "requires": {
        "platforms": [
          {
            "os": "win32",
            "arch": [
              "x64"
            ]
          }
        ]
      },
      "lock": {
        "$schema": "https://mojobox.dev/schemas/pack-lock-v1alpha1.json",
        "apiVersion": "packs.mojobox.dev/v1alpha1",
        "kind": "PackLock",
        "pack": "dev.dsh-eac.recommended.v1@0.1.0",
        "components": [
          {
            "id": "dev.tt-a1i.archify-dsh",
            "version": "0.1.0",
            "source": "npm:@tt-a1i/archify-dsh@0.1.0",
            "manifest": "catalog/plugins/dev.tt-a1i.archify-dsh.json",
            "manifestDigest": "sha256:b5547bd6bdc011b8780a33c0b6b379ab5ae53775a145e905155791a5256c29c8",
            "artifactDigest": "sha256:3192afe54949da6494acea3bd2bf5113a58ea78651113b1289bcc7212130df38"
          },
          {
            "id": "dev.phant0meow.meow-smooth",
            "version": "0.5.0",
            "source": "npm:meow-smooth@0.5.0",
            "manifest": "catalog/plugins/dev.phant0meow.meow-smooth.json",
            "manifestDigest": "sha256:7ae275865630aae9cd3992684e039b9c86c3adf4e79c47004a2d4e6b632b2f83",
            "artifactDigest": "sha256:52fda95a198e84639a821031de69d1137acb5b4d3db53cc84fdb72223e9dea55"
          }
        ]
      }
    },
    {
      "$schema": "https://mojobox.dev/schemas/pack-v1alpha1.json",
      "apiVersion": "packs.mojobox.dev/v1alpha1",
      "kind": "Pack",
      "metadata": {
        "id": "dev.mojobox.focus-kit",
        "version": "0.1.0",
        "name": "\u4E13\u6CE8\u5DE5\u4F5C\u5305",
        "description": "\u63D0\u4F9B\u4F1A\u8BDD\u4FA7\u680F\u4E0E Markdown \u4EBA\u8BBE\u80FD\u529B\u7684\u56FA\u5B9A\u7EC4\u5408\u3002"
      },
      "components": [
        {
          "id": "dev.omdsh.dsh-better-sidebar",
          "version": "0.12.2",
          "required": true
        },
        {
          "id": "dev.scorp1o117.dsh-soul-md",
          "version": "0.2.8",
          "required": false
        }
      ],
      "requires": {
        "hostCapabilities": [
          "host.snapshot",
          "host.trial-boot"
        ]
      },
      "lock": {
        "$schema": "https://mojobox.dev/schemas/pack-lock-v1alpha1.json",
        "apiVersion": "packs.mojobox.dev/v1alpha1",
        "kind": "PackLock",
        "pack": "dev.mojobox.focus-kit@0.1.0",
        "components": [
          {
            "id": "dev.omdsh.dsh-better-sidebar",
            "version": "0.12.2",
            "source": "npm:dsh-better-sidebar@0.12.2",
            "manifest": "catalog/plugins/dev.omdsh.dsh-better-sidebar.json",
            "manifestDigest": "sha256:b2faa1e6a274e342dbbf23ce6e893677a14747a372a1912cd3f7b97f19c3680b",
            "artifactDigest": "sha256:5f80d9cfd7f250a675cf9bc7f951ca246c047f09607200831733f845c8255d0f"
          },
          {
            "id": "dev.scorp1o117.dsh-soul-md",
            "version": "0.2.8",
            "source": "npm:dsh-soul-md@0.2.8",
            "manifest": "catalog/plugins/dev.scorp1o117.dsh-soul-md.json",
            "manifestDigest": "sha256:84523258a280586872aab9571fc1edb5c53f63f94d01c8c620d80aa0a50f2a93",
            "artifactDigest": "sha256:a3117a55e31c3594542f3c7c113b0620ab50de3867cef7ede36a59158cbc3dbd"
          }
        ]
      }
    },
    {
      "$schema": "https://mojobox.dev/schemas/pack-v1alpha1.json",
      "apiVersion": "packs.mojobox.dev/v1alpha1",
      "kind": "Pack",
      "metadata": {
        "id": "dev.mojobox.windows-operator",
        "version": "0.2.0",
        "name": "Windows \u64CD\u4F5C\u5305",
        "description": "\u9762\u5411 Windows \u684C\u9762\u64CD\u4F5C\u3001\u4F1A\u8BDD\u5BFC\u822A\u4E0E\u5E76\u884C\u5DE5\u4F5C\u6D41\u7684\u56FA\u5B9A\u6D4B\u8BD5\u7EC4\u5408\u3002"
      },
      "components": [
        {
          "id": "dev.jing-hy.computer-user",
          "version": "0.3.6",
          "required": true
        },
        {
          "id": "dev.jing-hy.picturereader",
          "version": "3.3.1",
          "required": true
        },
        {
          "id": "dev.omdsh.dsh-better-sidebar",
          "version": "0.12.2",
          "required": true
        },
        {
          "id": "dev.luaphes.dsh-web-attention-badge",
          "version": "0.3.2",
          "required": true
        },
        {
          "id": "dev.liliucourier.dsh-chat-outline",
          "version": "0.1.10",
          "required": true
        },
        {
          "id": "dev.nwflower.dsh-file-claim",
          "version": "0.2.0",
          "required": true
        },
        {
          "id": "dev.wine-red.dsh-prompt-stash",
          "version": "0.2.5",
          "required": true
        }
      ],
      "requires": {
        "hostCapabilities": [
          "host.snapshot",
          "host.trial-boot"
        ],
        "platforms": [
          {
            "os": "win32",
            "arch": [
              "x64"
            ]
          }
        ]
      },
      "lock": {
        "$schema": "https://mojobox.dev/schemas/pack-lock-v1alpha1.json",
        "apiVersion": "packs.mojobox.dev/v1alpha1",
        "kind": "PackLock",
        "pack": "dev.mojobox.windows-operator@0.2.0",
        "components": [
          {
            "id": "dev.jing-hy.computer-user",
            "version": "0.3.6",
            "source": "npm:computer-user@0.3.6",
            "manifest": "catalog/plugins/dev.jing-hy.computer-user.json",
            "manifestDigest": "sha256:77c0fba9300db7cd8ef2e7b6d4ca2b366f768b8164fa5585faefd0378b68d8b9",
            "artifactDigest": "sha256:cf6e505c7ff76fec961cea757796b07b79e524b4c8b4403aa1319f74526b655b"
          },
          {
            "id": "dev.jing-hy.picturereader",
            "version": "3.3.1",
            "source": "npm:picturereader@3.3.1",
            "manifest": "catalog/plugins/dev.jing-hy.picturereader.json",
            "manifestDigest": "sha256:0e483d08bb1062bf07a289577e1a8e012a5632d34297d4f11632a2693f9d3570",
            "artifactDigest": "sha256:0a04a1cfbb1f630bbedb867f876636b16637697f4107fe6356ce38b5ce8d9728"
          },
          {
            "id": "dev.omdsh.dsh-better-sidebar",
            "version": "0.12.2",
            "source": "npm:dsh-better-sidebar@0.12.2",
            "manifest": "catalog/plugins/dev.omdsh.dsh-better-sidebar.json",
            "manifestDigest": "sha256:b2faa1e6a274e342dbbf23ce6e893677a14747a372a1912cd3f7b97f19c3680b",
            "artifactDigest": "sha256:5f80d9cfd7f250a675cf9bc7f951ca246c047f09607200831733f845c8255d0f"
          },
          {
            "id": "dev.luaphes.dsh-web-attention-badge",
            "version": "0.3.2",
            "source": "npm:dsh-web-attention-badge@0.3.2",
            "manifest": "catalog/plugins/dev.luaphes.dsh-web-attention-badge.json",
            "manifestDigest": "sha256:03ce9083a59caba88fce1a148b50ea14567fed453c60a4dbd5284081593fa7cb",
            "artifactDigest": "sha256:bdb93b1e49821725d075f8ce4af24e01fe50f4bf73d09c8805b8ed942b07aa21"
          },
          {
            "id": "dev.liliucourier.dsh-chat-outline",
            "version": "0.1.10",
            "source": "npm:dsh-chat-outline@0.1.10",
            "manifest": "catalog/plugins/dev.liliucourier.dsh-chat-outline.json",
            "manifestDigest": "sha256:2ef91762f7d66ce7d5227356b8026bb4cb0ff4eabdfdfdd90cadea3cbdc0a335",
            "artifactDigest": "sha256:645d7cb30a84130019dc50f922d254aebf5f85002c1942a5d2174c0f8e0fe20a"
          },
          {
            "id": "dev.nwflower.dsh-file-claim",
            "version": "0.2.0",
            "source": "npm:dsh-file-claim@0.2.0",
            "manifest": "catalog/plugins/dev.nwflower.dsh-file-claim.json",
            "manifestDigest": "sha256:b249c557d63ec200c0b9e6ad276a451bae896aa795540bffd07b94209a70138a",
            "artifactDigest": "sha256:45bd87bc6cbb566278f3c8b1510ecd028817f8bb5365b1a8c8bd7e6b741a61db"
          },
          {
            "id": "dev.wine-red.dsh-prompt-stash",
            "version": "0.2.5",
            "source": "npm:dsh-prompt-stash@0.2.5",
            "manifest": "catalog/plugins/dev.wine-red.dsh-prompt-stash.json",
            "manifestDigest": "sha256:89d606724bc33fc1a96a73e31370d58cbe40eecb5f819f4db0db593b0c97aba8",
            "artifactDigest": "sha256:126153c3a112d36f4d48ea1f08334a3176a01945bc142e4544353a6d804dce18"
          }
        ]
      }
    },
    {
      "metadata": {
        "id": "dev.dsh-eac.skins.v1",
        "version": "1.1.0",
        "name": "EAC \u76AE\u80A4\u5305",
        "description": "EAC \u76AE\u80A4\u94FE\uFF1A\u76AE\u80A4\u52A0\u8F7D\u5668 1.1.0 + 13 \u6B3E\u516C\u7EA6\u76AE\u80A4\uFF082 \u6B3E\u53C2\u8003\u5B9E\u73B0 + 11 \u6B3E\u8FC1\u79FB\u76AE\u80A4\uFF09\u3002\u6210\u5458\u5747\u4E3A Mojobox \u76EE\u5F55\u4E2D\u7684\u771F\u5B9E\u8BB0\u5F55\uFF0C\u5236\u54C1\u4E3A GitHub Release tgz\uFF08v1.1.0 \u8D44\u4EA7\u4E0E npm \u53D1\u5E03\u5747\u5F85 M8\uFF09\u3002",
        "category": "appearance"
      },
      "components": [
        {
          "id": "dev.eac.ui-skin-loader",
          "version": "1.1.0",
          "required": true
        },
        {
          "id": "dev.eac.skin-aurora",
          "version": "1.1.0",
          "required": false
        },
        {
          "id": "dev.eac.skin-blue-fantasy",
          "version": "1.1.0",
          "required": false
        },
        {
          "id": "dev.eac.skin-deep-whale-day-night",
          "version": "1.1.0",
          "required": false
        },
        {
          "id": "dev.eac.skin-dragon-heir",
          "version": "1.1.0",
          "required": false
        },
        {
          "id": "dev.eac.skin-inkwash",
          "version": "1.1.0",
          "required": false
        },
        {
          "id": "dev.eac.skin-maid-atelier",
          "version": "1.1.0",
          "required": false
        },
        {
          "id": "dev.eac.skin-miku",
          "version": "1.1.0",
          "required": false
        },
        {
          "id": "dev.eac.skin-minecraft",
          "version": "1.1.0",
          "required": false
        },
        {
          "id": "dev.eac.skin-qq98",
          "version": "1.1.0",
          "required": false
        },
        {
          "id": "dev.eac.skin-ths",
          "version": "1.1.0",
          "required": false
        },
        {
          "id": "dev.eac.skin-trading",
          "version": "1.1.0",
          "required": false
        },
        {
          "id": "dev.eac.skin-whale-song",
          "version": "1.1.0",
          "required": false
        },
        {
          "id": "dev.eac.skin-xp",
          "version": "1.1.0",
          "required": false
        }
      ],
      "x-dsh-eac-provenance": {
        "kind": "snapshot-derived",
        "reason": "Mojobox \u5C1A\u65E0 eac.skins.v1 Pack \u8BB0\u5F55\uFF08M4 \u8BB0 draft/source-pending\uFF09\uFF1B\u6B64\u89C6\u56FE\u7531\u771F\u5B9E\u76EE\u5F55\u8BB0\u5F55\u6D3E\u751F\uFF08loader v1.1.0 + 13 \u6B3E\u76AE\u80A4\uFF09\uFF0C\u4E0D\u865A\u6784 digest \u6216\u5236\u54C1\u3002\u684C\u9762\u6CE8\u518C\u8868\u5C06\u76AE\u80A4\u94FE\u767B\u8BB0\u4E3A builtin/bundled\uFF08\u4E0D\u53EF\u53D6\u6D88\u52FE\u9009\uFF09\uFF0C\u5B89\u88C5\u5668\u6309\u81EA\u8EAB\u7B56\u7565\u5448\u73B0\u4E3A\u300C\u53EF\u9009\u300D\u5916\u89C2\u5305\uFF08\u53EF\u9010\u9879\u53D6\u6D88\u52FE\u9009\uFF09\uFF0C\u5206\u7EA7\u6765\u6E90\u5982\u5B9E\u6807\u6CE8\u4E3A installer-policy\u3002",
        "sources": [
          "dev.eac.ui-skin-loader",
          "dev.eac.skin-aurora",
          "dev.eac.skin-blue-fantasy",
          "dev.eac.skin-deep-whale-day-night",
          "dev.eac.skin-dragon-heir",
          "dev.eac.skin-inkwash",
          "dev.eac.skin-maid-atelier",
          "dev.eac.skin-miku",
          "dev.eac.skin-minecraft",
          "dev.eac.skin-qq98",
          "dev.eac.skin-ths",
          "dev.eac.skin-trading",
          "dev.eac.skin-whale-song",
          "dev.eac.skin-xp"
        ]
      }
    }
  ]
};

// src/adapter/dsh-0.1.7-host.ts
var DEFAULT_CATALOG_URL = "https://mojobox.dev/generated/catalog.json";
var ConfigSchema = z.object({
  catalogUrl: z.string().default(DEFAULT_CATALOG_URL),
  onlineEnabled: z.boolean().default(true),
  onlineTimeoutMs: z.number().default(5e3),
  profile: z.string().default("web"),
  dshCommand: z.string().default("dsh")
});
var RETAINED_RUNS = 20;
function createSpawnRunner() {
  return {
    run(command, args) {
      return new Promise((resolve) => {
        const child = spawn(command, [...args], { shell: false, windowsHide: true });
        let output = "";
        const collect = (chunk) => {
          output = `${output}${String(chunk)}`.slice(-16384);
        };
        child.stdout?.on("data", collect);
        child.stderr?.on("data", collect);
        child.on("error", (error) => resolve({ exitCode: 127, output: `${output}
${error.message}` }));
        child.on("close", (code) => resolve({ exitCode: code ?? 1, output }));
      });
    }
  };
}
var PackInstaller = class extends TypertRemoteService {
  static Config = ConfigSchema;
  resolved;
  runner = createSpawnRunner();
  runs = /* @__PURE__ */ new Map();
  lastCatalog = null;
  constructor(ctx, config = {}) {
    super(ctx, SERVICE_NAME);
    this.resolved = {
      catalogUrl: config.catalogUrl ?? DEFAULT_CATALOG_URL,
      onlineEnabled: config.onlineEnabled ?? true,
      onlineTimeoutMs: config.onlineTimeoutMs ?? 5e3,
      profile: config.profile ?? "web",
      dshCommand: config.dshCommand ?? "dsh"
    };
  }
  /** The mounted official plugin manager, or `undefined` when the profile has none. */
  manager() {
    const candidate = this.ctx.get(OFFICIAL_PLUGIN_MANAGER_SERVICE);
    if (typeof candidate !== "object" || candidate === null) return void 0;
    const record = candidate;
    return typeof record.installBundle === "function" && typeof record.setPluginEnabled === "function" && typeof record.listPlugins === "function" ? candidate : void 0;
  }
  /** The online catalog transport over `fetch`. */
  onlinePort() {
    const url = this.resolved.catalogUrl;
    return {
      async fetchOnline(signal) {
        const response = await fetch(url, { signal, headers: { accept: "application/json" } });
        if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
        return await response.json();
      }
    };
  }
  /**
   * Read the catalog: online first, embedded snapshot as the floor.
   * @returns the snapshot that answered and where it came from.
   */
  async catalog() {
    const result = await loadCatalog({
      embedded: snapshotDocument,
      port: this.resolved.onlineEnabled ? this.onlinePort() : null,
      enabled: this.resolved.onlineEnabled,
      timeoutMs: this.resolved.onlineTimeoutMs,
      generatedAt: SNAPSHOT_GENERATED_AT
    });
    this.lastCatalog = result;
    return result;
  }
  /** The install transport this profile offers, and what the official seam looks like. */
  hostSeam() {
    return describeHostSeam(this.seamFacts());
  }
  /**
   * Start installing the confirmed selection.
   * @param request - pack and component ids the user confirmed.
   * @returns the request id `progress` and `cancel` address.
   * @throws {RemoteError} `gateway/bad-request` for an unknown pack or an empty selection.
   */
  async install(request) {
    const catalog = this.lastCatalog ?? await this.catalog();
    const pack = findPack(catalog.snapshot, request.packId);
    if (pack === void 0) {
      throw new RemoteError("gateway/bad-request", `pack/unknown: \u76EE\u5F55\u4E2D\u6CA1\u6709 Pack ${request.packId}`, {});
    }
    const port = selectPort(
      this.manager(),
      createCliPort({ profile: this.resolved.profile, dshCommand: this.resolved.dshCommand, runner: this.runner })
    );
    let run;
    try {
      run = startInstall({ request, pack, port });
    } catch (error) {
      throw new RemoteError("gateway/bad-request", error instanceof Error ? error.message : String(error), {});
    }
    this.runs.set(run.requestId, run);
    void run.done.then(
      () => this.prune(),
      () => this.prune()
    );
    return { requestId: run.requestId };
  }
  /**
   * Read one run's progress.
   * @param requestId - id returned by {@link install}.
   * @throws {RemoteError} `gateway/bad-request` when no active run has that id.
   */
  async progress(requestId) {
    const run = this.runs.get(requestId);
    if (run === void 0) {
      throw new RemoteError("gateway/bad-request", `install/unknown-request: \u672A\u627E\u5230\u5B89\u88C5\u8BF7\u6C42 ${requestId}`, {});
    }
    return run.progress();
  }
  /**
   * Read one settled run as the settings section's result panel shows it:
   * the progress snapshot, the closing steps and the official seam.
   *
   * The steps are computed here rather than in the view so the rule "the
   * installer ends at the official sign-in surface" is testable and cannot
   * drift per render.
   *
   * @param requestId - id returned by {@link install}.
   * @throws {RemoteError} `gateway/bad-request` when no run has that id.
   */
  async result(requestId) {
    const run = this.runs.get(requestId);
    if (run === void 0) {
      throw new RemoteError("gateway/bad-request", `install/unknown-request: \u672A\u627E\u5230\u5B89\u88C5\u8BF7\u6C42 ${requestId}`, {});
    }
    const progress = run.progress();
    const account = await this.accountState();
    return {
      progress,
      steps: postInstallSteps({
        installedCount: progress.steps.filter((step) => step.state === "installed" || step.state === "enabled" || step.state === "disabled").length,
        enabledCount: progress.steps.filter((step) => step.state === "enabled").length,
        unknownEnablementCount: progress.steps.filter((step) => step.state === "installed" && step.enabled === null).length,
        restartRequired: progress.steps.some((step) => (step.message ?? "").includes("\u91CD\u542F")),
        account
      }),
      seam: this.hostSeam()
    };
  }
  /**
   * Stop a run before its next component.
   * @param requestId - id returned by {@link install}.
   * @returns `cancelled` when the run existed, `not-running` otherwise.
   */
  async cancel(requestId) {
    const run = this.runs.get(requestId);
    if (run === void 0) return { status: "not-running" };
    run.cancel();
    return { status: "cancelled" };
  }
  /** Keep only the most recent runs addressable. */
  prune() {
    while (this.runs.size > RETAINED_RUNS) {
      const oldest = this.runs.keys().next();
      if (oldest.done === true) return;
      this.runs.delete(oldest.value);
    }
  }
  /** Probe the official surfaces this plugin defers to. */
  seamFacts() {
    return {
      managerMounted: this.manager() !== void 0,
      accountMounted: this.ctx.get("accountController") !== void 0
    };
  }
  /**
   * Read the official account state, read-only.
   *
   * Only the one status value the official account UI itself keys on
   * (`credential-stored`) is treated as signed in; every other shape — an
   * absent service, a rejected call, an unrecognised status — is reported as
   * `unknown` rather than guessed at.
   *
   * @returns the observed account state.
   */
  async accountState() {
    const controller = this.ctx.get("accountController");
    if (typeof controller !== "object" || controller === null) return "unknown";
    const getState = controller.getState;
    if (typeof getState !== "function") return "unknown";
    try {
      const state = await getState.call(controller);
      if (typeof state !== "object" || state === null) return "unknown";
      const view = state.view;
      const status = typeof view === "object" && view !== null ? view.status : void 0;
      if (status === "credential-stored") return "signed-in";
      if (typeof status === "string") return "signed-out";
      return "unknown";
    } catch {
      return "unknown";
    }
  }
};
markRemoteMethods(PackInstaller.prototype, ["catalog", "install", "progress", "result", "cancel", "hostSeam"]);
export {
  CONVENTION_ID,
  DEFAULT_CATALOG_URL,
  PackInstaller,
  SERVICE_NAME,
  SETTINGS_NAMESPACE,
  PackInstaller as default
};
