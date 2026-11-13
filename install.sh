#!/usr/bin/env bash
# Link scruffyherdr's mods, themes and pictures into Herdr's home so the clone stays the record.
#   ./install.sh          link everything (backs up any regular file it replaces)
#   ./install.sh --check  report links that drifted (exit 1 on any)
#   ./install.sh --uninstall  remove the Claude hooks (name and card), our keys and the kit layout,
#                             and restore the status line install wrapped
#   --hooks / --no-hooks  add the Claude Code hooks without asking / skip them. With neither, install
#                         asks once on a terminal and skips without one. When private/install.sh
#                         exists and neither is given, install behaves as --hooks.
#                         With the hooks, install also wraps Claude Code's status line so ctx-tap
#                         gets fed (claude/statusline.mjs), unless something already feeds it.
# When an overlay's private/install.sh exists (its add-ons, settings, keys, config keys and the
# pictures and glyph layers in private/herdr/ that replace the kit's), install, --check and
# --uninstall run it last.
# Bash 3.2 compatible (macOS default).
set -eu

REPO="$(cd "$(dirname "$0")" && pwd)"
SRC="$REPO/herdr"
APP_HOME="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
KIT_HOME="$HOME/.config/herdr-kit"
# The generated layout, scruffy (herdr-signals/scenes.js KIT_LAYOUT); the scene and the view live inside it.
KIT_LAYOUTS="$(node "$REPO/scripts/make-layout.js" --list 2>/dev/null || true)"
# The layouts older installs generated: each scene's focus and grid pair, "kit" / "kit-grid",
# and the one layout under its old name, scruffyherdr.
LEGACY_LAYOUTS="$(node "$REPO/scripts/make-layout.js" --legacy 2>/dev/null || true)"
# The one layout's old name (scenes.js OLD_KIT_LAYOUT), one of LEGACY_LAYOUTS.
OLD_KIT_LAYOUT="$(node "$REPO/scripts/make-layout.js" --old 2>/dev/null || true)"
# --hooks / --no-hooks can sit anywhere; the rest stay positional.
HOOKS_FLAG=""
for arg in "$@"; do
  case "$arg" in
    --hooks) [ "$HOOKS_FLAG" = "no" ] || HOOKS_FLAG=yes; shift ;;
    --no-hooks) HOOKS_FLAG=no; shift ;;
    *) set -- "$@" "$arg"; shift ;;
  esac
done
MODE="${1:-install}"
# HERDR_KIT_PRIVATE lets the tests point at a missing add-on.
PRIVATE="${HERDR_KIT_PRIVATE:-$REPO/private/install.sh}"
HOOK_CMD="node \"$REPO/claude/name-hook.mjs\""
CARD_CMD="node \"$REPO/claude/card-hook.mjs\""
# On every tool call (PreToolUse, PermissionRequest) the name hook only patches
# its file and decides nothing, so it runs async: Claude doesn't wait ~150 ms of
# node startup. The events that read the transcript stay synchronous.
NAME_EVENTS=SessionStart,UserPromptSubmit,Stop,Notification,PermissionRequest:async,PreToolUse:async
CARD_EVENTS=SessionStart,Stop
CLAUDE_SETTINGS="$HOME/.claude/settings.json"
# The status line install replaced, kept for statusline.mjs and for --uninstall.
STATUS_PREV="$KIT_HOME/statusline-prev.json"

# "fresh" when ctx-tap (the only writer there) wrote a ctx file in the last 24 hours, else "stale".
ctx_fresh() {
  if [ -d "$KIT_HOME/ctx" ] && [ -n "$(find "$KIT_HOME/ctx" -type f -mtime -1 2>/dev/null | head -n 1)" ]; then
    echo fresh
  else
    echo stale
  fi
}

# "yes" when the user config has run_cards: true (the card hook rides on it).
run_cards_on() {
  command -v node >/dev/null 2>&1 || return 0
  node -e 'try{console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).run_cards===true?"yes":"no")}catch{console.log("no")}' "$KIT_HOME/config.json" 2>/dev/null || true
}

# The card hook ships only where Run cards do (not yet in the public cut).
CARD_HOOK_FILE="$REPO/claude/card-hook.mjs"

# "yes" when the card hook goes in: run_cards is on and the hook is in this checkout.
cards_hook_on() {
  [ -f "$CARD_HOOK_FILE" ] && [ "$(run_cards_on)" = "yes" ] && echo yes
  return 0
}

# Every linked path, relative to herdr/: top-level files, theme, wallpaper, glyph layer and layout
# preview files, mod dirs.
# Herdr's settings.json belongs to private/, so a herdr/settings.json is a leftover (Herdr writes
# one through a dead link) and is never linked; nor is a mods/ folder without a mod.json.
# The Herdr gallery's files (herdr/ is the gallery folder, tests/gallery.test.js): an installing
# agent copies them by hand, so install never links them. Linking keys.json would replace the
# user's keys, and layouts/scruffy.json is the one install builds.
gallery_file() {
  case "$1" in
    keys.json|RECIPE.md|preview.png|layouts/scruffy.json) return 0 ;;
  esac
  return 1
}

targets() {
  (cd "$SRC" && for f in *; do [ -f "$f" ] && [ "$f" != settings.json ] && ! gallery_file "$f" && echo "$f"; done)
  if [ -d "$SRC/themes" ]; then
    (cd "$SRC" && for f in themes/*; do [ -f "$f" ] && echo "$f"; done)
  fi
  if [ -d "$SRC/backgrounds" ]; then
    (cd "$SRC" && for f in backgrounds/*; do [ -f "$f" ] && echo "$f"; done)
  fi
  # The scene picker's thumbnails, one folder deeper.
  if [ -d "$SRC/backgrounds/thumbs" ]; then
    (cd "$SRC" && for f in backgrounds/thumbs/*; do [ -f "$f" ] && echo "$f"; done)
  fi
  if [ -d "$SRC/layouts" ]; then
    (cd "$SRC" && for f in layouts/*; do [ -f "$f" ] && ! gallery_file "$f" && echo "$f"; done)
  fi
  # The needs-you glyphs' layer files (look.js glyphLayers), per file so an overlay can replace one.
  if [ -d "$SRC/glyphs" ]; then
    (cd "$SRC" && for f in glyphs/*; do [ -f "$f" ] && echo "$f"; done)
  fi
  if [ -d "$SRC/mods" ]; then
    (cd "$SRC" && for d in mods/*; do [ -f "$d/mod.json" ] && echo "$d"; done)
  fi
  return 0
}

# A picture or glyph layer an overlay puts over the kit's: dst links to herdr/<rel> beside the overlay's
# install script (private/herdr/ here, or an overlay folder outside this checkout named by
# HERDR_KIT_PRIVATE), that file is there and so is the script that links it. Install leaves it
# and --check calls it ok.
OVERRIDES="$(dirname "$PRIVATE")/herdr"
overridden() {
  [ -L "$1" ] && [ -f "$PRIVATE" ] && [ -f "$OVERRIDES/$2" ] && [ "$(readlink "$1")" = "$OVERRIDES/$2" ]
}

# Herdr reloads assets saved under mods/ live, but new mod folders, themes and glyph art
# in glyphs/ only on a restart. glyphs_note: on a first install (FIRST, set before the
# links go in) name all three; otherwise, when the glyph links, or a file behind one,
# differ from what the last install saw (~/.config/herdr-kit/glyphs-seen), say so once.
# Either way remember them. It runs after the overlay script, so it sees its overrides too.
glyphs_note() {
  if [ ! -d "$APP_HOME/glyphs" ]; then
    [ -n "$FIRST" ] && echo "restart Herdr to load the new mods, themes and glyph art"
    return 0
  fi
  now="$(for f in "$APP_HOME"/glyphs/*; do
    [ -L "$f" ] || continue
    printf '%s %s %s\n' "$(basename "$f")" "$(readlink "$f")" "$({ cksum < "$f"; } 2>/dev/null || echo gone)"
  done)"
  seen=""
  [ -f "$KIT_HOME/glyphs-seen" ] && seen="$(cat "$KIT_HOME/glyphs-seen")"
  if [ "$now" != "$seen" ]; then
    mkdir -p "$KIT_HOME"
    printf '%s\n' "$now" > "$KIT_HOME/glyphs-seen"
    [ -z "$FIRST" ] && [ -n "$now" ] && echo "restart Herdr to load new glyph art"
  fi
  [ -n "$FIRST" ] && echo "restart Herdr to load the new mods, themes and glyph art"
  return 0
}

if [ "$MODE" = "--uninstall" ]; then
  node "$REPO/scripts/merge-config.js" unwrapstatus "$CLAUDE_SETTINGS" node "$REPO" "$STATUS_PREV" || true
  node "$REPO/scripts/merge-config.js" unhooks "$CLAUDE_SETTINGS" "$HOOK_CMD" -- "$CARD_CMD" || true
  [ -f "$APP_HOME/keys.json" ] && { node "$REPO/scripts/merge-config.js" unkeys "$APP_HOME/keys.json" || true; }
  [ -f "$PRIVATE" ] && { bash "$PRIVATE" --uninstall || true; }
  if [ -z "${HERDR_KIT_NO_SWITCH:-}" ] && command -v herdr-app >/dev/null 2>&1; then
    herdr-app do layout.switch --name main >/dev/null 2>&1 || true
  fi
  for name in $KIT_LAYOUTS $LEGACY_LAYOUTS; do rm -f "$APP_HOME/layouts/$name.json"; done
  rm -f "$KIT_HOME/layout-focus.json" "$KIT_HOME/sizes.json" "$KIT_HOME/glyphs-seen"
  echo "removed the Claude name and card hooks, the kit keys and the kit layout (links and config stay; delete them by hand if you want)"
  exit 0
fi

if [ "$MODE" = "--check" ]; then
  drift=0
  for rel in $(targets); do
    dst="$APP_HOME/$rel"
    if [ -L "$dst" ] && [ "$(readlink "$dst")" = "$SRC/$rel" ]; then
      echo "ok    $dst"
    elif overridden "$dst" "$rel"; then
      echo "ok    $dst (private override)"
    else
      echo "DRIFT $dst"
      drift=1
    fi
  done
  for name in $KIT_LAYOUTS; do
    lay="$APP_HOME/layouts/$name.json"
    if [ -f "$lay" ] && grep -q '"herdr-signals"' "$lay"; then
      echo "ok    $lay"
    else
      echo "DRIFT $lay (missing or without the signals strip: rerun ./install.sh)"
      drift=1
    fi
  done
  # Herdr can rewrite main.json after install (an update); the kit layouts are built from it.
  if [ -f "$APP_HOME/layouts/main.json" ] && command -v node >/dev/null 2>&1 \
    && ! node "$REPO/scripts/make-layout.js" --changed "$APP_HOME/layouts/main.json" "$KIT_HOME/layout-source.json"; then
    echo "DRIFT $APP_HOME/layouts (Herdr's main layout changed since install: rerun ./install.sh)"
    drift=1
  fi
  # Exactly what install would write: every event, and async where it belongs.
  # The card hook only when run_cards is on. A settings file with no kit hook at all
  # means the hooks were declined: not drift.
  if [ ! -f "$CLAUDE_SETTINGS" ] || ! grep -q "name-hook.mjs" "$CLAUDE_SETTINGS"; then
    echo "skip  $CLAUDE_SETTINGS (no kit hooks: ./install.sh --hooks adds them)"
  elif [ "$(cards_hook_on)" = "yes" ]; then
    if node "$REPO/scripts/merge-config.js" hooks-check "$CLAUDE_SETTINGS" "$HOOK_CMD" "$NAME_EVENTS" -- "$CARD_CMD" "$CARD_EVENTS" 2>/dev/null; then
      echo "ok    $CLAUDE_SETTINGS (name and card hooks)"
    else
      echo "DRIFT $CLAUDE_SETTINGS (name or card hook missing or out of date: rerun ./install.sh)"
      drift=1
    fi
  elif node "$REPO/scripts/merge-config.js" hooks-check "$CLAUDE_SETTINGS" "$HOOK_CMD" "$NAME_EVENTS" 2>/dev/null; then
    echo "ok    $CLAUDE_SETTINGS (name hook)"
  else
    echo "DRIFT $CLAUDE_SETTINGS (name hook missing or out of date: rerun ./install.sh)"
    drift=1
  fi
  # The status line wrap is reported, never drift: declining the hooks declines it too.
  if [ -f "$CLAUDE_SETTINGS" ] && command -v node >/dev/null 2>&1; then
    case "$(node "$REPO/scripts/merge-config.js" statusstate "$CLAUDE_SETTINGS" node "$REPO" "$(ctx_fresh)" "$STATUS_PREV" 2>/dev/null || true)" in
      wrapped) echo "ok    status line wrapped: it feeds ctx-tap, then runs your old one" ;;
      wired) echo "ok    status line already feeds ctx-tap" ;;
      moved) echo "DRIFT status line wrapper points at another checkout: rerun ./install.sh"; drift=1 ;;
      notcommand) echo "skip  status line isn't a command (the context meters need a command status line)" ;;
      *) echo "skip  status line not wrapped (no context meters: ./install.sh --hooks wraps it)" ;;
    esac
  else
    echo "skip  status line not wrapped (no context meters: ./install.sh --hooks wraps it)"
  fi
  if [ -f "$PRIVATE" ]; then
    bash "$PRIVATE" --check || drift=1
  fi
  exit $drift
fi

# Whether to add the Claude Code hooks (the name hook, and the card hook when run_cards is on):
# HOOKS=yes|no, decided once here. A flag wins (--no-hooks over everything); an
# overlay's private/install.sh means yes; else ask on a terminal and skip without one.
HOOKS=no
if [ "$HOOKS_FLAG" = "no" ]; then
  HOOKS=no
elif [ "$HOOKS_FLAG" = "yes" ] || [ -f "$PRIVATE" ]; then
  HOOKS=yes
elif [ -t 0 ]; then
  printf "The rail shows each Claude's name and question through a hook in ~/.claude/settings.json, and wraps your status line so the rail can show context use (your line still runs; both backed up first). Add them? [Y/n] "
  answer=""
  # EOF (Ctrl-D) with nothing typed counts as no.
  if ! read -r answer; then
    echo
    [ -n "$answer" ] || answer=n
  fi
  case "$answer" in
    ""|Y|y|yes|Yes|YES) HOOKS=yes ;;
  esac
fi

# A first install: Herdr has no link to the brain mod yet, so every mod and theme is new to it.
FIRST=""
[ -L "$APP_HOME/mods/herdr-signals" ] || FIRST=1
stamp="$(date +%Y%m%d%H%M%S)"
# A link into herdr/ whose file has gone (settings.json and kit-day moved to
# private/) would leave Herdr reading nothing there, and one to a path install
# no longer links (a leftover herdr/settings.json, a mods/ folder without a
# mod.json) would load a stale copy: remove both.
TARGETS="$(targets)"
for dst in "$APP_HOME"/* "$APP_HOME"/mods/* "$APP_HOME"/themes/* "$APP_HOME"/backgrounds/* "$APP_HOME"/backgrounds/thumbs/* "$APP_HOME"/glyphs/* "$APP_HOME"/layouts/*; do
  [ -L "$dst" ] || continue
  case "$(readlink "$dst")" in
    "$SRC"/*)
      rel="${dst#"$APP_HOME"/}"
      if [ ! -e "$dst" ]; then
        rm "$dst"
        echo "removed $dst (its file left herdr/)"
      elif ! printf '%s\n' "$TARGETS" | grep -qxF "$rel"; then
        rm "$dst"
        echo "removed $dst (a leftover install no longer links)"
      fi
      ;;
  esac
done
# Old layouts whose files install keeps below; merge-config keeps their key sections too.
kept=""
for rel in $TARGETS; do
  dst="$APP_HOME/$rel"
  mkdir -p "$(dirname "$dst")"
  if [ -L "$dst" ]; then
    [ "$(readlink "$dst")" = "$SRC/$rel" ] && continue
    overridden "$dst" "$rel" && continue
    rm "$dst"
  elif [ -e "$dst" ]; then
    # Back up outside Herdr's home: a renamed folder left under mods/ would
    # still load as a second copy of the mod.
    bak="$KIT_HOME/backup/$stamp/$rel"
    mkdir -p "$(dirname "$bak")"
    mv "$dst" "$bak"
    echo "backed up $dst -> $bak"
  fi
  ln -s "$SRC/$rel" "$dst"
  echo "linked $dst"
done

# Herdr hot-reloads a mod when one of its files is saved, but a git pull swaps
# the files in without that, so the old code kept running until a restart (on
# 2026-11-11, #56's day strip and #60's Run logs stayed off after a pull).
# Touching each mod's main.js changes only its mtime and reloads it in place.
if [ -d "$SRC/mods" ]; then
  for main in "$SRC"/mods/*/main.js; do
    [ -f "$main" ] && touch "$main"
  done
  echo "reloaded the kit mods"
fi

mkdir -p "$KIT_HOME"
if [ ! -f "$KIT_HOME/config.json" ]; then
  (umask 077 && cp "$REPO/config.example.json" "$KIT_HOME/config.json")
  echo "created $KIT_HOME/config.json (optional settings: README, Config)"
fi
chmod 600 "$KIT_HOME/config.json"

# The kit is tested against one Herdr; another may have moved the mod API on.
TESTED_HERDR="0.1.15"
if command -v herdr-app >/dev/null 2>&1; then
  found_herdr="$(herdr-app --version 2>/dev/null | grep -Eo '[0-9]+\.[0-9]+\.[0-9]+' | head -1)"
  if [ -n "$found_herdr" ] && [ "$found_herdr" != "$TESTED_HERDR" ]; then
    echo "warning: tested with Herdr $TESTED_HERDR, found $found_herdr"
  fi
fi

# The layout Herdr shows, from `herdr-app status` (read only; empty when Herdr
# is closed or herdr-app isn't on PATH).
status_layout() {
  command -v herdr-app >/dev/null 2>&1 || return 0
  herdr-app status 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).layout??"")}catch{console.log("")}})' || true
}

# Herdr's shipped main layout rejects structural edits, so the signals strip
# lives in a generated personal layout, scruffy (Settings -> Look), with
# the config's "look" applied. Regenerate on every install. Older installs made
# the one layout as scruffyherdr, before that one focus and one grid layout per
# scene, and before that "kit" / "kit-grid": a window on one lands on scruffy in
# the same scene, view and sizes, and their files go. The shown layout's files
# go only once the window is verified on scruffy. Herdr's own layouts/.state
# files are left alone, except scruffyherdr's, which goes with its file.
OPEN_HINT=""
if [ -f "$APP_HOME/layouts/main.json" ]; then
  if command -v node >/dev/null 2>&1; then
    # 1. The shown layout: Herdr's status (read only, even under HERDR_KIT_NO_SWITCH),
    # else shared.json's "layout", the one Herdr opens on next (Herdr's file, read only).
    shown="$(status_layout)"
    running=""
    [ -n "$shown" ] && running=1
    if [ -z "$shown" ] && [ -f "$APP_HOME/shared.json" ]; then
      shown="$(node -e 'try{const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(typeof j.layout==="string"?j.layout:"")}catch{console.log("")}' "$APP_HOME/shared.json")"
    fi
    # 2. The scene and view it showed. An old layout names both (scruffyherdr's
    # are in its file's tree); on scruffy itself the file keeps its scene and
    # the view comes from the file; on any other layout the file keeps its
    # scene, in focus.
    scene=""
    view=""
    legacy=""
    case " $LEGACY_LAYOUTS " in
      *" $shown "*)
        legacy=1
        pick_theme=""
        if [ "$shown" = "kit" ] || [ "$shown" = "kit-grid" ]; then
          [ -f "$APP_HOME/layouts/.state/kit.json" ] && pick_theme="$(node -e 'try{console.log(JSON.stringify(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).theme??""))}catch{console.log("")}' "$APP_HOME/layouts/.state/kit.json")"
        fi
        picked="$(node "$REPO/scripts/make-layout.js" --pick "$shown" "$pick_theme" "$APP_HOME/layouts/$shown.json" || true)"
        if [ -n "$picked" ]; then
          scene="${picked% *}"
          view="${picked#* }"
        fi
        ;;
      *)
        if [ -n "$shown" ] && [ "$shown" = "$KIT_LAYOUTS" ]; then
          view="$(node "$REPO/scripts/make-layout.js" --view "$APP_HOME/layouts/$KIT_LAYOUTS.json" || true)"
        fi
        ;;
    esac
    # 3. Build, in the scene the window was on when it names one.
    # The first migration also keeps the old layout's panel sizes (--from; its .state is only read).
    if [ -n "$scene" ]; then
      node "$REPO/scripts/make-layout.js" "$APP_HOME/layouts/main.json" "$APP_HOME/layouts" "$KIT_HOME/config.json" --scene "$scene" --from "$shown"
    else
      node "$REPO/scripts/make-layout.js" "$APP_HOME/layouts/main.json" "$APP_HOME/layouts" "$KIT_HOME/config.json"
    fi
    # 4. Land on scruffy, in the grid when the window was in one: from an
    # old kit layout, Herdr's main, or scruffy itself, never from another
    # layout of the user's. Best-effort: herdr-signals has to see the switch
    # before the grid request, hence the pause.
    landed=""
    if [ -n "$running" ] && [ -z "${HERDR_KIT_NO_SWITCH:-}" ]; then
      if [ -n "$legacy" ] || [ "$shown" = "main" ] || [ "$shown" = "$KIT_LAYOUTS" ]; then
        herdr-app do layout.switch --name "$KIT_LAYOUTS" >/dev/null 2>&1 || true
        if [ "$view" = "grid" ]; then
          sleep 1
          herdr-app do herdr-signals.view-grid >/dev/null 2>&1 || true
        fi
        [ "$(status_layout)" = "$KIT_LAYOUTS" ] && landed=1
      fi
    fi
    # Not on scruffy now, nor reopening on it: say how to get there (after the restart hint).
    if [ -z "$landed" ] && [ "$shown" != "$KIT_LAYOUTS" ]; then
      OPEN_HINT=1
    fi
    # 5. The old layouts' files go, except the shown scene's pair until the
    # window is verified on scruffy (and all of them when the shown layout
    # is unknown). The kit's old Settings preview links go either way.
    keep_a=""
    keep_b=""
    if [ -n "$legacy" ] && [ -z "$landed" ]; then
      if [ -n "$OLD_KIT_LAYOUT" ] && [ "$shown" = "$OLD_KIT_LAYOUT" ]; then
        keep_a="$shown"; keep_b="$shown"
      else
        case "$shown" in
          kit|kit-grid) keep_a=kit; keep_b=kit-grid ;;
          *-grid) keep_a="${shown%-grid}"; keep_b="$shown" ;;
          *) keep_a="$shown"; keep_b="$shown-grid" ;;
        esac
      fi
    fi
    left=""
    kept=""
    for name in $LEGACY_LAYOUTS; do
      f="$APP_HOME/layouts/$name.json"
      if [ -f "$f" ]; then
        if [ -z "$shown" ] || [ "$name" = "$keep_a" ] || [ "$name" = "$keep_b" ]; then
          left="$left $name.json"
          kept="$kept $name"
        else
          rm -f "$f"
          echo "removed $f"
          # scruffy is the same layout renamed: its old click record goes with it.
          if [ -n "$OLD_KIT_LAYOUT" ] && [ "$name" = "$OLD_KIT_LAYOUT" ]; then rm -f "$APP_HOME/layouts/.state/$name.json"; fi
        fi
      fi
      svg="$APP_HOME/layouts/$name.svg"
      if [ -L "$svg" ]; then
        case "$(readlink "$svg")" in
          */herdr/layouts/"$name".svg) rm -f "$svg" ;;
        esac
      fi
    done
    if [ -n "$left" ]; then
      echo "left$left: run ./install.sh again with Herdr open to finish the move"
    fi
  else
    echo "node not found: skipped the kit layout (the signals strip needs it)"
  fi
else
  echo "no layouts/main.json yet: launch Herdr once, then run install.sh again (the signals strip needs it)"
fi

# cmd-shift-g toggles the kit layout between focus and grid; the rest are the grid's spotlight and urgent keys.
# The old per-scene sections go where they still hold exactly the kit's bindings.
# Editing keys.json makes it yours to Herdr. A key you bound yourself is left alone (and printed).
if [ -f "$APP_HOME/keys.json" ]; then
  if HERDR_KIT_KEEP_LAYOUTS="$kept" node "$REPO/scripts/merge-config.js" keys "$APP_HOME/keys.json"; then
    echo "keys: cmd-shift-g switches focus/grid, cmd-alt-] and cmd-alt-[ spotlight, cmd-shift-a shows all spaces, cmd-shift-u goes to the most urgent Claude, cmd-shift-f toggles focus mode, cmd-shift-s opens the scene picker."
    echo "Note: Herdr now treats keys.json as edited, so it stops automatic shortcut upgrades for that file."
  else
    echo "skipped the grid key: $APP_HOME/keys.json isn't valid JSON"
  fi
fi

# An overlay's parts go on last, over the kit: private/install.sh links its mods and Herdr's
# settings, adds its config keys and rebuilds the layout with the add-on blocks.
if [ -f "$PRIVATE" ]; then
  if ! bash "$PRIVATE" install; then
    echo "overlay install failed" >&2
    exit 1
  fi
fi
glyphs_note
[ -n "$OPEN_HINT" ] && echo "to open the layout: cmd-shift-s, or Settings > Look > scruffy"

# Claude hooks, after private/ so its config keys (run_cards) are in. The name hook tells the rail each session's /rename name. The
# card hook injects the card rules at SessionStart and blocks a badly formatted
# final message once on Stop so Claude rewrites it. Events: NAME_EVENTS and
# CARD_EVENTS at the top.
if [ "$HOOKS" = "yes" ]; then
  mkdir -p "$(dirname "$CLAUDE_SETTINGS")"
  # A settings file the hooks step creates has nothing of the user's to back up.
  settings_new=""
  [ -f "$CLAUDE_SETTINGS" ] || settings_new=1
  # An overlay brings its own card hook, so the note is only for a checkout without one.
  if [ ! -f "$PRIVATE" ] && [ "$(run_cards_on)" = "yes" ] && [ ! -f "$CARD_HOOK_FILE" ]; then
    echo "note: run_cards is on, but this checkout has no claude/card-hook.mjs: skipped the card hook"
  fi
  if [ "$(cards_hook_on)" = "yes" ]; then
    if node "$REPO/scripts/merge-config.js" hooks "$CLAUDE_SETTINGS" "$HOOK_CMD" "$NAME_EVENTS" -- "$CARD_CMD" "$CARD_EVENTS"; then
      echo "Claude name and card hooks are in $CLAUDE_SETTINGS (restart Claude sessions to load them)"
    else
      echo "skipped the Claude hooks: fix $CLAUDE_SETTINGS and run install.sh again"
    fi
  else
    # run_cards off (or no card hook here): the name hook only, and a card hook the kit added earlier goes.
    if node "$REPO/scripts/merge-config.js" hooks "$CLAUDE_SETTINGS" "$HOOK_CMD" "$NAME_EVENTS" \
      && node "$REPO/scripts/merge-config.js" unhooks "$CLAUDE_SETTINGS" "$CARD_CMD"; then
      echo "Claude name hook is in $CLAUDE_SETTINGS (restart Claude sessions to load it)"
    else
      echo "skipped the Claude hooks: fix $CLAUDE_SETTINGS and run install.sh again"
    fi
  fi
  # Claude Code gives context use only to the status line command, so the rail's
  # context meters need the status line to feed ctx-tap. Wrap it (statusline.mjs runs
  # ctx-tap's write, then the old line unchanged), unless something already feeds
  # it: a line that names ctx-tap or a statusline.mjs, or a ctx file written in the
  # last day. A status line that is not a command one is left alone too.
  if HERDR_KIT_NO_BACKUP="$settings_new" node "$REPO/scripts/merge-config.js" wrapstatus "$CLAUDE_SETTINGS" node "$REPO" "$STATUS_PREV" "$(ctx_fresh)"; then
    :
  else
    echo "skipped the status line: fix $CLAUDE_SETTINGS and run install.sh again"
  fi
else
  echo "hooks skipped: rerun ./install.sh --hooks to add them"
fi
