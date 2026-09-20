# EAC minimal built-in skin

This directory is the built-in `system.default` package set for
`dsh-desktop-eac-ui-skin-profile@^0.3`. It replaces the former monolithic
shell-skin layout.

Package boundaries:

- `skin.json` aggregates one Control Package and one Style Package.
- `control/control.json` declares regions, stable control names, supported
  states, runtime consumers, and the structural `layout.css` asset.
- `style/style.json` declares the same regions and states. `tokens.css` owns
  visual values and `states.css` maps region, control, pseudo-class, ARIA, and
  profile states to those values.
- `slot/slot.json` is registered independently. It defines the host region
  slots; popup, dialog, and floating-window remain instances and do not enter
  the binding table.

The registry at `../registry.json` selects this directory at startup. Rust only
serves registry-listed, explicitly whitelisted assets under `/skin/`. The shell
pages and the main Web UI load assets in this order:

1. `control/layout.css`
2. `style/tokens.css`
3. `style/states.css`

Runtime structure exposes `data-region`, `data-control-name`, and `data-state`.
Contract control names are short and region-local. Implementation-owned visual
nodes use the fully qualified `system.default.*` namespace.

The 17 predefined profile states are `empty`, `idle`, `loading`, `running`,
`success`, `warning`, `error`, `disabled`, `collapsed`, `hidden`, `docked`,
`floating`, `detached`, `dragging`, `drop-target`, `dangerous`, and
`animating`. Hover, focus, active/pressed, and selected visuals use CSS pseudo
classes or ARIA instead of pretending to be predefined states.

The package controls EAC-owned shell pages, the native title bar, and the exit
overlay. Upstream dsh Web UI internals remain owned by the dsh token contract;
the bridge only adds stable names where the upstream DOM already exposes a
stable data or ARIA anchor.
