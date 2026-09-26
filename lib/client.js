window.__ModuleLoader__.load({
  id: "@dsh-eac/pack-installer",
  factory: (require) => {
    var module = { exports: {} };

"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.ts
var index_exports = {};
__export(index_exports, {
  PackInstallerSection: () => PackInstallerSection,
  REMOTE_SERVICE_KEY: () => REMOTE_SERVICE_KEY,
  TYPERT_REMOTE: () => TYPERT_REMOTE,
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);

// src/client/adapter/dsh-0.1.7-client.ts
function createClientAdapter(ctx) {
  return {
    mountRemote: (contribution) => ctx.remote.$mount(contribution),
    registerSection(options, component) {
      return ctx.slots.register({ ...options, name: "settings.section" }, component);
    },
    injectSection(register) {
      return ctx.slots.inject("settings.section", register);
    },
    remoteNamespace(name) {
      const namespace = ctx.remote[name];
      if (namespace === void 0) throw new Error(`remote namespace ${JSON.stringify(name)} is not mounted`);
      return namespace;
    },
    bindLocale(namespace, dictionaries) {
      const dispose = ctx.locale.register(namespace, dictionaries);
      const translate = ctx.locale.bind(namespace);
      return {
        t: (key, parameters) => {
          try {
            return translate(key, parameters);
          } catch {
            return key;
          }
        },
        dispose
      };
    }
  };
}
function composeDisposers(disposers) {
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    for (const dispose of [...disposers].reverse()) void dispose();
  };
}

// src/client/messages.ts
var MESSAGES = {
  en: {
    nav: "EAC Packs",
    title: "EAC integration packs",
    subtitle: "Browse EAC / Mojobox packs, choose the components to install, and install them through the DSH plugin manager.",
    offline: "Offline: using the embedded catalog snapshot",
    degraded: "Online catalog unavailable \u2014 fell back to the embedded snapshot",
    loading: "Loading the catalog\u2026",
    reload: "Reload",
    refresh: "Refresh",
    components: "Components",
    install: "Install selected",
    installing: "Installing\u2026",
    cancel: "Cancel",
    confirm: "Confirm installation",
    confirmHint: "Untick anything you do not want. Tier decides whether a component is enabled after install.",
    required: "Required",
    notInstallable: "Not installable yet",
    selectableHint: "Click a row to include or exclude it",
    locked: "Locked (Pack Lock)",
    unlocked: "Not locked (draft / source-pending)",
    derived: "Derived view",
    progress: "Progress",
    result: "Result",
    followUp: "Next steps",
    credentials: "Sign-in and credentials stay with the official DeepSeek account page. This plugin never asks for an API key.",
    transport: "Install transport",
    transportManager: "DSH plugin manager (reports enablement)",
    transportCli: "dsh plugin CLI (cannot report enablement)",
    noCatalog: "The catalog is empty.",
    installFailed: "Could not start the installation"
  },
  zh: {
    nav: "EAC \u6574\u5408\u5305",
    title: "EAC \u6574\u5408\u5305",
    subtitle: "\u6D4F\u89C8 EAC / Mojobox \u6574\u5408\u5305\uFF0C\u52FE\u9009\u8981\u5B89\u88C5\u7684\u7EC4\u4EF6\uFF0C\u901A\u8FC7 DSH \u63D2\u4EF6\u7BA1\u7406\u5668\u5B8C\u6210\u5B89\u88C5\u3002",
    offline: "\u79BB\u7EBF\uFF1A\u4F7F\u7528\u5185\u5D4C\u76EE\u5F55\u5FEB\u7167",
    degraded: "\u5728\u7EBF\u76EE\u5F55\u4E0D\u53EF\u7528\u2014\u2014\u5DF2\u56DE\u9000\u5230\u5185\u5D4C\u5FEB\u7167",
    loading: "\u6B63\u5728\u8BFB\u53D6\u76EE\u5F55\u2026",
    reload: "\u91CD\u65B0\u8BFB\u53D6",
    refresh: "\u5237\u65B0",
    components: "\u7EC4\u4EF6",
    install: "\u5B89\u88C5\u6240\u9009",
    installing: "\u6B63\u5728\u5B89\u88C5\u2026",
    cancel: "\u53D6\u6D88",
    confirm: "\u786E\u8BA4\u5B89\u88C5",
    confirmHint: "\u53D6\u6D88\u52FE\u9009\u5373\u53EF\u6392\u9664\uFF1B\u5206\u7EA7\u51B3\u5B9A\u5B89\u88C5\u540E\u662F\u5426\u542F\u7528\u3002",
    required: "\u5FC5\u9700",
    notInstallable: "\u6682\u4E0D\u53EF\u5B89\u88C5",
    selectableHint: "\u70B9\u51FB\u884C\u4EE5\u52FE\u9009\u6216\u53D6\u6D88",
    locked: "\u5DF2\u9501\u5B9A\uFF08Pack Lock\uFF09",
    unlocked: "\u672A\u9501\u5B9A\uFF08draft / source-pending\uFF09",
    derived: "\u6D3E\u751F\u89C6\u56FE",
    progress: "\u8FDB\u5EA6",
    result: "\u7ED3\u679C",
    followUp: "\u540E\u7EED\u6B65\u9AA4",
    credentials: "\u767B\u5F55\u4E0E\u51ED\u636E\u7531\u5B98\u65B9 DeepSeek \u8D26\u53F7\u9875\u9762\u6301\u6709\uFF0C\u672C\u63D2\u4EF6\u4E0D\u4F1A\u7D22\u53D6 API Key\u3002",
    transport: "\u5B89\u88C5\u901A\u9053",
    transportManager: "DSH \u63D2\u4EF6\u7BA1\u7406\u5668\uFF08\u53EF\u56DE\u8BFB\u542F\u7528\u72B6\u6001\uFF09",
    transportCli: "dsh plugin CLI\uFF08\u65E0\u6CD5\u56DE\u8BFB\u542F\u7528\u72B6\u6001\uFF09",
    noCatalog: "\u76EE\u5F55\u4E3A\u7A7A\u3002",
    installFailed: "\u65E0\u6CD5\u5F00\u59CB\u5B89\u88C5"
  }
};
var LOCALE_KEYS = Object.keys(MESSAGES);

// src/client/section.tsx
var import_react = require("react");

// src/core/tier-policy.ts
function tierLabel(tier) {
  switch (tier) {
    case "L1":
      return "\u5EFA\u8BAE\u5B89\u88C5";
    case "L2":
      return "\u53EF\u9009";
    case "L3":
      return "\u4E0D\u63A8\u8350";
  }
}
function defaultSelected(tier) {
  return tier !== "L3";
}
function selectable(tier, required) {
  return !required && tier !== "L1";
}
function tierSourceLabel(source) {
  switch (source) {
    case "desktop-sync":
      return "\u6765\u81EA EAC \u684C\u9762\u5206\u7EA7\u6CE8\u518C\u8868";
    case "installer-policy":
      return "\u7531\u5B89\u88C5\u5668\u7B56\u7565\u6307\u5B9A\uFF08\u975E\u4E0A\u6E38\u5206\u7EA7\uFF09";
    case "unmapped":
      return "\u672A\u5206\u7C7B\uFF0C\u6309 L3 \u4FDD\u5B88\u5904\u7406";
  }
}

// src/core/selection.ts
function rowSelectable(component) {
  return selectable(component.tier, component.required) && component.installSpec !== null;
}
function consents(component) {
  return component.tier === "L2";
}
function createSelection(pack, options = {}) {
  const installed = new Set(options.installed ?? []);
  const selected = {};
  const enable = {};
  for (const component of pack.components) {
    const included = defaultSelected(component.tier) && component.installSpec !== null && !installed.has(component.id);
    selected[component.id] = included;
    enable[component.id] = included && consents(component);
  }
  return { packId: pack.id, selected, enable };
}
function toggleComponent(state, pack, componentId) {
  const component = pack.components.find((candidate) => candidate.id === componentId);
  if (component === void 0 || !rowSelectable(component)) return state;
  const included = state.selected[componentId] !== true;
  return {
    packId: state.packId,
    selected: { ...state.selected, [componentId]: included },
    enable: { ...state.enable, [componentId]: included && consents(component) }
  };
}
function enableIds(state) {
  return Object.keys(state.enable).filter((id) => state.enable[id] === true && state.selected[id] === true);
}
function selectionSummary(pack, state) {
  const components = pack.components;
  return {
    total: components.length,
    selectable: components.filter(rowSelectable).length,
    selected: components.filter((component) => state.selected[component.id] === true).length,
    installable: components.filter((component) => state.selected[component.id] === true && component.installSpec !== null).length,
    blocked: components.filter((component) => component.installSpec === null).length
  };
}
var EmptySelectionError = class extends Error {
  code = "selection/empty";
  constructor(message = "selection/empty: \u81F3\u5C11\u9009\u62E9\u4E00\u4E2A\u53EF\u5B89\u88C5\u7684\u7EC4\u4EF6") {
    super(message);
    this.name = "EmptySelectionError";
  }
};
function toInstallRequest(pack, state) {
  const ordered = pack.components.filter((component) => state.selected[component.id] === true && component.installSpec !== null);
  if (ordered.length === 0) throw new EmptySelectionError();
  const consented = new Set(enableIds(state));
  return {
    packId: pack.id,
    componentIds: ordered.map((component) => component.id),
    enableComponentIds: ordered.filter((component) => consented.has(component.id)).map((component) => component.id)
  };
}

// src/client/view-model.ts
function categoryLabel(category) {
  switch (category) {
    case "appearance":
      return "\u76AE\u80A4\u5916\u89C2";
    case "function":
      return "\u529F\u80FD\u589E\u5F3A";
    case "workflow":
      return "\u5DE5\u4F5C\u6D41";
  }
}
function provenanceLabel(pack) {
  return pack.provenance.kind === "snapshot-derived" ? `\u6D3E\u751F\u89C6\u56FE\uFF1A${pack.provenance.reason}` : pack.provenance.reason;
}
function lockedLabel(pack) {
  if (pack.provenance.kind === "snapshot-derived") return "\u672A\u9501\u5B9A\uFF08\u6D3E\u751F\u89C6\u56FE\uFF0C\u65E0 Pack Lock\uFF09";
  return pack.provenance.locked ? "\u5DF2\u9501\u5B9A\uFF08Pack Lock\uFF09" : "\u672A\u9501\u5B9A\uFF08draft / source-pending\uFF09";
}
function buildPackCard(pack, selection, progress) {
  const live = progress !== null && progress.packId === pack.id ? progress : null;
  const stepByComponent = new Map((live?.steps ?? []).map((step) => [step.componentId, step]));
  const rows = pack.components.map((component) => {
    const step = stepByComponent.get(component.id);
    return {
      id: component.id,
      name: component.name,
      version: component.version,
      tier: component.tier,
      tierLabel: tierLabel(component.tier),
      tierSourceLabel: tierSourceLabel(component.tierSource),
      distributionClass: component.distributionClass,
      selected: selection.selected[component.id] === true,
      selectable: rowSelectable(component),
      installable: component.installSpec !== null,
      required: component.required,
      sourcePending: component.sourcePending,
      reason: component.reason,
      enableAfterInstall: component.tier === "L2" && defaultSelected(component.tier),
      state: step?.state ?? null,
      message: step?.message ?? null
    };
  });
  return {
    id: pack.id,
    name: pack.name,
    description: pack.description,
    version: pack.version,
    category: pack.category,
    categoryLabel: categoryLabel(pack.category),
    provenanceLabel: provenanceLabel(pack),
    locked: pack.provenance.locked,
    lockedLabel: lockedLabel(pack),
    summary: selectionSummary(pack, selection),
    rows
  };
}
function packCardSubtitle(card) {
  const recommended = card.rows.filter((row) => row.tier === "L1" || row.tier === "L2").length;
  return `${card.rows.length} \u4E2A\u7EC4\u4EF6 \xB7 ${recommended} \u4E2A\u5EFA\u8BAE\u5B89\u88C5 \xB7 ${card.summary.blocked} \u4E2A\u6682\u4E0D\u53EF\u5B89\u88C5`;
}
function installStateLabel(progress) {
  if (progress === null) {
    return { state: "idle", label: "\u5C1A\u672A\u5B89\u88C5", detail: "\u9009\u62E9\u4E00\u4E2A\u6574\u5408\u5305\u5E76\u786E\u8BA4\u8981\u5B89\u88C5\u7684\u7EC4\u4EF6\u3002" };
  }
  const done = progress.steps.filter((step) => step.state === "enabled" || step.state === "installed" || step.state === "disabled").length;
  const total = progress.steps.length;
  switch (progress.state) {
    case "running":
      return { state: "running", label: "\u6B63\u5728\u5B89\u88C5", detail: `\u6B63\u5728\u5B89\u88C5\uFF1A\u5DF2\u5B8C\u6210 ${done}/${total} \u4E2A\u7EC4\u4EF6\uFF0C\u8BF7\u52FF\u5173\u95ED\u7A97\u53E3\u3002` };
    case "completed":
      return { state: "completed", label: "\u5B89\u88C5\u5B8C\u6210", detail: `\u5DF2\u5904\u7406 ${done}/${total} \u4E2A\u7EC4\u4EF6\u3002` };
    case "failed":
      return { state: "failed", label: "\u5B89\u88C5\u5931\u8D25", detail: progress.error ?? "\u672A\u77E5\u9519\u8BEF" };
    case "cancelled":
      return { state: "cancelled", label: "\u5DF2\u53D6\u6D88", detail: `\u5DF2\u53D6\u6D88\uFF0C\u5B8C\u6210 ${done}/${total} \u4E2A\u7EC4\u4EF6\u3002` };
  }
}

// src/client/section.tsx
var import_jsx_runtime = require("react/jsx-runtime");
var BADGE_COLORS = {
  L1: "var(--dsw-alias-state-success-primary, #4caf7d)",
  L2: "var(--dsw-alias-state-warning-primary, #d9a441)",
  L3: "var(--dsw-alias-label-tertiary, rgba(128,128,128,0.7))"
};
var CSS_ID = "@dsh-eac/pack-installer/section.css";
function ensureStyles() {
  if (typeof document === "undefined" || document.querySelector(`style[data-plugin-css="${CSS_ID}"]`) !== null) return;
  const style = document.createElement("style");
  style.dataset.plugin = "@dsh-eac/pack-installer";
  style.dataset.pluginCss = CSS_ID;
  style.textContent = `
.eacpi-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
@media (width <= 680px) { .eacpi-grid { grid-template-columns: minmax(0, 1fr); } }
.eacpi-row { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 8px; cursor: pointer; }
.eacpi-row[data-selectable="false"] { cursor: default; opacity: .75; }
.eacpi-row:hover[data-selectable="true"] { background: color-mix(in srgb, currentColor 6%, transparent); }
.eacpi-row input { margin: 0; flex: none; }
.eacpi-name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.eacpi-meta { font-size: 11px; opacity: .7; flex: none; }
.eacpi-actions { display: flex; gap: 8px; align-items: center; margin-top: 10px; flex-wrap: wrap; }
`;
  document.head.appendChild(style);
}
function Badge({ text, color }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "span",
    {
      style: {
        fontSize: 11,
        padding: "1px 8px",
        borderRadius: 8,
        border: "1px solid currentColor",
        color,
        whiteSpace: "nowrap",
        flex: "none"
      },
      children: text
    }
  );
}
var STEP_STATE_LABEL = {
  pending: "\u5F85\u5B89\u88C5",
  installing: "\u5B89\u88C5\u4E2D",
  installed: "\u5DF2\u5B89\u88C5",
  enabled: "\u5DF2\u542F\u7528",
  disabled: "\u5DF2\u5B89\u88C5\xB7\u672A\u542F\u7528",
  skipped: "\u5DF2\u8DF3\u8FC7",
  failed: "\u5931\u8D25"
};
function ComponentRow({
  row,
  onToggle
}) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "eacpi-row", "data-selectable": String(row.selectable), "data-tier": row.tier, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "input",
      {
        type: "checkbox",
        checked: row.selected,
        disabled: !row.selectable,
        onChange: () => onToggle(row.id),
        "aria-label": row.name
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "eacpi-name", title: `${row.name}@${row.version} \u2014 ${row.tierSourceLabel}`, children: row.name }),
    row.required ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Badge, { text: "\u5FC5\u9700", color: "var(--dsw-alias-label-tertiary, rgba(128,128,128,0.7))" }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Badge, { text: row.tierLabel, color: BADGE_COLORS[row.tier] ?? "currentColor" }),
    row.installable ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Badge, { text: "\u6682\u4E0D\u53EF\u5B89\u88C5", color: BADGE_COLORS["L3"] }),
    row.state !== null ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "eacpi-meta", children: [
      STEP_STATE_LABEL[row.state] ?? row.state,
      row.message !== null ? ` \xB7 ${row.message}` : ""
    ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "eacpi-meta", children: row.version })
  ] });
}
function PackCard({
  card,
  onToggle,
  onConfirm,
  busy
}) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    "section",
    {
      "data-pack": card.id,
      style: {
        border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.25))",
        borderRadius: 12,
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 8
      },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", { style: { display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { style: { fontSize: 14 }, children: card.name }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Badge, { text: card.categoryLabel, color: "var(--dsw-alias-label-secondary, currentColor)" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "eacpi-meta", children: card.version })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: { margin: 0, fontSize: 12, opacity: 0.8 }, children: card.description }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { className: "eacpi-meta", style: { margin: 0 }, children: [
          packCardSubtitle(card),
          " \xB7 ",
          card.locked ? "\u5DF2\u9501\u5B9A" : "\u672A\u9501\u5B9A"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { children: card.rows.map((row) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ComponentRow, { row, onToggle: (id) => onToggle(card.id, id) }, row.id)) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "eacpi-actions", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", disabled: busy || card.summary.installable === 0, onClick: () => onConfirm(card.id), children: busy ? "\u6B63\u5728\u5B89\u88C5\u2026" : `\u5B89\u88C5\u6240\u9009\uFF08${card.summary.installable}\uFF09` }) })
      ]
    }
  );
}
function PackInstallerSection({ remote, t }) {
  const [catalog, setCatalog] = (0, import_react.useState)(null);
  const [selections, setSelections] = (0, import_react.useState)({});
  const [progress, setProgress] = (0, import_react.useState)(null);
  const [result, setResult] = (0, import_react.useState)(null);
  const [seam, setSeam] = (0, import_react.useState)(null);
  const [error, setError] = (0, import_react.useState)(null);
  const [busy, setBusy] = (0, import_react.useState)(false);
  (0, import_react.useEffect)(ensureStyles, []);
  const load = (0, import_react.useCallback)(async () => {
    setError(null);
    const answer = await remote.catalog();
    if (!answer.ok) {
      setError(answer.error.message);
      return;
    }
    setCatalog(answer.value);
    setSelections(Object.fromEntries(answer.value.snapshot.packs.map((pack) => [pack.id, createSelection(pack)])));
  }, [remote]);
  (0, import_react.useEffect)(() => {
    void load();
    void remote.hostSeam().then((answer) => {
      if (answer.ok) setSeam(answer.value);
    });
  }, [load, remote]);
  (0, import_react.useEffect)(() => {
    if (progress === null || progress.state !== "running") return;
    const timer = setInterval(() => {
      void remote.progress(progress.requestId).then((answer) => {
        if (!answer.ok) return;
        setProgress(answer.value);
        if (answer.value.state !== "running") void remote.result(answer.value.requestId).then((settled) => {
          if (settled.ok) setResult(settled.value);
        });
      });
    }, 500);
    return () => clearInterval(timer);
  }, [progress, remote]);
  const cards = (0, import_react.useMemo)(() => {
    if (catalog === null) return [];
    return catalog.snapshot.packs.map((pack) => buildPackCard(pack, selections[pack.id] ?? createSelection(pack), progress));
  }, [catalog, selections, progress]);
  const onToggle = (0, import_react.useCallback)(
    (packId, componentId) => {
      if (catalog === null) return;
      const pack = catalog.snapshot.packs.find((candidate) => candidate.id === packId);
      if (pack === void 0) return;
      setSelections((current) => ({
        ...current,
        [packId]: toggleComponent(current[packId] ?? createSelection(pack), pack, componentId)
      }));
    },
    [catalog]
  );
  const onConfirm = (0, import_react.useCallback)(
    async (packId) => {
      if (catalog === null) return;
      const pack = catalog.snapshot.packs.find((candidate) => candidate.id === packId);
      if (pack === void 0) return;
      setBusy(true);
      setError(null);
      try {
        const request = toInstallRequest(pack, selections[packId] ?? createSelection(pack));
        const accepted = await remote.install(request);
        if (!accepted.ok) {
          setError(accepted.error.message);
          return;
        }
        setResult(null);
        const first = await remote.progress(accepted.value.requestId);
        if (first.ok) setProgress(first.value);
      } catch (failure) {
        setError(`${t("installFailed")}\uFF1A${failure instanceof Error ? failure.message : String(failure)}`);
      } finally {
        setBusy(false);
      }
    },
    [catalog, remote, selections, t]
  );
  const state = installStateLabel(progress);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { "data-eacpi": "section", style: { display: "flex", flexDirection: "column", gap: 12 }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", { style: { display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { style: { margin: 0, fontSize: 16 }, children: t("title") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "span",
        {
          "data-eacpi": "wordmark",
          style: {
            fontSize: 11,
            letterSpacing: 1,
            padding: "1px 6px",
            borderRadius: 6,
            border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.35))",
            opacity: 0.85
          },
          children: seam?.wordmark ?? "DSH\xB7EAC"
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", onClick: () => void load(), children: t("refresh") })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: { margin: 0, fontSize: 12, opacity: 0.8 }, children: t("subtitle") }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: { margin: 0, fontSize: 12, opacity: 0.8 }, children: t("credentials") }),
    catalog === null ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: t("loading") }) : null,
    catalog?.source === "snapshot" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { "data-eacpi": "source", style: { margin: 0, fontSize: 12 }, children: [
      catalog.degraded ? t("degraded") : t("offline"),
      catalog.warnings.length > 0 ? ` \u2014 ${catalog.warnings.join("; ")}` : ""
    ] }) : null,
    error !== null ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: { margin: 0, color: "var(--dsw-alias-state-error-primary, #d9534f)" }, children: error }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "eacpi-grid", children: cards.map((card) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PackCard, { card, onToggle, onConfirm, busy }, card.id)) }),
    progress !== null ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { "data-eacpi": "progress", style: { display: "flex", flexDirection: "column", gap: 6 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("strong", { children: [
        t("progress"),
        "\uFF1A",
        state.label
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "eacpi-meta", children: state.detail }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", { style: { margin: 0, paddingInlineStart: 18, fontSize: 12 }, children: progress.steps.map((step) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { children: [
        step.name,
        " \u2014 ",
        STEP_STATE_LABEL[step.state] ?? step.state,
        step.enabled === null ? "\uFF08\u542F\u7528\u72B6\u6001\u672A\u77E5\uFF09" : step.enabled ? "\uFF08\u5DF2\u542F\u7528\uFF09" : "\uFF08\u672A\u542F\u7528\uFF09",
        step.message !== null ? ` \xB7 ${step.message}` : ""
      ] }, step.componentId)) }),
      progress.state === "running" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "eacpi-actions", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", onClick: () => void remote.cancel(progress.requestId), children: t("cancel") }) }) : null
    ] }) : null,
    result !== null ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { "data-eacpi": "result", style: { display: "flex", flexDirection: "column", gap: 6 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: t("followUp") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", { style: { margin: 0, paddingInlineStart: 18, fontSize: 12 }, children: result.steps.map((step) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { "data-surface": step.target ?? "none", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: step.label }),
        " \u2014 ",
        step.detail
      ] }, step.kind)) })
    ] }) : null,
    seam !== null ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("footer", { className: "eacpi-meta", "data-eacpi": "seam", children: [
      t("transport"),
      "\uFF1A",
      seam.manager === "pluginManager" ? t("transportManager") : t("transportCli"),
      seam.installUi === null ? "" : " \xB7 \u63D2\u4EF6\u5F00\u5173\u8BF7\u5728\u5B98\u65B9\u300C\u63D2\u4EF6\u300D\u8BBE\u7F6E\u4E2D\u7BA1\u7406"
    ] }) : null
  ] });
}

// src/protocol.ts
var SERVICE_NAME = "eacPackInstaller";
var SETTINGS_SECTION_ID = "dsh-eac-pack-installer";
var SETTINGS_SECTION_ORDER = 91;
var LOCALE_NAMESPACE = "dsh-eac-pack-installer";
var BRAND_LAYER_ID = "dsh-eac-brand-layer";
var BRAND_STYLE_ID = `${BRAND_LAYER_ID}-style`;

// src/client/typert-remote.ts
var PACKAGE = "@dsh-eac/pack-installer";
function parameterCodec(name, typeSymbol) {
  return {
    name,
    wire: name,
    source: "json",
    // Never executed on the client; the Host is the validating side.
    codec: { mode: "strict", typeSymbol, create: () => (value) => value }
  };
}
function descriptor(method, parameters, resultType) {
  return {
    id: `${PACKAGE}#${SERVICE_NAME}/${method}`,
    service: SERVICE_NAME,
    namespace: SERVICE_NAME,
    method,
    invocation: { kind: "direct" },
    parameters,
    result: { mode: "strict", typeSymbol: resultType, create: () => (value) => value }
  };
}
var TYPERT_REMOTE = {
  package: PACKAGE,
  descriptors: [
    descriptor("catalog", [], "@dsh-eac/pack-installer/types#CatalogResult"),
    descriptor("install", [parameterCodec("request", "@dsh-eac/pack-installer/types#InstallRequest")], "@dsh-eac/pack-installer/types#InstallAccepted"),
    descriptor("progress", [parameterCodec("requestId", "@dsh-eac/pack-installer/types#InstallRequestId")], "@dsh-eac/pack-installer/types#InstallProgress"),
    descriptor("result", [parameterCodec("requestId", "@dsh-eac/pack-installer/types#InstallRequestId")], "@dsh-eac/pack-installer/types#InstallResultView"),
    descriptor("cancel", [parameterCodec("requestId", "@dsh-eac/pack-installer/types#InstallRequestId")], "@dsh-eac/pack-installer/types#InstallCancellation"),
    descriptor("hostSeam", [], "@dsh-eac/pack-installer/types#OfficialHostSeam")
  ]
};
var REMOTE_SERVICE_KEY = `remote.${SERVICE_NAME}`;

// src/client/index.ts
var inject = ["remote", "slots", "locale"];
async function apply(ctx) {
  const adapter = createClientAdapter(ctx);
  const disposers = [];
  try {
    disposers.push(await adapter.mountRemote(TYPERT_REMOTE));
    const locale = adapter.bindLocale(LOCALE_NAMESPACE, MESSAGES);
    disposers.push(locale.dispose);
    adapter.injectSection(
      () => adapter.registerSection(
        {
          kind: "list",
          id: SETTINGS_SECTION_ID,
          order: SETTINGS_SECTION_ORDER,
          label: () => locale.t("nav"),
          locale: LOCALE_NAMESPACE
        },
        (props) => PackInstallerSection({ ...props, remote: adapter.remoteNamespace(SERVICE_NAME), t: locale.t })
      )
    );
  } catch (error) {
    await composeDisposers(disposers)();
    throw error;
  }
  return composeDisposers(disposers);
}

    return module.exports;
  },
});

