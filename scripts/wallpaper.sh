#!/usr/bin/env bash
# Change the picture behind Herdr's terminals. Herdr applies it live.
#   scripts/wallpaper.sh ~/Pictures/dunes.jpg   copy a picture in and use it
#   scripts/wallpaper.sh twin-suns.jpg          use one already in backgrounds/
#   scripts/wallpaper.sh dunes.jpg 0.45         also set terminal opacity (0..1)
#   scripts/wallpaper.sh off                    back to Herdr's plain look
#   scripts/wallpaper.sh --light day.jpg        the picture in light mode
#   scripts/wallpaper.sh --light off            light mode uses the dark one
# Bash 3.2 compatible (macOS default).
set -eu

REPO="$(cd "$(dirname "$0")/.." && pwd)"
APP_HOME="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
CFG="$HOME/.config/herdr-kit/config.json"
KEY=wallpaper
if [ "${1:-}" = "--light" ]; then
  KEY=wallpaper_light
  shift
fi
PICK="${1:-}"
OPACITY="${2:-}"

if [ -z "$PICK" ]; then
  sed -n '2,8s/^# \{0,1\}//p' "$0"
  exit 2
fi
if [ ! -f "$CFG" ] || [ ! -f "$APP_HOME/layouts/main.json" ]; then
  echo "run install.sh first (needs $CFG and Herdr's layouts/main.json)" >&2
  exit 1
fi

if [ "$PICK" = "off" ]; then
  REL=""
elif [ -f "$PICK" ]; then
  mkdir -p "$APP_HOME/backgrounds"
  NAME="$(basename "$PICK")"
  # Same file already linked there (the bundled one): use it as is.
  if [ ! "$PICK" -ef "$APP_HOME/backgrounds/$NAME" ]; then
    cp "$PICK" "$APP_HOME/backgrounds/$NAME"
  fi
  REL="backgrounds/$NAME"
elif [ -f "$APP_HOME/backgrounds/$PICK" ]; then
  REL="backgrounds/$PICK"
else
  echo "no such picture: $PICK" >&2
  exit 1
fi

node -e '
const fs = require("fs");
const [cfg, key, rel, opacity] = process.argv.slice(1);
const d = JSON.parse(fs.readFileSync(cfg, "utf8"));
d.look = { ...(d.look ?? {}), [key]: rel };
// "--light off": no light picture of its own, so light mode uses the dark one.
if (key === "wallpaper_light" && rel === "") delete d.look.wallpaper_light;
if (opacity !== "") {
  const n = Number(opacity);
  if (!(n >= 0 && n <= 1)) { console.error("opacity must be 0..1"); process.exit(1); }
  d.look.terminal_opacity = n;
}
fs.writeFileSync(cfg, JSON.stringify(d, null, 2) + "\n", { mode: 0o600 });
' "$CFG" "$KEY" "$REL" "$OPACITY"
chmod 600 "$CFG"

# The rebuild writes the focus view; a window on the kit layout in the grid
# asks for the grid again afterward (best-effort, as install.sh does).
KIT_LAYOUT="$(node "$REPO/scripts/make-layout.js" --list)"
view=""
if [ -z "${HERDR_KIT_NO_SWITCH:-}" ] && command -v herdr-app >/dev/null 2>&1; then
  shown="$(herdr-app status 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).layout??"")}catch{console.log("")}})' || true)"
  if [ "$shown" = "$KIT_LAYOUT" ]; then
    view="$(node "$REPO/scripts/make-layout.js" --view "$APP_HOME/layouts/$KIT_LAYOUT.json" || true)"
  fi
fi
node "$REPO/scripts/make-layout.js" "$APP_HOME/layouts/main.json" "$APP_HOME/layouts" "$CFG"
if [ "$view" = "grid" ]; then
  sleep 1
  herdr-app do herdr-signals.view-grid >/dev/null 2>&1 || true
fi
echo "$KEY: ${REL:-off}"
