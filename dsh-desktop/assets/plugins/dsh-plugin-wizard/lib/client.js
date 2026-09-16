/**
 * dsh-plugin-wizard — browser half: the 插件 → 选择向导 settings section.
 *
 * One button re-opens the plugin distribution wizard (the same
 * onboarding.html shown on first launch) in "rerun" mode, letting users
 * choose recommended-pack features while builtin plugins stay enabled. All actions ride the
 * window.dshDesktop.pluginWizard IPC bridge (desktop shell).
 *
 * Hand-written ModuleLoader bundle — no build step required.
 */
window.__ModuleLoader__.load({
  id: "dsh-plugin-wizard",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    var react = require("react");
    var h = react.createElement;

    var CSS =
      ".__pw_root{max-width:640px;display:flex;flex-direction:column;gap:12px}" +
      ".__pw_hint{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);margin:0}" +
      ".__pw_actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}" +
      ".__pw_btn{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);border-radius:8px;padding:7px 16px;font:inherit;font-size:13px;cursor:pointer}" +
      ".__pw_btn:hover:not(:disabled){border-color:var(--dsw-alias-state-business-primary)}" +
      ".__pw_btnPrimary{border-color:var(--dsw-alias-state-business-primary);background:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-label-on-accent)}" +
      ".__pw_btn:disabled{opacity:.5;cursor:default}" +
      ".__pw_note{font-size:11px;line-height:17px;color:var(--dsw-alias-label-caption)}";
    var tagId = "dsh-plugin-wizard/main.css";
    if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
      var tag = document.createElement("style");
      tag.dataset.plugin = "dsh-plugin-wizard";
      tag.dataset.pluginCss = tagId;
      tag.textContent = CSS;
      document.head.appendChild(tag);
    }

    var NS = "pluginWizard";
    var zh = {
      nav: "选择向导",
      intro: "内置插件保持启用；推荐插件包中的功能可按需选择。迁移期间这里只调整启停状态，不会卸载插件包，「插件 → 管理」里仍可单独操作。",
      open: "重新打开插件选择向导",
      busy: "已打开向导窗口…",
      noBridge: "此功能需要 Deepseek Harness EAC 桌面端运行（浏览器/CLI 模式下不可用）。",
      applied: "已应用并重启 Web 服务。"
    };
    var en = {
      nav: "Plugin wizard",
      intro: "Built-in plugins stay enabled. Choose features from the recommended plugin pack; during migration this changes enabled state without uninstalling packages.",
      open: "Re-open plugin wizard",
      busy: "Wizard window opened…",
      noBridge: "This requires the Deepseek Harness EAC desktop shell (unavailable in browser/CLI mode).",
      applied: "Applied and restarted the web service."
    };

    var inject = ["slots", "locale"];

    function WizardSection(props) {
      var t = props.t;
      var bridge = (typeof window !== "undefined" && window.dshDesktop && window.dshDesktop.pluginWizard) || null;
      var busyState = react.useState(false);
      var busy = busyState[0];
      var setBusy = busyState[1];

      var open = function () {
        if (!bridge || busy) return;
        setBusy(true);
        bridge.open().then(function (r) {
          if (!r || r.ok !== true) window.alert(t("noBridge"));
        }).catch(function () {
          window.alert(t("noBridge"));
        });
      };

      return h("div", { className: "__pw_root" },
        h("p", { className: "__pw_hint", style: { margin: 0 } }, t("intro")),
        h("div", { className: "__pw_actions" },
          h("button", {
            className: "__pw_btn __pw_btnPrimary",
            disabled: !bridge || busy,
            onClick: open
          }, busy ? t("busy") : t("open"))
        ),
        bridge ? null : h("p", { className: "__pw_note" }, t("noBridge"))
      );
    }

    function apply(ctx) {
      var t = ctx.locale.bind(NS);
      ctx.effect(function () { return ctx.locale.register(NS, { zh: zh, en: en }); }, "dsh-plugin-wizard: dictionaries");
      ctx.slots.inject("settings.section", function () {
        return ctx.slots.register({
          name: "settings.section",
          id: "plugin-wizard",
          order: 24,
          label: function () { return t("nav"); },
          locale: NS
        }, function (props) {
          return h(WizardSection, props);
        });
      });
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }
});