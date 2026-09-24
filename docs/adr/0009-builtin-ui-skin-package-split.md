# ADR 0009: Built-in UI skin package split

Date: 2026-09-19
Status: Historical baseline (superseded by ADR 0010)
Supersedes: the current architecture described by ADR 0005 and ADR 0007

## Context

The former `assets/shell-skin/{eac-default,aio}` layout grouped a Skin, Control,
and Style identity into one four-file directory and used `kind: shell-skin` as
a host routing concept. It did not expose independent package manifests,
region bindings, stable DOM control names, or the profile's complete state
vocabulary. The AIO directory also had no production selection path.

The UI Skin Authoring Convention Draft v0.11 separates structure and behavior
(Control), visual values and state presentation (Style), custom region
contracts (Slot), and the Control/Style aggregate (Skin). Task 1.4 additionally
requires deterministic names for visual nodes and definitions for all four
sidebars, overlay, session, popup, and dialog surfaces.

## Decision

The former built-in package set lived at
`dsh-desktop/assets/ui-skin/system-default/`. This section records the
migration baseline only; ADR 0010 removes that editable source from EAC.

- `skin.json` aggregates only `system.default.control` and
  `system.default.style`.
- `control/control.json` owns region/control/state declarations and
  `control/layout.css` owns structural layout.
- `style/style.json` owns visual declarations. `style/tokens.css` is the value
  source and `style/states.css` maps stable names, pseudo-classes, ARIA, and
  profile states to visual output.
- `slot/slot.json` is registered independently. It defines the six host
  regions and their separate Control and Style slots.
- The historical `assets/ui-skin/registry.json` selected the default directory
  and explicitly listed loadable assets. It was removed by ADR 0010; current
  staging uses the locally supplied manager snapshot and resolved asset inventory.

The predefined regions are `top-sidebar`, `bottom-sidebar`, `left-sidebar`,
`right-sidebar`, `session`, and `overlay`. Popup, dialog, and floating-window
are instance kinds, not binding-table regions.

The 17 predefined states are `empty`, `idle`, `loading`, `running`, `success`,
`warning`, `error`, `disabled`, `collapsed`, `hidden`, `docked`, `floating`,
`detached`, `dragging`, `drop-target`, `dangerous`, and `animating`. Hover,
focus, active/pressed, and selected use CSS pseudo-classes or ARIA.

Runtime consumers expose `data-region`, `data-control-name`, and `data-state`.
Contract names are short and region-local. EAC-private visual nodes use the
fully qualified `system.default.*` namespace. The bridge only names upstream
nodes that already have stable `data-*`, ARIA, or portal anchors; it does not
promote CSS-module hashes into public skin APIs.

The historical load order was Control layout, default Style tokens, then
default Style state selectors. The current EAC path consumes the manager's
resolved snapshot and asset inventory; it does not read the old registry or
source directory.

The old `assets/shell-skin` directories and `kind: shell-skin` extension remain
removed. ADR 0005 and ADR 0007 remain historical records, but their package
layout and loader decisions no longer describe the current implementation.
ADR 0010 is the current source-of-truth decision and forbids restoring either
the old source mirror or AIO v1.

## Consequences

Control, Style, Slot, and Skin packages are independently identifiable and
versioned. A future selector can replace Control and Style independently by
changing registry bindings while keeping the host region contract stable.

All EAC-owned visual rules have a named selector in the built-in package. The
upstream dsh Web UI remains governed by its own `--dsw-*` contract; Task 1.4
does not claim unnamed upstream internals as EAC controls.

The previously unpublished AIO package is removed instead of preserving a
second obsolete package model. Reintroducing AIO requires a Style Package that
implements this region/control/state contract and a real registry binding.

## Historical verification

- `dsh-desktop/test/shell-skin-pack.test.ts` validates package identities,
  region/control declarations, all 17 states, style selectors, runtime names,
  and registry-driven loading.
- Rust shell tests validate the asset whitelist, traversal rejection, named
  loading/died DOM, and retry state transitions.
- The existing TypeScript build, full Node test suite, Rust checks, and staged
  resource checks remain required release gates.
