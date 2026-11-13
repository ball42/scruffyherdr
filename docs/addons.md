# Add-ons

An add-on is a Herdr mod that adds to the kit without the core knowing what it is. It publishes data through four shared keys. `herdr-signals` and `kit-rail` draw that data when it is there, and draw nothing for it when it isn't. The core holds no add-on's logic, words or tools.

The pure helpers are in `herdr/mods/herdr-signals/addons.js`. A mod can't import another mod's folder, so an add-on uses the key names as literal strings.

## Running an add-on

1. Put the mod in Herdr's `mods/` folder (`~/.config/herdr-app/mods/<name>/`).
2. List its folder name in `~/.config/herdr-kit/config.json`:

   ```json
   { "addons": ["kit-example"] }
   ```

3. Rerun `./install.sh`. `scripts/make-layout.js` gives each add-on that is both listed and present under `mods/` one block in the `scruffy` layout:

   ```json
   { "id": "addon-kit-example", "type": "block", "size": { "px": 0 }, "content": { "mod": "kit-example" } }
   ```

The block is a sibling placed right after the strip's `herdr-signals` block, inside the strip's own row. A listed add-on that is missing from `mods/` is skipped, and the layout still builds.

herdr-signals reads add-on data only while `addons` lists at least one add-on, and only data stamped since herdr-signals started (see Freshness).

### Runtime facts (spiked 2026-11-12, Herdr 0.1.15)

- **The block is not `hidden`.** A block with `hidden: true` never starts its mod: no `init`, no timers and no `setShared`. A visible `px: 0` block starts its mod normally. It goes beside the strip, not under the root, so the 0-px block doesn't add a divider to the root row.
- **Mod commands carry no value.** A mod receives a command only as a string (`nextCommand(): Promise<string>`), so a keys.json action can't pass an argument. A button's id therefore rides in the command's name: `herdr-signals.press-<id>`.

## The shared keys

| Key | Written by | Shape |
| --- | --- | --- |
| `kit.addon.badges` | the add-on | `{ at: number, items: { [address]: Badge } }` |
| `kit.addon.rows` | the add-on | `{ at: number, items: Row[] }` (at most 20 kept) |
| `kit.addon.buttons` | the add-on | `{ at: number, items: Button[] }` (at most 4 kept) |
| `kit.addon.press` | herdr-signals and kit-rail | `{ id: string, at: number }` |

Every `at` is epoch ms (`Date.now()`).

```ts
type Badge = {
  text: string;                       // replaces the Claude's hint line
  short?: string;                     // 1 to 40 characters, such as "PROJ-12 In Progress": the Discord card
                                      // names the Claude "name (short)", and the deck key shows it on top
  url?: string;                       // http(s); a click on the hint line opens it
  tone?: "bright" | "dim";            // bright for work in flight; dim (the default) otherwise
  action?: { id: string; tip: string }; // a right-click on the hint line presses `id`; `tip` is its tooltip
};
type Row = { id: string; text: string; sub?: string; url?: string };   // work no Claude is on
type Button = { id: string; glyph: string; label: string; tip: string }; // a strip button
```

`address` is the Claude's terminal address, as in the model (`shared("herdr-kit").agents[].address`).

herdr-signals checks each value with `readAddon` every poll. A malformed entry is dropped whole, and the rest still show. Malformed means:

- the wrong type, or a missing or empty `text`, `id` or `glyph`;
- a `tone` other than `bright` or `dim`;
- a `url` that isn't `http(s)://`;
- an `action` without both `id` and `tip`;
- a `short` that is empty, not a string, or over 40 characters.

A url must start `http://` or `https://` and hold no whitespace or control characters. The Stream Deck server applies the same rule, and both are tested against `tests/support/addon-urls.json`.

A badge for an address with no Claude is ignored, and so is an address key `__proto__`. Rows and buttons with the same `id` keep the first. Past 20 good rows or 4 good buttons, the rest are dropped. Fields outside the shapes above are not copied.

## Freshness

Shared state is saved across restarts, and terminal addresses are reused, so a past session's badge could land on a different Claude. To stop that, herdr-signals records when it started. It treats a key as empty when its `at` is missing, isn't a number, or is older than that start. Each key is judged on its own `at`.

An add-on must therefore:

- publish empty values (`{ at: Date.now(), items: {} }` or `items: []`) at init;
- publish each key at least every 60 s while it has data, with a fresh `at`, even when nothing changed. That also covers a restart where the add-on published before herdr-signals started;
- publish empty values when it gives up, for example when a tool it needs is missing.

A reload of herdr-signals (a save of one of its files) resets its start stamp too, so everything published before it is ignored from then on. Republish promptly, well inside the 60 s: every 15 s is a good cadence.

## What the core draws

- **Badge:** the Discord away card names the Claude `name (short)` when the badge has a `short`. The Claude's hint line shows `badge.text`, in the foreground colour when `tone` is `"bright"` and dim otherwise. With a `url`, a click on the line opens it. With an `action`, a right-click presses `action.id`, and the tooltip reads `Right-click: <tip>`. The grid places a new tile next to a placed tile whose badge has the same `url`. The Stream Deck's badge key shows the focused Claude's badge and opens its `url` on a press. The key shows `short` on top and the text's first ` · ` part below it, or, without a `short`, the text's first two parts.
- **Rows:** under the rail's Claudes, under the heading `No Claude on these`: `text`, then `sub` dimmed. A click opens `url`. They are in the model as `rows`.
- **Buttons:** on the strip, after `◎ focus` and before the scene button. They show `<glyph> <label>`, or the glyph alone when the strip is short, with `tip` as the tooltip. A click presses `id`.

## Presses

A press sets `kit.addon.press = { id, at: Date.now() }`. It comes from three places:

- a strip button click;
- a right-click on a badge's hint line;
- the mod command `herdr-signals.press-<id>`. Bind it in Herdr's `keys.json`, for example `"cmd-shift-j": "herdr-signals.press-day"` for an add-on button with id `day`.

The add-on watches the key in `render` (every `setShared` re-renders every mod) and acts on a press whose `at` it hasn't handled yet. Shared state survives a restart, so an add-on should ignore a press from before it started. The ids are the add-on's own: the core only passes them along.

## What an add-on reads

The model, `shared("herdr-kit")`, gives each Claude in `agents[]`:

- `address` and `name`;
- `rawHint`: the names file's hint, before PR state or a badge replaced it;
- `pr`: `{ number, url, state, draft, review, checks }` or null, so a badge can fold PR state into its text;
- `session`: the Claude Code session id from the names file, or null;
- `badge`: what the core drew from this add-on last poll.

Compute badges from the model you read now. A saved agent list can name a terminal address that now belongs to a different Claude.

## One add-on per key

Each key holds one value, so two add-ons writing the same key overwrite each other. Run one add-on that owns all three keys, so there is one block and one writer. A second add-on would have to merge its entries into the existing value, or the contract would grow per-add-on keys.

## Overlays

An overlay is a folder outside the core that adds its own mods, Herdr settings, key bindings, config keys and picture or glyph overrides to an install, without forking. `install.sh` runs the overlay's script, and the overlay calls a few of the core's scripts directly. This section is the contract it relies on: a change to anything named here is a breaking change for overlays.

### The script

- **`HERDR_KIT_PRIVATE`** is the path to the overlay's script. Without it, install uses `private/install.sh` inside the clone. An overlay that holds the core as a submodule sets it to its own script and runs the core's `install.sh` with the user's arguments.
- **Modes.** Install runs the script with `bash`, given one argument:
  - `install`: after the core's links, config, layout and key bindings, and before the restart hint and the Claude hooks. A non-zero exit stops install: it prints `overlay install failed` to stderr and exits 1, without adding the hooks.
  - `--check`: after the core's own checks. A non-zero exit counts as drift, so `--check` exits 1.
  - `--uninstall`: after the core removes its hooks and key bindings, and before it removes the layout files. The exit code is ignored.
- **Hooks.** While the script exists, install behaves as `--hooks` unless `--no-hooks` is given, and it never asks. It also says nothing about a missing `claude/card-hook.mjs`: an overlay that wants the card hook adds it itself.
- **Environment.** The script inherits the core's environment: `HOME`, and `HERDR_APP_HOME` when it is set (Herdr's home, default `~/.config/herdr-app`). The user config is `~/.config/herdr-kit/config.json`.

### Overrides

A file under `herdr/` beside the script (`$(dirname "$HERDR_KIT_PRIVATE")/herdr/<path>`) can replace the core's picture or glyph layer at the same path: `backgrounds/*`, `backgrounds/thumbs/*` and `glyphs/*`. The overlay links it into Herdr's home itself, during `install`. The core's install then leaves that link alone, and `--check` reports it as `ok ... (private override)`. On `--uninstall` the core leaves its links in place, so the overlay links the core's own file back.

### The core's scripts an overlay calls

Paths are relative to the core's folder. Each one keeps `merge-config.js`'s contract: it touches only its own entries, backs up first, and leaves malformed JSON alone (exit 1).

- `node scripts/merge-config.js addkeys <keys.json> <bindings.json>`: merges a bindings table (`{ "global": { key: action }, "layout:<name>": { ... } }`) into Herdr's `keys.json`. A key the user bound differently is left alone and printed.
- `node scripts/merge-config.js rmkeys <keys.json> <bindings.json>`: removes exactly those bindings, where they still hold the table's action.
- `node scripts/merge-config.js hooks <settings.json> <command> <events> [-- <command> <events>]...`: adds Claude Code hook commands to `~/.claude/settings.json`. `<events>` is a comma list, each event optionally `:async` (`SessionStart,Stop`).
- `node scripts/merge-config.js unhooks <settings.json> <command> [-- <command>]...`: removes those commands from every event.
- `node scripts/merge-config.js hooks-check <settings.json> <command> <events> [-- ...]`: writes nothing, and exits 0 when `hooks` would change nothing, else 1.
- `node scripts/make-layout.js --list`: prints the generated layout's name (`scruffy`).
- `node scripts/make-layout.js <main.json> <layouts dir> <config.json>`: rebuilds that layout from Herdr's `main.json`, keeping its scene and panel sizes, with a block for each add-on listed in `addons` and present under `mods/`. Run it after linking add-on mods.

An overlay that imports or copies a core file (`claude/ctx-tap.mjs`, `claude/cards.js`, the mods' `look.js`, `herdr-signals/addons.js`) should guard the copy with a test, since those files aren't part of this contract.
