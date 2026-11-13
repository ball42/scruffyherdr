#!/usr/bin/env bash
# Tests for install.sh. Runs in throwaway HOME / HERDR_APP_HOME dirs.
set -u
REPO="$(cd "$(dirname "$0")/.." && pwd)"
FAILS=0
pass() { echo "ok   $1"; }
fail() { echo "FAIL $1"; FAILS=$((FAILS + 1)); }

fresh() {
  export HERDR_KIT_NO_SWITCH=1
  export HOME="$(mktemp -d)"
  export HERDR_APP_HOME="$(mktemp -d)"
  # Herdr writes its main layout on first launch; most tests assume it ran.
  mkdir -p "$HERDR_APP_HOME/layouts"
  echo '{"id":"root","type":"column","children":[{"id":"work-body","type":"row","children":[{"id":"main","type":"block","content":{"tab":"active"}}]},{"id":"status","type":"block","content":{"mod":"workspace-status"}}]}' > "$HERDR_APP_HOME/layouts/main.json"
}

# prints a JSON value (or a string) at a dotted path in a JSON file
jget() {
  node -e 'const s = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
const v = process.argv[2].split(".").reduce((o, k) => (o == null ? undefined : o[k]), s);
console.log(v === undefined ? "" : typeof v === "string" ? v : JSON.stringify(v));' "$1" "$2"
}
# links the theme into the app home, and private/'s settings when private/ is there
# (the public cut has no private/ and no card hook: those tests skip there)
HAS_PRIVATE=""
[ -f "$REPO/private/install.sh" ] && HAS_PRIVATE=1
HAS_CARD_HOOK=""
[ -f "$REPO/claude/card-hook.mjs" ] && HAS_CARD_HOOK=1
fresh
"$REPO/install.sh" >/dev/null 2>&1
for f in herdr/themes/github-dark-colorblind.json ${HAS_PRIVATE:+private/settings.json}; do
  rel="${f#*/}"
  if [ -L "$HERDR_APP_HOME/$rel" ] && [ "$(readlink "$HERDR_APP_HOME/$rel")" = "$REPO/$f" ]; then
    pass "links $rel"
  else
    fail "links $rel"
  fi
done

# links each mod directory, the kit's and private/'s
# (a leftover folder without a mod.json isn't linked: see "leftovers" below)
for d in "$REPO"/herdr/mods/*/ "$REPO"/private/mods/*/; do
  [ -f "$d/mod.json" ] || continue
  name="$(basename "$d")"
  if [ -L "$HERDR_APP_HOME/mods/$name" ] && [ "$(readlink "$HERDR_APP_HOME/mods/$name")" = "${d%/}" ]; then pass "links mod $name"; else fail "links mod $name"; fi
done

# creates private config from the example
CFG="$HOME/.config/herdr-kit/config.json"
if [ -f "$CFG" ] && [ "$(stat -f %Lp "$CFG")" = "600" ]; then
  pass "config created with mode 600"
else
  fail "config created with mode 600"
fi

# idempotent: second run makes no backups and keeps links
"$REPO/install.sh" >/dev/null 2>&1
if ls -d "$HOME"/.config/herdr-kit/backup/* >/dev/null 2>&1; then fail "idempotent rerun"; else pass "idempotent rerun"; fi

# does not overwrite an existing config
echo '{"discord_webhook":"keep-me"}' > "$CFG"
"$REPO/install.sh" >/dev/null 2>&1
if grep -q keep-me "$CFG"; then pass "keeps existing config"; else fail "keeps existing config"; fi

# --check passes on a clean install
if "$REPO/install.sh" --check >/dev/null 2>&1; then pass "check clean"; else fail "check clean"; fi

# the gallery's files (herdr/keys.json, RECIPE.md, preview.png, layouts/scruffy.json) are never linked
if [ ! -L "$HERDR_APP_HOME/keys.json" ] && [ ! -e "$HERDR_APP_HOME/RECIPE.md" ] && [ ! -e "$HERDR_APP_HOME/preview.png" ] \
  && [ ! -L "$HERDR_APP_HOME/layouts/scruffy.json" ] && ! "$REPO/install.sh" --check 2>&1 | grep -qE "RECIPE|preview.png"; then
  pass "the gallery files stay unlinked, and check doesn't ask for them"
else
  fail "the gallery files stay unlinked, and check doesn't ask for them"
fi

# --check flags a link replaced by a regular file (private/'s settings.json, else a theme)
LINKED=themes/github-dark-colorblind.json
[ -n "$HAS_PRIVATE" ] && LINKED=settings.json
rm "$HERDR_APP_HOME/$LINKED"
echo '{}' > "$HERDR_APP_HOME/$LINKED"
OUT="$("$REPO/install.sh" --check 2>&1)"; RC=$?
if [ $RC -ne 0 ] && echo "$OUT" | grep -q "DRIFT .*$LINKED"; then
  pass "check reports drift"
else
  fail "check reports drift"
fi

# backs up a pre-existing regular file
fresh
mkdir -p "$(dirname "$HERDR_APP_HOME/$LINKED")"
echo "{}" > "$HERDR_APP_HOME/$LINKED"
"$REPO/install.sh" >/dev/null 2>&1
if ls "$HOME/.config/herdr-kit/backup/"*/"$LINKED" >/dev/null 2>&1 && [ -L "$HERDR_APP_HOME/$LINKED" ]; then
  pass "backs up existing file"
else
  fail "backs up existing file"
fi

# generates the one kit layout from Herdr's main layout when present, and drops the old kit ones
fresh
mkdir -p "$HERDR_APP_HOME/layouts"
echo '{"id":"root","type":"column","children":[{"id":"status","type":"block","content":{"mod":"workspace-status"}}]}' > "$HERDR_APP_HOME/layouts/main.json"
echo '{}' > "$HERDR_APP_HOME/layouts/kit.json"
echo '{"layout":"main"}' > "$HERDR_APP_HOME/shared.json"   # Herdr closed on main
"$REPO/install.sh" >/dev/null 2>&1
if grep -q '"herdr-signals"' "$HERDR_APP_HOME/layouts/scruffy.json" 2>/dev/null \
  && grep -q '"tatooine-night"' "$HERDR_APP_HOME/layouts/scruffy.json" \
  && [ ! -e "$HERDR_APP_HOME/layouts/endor.json" ] && [ ! -e "$HERDR_APP_HOME/layouts/tatooine-grid.json" ] \
  && [ -f "$HOME/.config/herdr-kit/layout-focus.json" ]; then
  pass "generates the scruffy layout and layout-focus.json"
else
  fail "generates the scruffy layout and layout-focus.json"
fi
if [ -e "$HERDR_APP_HOME/layouts/kit.json" ]; then fail "removes the old kit layout"; else pass "removes the old kit layout"; fi

# a rebuild keeps the layout's scene and its panel sizes
fresh
"$REPO/install.sh" >/dev/null 2>&1
L="$HERDR_APP_HOME/layouts/scruffy.json"
node -e 'const f=process.argv[1],t=JSON.parse(require("fs").readFileSync(f,"utf8"));t.theme={light:"hoth-day",dark:"hoth-night"};
const walk=(n)=>{if(n.id==="rail")n.size={px:300};(n.children||[]).forEach(walk)};walk(t);require("fs").writeFileSync(f,JSON.stringify(t))' "$L"
"$REPO/install.sh" >/dev/null 2>&1
if grep -q '"hoth-night"' "$L" && node -e 'const t=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));
const find=(n)=>n.id==="rail"?n:(n.children||[]).map(find).find(Boolean);process.exit(find(t).size.px===300?0:1)' "$L"; then
  pass "reinstall keeps the scene and the rail size"
else
  fail "reinstall keeps the scene and the rail size"
fi
rm -f "$L"
if "$REPO/install.sh" --check 2>&1 | grep -q "DRIFT .*layouts/scruffy.json"; then
  pass "check reports a missing scruffy layout"
else
  fail "check reports a missing scruffy layout"
fi

# A fake herdr-app: `status` reports the layout in $FAKEBIN/shown (exit 2 when
# $FAKEBIN/down exists, as with Herdr closed); `do` logs to $DOLOG, and
# `do layout.switch --name X` lands unless $FAKEBIN/stuck exists.
FAKEBIN="$(mktemp -d)"
DOLOG="$FAKEBIN/do.log"
cat > "$FAKEBIN/herdr-app" <<FAKE
#!/bin/sh
if [ "\$1" = "--version" ]; then
  [ -f "$FAKEBIN/version" ] && echo "herdr-app \$(cat "$FAKEBIN/version")"; exit 0
fi
if [ "\$1" = "status" ]; then
  [ -f "$FAKEBIN/down" ] && exit 2
  printf '{"layout":"%s"}\n' "\$(cat "$FAKEBIN/shown")"; exit 0
fi
if [ "\$1" = "do" ]; then
  shift; echo "\$*" >> "$DOLOG"
  if [ "\$1" = "layout.switch" ] && [ ! -f "$FAKEBIN/stuck" ]; then echo "\$3" > "$FAKEBIN/shown"; fi
  exit 0
fi
exit 0
FAKE
chmod +x "$FAKEBIN/herdr-app"
# fake <shown layout>: a fresh home with Herdr "running" on that layout, switching allowed
fake() {
  fresh
  unset HERDR_KIT_NO_SWITCH
  rm -f "$FAKEBIN/down" "$FAKEBIN/stuck"
  echo "$1" > "$FAKEBIN/shown"
  : > "$DOLOG"
}
run_fake() { PATH="$FAKEBIN:$PATH" "$REPO/install.sh" 2>&1; }
# rail <layout.json>: the rail's px
rail() {
  node -e 'const t=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));
const find=(n)=>n.id==="rail"?n:(n.children||[]).map(find).find(Boolean);console.log(find(t)?.size?.px ?? "")' "$1"
}
LD_OLD='{"theme":{"light":"naboo-day","dark":"naboo-night"}}'

# moves an install off the 20 scene layouts: their JSONs and preview links go, Herdr's .state stays
fake main
export HERDR_KIT_NO_SWITCH=1
LD="$HERDR_APP_HOME/layouts"
mkdir -p "$LD/.state"
echo "$LD_OLD" > "$LD/naboo.json"
echo "$LD_OLD" > "$LD/naboo-grid.json"
echo '{"nodes":{"rail":{"size":{"px":321}}}}' > "$LD/.state/naboo.json"
echo '{"theme":{"light":"x","dark":"y"}}' > "$LD/.state/naboo-grid.json"
ln -s "$REPO/herdr/layouts/naboo.svg" "$LD/naboo.svg"
ln -s "$REPO/herdr/layouts/naboo-grid.svg" "$LD/naboo-grid.svg"
ln -s /elsewhere/endor.svg "$LD/endor.svg"
echo '<svg/>' > "$LD/my-own.svg"
S1="$(cat "$LD/.state/naboo.json")"; S2="$(cat "$LD/.state/naboo-grid.json")"
run_fake >/dev/null
if [ ! -e "$LD/naboo.json" ] && [ ! -e "$LD/naboo-grid.json" ] && [ -f "$LD/scruffy.json" ]; then
  pass "migration removes the old scene layouts not on screen"
else
  fail "migration removes the old scene layouts not on screen"
fi
if [ "$(cat "$LD/.state/naboo.json")" = "$S1" ] && [ "$(cat "$LD/.state/naboo-grid.json")" = "$S2" ] \
  && [ ! -e "$LD/.state/scruffy.json" ]; then
  pass "migration leaves .state alone"
else
  fail "migration leaves .state alone"
fi
if [ ! -L "$LD/naboo.svg" ] && [ ! -L "$LD/naboo-grid.svg" ] && [ -f "$LD/my-own.svg" ] && [ -L "$LD/endor.svg" ] && [ -L "$LD/scruffy.svg" ]; then
  pass "migration removes only herdr-kit's per-scene preview links"
else
  fail "migration removes only herdr-kit's per-scene preview links"
fi
if [ ! -s "$DOLOG" ]; then pass "HERDR_KIT_NO_SWITCH sends no commands"; else fail "HERDR_KIT_NO_SWITCH sends no commands"; fi

# with Herdr running on an old -grid layout, install lands on scruffy in that scene, in the grid
fake naboo-grid
echo "$LD_OLD" > "$HERDR_APP_HOME/layouts/naboo-grid.json"
echo "$LD_OLD" > "$HERDR_APP_HOME/layouts/naboo.json"
run_fake >/dev/null
if grep -q '"naboo-night"' "$HERDR_APP_HOME/layouts/scruffy.json" \
  && grep -q "^layout.switch --name scruffy$" "$DOLOG" && grep -q "^herdr-signals.view-grid$" "$DOLOG" \
  && [ ! -e "$HERDR_APP_HOME/layouts/naboo-grid.json" ] && [ ! -e "$HERDR_APP_HOME/layouts/naboo.json" ]; then
  pass "lands on the old layout's scene and view, then removes its files"
else
  fail "lands on the old layout's scene and view, then removes its files"
fi
# on a focus layout: the scene, no grid request
echo kamino > "$FAKEBIN/shown"; : > "$DOLOG"
run_fake >/dev/null
if grep -q '"kamino-night"' "$HERDR_APP_HOME/layouts/scruffy.json" && grep -q "^layout.switch --name scruffy$" "$DOLOG" \
  && ! grep -q "view-grid" "$DOLOG"; then
  pass "lands on an old focus layout's scene in focus"
else
  fail "lands on an old focus layout's scene in focus"
fi
# on Herdr's own main layout: the scene the file already has
echo main > "$FAKEBIN/shown"; : > "$DOLOG"
run_fake >/dev/null
if grep -q '"kamino-night"' "$HERDR_APP_HOME/layouts/scruffy.json" && ! grep -q "view-grid" "$DOLOG"; then
  pass "from main, keeps the layout's own scene"
else
  fail "from main, keeps the layout's own scene"
fi
# on an unrelated layout of the user's: no switch
echo win98 > "$FAKEBIN/shown"; : > "$DOLOG"
run_fake >/dev/null
if ! grep -q "layout.switch" "$DOLOG"; then pass "leaves a window on another layout there"; else fail "leaves a window on another layout there"; fi

# when the window isn't left on scruffy, install says how to open it; when it is, it doesn't
OPENHINT="to open the layout: cmd-shift-s, or Settings > Look > scruffy"
if run_fake | grep -qxF "$OPENHINT"; then pass "open hint: a window left on another layout is told how to open scruffy"; else fail "open hint: a window left on another layout is told how to open scruffy"; fi
echo main > "$FAKEBIN/shown"
if ! run_fake | grep -qF "to open the layout"; then pass "open hint: none once the window lands on scruffy"; else fail "open hint: none once the window lands on scruffy"; fi
echo main > "$FAKEBIN/shown"; touch "$FAKEBIN/stuck"
if run_fake | grep -qxF "$OPENHINT"; then pass "open hint: a switch that didn't land is told how to open scruffy"; else fail "open hint: a switch that didn't land is told how to open scruffy"; fi
rm -f "$FAKEBIN/stuck"
fake main; touch "$FAKEBIN/down"   # Herdr closed
if run_fake | grep -qxF "$OPENHINT"; then pass "open hint: Herdr closed, install says how to open scruffy"; else fail "open hint: Herdr closed, install says how to open scruffy"; fi
echo '{"layout":"scruffy"}' > "$HERDR_APP_HOME/shared.json"
if ! run_fake | grep -qF "to open the layout"; then pass "open hint: none when Herdr reopens on scruffy"; else fail "open hint: none when Herdr reopens on scruffy"; fi
rm -f "$FAKEBIN/down"

# HERDR_KIT_NO_SWITCH: the shown layout still sets the scene and sizes, and its files and key sections stay
fake small-moon-grid
export HERDR_KIT_NO_SWITCH=1
LD="$HERDR_APP_HOME/layouts"
mkdir -p "$LD/.state"
node -e 'const fs=require("fs");const [src,dst]=process.argv.slice(1);fs.writeFileSync(dst,fs.readFileSync(src,"utf8"))' "$LD/main.json" "$LD/small-moon-grid.json"
"$REPO/install.sh" >/dev/null 2>&1   # a prior build, to copy as the old focus file
node -e 'const fs=require("fs");const [src,dst]=process.argv.slice(1);const t=JSON.parse(fs.readFileSync(src,"utf8"));
const walk=(n)=>{if(n.id==="rail")n.size={px:300};(n.children||[]).forEach(walk)};walk(t);t.theme={light:"small-moon-day",dark:"small-moon-night"};fs.writeFileSync(dst,JSON.stringify(t))' "$LD/scruffy.json" "$LD/small-moon.json"
rm -f "$LD/scruffy.json"
K="$HERDR_APP_HOME/keys.json"
node -e 'const k={};for(const s of ["small-moon","naboo"]){k[`layout:${s}`]={"cmd-shift-g":{command:"layout.switch",args:{name:`${s}-grid`}}};
k[`layout:${s}-grid`]={"cmd-shift-g":{command:"layout.switch",args:{name:s}},"cmd-alt-]":"herdr-signals.spot-next","cmd-alt-[":"herdr-signals.spot-prev","cmd-shift-a":"herdr-signals.grid-all"}}
require("fs").writeFileSync(process.argv[1],JSON.stringify(k))' "$K"
echo "$LD_OLD" > "$LD/naboo.json"
OUT="$(run_fake)"
if grep -q '"small-moon-night"' "$LD/scruffy.json" && [ "$(rail "$LD/scruffy.json")" = "300" ] \
  && [ -f "$LD/small-moon.json" ] && [ -f "$LD/small-moon-grid.json" ] && [ ! -e "$LD/naboo.json" ] \
  && echo "$OUT" | grep -q "run ./install.sh again with Herdr open" && [ ! -s "$DOLOG" ]; then
  pass "NO_SWITCH: builds the shown scene with its focus sizes, keeps its files"
else
  fail "NO_SWITCH: builds the shown scene with its focus sizes, keeps its files"
fi
if [ "$(jget "$K" "layout:small-moon.cmd-shift-g.args.name")" = "small-moon-grid" ] \
  && [ "$(jget "$K" "layout:small-moon-grid.cmd-shift-g.args.name")" = "small-moon" ] \
  && [ -z "$(jget "$K" "layout:naboo")" ] && [ -z "$(jget "$K" "layout:naboo-grid")" ] \
  && [ "$(jget "$K" "layout:scruffy.cmd-shift-g")" = "herdr-signals.view-toggle" ]; then
  pass "NO_SWITCH: keeps the kept layouts' key sections, drops the rest"
else
  fail "NO_SWITCH: keeps the kept layouts' key sections, drops the rest"
fi
# a later install that lands the switch removes the files and the sections
unset HERDR_KIT_NO_SWITCH
run_fake >/dev/null
if [ ! -e "$LD/small-moon.json" ] && [ ! -e "$LD/small-moon-grid.json" ] && [ -z "$(jget "$K" "layout:small-moon")" ] \
  && [ -z "$(jget "$K" "layout:small-moon-grid")" ]; then
  pass "a later install finishes the move, keys included"
else
  fail "a later install finishes the move, keys included"
fi

# Herdr closed: shared.json names the layout it will open on
fake x
touch "$FAKEBIN/down"
LD="$HERDR_APP_HOME/layouts"
echo '{"layout":"small-moon","sidebar.width":200}' > "$HERDR_APP_HOME/shared.json"
echo "$LD_OLD" > "$LD/small-moon.json"
echo "$LD_OLD" > "$LD/naboo.json"
OUT="$(run_fake)"
if grep -q '"small-moon-night"' "$LD/scruffy.json" && [ -f "$LD/small-moon.json" ] && [ ! -e "$LD/naboo.json" ] \
  && echo "$OUT" | grep -q "run ./install.sh again with Herdr open"; then
  pass "Herdr closed: shared.json's layout sets the scene, its file stays"
else
  fail "Herdr closed: shared.json's layout sets the scene, its file stays"
fi
# shown layout unknown by both routes: every old layout stays
rm -f "$HERDR_APP_HOME/shared.json" "$LD/scruffy.json"
echo "$LD_OLD" > "$LD/naboo.json"
OUT="$(run_fake)"
if [ -f "$LD/small-moon.json" ] && [ -f "$LD/naboo.json" ] && grep -q '"tatooine-night"' "$LD/scruffy.json" \
  && echo "$OUT" | grep -q "run ./install.sh again with Herdr open"; then
  pass "shown layout unknown: keeps every old layout"
else
  fail "shown layout unknown: keeps every old layout"
fi

# a switch that didn't land keeps the shown scene's files
fake endor
touch "$FAKEBIN/stuck"
LD="$HERDR_APP_HOME/layouts"
echo "$LD_OLD" > "$LD/endor.json"
echo "$LD_OLD" > "$LD/endor-grid.json"
echo "$LD_OLD" > "$LD/naboo.json"
OUT="$(run_fake)"
if [ -f "$LD/endor.json" ] && [ -f "$LD/endor-grid.json" ] && [ ! -e "$LD/naboo.json" ] && grep -q "^layout.switch" "$DOLOG" \
  && echo "$OUT" | grep -q "left .*endor.json"; then
  pass "a failed switch keeps the shown layout's files"
else
  fail "a failed switch keeps the shown layout's files"
fi

# the first migration keeps the old layout's panel sizes from its .state, read only
fake scarif
mkdir -p "$HERDR_APP_HOME/layouts/.state"
echo '{"nodes":{"rail":{"size":{"px":300}}}}' > "$HERDR_APP_HOME/layouts/.state/scarif.json"
ST="$(cat "$HERDR_APP_HOME/layouts/.state/scarif.json")"
run_fake >/dev/null
if grep -q '"scarif-night"' "$HERDR_APP_HOME/layouts/scruffy.json" && [ "$(rail "$HERDR_APP_HOME/layouts/scruffy.json")" = "300" ] \
  && [ "$(cat "$HERDR_APP_HOME/layouts/.state/scarif.json")" = "$ST" ]; then
  pass "first migration keeps the old layout's sizes"
else
  fail "first migration keeps the old layout's sizes"
fi

# wallpaper.sh keeps the grid view: on scruffy in grid, it asks for the grid again
echo scruffy > "$FAKEBIN/shown"; : > "$DOLOG"
L="$HERDR_APP_HOME/layouts/scruffy.json"
node -e 'const f=process.argv[1],t=JSON.parse(require("fs").readFileSync(f,"utf8"));
const walk=(n)=>{(n.children||[]).forEach((c,i)=>{if(c.id==="main")n.children[i]={id:"kit-grid",type:"column",children:[]};else walk(c)})};walk(t);require("fs").writeFileSync(f,JSON.stringify(t))' "$L"
PATH="$FAKEBIN:$PATH" "$REPO/scripts/wallpaper.sh" off >/dev/null 2>&1
if grep -q "^herdr-signals.view-grid$" "$DOLOG" && grep -q '"scarif-night"' "$L"; then
  pass "wallpaper.sh keeps the grid view"
else
  fail "wallpaper.sh keeps the grid view"
fi
: > "$DOLOG"
PATH="$FAKEBIN:$PATH" "$REPO/scripts/wallpaper.sh" off >/dev/null 2>&1
if grep -q "view-grid" "$DOLOG"; then fail "wallpaper.sh in focus asks for nothing"; else pass "wallpaper.sh in focus asks for nothing"; fi

# the layout's old name: a window on scruffyherdr (grid, Kamino) lands on scruffy in the same scene, view and sizes
fake scruffyherdr
export HERDR_KIT_NO_SWITCH=1
LD="$HERDR_APP_HOME/layouts"
mkdir -p "$LD/.state"
"$REPO/install.sh" >/dev/null 2>&1   # a build to copy as the old file
unset HERDR_KIT_NO_SWITCH
node -e 'const fs=require("fs");const [src,dst]=process.argv.slice(1);const t=JSON.parse(fs.readFileSync(src,"utf8"));
const walk=(n)=>{(n.children||[]).forEach((c,i)=>{if(c.id==="main")n.children[i]={id:"kit-grid",type:"column",children:[]};else walk(c)});if(n.id==="rail")n.size={px:410}};walk(t);
t.theme={light:"kamino-day",dark:"kamino-night"};fs.writeFileSync(dst,JSON.stringify(t))' "$LD/scruffy.json" "$LD/scruffyherdr.json"
rm -f "$LD/scruffy.json"
# herdr-signals keeps a grid window's focus sizes in sizes.json
echo '{"focus":{"rail":{"size":{"px":300}}},"grid":{"rail":{"size":{"px":410}}}}' > "$HOME/.config/herdr-kit/sizes.json"
echo '{"nodes":{"sidebar":{"size":{"px":230}}}}' > "$LD/.state/scruffyherdr.json"
ln -s "$REPO/herdr/layouts/scruffyherdr.svg" "$LD/scruffyherdr.svg"
K="$HERDR_APP_HOME/keys.json"
echo '{"layout:scruffyherdr":{"cmd-shift-g":"herdr-signals.view-toggle","cmd-shift-s":"herdr-signals.scenes","cmd-alt-]":"herdr-signals.spot-next","cmd-alt-[":"herdr-signals.spot-prev","cmd-shift-a":"herdr-signals.grid-all","cmd-k":"tab.new"}}' > "$K"
OUT="$(run_fake)"
if grep -q '"kamino-night"' "$LD/scruffy.json" && [ "$(rail "$LD/scruffy.json")" = "300" ] \
  && [ "$(sed -n 1p "$DOLOG")" = "layout.switch --name scruffy" ] && [ "$(sed -n 2p "$DOLOG")" = "herdr-signals.view-grid" ]; then
  pass "from scruffyherdr: lands on scruffy in its scene, grid and sizes"
else
  fail "from scruffyherdr: lands on scruffy in its scene, grid and sizes"
fi
if [ ! -e "$LD/scruffyherdr.json" ] && [ ! -e "$LD/.state/scruffyherdr.json" ] && [ ! -L "$LD/scruffyherdr.svg" ] && [ -L "$LD/scruffy.svg" ]; then
  pass "from scruffyherdr: the old file, its .state and preview link go once the switch lands"
else
  fail "from scruffyherdr: the old file, its .state and preview link go once the switch lands"
fi
if [ -z "$(jget "$K" "layout:scruffyherdr")" ] && [ "$(jget "$K" "layout:scruffy.cmd-shift-g")" = "herdr-signals.view-toggle" ] \
  && [ "$(jget "$K" "layout:scruffy.cmd-k")" = "tab.new" ] && echo "$OUT" | grep -q "moved layout:scruffyherdr cmd-k"; then
  pass "from scruffyherdr: the old key section goes, a user's own key moves to layout:scruffy"
else
  fail "from scruffyherdr: the old key section goes, a user's own key moves to layout:scruffy"
fi
# a switch that doesn't land keeps the old file, its .state and its keys
fake scruffyherdr
touch "$FAKEBIN/stuck"
LD="$HERDR_APP_HOME/layouts"
mkdir -p "$LD/.state"
echo '{"id":"root","theme":{"light":"endor-day","dark":"endor-night"},"children":[]}' > "$LD/scruffyherdr.json"
echo '{"nodes":{}}' > "$LD/.state/scruffyherdr.json"
echo '{"layout:scruffyherdr":{"cmd-shift-g":"herdr-signals.view-toggle","cmd-alt-]":"space.next"}}' > "$HERDR_APP_HOME/keys.json"
OUT="$(run_fake)"
if [ -f "$LD/scruffyherdr.json" ] && [ -f "$LD/.state/scruffyherdr.json" ] && grep -q '"endor-night"' "$LD/scruffy.json" \
  && [ "$(jget "$HERDR_APP_HOME/keys.json" "layout:scruffyherdr.cmd-shift-g")" = "herdr-signals.view-toggle" ] \
  && echo "$OUT" | grep -q "left scruffyherdr.json"; then
  pass "from scruffyherdr: a failed switch keeps the old file, its .state and keys"
else
  fail "from scruffyherdr: a failed switch keeps the old file, its .state and keys"
fi
rm -f "$FAKEBIN/stuck"
# the later install that lands: the user's rebinding replaces the kit default the kept run added
OUT="$(run_fake)"
if [ ! -e "$LD/scruffyherdr.json" ] && [ -z "$(jget "$HERDR_APP_HOME/keys.json" "layout:scruffyherdr")" ] \
  && [ "$(jget "$HERDR_APP_HOME/keys.json" "layout:scruffy.cmd-alt-]")" = "space.next" ] \
  && [ "$(jget "$HERDR_APP_HOME/keys.json" "layout:scruffy.cmd-alt-[")" = "herdr-signals.spot-prev" ]; then
  pass "from scruffyherdr: kept, then landed, a rebound kit key moves over the kit default"
else
  fail "from scruffyherdr: kept, then landed, a rebound kit key moves over the kit default"
fi
export HERDR_KIT_NO_SWITCH=1

# backs up a real mod folder outside mods/, so Herdr can't load it twice
fresh
mkdir -p "$HERDR_APP_HOME/mods/herdr-signals"
echo '// old' > "$HERDR_APP_HOME/mods/herdr-signals/main.js"
"$REPO/install.sh" >/dev/null 2>&1
if ls -d "$HERDR_APP_HOME"/mods/*.bak.* >/dev/null 2>&1; then
  fail "mod backup kept out of mods/"
elif ls "$HOME"/.config/herdr-kit/backup/*/mods/herdr-signals/main.js >/dev/null 2>&1; then
  pass "mod backup kept out of mods/"
else
  fail "mod backup kept out of mods/"
fi

# warns when Herdr has never run (no main layout to build from)
fresh
rm "$HERDR_APP_HOME/layouts/main.json"
OUT="$("$REPO/install.sh" 2>&1)"
if echo "$OUT" | grep -q "launch Herdr once"; then pass "warns without main layout"; else fail "warns without main layout"; fi

# --check flags a missing kit layout
if "$REPO/install.sh" --check 2>&1 | grep -q "DRIFT .*layouts/scruffy.json"; then
  pass "check reports missing kit layout"
else
  fail "check reports missing kit layout"
fi

# saves the main layout it built from; --check flags a later change to main.json
fresh
"$REPO/install.sh" >/dev/null 2>&1
SRC_COPY="$HOME/.config/herdr-kit/layout-source.json"
if [ -f "$SRC_COPY" ] && "$REPO/install.sh" --check 2>&1 | grep -q "ok    .*layouts/scruffy.json" \
  && ! "$REPO/install.sh" --check 2>&1 | grep -q "main layout changed"; then
  pass "check passes right after install"
else
  fail "check passes right after install"
fi
# the same layout, rewritten with other spacing and key order, is not a change
echo '{"type":"column","id":"root","children":[{"type":"row","id":"work-body","children":[{"id":"main","type":"block","content":{"tab":"active"}}]},{"id":"status","type":"block","content":{"mod":"workspace-status"}}]}' > "$HERDR_APP_HOME/layouts/main.json"
if "$REPO/install.sh" --check 2>&1 | grep -q "main layout changed"; then fail "check ignores a same-content rewrite"; else pass "check ignores a same-content rewrite"; fi
echo '{"id":"root","type":"column","children":[{"id":"status","type":"block","content":{"mod":"workspace-status"}}]}' > "$HERDR_APP_HOME/layouts/main.json"
if "$REPO/install.sh" --check 2>&1 | grep -q "DRIFT .*main layout changed since install"; then
  pass "check flags a changed main layout"
else
  fail "check flags a changed main layout"
fi
"$REPO/install.sh" >/dev/null 2>&1
if "$REPO/install.sh" --check 2>&1 | grep -q "main layout changed"; then fail "reinstall clears the layout drift"; else pass "reinstall clears the layout drift"; fi

# links the bundled wallpaper and puts it in the kit layout
fresh
"$REPO/install.sh" >/dev/null 2>&1
if [ -L "$HERDR_APP_HOME/backgrounds/twin-suns.jpg" ] && [ -L "$HERDR_APP_HOME/backgrounds/twin-suns-day.jpg" ] && grep -q 'backgrounds/twin-suns.jpg' "$HERDR_APP_HOME/layouts/scruffy.json"; then
  pass "wallpaper linked and in kit layout"
else
  fail "wallpaper linked and in kit layout"
fi

# links the scene picker's thumbnails (one folder below backgrounds/)
if [ -L "$HERDR_APP_HOME/backgrounds/thumbs/twin-suns.jpg" ] && [ -L "$HERDR_APP_HOME/backgrounds/thumbs/small-moon-day.jpg" ] && [ -L "$HERDR_APP_HOME/mods/kit-scenes" ]; then
  pass "scene thumbnails and kit-scenes linked"
else
  fail "scene thumbnails and kit-scenes linked"
fi

# links each glyph layer file per file into glyphs/, where look.js draws them from
ok=1
for f in "$REPO"/herdr/glyphs/*.svg; do
  rel="glyphs/$(basename "$f")"
  [ -L "$HERDR_APP_HOME/$rel" ] || { ok=""; continue; }
  # private/ may link its own over one; otherwise it's the kit's
  case "$(readlink "$HERDR_APP_HOME/$rel")" in
    "$REPO/herdr/$rel"|"$REPO/private/herdr/$rel") ;;
    *) ok="" ;;
  esac
done
if [ -n "$ok" ] && [ -L "$HERDR_APP_HOME/glyphs/small-moon-body.svg" ] && [ ! -L "$HERDR_APP_HOME/glyphs" ]; then
  pass "glyph layers linked per file into glyphs/"
else
  fail "glyph layers linked per file into glyphs/"
fi

# Herdr loads new mods, themes and glyph art outside mods/ only on a restart: the first install
# names all three once (kit and private links together), a rerun that changes nothing says nothing
fresh
OUT="$("$REPO/install.sh" 2>&1)"
if [ "$(echo "$OUT" | grep -cxF "restart Herdr to load the new mods, themes and glyph art")" = "1" ] \
  && ! echo "$OUT" | grep -qxF "restart Herdr to load new glyph art"; then
  pass "first install: the restart hint names mods, themes and glyph art, once"
else
  fail "first install: the restart hint names mods, themes and glyph art, once"
fi
OUT="$("$REPO/install.sh" 2>&1)"
if ! echo "$OUT" | grep -q "restart Herdr"; then
  pass "glyph art: a rerun that changes nothing doesn't ask"
else
  fail "glyph art: a rerun that changes nothing doesn't ask"
fi

# links the one layout picture and names it in the kit layout
if [ -L "$HERDR_APP_HOME/layouts/scruffy.svg" ] && [ ! -e "$HERDR_APP_HOME/layouts/tatooine.svg" ] \
  && grep -q '"preview": "layouts/scruffy.svg"' "$HERDR_APP_HOME/layouts/scruffy.json"; then
  pass "layout preview linked and named"
else
  fail "layout preview linked and named"
fi

# kit layout follows the config's look
echo '{"look":{"wallpaper":""}}' > "$HOME/.config/herdr-kit/config.json"
"$REPO/install.sh" >/dev/null 2>&1
if grep -q '"image"' "$HERDR_APP_HOME/layouts/scruffy.json"; then fail "look off in config"; else pass "look off in config"; fi

# wallpaper.sh copies a picture in, records it, and rebuilds the layout
fresh
"$REPO/install.sh" >/dev/null 2>&1
PIC="$(mktemp -d)/My Dunes.jpg"; echo jpg > "$PIC"
"$REPO/scripts/wallpaper.sh" "$PIC" 0.4 >/dev/null 2>&1
CFG="$HOME/.config/herdr-kit/config.json"
if [ -f "$HERDR_APP_HOME/backgrounds/My Dunes.jpg" ] \
  && grep -q '"backgrounds/My Dunes.jpg"' "$HERDR_APP_HOME/layouts/scruffy.json" \
  && grep -q '"terminal_opacity": 0.4' "$HERDR_APP_HOME/layouts/scruffy.json" \
  && grep -q 'My Dunes.jpg' "$CFG" && [ "$(stat -f %Lp "$CFG")" = "600" ]; then
  pass "wallpaper.sh sets a picture"
else
  fail "wallpaper.sh sets a picture"
fi

# wallpaper.sh --light records the light-mode picture and leaves the dark one
DAYPIC="$(mktemp -d)/Noon.jpg"; echo jpg > "$DAYPIC"
"$REPO/scripts/wallpaper.sh" --light "$DAYPIC" >/dev/null 2>&1
if grep -q '"wallpaper_light": "backgrounds/Noon.jpg"' "$CFG" \
  && grep -q '"backgrounds/My Dunes.jpg"' "$HERDR_APP_HOME/layouts/scruffy.json"; then
  pass "wallpaper.sh --light sets the light picture"
else
  fail "wallpaper.sh --light sets the light picture"
fi
"$REPO/scripts/wallpaper.sh" --light off >/dev/null 2>&1
if grep -q wallpaper_light "$CFG"; then fail "wallpaper.sh --light off"; else pass "wallpaper.sh --light off"; fi

# wallpaper.sh off returns to Herdr's own look; a missing file changes nothing
"$REPO/scripts/wallpaper.sh" off >/dev/null 2>&1
if grep -q '"image"' "$HERDR_APP_HOME/layouts/scruffy.json"; then fail "wallpaper.sh off"; else pass "wallpaper.sh off"; fi
if "$REPO/scripts/wallpaper.sh" /nope.jpg >/dev/null 2>&1; then fail "wallpaper.sh rejects missing file"; else pass "wallpaper.sh rejects missing file"; fi

# merges the Claude name hook into ~/.claude/settings.json
fresh
mkdir -p "$HOME/.claude"
echo '{"model":"x","hooks":{"PreToolUse":[{"matcher":"Bash","hooks":[{"type":"command","command":"guard.sh"}]}]}}' > "$HOME/.claude/settings.json"
echo '{"global":{"cmd-q":"app.quit"}}' > "$HERDR_APP_HOME/keys.json"
OUT="$("$REPO/install.sh" --hooks 2>&1)"
if grep -q "claude/name-hook.mjs" "$HOME/.claude/settings.json" && grep -q guard.sh "$HOME/.claude/settings.json"; then
  pass "merges claude hooks"
else
  fail "merges claude hooks"
fi
if grep -q '"layout:scruffy"' "$HERDR_APP_HOME/keys.json" && echo "$OUT" | grep -q "automatic shortcut upgrades"; then
  pass "prints keys caveat"
else
  fail "prints keys caveat"
fi

# --uninstall removes hooks, keys, the kit layout, its focus file and herdr-signals' sizes
echo '{"focus":{},"grid":{}}' > "$HOME/.config/herdr-kit/sizes.json"
[ -f "$HOME/.config/herdr-kit/glyphs-seen" ] || fail "install wrote the glyph record"
"$REPO/install.sh" --uninstall >/dev/null 2>&1
if grep -q "name-hook" "$HOME/.claude/settings.json" || grep -q "layout:" "$HERDR_APP_HOME/keys.json" || ! grep -q guard.sh "$HOME/.claude/settings.json"; then
  fail "uninstall removes hooks and keys"
else
  pass "uninstall removes hooks and keys"
fi
if [ ! -e "$HERDR_APP_HOME/layouts/scruffy.json" ] && [ ! -e "$HOME/.config/herdr-kit/layout-focus.json" ] \
  && [ ! -e "$HOME/.config/herdr-kit/sizes.json" ] && [ -f "$HOME/.config/herdr-kit/config.json" ]; then
  pass "uninstall removes scruffy.json, layout-focus.json and sizes.json"
else
  fail "uninstall removes scruffy.json, layout-focus.json and sizes.json"
fi
if [ ! -e "$HOME/.config/herdr-kit/glyphs-seen" ]; then
  pass "uninstall removes the glyph record"
else
  fail "uninstall removes the glyph record"
fi

# leaves malformed settings alone and still finishes
fresh
mkdir -p "$HOME/.claude"
printf '{' > "$HOME/.claude/settings.json"
OUT="$("$REPO/install.sh" --hooks 2>&1)"; RC=$?
if [ $RC -eq 0 ] && [ "$(cat "$HOME/.claude/settings.json")" = "{" ] && echo "$OUT" | grep -q "settings.json" && [ -f "$HOME/.config/herdr-kit/config.json" ]; then
  pass "leaves malformed settings alone"
else
  fail "leaves malformed settings alone"
fi

# counts hook entries that run the name hook, across all events
hookcount() {
  node -e 'const s = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
let n = 0; for (const es of Object.values(s.hooks ?? {})) for (const e of es) for (const h of e.hooks ?? []) if (String(h.command).includes("name-hook.mjs")) n++;
console.log(n);' "$1"
}

# install touches each mod's main.js so Herdr reloads code a git pull swapped in
fresh
touch -t 202001010000 "$REPO/herdr/mods/kit-rail/main.js" "$REPO/herdr/mods/herdr-signals/main.js"
out="$("$REPO/install.sh" --hooks 2>&1)"
if [ "$(stat -f %m "$REPO/herdr/mods/kit-rail/main.js")" -gt 1600000000 ] \
  && [ "$(stat -f %m "$REPO/herdr/mods/herdr-signals/main.js")" -gt 1600000000 ] \
  && echo "$out" | grep -q "reloaded the kit mods"; then
  pass "install reloads the mods"
else
  fail "install reloads the mods"
fi
touch -t 202001010000 "$REPO/herdr/mods/kit-rail/main.js"
"$REPO/install.sh" --check >/dev/null 2>&1
if [ "$(stat -f %m "$REPO/herdr/mods/kit-rail/main.js")" -lt 1600000000 ]; then pass "check doesn't reload the mods"; else fail "check doesn't reload the mods"; fi
touch "$REPO/herdr/mods/kit-rail/main.js"

# the hook is added for every event, including PermissionRequest and PreToolUse
fresh
"$REPO/install.sh" --hooks >/dev/null 2>&1
if [ "$(jget "$HOME/.claude/settings.json" hooks.PermissionRequest.0.hooks.0.command | grep -c name-hook)" = "1" ] \
  && [ "$(jget "$HOME/.claude/settings.json" hooks.PreToolUse.0.hooks.0.command | grep -c name-hook)" = "1" ] \
  && [ "$(hookcount "$HOME/.claude/settings.json")" = "6" ]; then
  pass "hooks PermissionRequest and PreToolUse"
else
  fail "hooks PermissionRequest and PreToolUse"
fi
# the per-tool-call events run async; the transcript-reading ones stay synchronous
if [ "$(jget "$HOME/.claude/settings.json" hooks.PreToolUse.0.hooks.0.async)" = "true" ] \
  && [ "$(jget "$HOME/.claude/settings.json" hooks.PermissionRequest.0.hooks.0.async)" = "true" ] \
  && [ -z "$(jget "$HOME/.claude/settings.json" hooks.Stop.0.hooks.0.async)" ] \
  && [ -z "$(jget "$HOME/.claude/settings.json" hooks.UserPromptSubmit.0.hooks.0.async)" ]; then
  pass "name hook is async on PreToolUse and PermissionRequest only"
else
  fail "name hook is async on PreToolUse and PermissionRequest only"
fi

# the new key bindings are added, and cmd-shift-g toggles the view
fresh
K="$HERDR_APP_HOME/keys.json"
echo '{"global":{"cmd-q":"app.quit"}}' > "$K"
"$REPO/install.sh" --hooks >/dev/null 2>&1
if [ "$(jget "$K" "layout:scruffy.cmd-alt-]")" = "herdr-signals.spot-next" ] \
  && [ "$(jget "$K" "layout:scruffy.cmd-alt-[")" = "herdr-signals.spot-prev" ] \
  && [ "$(jget "$K" "layout:scruffy.cmd-shift-a")" = "herdr-signals.grid-all" ] \
  && [ "$(jget "$K" "layout:scruffy.cmd-shift-g")" = "herdr-signals.view-toggle" ] \
  && [ "$(jget "$K" "global.cmd-shift-u")" = "herdr-signals.urgent" ] \
  && { [ -z "$HAS_PRIVATE" ] || [ "$(jget "$K" "global.cmd-shift-j")" = "herdr-signals.press-day" ]; } \
  && [ "$(jget "$K" "global.cmd-q")" = "app.quit" ] \
  && [ -z "$(jget "$K" "layout:endor")" ]; then
  pass "adds the new key bindings"
else
  fail "adds the new key bindings"
fi

# the old per-scene key sections go; a user's own binding in one stays and is reported
fresh
K="$HERDR_APP_HOME/keys.json"
echo '{"layout:endor":{"cmd-shift-g":"tab.new"},"layout:endor-grid":{"cmd-shift-g":{"command":"layout.switch","args":{"name":"endor"}},"cmd-alt-]":"herdr-signals.spot-next","cmd-alt-[":"herdr-signals.spot-prev","cmd-shift-a":"herdr-signals.grid-all"}}' > "$K"
OUT="$("$REPO/install.sh" --hooks 2>&1)"
if [ -z "$(jget "$K" "layout:endor-grid")" ] && [ "$(jget "$K" "layout:endor.cmd-shift-g")" = "tab.new" ] \
  && echo "$OUT" | grep -q "layout:endor .*cmd-shift-g"; then
  pass "old scene key sections migrate"
else
  fail "old scene key sections migrate"
fi

# a key the user rebound is left alone, reported, and kept on uninstall
fresh
K="$HERDR_APP_HOME/keys.json"
echo '{"layout:scruffy":{"cmd-alt-]":"space.next"}}' > "$K"
OUT="$("$REPO/install.sh" --hooks 2>&1)"
if [ "$(jget "$K" "layout:scruffy.cmd-alt-]")" = "space.next" ] \
  && [ "$(jget "$K" "layout:scruffy.cmd-alt-[")" = "herdr-signals.spot-prev" ] \
  && echo "$OUT" | grep -q "left layout:scruffy cmd-alt-\] alone"; then
  pass "rebound key left alone and reported"
else
  fail "rebound key left alone and reported"
fi
"$REPO/install.sh" --uninstall >/dev/null 2>&1
if [ "$(jget "$K" "layout:scruffy.cmd-alt-]")" = "space.next" ] \
  && [ -z "$(jget "$K" "layout:scruffy.cmd-alt-[")" ]; then
  pass "rebound key kept on uninstall"
else
  fail "rebound key kept on uninstall"
fi

# the hook path is quoted, so a repo under a folder with a space still works
fresh
SP="$(mktemp -d)/my repos"
mkdir -p "$SP"
tar -C "$REPO" --exclude=.git --exclude=node_modules -cf - . | tar -C "$SP" -xf -
"$SP/install.sh" --hooks >/dev/null 2>&1
STORED="$(jget "$HOME/.claude/settings.json" hooks.PreToolUse.0.hooks.0.command)"
if [ "$STORED" = "node \"$SP/claude/name-hook.mjs\"" ] && sh -c "$STORED" </dev/null >/dev/null 2>&1; then
  pass "quoted hook path runs"
else
  fail "quoted hook path runs"
fi
# re-install keeps one copy of each hook
"$SP/install.sh" --hooks >/dev/null 2>&1
if [ "$(hookcount "$HOME/.claude/settings.json")" = "6" ]; then pass "quoted hook re-install is idempotent"; else fail "quoted hook re-install is idempotent"; fi
# an unquoted hook from an older install is adopted, not duplicated
fresh
mkdir -p "$HOME/.claude"
echo "{\"hooks\":{\"Stop\":[{\"hooks\":[{\"type\":\"command\",\"command\":\"node $SP/claude/name-hook.mjs\"}]}]}}" > "$HOME/.claude/settings.json"
"$SP/install.sh" --hooks >/dev/null 2>&1
if [ "$(hookcount "$HOME/.claude/settings.json")" = "6" ] && [ "$(jget "$HOME/.claude/settings.json" hooks.Stop.0.hooks.0.command)" = "node \"$SP/claude/name-hook.mjs\"" ]; then
  pass "older unquoted hook adopted"
else
  fail "older unquoted hook adopted"
fi
"$SP/install.sh" --uninstall >/dev/null 2>&1
if [ "$(hookcount "$HOME/.claude/settings.json")" = "0" ]; then pass "uninstall removes quoted hook"; else fail "uninstall removes quoted hook"; fi

# the card hook is added for SessionStart and Stop only, beside the name hook
cardcount() {
  node -e 'const s = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
const evs = []; for (const [ev, es] of Object.entries(s.hooks ?? {})) for (const e of es) for (const h of e.hooks ?? []) if (String(h.command).includes("card-hook.mjs")) evs.push(ev);
console.log(evs.sort().join(","));' "$1"
}
if [ -n "$HAS_CARD_HOOK" ]; then
fresh
mkdir -p "$HOME/.claude" "$HOME/.config/herdr-kit"
echo '{"run_cards":true}' > "$HOME/.config/herdr-kit/config.json"
echo '{"hooks":{"Stop":[{"hooks":[{"type":"command","command":"mine.sh"}]}]}}' > "$HOME/.claude/settings.json"
"$REPO/install.sh" --hooks >/dev/null 2>&1
S="$HOME/.claude/settings.json"
if [ "$(cardcount "$S")" = "SessionStart,Stop" ] && [ "$(hookcount "$S")" = "6" ] && grep -q mine.sh "$S"; then
  pass "registers the card hook on SessionStart and Stop"
else
  fail "registers the card hook on SessionStart and Stop"
fi
"$REPO/install.sh" --hooks >/dev/null 2>&1
if [ "$(cardcount "$S")" = "SessionStart,Stop" ]; then pass "card hook re-install is idempotent"; else fail "card hook re-install is idempotent"; fi
if "$REPO/install.sh" --check 2>&1 | grep -q "ok    $S"; then pass "check reports the hooks ok"; else fail "check reports the hooks ok"; fi
node -e 'const f=process.argv[1],s=JSON.parse(require("fs").readFileSync(f,"utf8"));delete s.hooks.SessionStart;require("fs").writeFileSync(f,JSON.stringify(s))' "$S"
if "$REPO/install.sh" --check 2>&1 | grep -q "DRIFT $S"; then pass "check reports a missing hook"; else fail "check reports a missing hook"; fi
# an install from before the async flag: every hook present, PreToolUse not async
"$REPO/install.sh" --hooks >/dev/null 2>&1
node -e 'const f=process.argv[1],s=JSON.parse(require("fs").readFileSync(f,"utf8"));for(const e of s.hooks.PreToolUse)for(const h of e.hooks)delete h.async;require("fs").writeFileSync(f,JSON.stringify(s))' "$S"
if "$REPO/install.sh" --check 2>&1 | grep -q "DRIFT $S (name or card hook missing or out of date"; then pass "check reports a hook that lost async"; else fail "check reports a hook that lost async"; fi
before="$(cat "$S")"
"$REPO/install.sh" --check >/dev/null 2>&1
if [ "$(cat "$S")" = "$before" ]; then pass "check writes nothing"; else fail "check writes nothing"; fi
"$REPO/install.sh" --uninstall >/dev/null 2>&1
if [ "$(cardcount "$S")" = "" ] && [ "$(hookcount "$S")" = "0" ] && grep -q mine.sh "$S"; then
  pass "uninstall removes the card hook"
else
  fail "uninstall removes the card hook"
fi
fi

# hooks are opt-in: no flag and no terminal skips them
NOPRIV=/nonexistent/private-install.sh
fresh
mkdir -p "$HOME/.claude"
echo '{"model":"x"}' > "$HOME/.claude/settings.json"
OUT="$(HERDR_KIT_PRIVATE=$NOPRIV "$REPO/install.sh" </dev/null 2>&1)"
if [ "$(cat "$HOME/.claude/settings.json")" = '{"model":"x"}' ] && echo "$OUT" | grep -q "hooks skipped: rerun ./install.sh --hooks to add them" && ! echo "$OUT" | grep -q "Add them?"; then
  pass "no flag, no terminal: hooks skipped"
else
  fail "no flag, no terminal: hooks skipped"
fi
OUT="$(HERDR_KIT_PRIVATE=$NOPRIV "$REPO/install.sh" --hooks </dev/null 2>&1)"
if [ "$(hookcount "$HOME/.claude/settings.json")" = "6" ] && [ "$(cardcount "$HOME/.claude/settings.json")" = "" ] && ! echo "$OUT" | grep -q "Add them?"; then
  pass "--hooks adds the name hook, not the card hook (run_cards off)"
else
  fail "--hooks adds the name hook, not the card hook (run_cards off)"
fi
# run_cards on: the card hook comes too; off again: it goes, the name hook stays
if [ -n "$HAS_CARD_HOOK" ]; then
echo '{"run_cards":true}' > "$HOME/.config/herdr-kit/config.json"
HERDR_KIT_PRIVATE=$NOPRIV "$REPO/install.sh" --hooks </dev/null >/dev/null 2>&1
if [ "$(cardcount "$HOME/.claude/settings.json")" = "SessionStart,Stop" ]; then pass "--hooks adds the card hook when run_cards is on"; else fail "--hooks adds the card hook when run_cards is on"; fi
fi
echo '{"run_cards":false}' > "$HOME/.config/herdr-kit/config.json"
HERDR_KIT_PRIVATE=$NOPRIV "$REPO/install.sh" --hooks </dev/null >/dev/null 2>&1
if [ "$(cardcount "$HOME/.claude/settings.json")" = "" ] && [ "$(hookcount "$HOME/.claude/settings.json")" = "6" ]; then pass "run_cards off removes the card hook"; else fail "run_cards off removes the card hook"; fi
# --check on a declined install is not drift
fresh
HERDR_KIT_PRIVATE=$NOPRIV "$REPO/install.sh" </dev/null >/dev/null 2>&1
if HERDR_KIT_PRIVATE=$NOPRIV "$REPO/install.sh" --check </dev/null 2>&1 | grep -q "skip  .*settings.json"; then pass "check: declined hooks are not drift"; else fail "check: declined hooks are not drift"; fi
# --no-hooks leaves settings alone and never asks, private/ or not
fresh
mkdir -p "$HOME/.claude"
echo '{"model":"x"}' > "$HOME/.claude/settings.json"
OUT="$("$REPO/install.sh" --no-hooks </dev/null 2>&1)"
if [ "$(cat "$HOME/.claude/settings.json")" = '{"model":"x"}' ] && ! echo "$OUT" | grep -q "Add them?"; then pass "--no-hooks wins over private/"; else fail "--no-hooks wins over private/"; fi
# private/ present and no flag behaves as --hooks, without asking
if [ -f "$REPO/private/install.sh" ]; then
  fresh
  OUT="$("$REPO/install.sh" </dev/null 2>&1)"
  if [ "$(hookcount "$HOME/.claude/settings.json")" = "6" ] && ! echo "$OUT" | grep -q "Add them?\|hooks skipped"; then pass "private/ present: hooks added without asking"; else fail "private/ present: hooks added without asking"; fi
fi
# on a terminal it asks once: n skips, empty (Enter) means yes
# ttyrun <answer> <install args>: runs install.sh on a pty, typing <answer> at the prompt.
ttyrun() {
  python3 -c '
import os, pty, sys, select
ans = b"\x04" if sys.argv[1] == "^D" else sys.argv[1].encode() + b"\n"
pid, fd = pty.fork()
if pid == 0:
    os.execv(sys.argv[2], sys.argv[2:])
out = b""
sent = False
while True:
    r, _, _ = select.select([fd], [], [], 60)
    if not r: break
    try: d = os.read(fd, 4096)
    except OSError: break
    if not d: break
    out += d
    if not sent and b"[Y/n]" in out:
        os.write(fd, ans); sent = True
os.waitpid(pid, 0)
sys.stdout.write(out.decode(errors="replace"))
' "$@"
}
if command -v python3 >/dev/null 2>&1; then
  fresh
  OUT="$(HERDR_KIT_PRIVATE=$NOPRIV ttyrun n "$REPO/install.sh" 2>&1)"
  if echo "$OUT" | grep -q "Add them? \[Y/n\]" && echo "$OUT" | grep -q "hooks skipped" && [ ! -f "$HOME/.claude/settings.json" ]; then pass "prompt: n skips"; else fail "prompt: n skips"; fi
  if echo "$OUT" | tr -d '\r\n' | grep -qF "a hook in ~/.claude/settings.json, and wraps your status line so the rail can show context use (your line still runs; both backed up first). Add them? [Y/n]"; then
    pass "prompt: names the hook and the status line wrap"
  else
    fail "prompt: names the hook and the status line wrap"
  fi
  fresh
  HERDR_KIT_PRIVATE=$NOPRIV ttyrun "" "$REPO/install.sh" >/dev/null 2>&1
  if [ "$(hookcount "$HOME/.claude/settings.json")" = "6" ]; then pass "prompt: Enter adds the hooks"; else fail "prompt: Enter adds the hooks"; fi
fi

# Ctrl-D at the prompt counts as no
if command -v python3 >/dev/null 2>&1; then
  fresh
  OUT="$(HERDR_KIT_PRIVATE=$NOPRIV ttyrun "^D" "$REPO/install.sh" 2>&1)"
  if echo "$OUT" | grep -q "Add them? \[Y/n\]" && echo "$OUT" | grep -q "hooks skipped" && [ ! -f "$HOME/.claude/settings.json" ]; then pass "prompt: EOF skips"; else fail "prompt: EOF skips"; fi
fi
# --no-hooks wins over --hooks in either order
for order in "--hooks --no-hooks" "--no-hooks --hooks"; do
  fresh
  mkdir -p "$HOME/.claude"
  echo '{"model":"x"}' > "$HOME/.claude/settings.json"
  # shellcheck disable=SC2086
  HERDR_KIT_PRIVATE=$NOPRIV "$REPO/install.sh" $order </dev/null >/dev/null 2>&1
  if [ "$(cat "$HOME/.claude/settings.json")" = '{"model":"x"}' ]; then pass "--no-hooks wins: $order"; else fail "--no-hooks wins: $order"; fi
done
# a failing overlay script stops install before the hooks, saying the overlay failed
fresh
BADPRIV="$(mktemp -d)/install.sh"
printf '#!/usr/bin/env bash\n[ "${1:-}" = install ] && exit 3\nexit 0\n' > "$BADPRIV"
OUT="$(HERDR_KIT_PRIVATE=$BADPRIV "$REPO/install.sh" </dev/null 2>&1)"; RC=$?
if [ $RC -ne 0 ] && echo "$OUT" | grep -qxF "overlay install failed" && ! echo "$OUT" | grep -q "hooks skipped" \
  && [ ! -f "$HOME/.claude/settings.json" ]; then
  pass "overlay install failure: says the overlay failed, exits non-zero"
else
  fail "overlay install failure: says the overlay failed, exits non-zero"
fi

# the status line: with the hooks, install wraps the old line so ctx-tap gets fed
OLDLINE='{"type":"command","command":"bash -c '"'"'echo \"hi there\"'"'"' && ~/.claude/line.sh # x","padding":0}'
fresh
S="$HOME/.claude/settings.json"; PREVF="$HOME/.config/herdr-kit/statusline-prev.json"
mkdir -p "$HOME/.claude"
echo "{\"model\":\"x\",\"statusLine\":$OLDLINE}" > "$S"
BEFORE="$(jget "$S" statusLine)"
OUT="$(HERDR_KIT_PRIVATE=$NOPRIV "$REPO/install.sh" --hooks </dev/null 2>&1)"
if [ "$(jget "$S" statusLine.command)" = "node \"$REPO/claude/statusline.mjs\"" ] && [ "$(jget "$PREVF" statusLine)" = "$BEFORE" ] \
  && echo "$OUT" | grep -q "status line wrapped"; then
  pass "hooks yes: wraps the status line and saves the old one"
else
  fail "hooks yes: wraps the status line and saves the old one"
fi
HERDR_KIT_PRIVATE=$NOPRIV "$REPO/install.sh" --hooks </dev/null >/dev/null 2>&1
if [ "$(jget "$PREVF" statusLine)" = "$BEFORE" ] && [ "$(jget "$S" statusLine.command)" = "node \"$REPO/claude/statusline.mjs\"" ]; then
  pass "reinstall keeps the saved old line (never the wrapper)"
else
  fail "reinstall keeps the saved old line (never the wrapper)"
fi
if HERDR_KIT_PRIVATE=$NOPRIV "$REPO/install.sh" --check </dev/null 2>&1 | grep -q "status line wrapped"; then pass "check: status line wrapped"; else fail "check: status line wrapped"; fi
HERDR_KIT_PRIVATE=$NOPRIV "$REPO/install.sh" --uninstall </dev/null >/dev/null 2>&1
if [ "$(jget "$S" statusLine)" = "$BEFORE" ] && [ ! -e "$PREVF" ] \
  && node -e 'const s=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.exit(s.statusLine.command===JSON.parse(process.argv[2]).command?0:1)' "$S" "$OLDLINE"; then
  pass "uninstall restores the old status line byte for byte"
else
  fail "uninstall restores the old status line byte for byte"
fi
if HERDR_KIT_PRIVATE=$NOPRIV "$REPO/install.sh" --check </dev/null 2>&1 | grep -q "status line not wrapped"; then pass "check: status line not wrapped"; else fail "check: status line not wrapped"; fi
# no status line before: install sets the wrapper, uninstall removes it
fresh
S="$HOME/.claude/settings.json"; PREVF="$HOME/.config/herdr-kit/statusline-prev.json"
HERDR_KIT_PRIVATE=$NOPRIV "$REPO/install.sh" --hooks </dev/null >/dev/null 2>&1
if [ "$(jget "$S" statusLine.command)" = "node \"$REPO/claude/statusline.mjs\"" ] && [ "$(jget "$PREVF" statusLine)" = "null" ] \
  && ! ls -d "$HOME"/.config/herdr-kit/backup/* >/dev/null 2>&1; then
  pass "no old status line: wrapper set, null saved, no backup of a file install just made"
else
  fail "no old status line: wrapper set, null saved, no backup of a file install just made"
fi
HERDR_KIT_PRIVATE=$NOPRIV "$REPO/install.sh" --uninstall </dev/null >/dev/null 2>&1
if [ -z "$(jget "$S" statusLine)" ] && [ ! -e "$PREVF" ]; then pass "uninstall removes a wrapper that replaced nothing"; else fail "uninstall removes a wrapper that replaced nothing"; fi
# a status line the user changed after install is left alone on uninstall
fresh
S="$HOME/.claude/settings.json"; PREVF="$HOME/.config/herdr-kit/statusline-prev.json"
mkdir -p "$HOME/.claude"
echo "{\"statusLine\":$OLDLINE}" > "$S"
HERDR_KIT_PRIVATE=$NOPRIV "$REPO/install.sh" --hooks </dev/null >/dev/null 2>&1
node -e 'const f=process.argv[1],s=JSON.parse(require("fs").readFileSync(f,"utf8"));s.statusLine={type:"command",command:"my-new-line.sh"};require("fs").writeFileSync(f,JSON.stringify(s))' "$S"
OUT="$(HERDR_KIT_PRIVATE=$NOPRIV "$REPO/install.sh" --uninstall </dev/null 2>&1)"
if [ "$(jget "$S" statusLine.command)" = "my-new-line.sh" ] && [ "$(jget "$PREVF" statusLine.command)" = "$(node -e 'console.log(JSON.parse(process.argv[1]).command)' "$OLDLINE")" ] \
  && echo "$OUT" | grep -q "left the status line alone.*still saved in $PREVF"; then
  pass "uninstall leaves a changed status line alone, keeps the saved line and says where"
else
  fail "uninstall leaves a changed status line alone, keeps the saved line and says where"
fi
# a line that already runs ctx-tap is left alone
fresh
S="$HOME/.claude/settings.json"; PREVF="$HOME/.config/herdr-kit/statusline-prev.json"
mkdir -p "$HOME/.claude"
echo '{"statusLine":{"type":"command","command":"~/.claude/line.sh | node ~/kit/claude/ctx-tap.mjs"}}' > "$S"
OUT="$(HERDR_KIT_PRIVATE=$NOPRIV "$REPO/install.sh" --hooks </dev/null 2>&1)"
if [ "$(jget "$S" statusLine.command)" = "~/.claude/line.sh | node ~/kit/claude/ctx-tap.mjs" ] && [ ! -e "$PREVF" ] \
  && echo "$OUT" | grep -q "status line already feeds ctx-tap: left alone"; then
  pass "a status line that runs ctx-tap is left alone"
else
  fail "a status line that runs ctx-tap is left alone"
fi
if HERDR_KIT_PRIVATE=$NOPRIV "$REPO/install.sh" --check </dev/null 2>&1 | grep -q "status line already feeds ctx-tap"; then pass "check: status line already wired"; else fail "check: status line already wired"; fi
# a ctx file written in the last day means something already feeds ctx-tap: left alone
fresh
S="$HOME/.claude/settings.json"; PREVF="$HOME/.config/herdr-kit/statusline-prev.json"
mkdir -p "$HOME/.claude" "$HOME/.config/herdr-kit/ctx"
echo '{"statusLine":{"type":"command","command":"~/.claude/chain.sh"}}' > "$S"
echo 40 > "$HOME/.config/herdr-kit/ctx/t9"
OUT="$(HERDR_KIT_PRIVATE=$NOPRIV "$REPO/install.sh" --hooks </dev/null 2>&1)"
if [ "$(jget "$S" statusLine.command)" = "~/.claude/chain.sh" ] && [ ! -e "$PREVF" ] && echo "$OUT" | grep -q "status line already feeds ctx-tap: left alone"; then
  pass "a fresh ctx file: status line left alone"
else
  fail "a fresh ctx file: status line left alone"
fi
# a stale one (two days old) doesn't count
node -e 'const t=(Date.now()-2*864e5)/1000;require("fs").utimesSync(process.argv[1],t,t)' "$HOME/.config/herdr-kit/ctx/t9"
HERDR_KIT_PRIVATE=$NOPRIV "$REPO/install.sh" --hooks </dev/null >/dev/null 2>&1
if [ "$(jget "$S" statusLine.command)" = "node \"$REPO/claude/statusline.mjs\"" ]; then pass "a stale ctx file: status line wrapped"; else fail "a stale ctx file: status line wrapped"; fi
# one install over an existing settings.json: hooks, then the wrap; the earliest backup is still the original
fresh
S="$HOME/.claude/settings.json"
mkdir -p "$HOME/.claude"
echo '{"model":"x","statusLine":{"type":"command","command":"~/.claude/line.sh"}}' > "$S"
cp "$S" "$HOME/original.json"
HERDR_KIT_PRIVATE=$NOPRIV "$REPO/install.sh" --hooks </dev/null >/dev/null 2>&1
FIRST="$(ls -d "$HOME"/.config/herdr-kit/backup/*/ 2>/dev/null | sort | head -n 1)"
if [ -n "$FIRST" ] && cmp -s "$FIRST/settings.json" "$HOME/original.json" && [ "$(jget "$S" statusLine.command)" = "node \"$REPO/claude/statusline.mjs\"" ]; then
  pass "hooks then wrap in one install: the backup keeps the original bytes"
else
  fail "hooks then wrap in one install: the backup keeps the original bytes"
fi
# uninstall (unwrap, then unhooks) keeps the first backup of that run too
rm -rf "$HOME/.config/herdr-kit/backup"
cp "$S" "$HOME/installed.json"
HERDR_KIT_PRIVATE=$NOPRIV "$REPO/install.sh" --uninstall </dev/null >/dev/null 2>&1
FIRST="$(ls -d "$HOME"/.config/herdr-kit/backup/*/ 2>/dev/null | sort | head -n 1)"
if [ -n "$FIRST" ] && cmp -s "$FIRST/settings.json" "$HOME/installed.json"; then
  pass "uninstall: the backup keeps the installed bytes"
else
  fail "uninstall: the backup keeps the installed bytes"
fi
# a user's own ~/.claude/statusline.mjs is not the kit's wrapper: left alone, reported, never unwrapped
fresh
S="$HOME/.claude/settings.json"; PREVF="$HOME/.config/herdr-kit/statusline-prev.json"
mkdir -p "$HOME/.claude"
echo '{"statusLine":{"type":"command","command":"node ~/.claude/statusline.mjs"}}' > "$S"
OUT="$(HERDR_KIT_PRIVATE=$NOPRIV "$REPO/install.sh" --hooks </dev/null 2>&1)"
if [ "$(jget "$S" statusLine.command)" = "node ~/.claude/statusline.mjs" ] && [ ! -e "$PREVF" ] \
  && echo "$OUT" | grep -q "status line already feeds ctx-tap: left alone"; then
  pass "a user's own statusline.mjs is left alone"
else
  fail "a user's own statusline.mjs is left alone"
fi
if HERDR_KIT_PRIVATE=$NOPRIV "$REPO/install.sh" --check </dev/null 2>&1 | grep -q "ok    status line already feeds ctx-tap"; then pass "check: a user's statusline.mjs is already wired"; else fail "check: a user's statusline.mjs is already wired"; fi
# even with a saved line from an earlier wrap, uninstall doesn't touch it
echo '{"statusLine":{"type":"command","command":"old.sh"}}' > "$PREVF"
OUT="$(HERDR_KIT_PRIVATE=$NOPRIV "$REPO/install.sh" --uninstall </dev/null 2>&1)"
if [ "$(jget "$S" statusLine.command)" = "node ~/.claude/statusline.mjs" ] && [ "$(jget "$PREVF" statusLine.command)" = "old.sh" ] && echo "$OUT" | grep -q "left the status line alone"; then
  pass "uninstall leaves a user's statusline.mjs alone"
else
  fail "uninstall leaves a user's statusline.mjs alone"
fi
# a status line that isn't a command one is left alone, with a notice
fresh
S="$HOME/.claude/settings.json"; PREVF="$HOME/.config/herdr-kit/statusline-prev.json"
mkdir -p "$HOME/.claude"
echo '{"statusLine":{"type":"static","text":"hi"}}' > "$S"
OUT="$(HERDR_KIT_PRIVATE=$NOPRIV "$REPO/install.sh" --hooks </dev/null 2>&1)"
if [ "$(jget "$S" statusLine)" = '{"type":"static","text":"hi"}' ] && [ ! -e "$PREVF" ] \
  && echo "$OUT" | grep -q "status line isn't a command: left alone (the context meters need a command status line)"; then
  pass "a non-command status line is left alone, with a notice"
else
  fail "a non-command status line is left alone, with a notice"
fi
# uninstall with settings.json gone: nothing about a changed line, and the saved line stays
fresh
PREVF="$HOME/.config/herdr-kit/statusline-prev.json"
mkdir -p "$HOME/.config/herdr-kit"
echo '{"statusLine":null}' > "$PREVF"
OUT="$(HERDR_KIT_PRIVATE=$NOPRIV "$REPO/install.sh" --uninstall </dev/null 2>&1)"
if ! echo "$OUT" | grep -q "changed since install" && echo "$OUT" | grep -q "nothing to restore" && [ -f "$PREVF" ] && [ ! -e "$HOME/.claude/settings.json" ]; then
  pass "uninstall with no settings.json says nothing about the status line"
else
  fail "uninstall with no settings.json says nothing about the status line"
fi
# a wrapper from a moved or re-cloned checkout is still the kit's: rewrapped here, the saved line kept
fresh
S="$HOME/.claude/settings.json"; PREVF="$HOME/.config/herdr-kit/statusline-prev.json"
mkdir -p "$HOME/.claude" "$HOME/.config/herdr-kit"
echo '{"statusLine":{"type":"command","command":"node \"/gone/herdr-kit/claude/statusline.mjs\"","padding":1}}' > "$S"
echo '{"statusLine":{"type":"command","command":"orig.sh"}}' > "$PREVF"
if HERDR_KIT_PRIVATE=$NOPRIV "$REPO/install.sh" --check </dev/null 2>&1 | grep -q "DRIFT status line wrapper points at another checkout"; then pass "check: a moved wrapper is drift"; else fail "check: a moved wrapper is drift"; fi
OUT="$(HERDR_KIT_PRIVATE=$NOPRIV "$REPO/install.sh" --hooks </dev/null 2>&1)"
if [ "$(jget "$S" statusLine.command)" = "node \"$REPO/claude/statusline.mjs\"" ] && [ "$(jget "$S" statusLine.padding)" = "1" ] \
  && [ "$(jget "$PREVF" statusLine.command)" = "orig.sh" ] && echo "$OUT" | grep -q "status line wrapper moved to this checkout"; then
  pass "a moved wrapper is rewrapped to this checkout, the saved line kept"
else
  fail "a moved wrapper is rewrapped to this checkout, the saved line kept"
fi
# a moved wrapper over no old line says so, not "your old line stays saved"
echo '{"statusLine":{"type":"command","command":"node \"/gone/herdr-kit/claude/statusline.mjs\""}}' > "$S"
cp "$PREVF" "$HOME/prev-keep.json"
echo '{"statusLine":null}' > "$PREVF"
OUT="$(HERDR_KIT_PRIVATE=$NOPRIV "$REPO/install.sh" --hooks </dev/null 2>&1)"
if [ "$(jget "$S" statusLine.command)" = "node \"$REPO/claude/statusline.mjs\"" ] && echo "$OUT" | grep -q "you had no status line before it" && ! echo "$OUT" | grep -q "stays saved"; then
  pass "a moved wrapper over no old line: the message says so"
else
  fail "a moved wrapper over no old line: the message says so"
fi
mv "$HOME/prev-keep.json" "$PREVF"
# and uninstall from this checkout restores the original from a moved one too
echo '{"statusLine":{"type":"command","command":"node \"/gone/herdr-kit/claude/statusline.mjs\""}}' > "$S"
HERDR_KIT_PRIVATE=$NOPRIV "$REPO/install.sh" --uninstall </dev/null >/dev/null 2>&1
if [ "$(jget "$S" statusLine.command)" = "orig.sh" ] && [ ! -e "$PREVF" ]; then pass "uninstall restores over a moved wrapper"; else fail "uninstall restores over a moved wrapper"; fi
# a user's own $HOME/claude/statusline.mjs (the kit wrapper's shape) with no saved line: left alone, nothing saved
fresh
S="$HOME/.claude/settings.json"; PREVF="$HOME/.config/herdr-kit/statusline-prev.json"
mkdir -p "$HOME/.claude"
echo "{\"statusLine\":{\"type\":\"command\",\"command\":\"node \\\"$HOME/claude/statusline.mjs\\\"\"}}" > "$S"
OUT="$(HERDR_KIT_PRIVATE=$NOPRIV "$REPO/install.sh" --hooks </dev/null 2>&1)"
if [ "$(jget "$S" statusLine.command)" = "node \"$HOME/claude/statusline.mjs\"" ] && [ ! -e "$PREVF" ] \
  && echo "$OUT" | grep -q "status line already feeds ctx-tap: left alone" && ! echo "$OUT" | grep -q "moved to this checkout"; then
  pass "a user's own claude/statusline.mjs with no saved line is left alone, nothing saved"
else
  fail "a user's own claude/statusline.mjs with no saved line is left alone, nothing saved"
fi
if HERDR_KIT_PRIVATE=$NOPRIV "$REPO/install.sh" --check </dev/null 2>&1 | grep -q "ok    status line already feeds ctx-tap"; then pass "check: that line is already wired, not drift"; else fail "check: that line is already wired, not drift"; fi
# a user's own ~/bin/statusline.mjs isn't wired: it gets wrapped
fresh
S="$HOME/.claude/settings.json"; PREVF="$HOME/.config/herdr-kit/statusline-prev.json"
mkdir -p "$HOME/.claude"
echo '{"statusLine":{"type":"command","command":"node ~/bin/statusline.mjs"}}' > "$S"
HERDR_KIT_PRIVATE=$NOPRIV "$REPO/install.sh" --hooks </dev/null >/dev/null 2>&1
if [ "$(jget "$S" statusLine.command)" = "node \"$REPO/claude/statusline.mjs\"" ] && [ "$(jget "$PREVF" statusLine.command)" = "node ~/bin/statusline.mjs" ]; then
  pass "a user's ~/bin/statusline.mjs is wrapped"
else
  fail "a user's ~/bin/statusline.mjs is wrapped"
fi
# --no-hooks never touches the status line
fresh
S="$HOME/.claude/settings.json"; PREVF="$HOME/.config/herdr-kit/statusline-prev.json"
mkdir -p "$HOME/.claude"
echo '{"statusLine":{"type":"command","command":"~/.claude/line.sh"}}' > "$S"
"$REPO/install.sh" --no-hooks </dev/null >/dev/null 2>&1
if [ "$(jget "$S" statusLine.command)" = "~/.claude/line.sh" ] && [ ! -e "$PREVF" ]; then pass "--no-hooks leaves the status line alone"; else fail "--no-hooks leaves the status line alone"; fi

# private/: its settings and mods are linked, its config keys merged where absent, and its add-on block placed
if [ -n "$HAS_PRIVATE" ]; then
fresh
mkdir -p "$HOME/.config/herdr-kit"
(umask 077 && echo '{"discord_webhook":"keep-me","deck":false}' > "$HOME/.config/herdr-kit/config.json")
OUT="$("$REPO/install.sh" 2>&1)"; RC=$?
CFG="$HOME/.config/herdr-kit/config.json"
if [ $RC -eq 0 ] && [ "$(readlink "$HERDR_APP_HOME/settings.json")" = "$REPO/private/settings.json" ] \
  && [ "$(readlink "$HERDR_APP_HOME/mods/kit-private")" = "$REPO/private/mods/kit-private" ] \
  && [ "$(readlink "$HERDR_APP_HOME/mods/kit-day")" = "$REPO/private/mods/kit-day" ]; then
  pass "private: links settings.json, kit-private and kit-day"
else
  fail "private: links settings.json, kit-private and kit-day"
fi
if [ "$(jget "$CFG" discord_webhook)" = "keep-me" ] && [ "$(jget "$CFG" deck)" = "false" ] \
  && [ "$(jget "$CFG" addons)" = '["kit-private"]' ] && [ "$(jget "$CFG" pr_status)" = "true" ] \
  && [ "$(stat -f %Lp "$CFG")" = "600" ]; then
  pass "private: config keys added where absent, set ones kept"
else
  fail "private: config keys added where absent, set ones kept"
fi
if grep -q '"addon-kit-private"' "$HERDR_APP_HOME/layouts/scruffy.json" \
  && grep -q '"addon-kit-private"' "$HOME/.config/herdr-kit/layout-focus.json"; then
  pass "private: the kit layout gets the kit-private block"
else
  fail "private: the kit layout gets the kit-private block"
fi
if "$REPO/install.sh" --check >/dev/null 2>&1; then pass "private: check clean"; else fail "private: check clean"; fi
rm "$HERDR_APP_HOME/mods/kit-private"
if "$REPO/install.sh" --check 2>&1 | grep -q "DRIFT .*mods/kit-private"; then pass "private: check reports a missing private mod"; else fail "private: check reports a missing private mod"; fi

# private/ on a fresh machine (no user config yet): the example's empty addons list still gets kit-private
fresh
"$REPO/install.sh" >/dev/null 2>&1
CFG="$HOME/.config/herdr-kit/config.json"
if node -e 'const a=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).addons;process.exit(Array.isArray(a)&&a.includes("kit-private")?0:1)' "$CFG" \
  && grep -q '"addon-kit-private"' "$HERDR_APP_HOME/layouts/scruffy.json"; then
  pass "private: a fresh install turns kit-private on"
else
  fail "private: a fresh install turns kit-private on"
fi
echo '{"addons":["kit-mine"]}' > "$CFG"
"$REPO/install.sh" >/dev/null 2>&1
if [ "$(jget "$CFG" addons)" = '["kit-mine","kit-private"]' ]; then pass "private: kit-private joins the user's addons, theirs first"; else fail "private: kit-private joins the user's addons, theirs first"; fi
echo '{"addons":[]}' > "$CFG"
if "$REPO/install.sh" --check 2>&1 | grep -q "DRIFT .*addons lacks kit-private"; then pass "private: check reports kit-private missing from addons"; else fail "private: check reports kit-private missing from addons"; fi

# private/herdr/: a scene picture or glyph layer there is linked over the kit's, core --check calls it an override, private --check reports it
fresh
"$REPO/install.sh" >/dev/null 2>&1
OVR="backgrounds/small-moon.jpg backgrounds/small-moon-day.jpg backgrounds/thumbs/small-moon.jpg backgrounds/thumbs/small-moon-day.jpg glyphs/small-moon-body.svg glyphs/small-moon-edge.svg glyphs/small-moon-light.svg glyphs/small-moon-mover.svg"
ok=1
for rel in $OVR; do
  [ -f "$REPO/private/herdr/$rel" ] && [ "$(readlink "$HERDR_APP_HOME/$rel")" = "$REPO/private/herdr/$rel" ] || ok=""
done
if [ -n "$ok" ] && [ "$(readlink "$HERDR_APP_HOME/backgrounds/twin-suns.jpg")" = "$REPO/herdr/backgrounds/twin-suns.jpg" ]; then
  pass "private: its scene pictures and glyph layers are linked over the kit's, the rest stay the kit's"
else
  fail "private: its scene pictures and glyph layers are linked over the kit's, the rest stay the kit's"
fi
OUT="$("$REPO/install.sh" --check 2>&1)"; RC=$?
if [ $RC -eq 0 ] && echo "$OUT" | grep -qxF "ok    $HERDR_APP_HOME/backgrounds/small-moon.jpg (private override)" \
  && echo "$OUT" | grep -qxF "ok    $HERDR_APP_HOME/backgrounds/thumbs/small-moon-day.jpg (private override)" \
  && echo "$OUT" | grep -qxF "ok    $HERDR_APP_HOME/glyphs/small-moon-light.svg (private override)" \
  && ! echo "$OUT" | grep -q "DRIFT"; then
  pass "private: core check calls an overridden picture a private override, not drift"
else
  fail "private: core check calls an overridden picture a private override, not drift"
fi
OUT="$(bash "$REPO/private/install.sh" --check 2>&1)"; RC=$?
if [ $RC -eq 0 ] && echo "$OUT" | grep -qxF "ok    $HERDR_APP_HOME/backgrounds/small-moon.jpg" \
  && echo "$OUT" | grep -qxF "ok    $HERDR_APP_HOME/backgrounds/thumbs/small-moon.jpg" \
  && echo "$OUT" | grep -qxF "ok    $HERDR_APP_HOME/glyphs/small-moon-mover.svg"; then
  pass "private: private check reports its picture and glyph links"
else
  fail "private: private check reports its picture and glyph links"
fi
OUT="$("$REPO/install.sh" 2>&1)"
if ! echo "$OUT" | grep -q "linked .*small-moon" && ! ls -d "$HOME"/.config/herdr-kit/backup/* >/dev/null 2>&1; then
  pass "private: a rerun leaves the picture overrides in place, no relinks or backups"
else
  fail "private: a rerun leaves the picture overrides in place, no relinks or backups"
fi
# pointed back at the kit's picture: private check calls it drift
rm "$HERDR_APP_HOME/backgrounds/small-moon.jpg"
ln -s "$REPO/herdr/backgrounds/small-moon.jpg" "$HERDR_APP_HOME/backgrounds/small-moon.jpg"
if bash "$REPO/private/install.sh" --check 2>&1 | grep -qxF "DRIFT $HERDR_APP_HOME/backgrounds/small-moon.jpg"; then
  pass "private: private check flags a picture that lost its override"
else
  fail "private: private check flags a picture that lost its override"
fi
rm "$HERDR_APP_HOME/glyphs/small-moon-body.svg"
ln -s "$REPO/herdr/glyphs/small-moon-body.svg" "$HERDR_APP_HOME/glyphs/small-moon-body.svg"
if bash "$REPO/private/install.sh" --check 2>&1 | grep -qxF "DRIFT $HERDR_APP_HOME/glyphs/small-moon-body.svg"; then
  pass "private: private check flags a glyph layer that lost its override"
else
  fail "private: private check flags a glyph layer that lost its override"
fi
# a regular file there is backed up, as for settings.json
rm "$HERDR_APP_HOME/backgrounds/small-moon.jpg"
echo mine > "$HERDR_APP_HOME/backgrounds/small-moon.jpg"
bash "$REPO/private/install.sh" install >/dev/null 2>&1
if [ "$(readlink "$HERDR_APP_HOME/backgrounds/small-moon.jpg")" = "$REPO/private/herdr/backgrounds/small-moon.jpg" ] \
  && [ "$(cat "$HOME"/.config/herdr-kit/backup/*/backgrounds/small-moon.jpg 2>/dev/null)" = "mine" ]; then
  pass "private: backs up a regular file a picture override replaces"
else
  fail "private: backs up a regular file a picture override replaces"
fi
if [ "$(readlink "$HERDR_APP_HOME/glyphs/small-moon-body.svg")" = "$REPO/private/herdr/glyphs/small-moon-body.svg" ]; then
  pass "private: install puts a glyph layer's override back"
else
  fail "private: install puts a glyph layer's override back"
fi
# uninstall takes the overrides off: the kit's own pictures are linked back
"$REPO/install.sh" --uninstall >/dev/null 2>&1
ok=1
for rel in $OVR; do
  [ "$(readlink "$HERDR_APP_HOME/$rel")" = "$REPO/herdr/$rel" ] || ok=""
done
if [ -n "$ok" ]; then pass "private: uninstall removes the picture and glyph overrides, the kit's own linked back"; else fail "private: uninstall removes the picture and glyph overrides, the kit's own linked back"; fi

# private/keys.json: cmd-shift-j presses day; a user's own binding is left alone and printed; uninstall removes ours
fresh
K="$HERDR_APP_HOME/keys.json"
echo '{"global":{"cmd-q":"app.quit","cmd-shift-j":"herdr-signals.day"}}' > "$K"
"$REPO/install.sh" >/dev/null 2>&1
if [ "$(jget "$K" "global.cmd-shift-j")" = "herdr-signals.press-day" ] && [ "$(jget "$K" "global.cmd-q")" = "app.quit" ]; then
  pass "private: binds cmd-shift-j to press-day (an old herdr-signals.day moves over)"
else
  fail "private: binds cmd-shift-j to press-day (an old herdr-signals.day moves over)"
fi
"$REPO/install.sh" --uninstall >/dev/null 2>&1
if [ -z "$(jget "$K" "global.cmd-shift-j")" ] && [ "$(jget "$K" "global.cmd-q")" = "app.quit" ]; then pass "private: uninstall removes cmd-shift-j"; else fail "private: uninstall removes cmd-shift-j"; fi
fresh
K="$HERDR_APP_HOME/keys.json"
echo '{"global":{"cmd-shift-j":"tab.new"}}' > "$K"
OUT="$("$REPO/install.sh" 2>&1)"
if [ "$(jget "$K" "global.cmd-shift-j")" = "tab.new" ] && echo "$OUT" | grep -q "left global cmd-shift-j alone"; then
  pass "private: a user's cmd-shift-j is left alone and reported"
else
  fail "private: a user's cmd-shift-j is left alone and reported"
fi
"$REPO/install.sh" --uninstall >/dev/null 2>&1
if [ "$(jget "$K" "global.cmd-shift-j")" = "tab.new" ]; then pass "private: uninstall keeps a user's cmd-shift-j"; else fail "private: uninstall keeps a user's cmd-shift-j"; fi
fi

# without private/: no settings.json or private mods linked, an old link into herdr/ that went is removed, and install exits 0
fresh
PUB="$(mktemp -d)/kit"
mkdir -p "$PUB"
tar -C "$REPO" --exclude=.git --exclude=node_modules --exclude=./private -cf - . | tar -C "$PUB" -xf -
ln -s "$PUB/herdr/settings.json" "$HERDR_APP_HOME/settings.json"   # an install from before the move
mkdir -p "$HERDR_APP_HOME/mods"
ln -s "$PUB/herdr/mods/kit-day" "$HERDR_APP_HOME/mods/kit-day"
echo '{"global":{"cmd-q":"app.quit","cmd-shift-j":"herdr-signals.day"}}' > "$HERDR_APP_HOME/keys.json"
OUT="$("$PUB/install.sh" 2>&1)"; RC=$?
if [ $RC -eq 0 ] && [ ! -e "$HERDR_APP_HOME/settings.json" ] && [ ! -L "$HERDR_APP_HOME/settings.json" ] \
  && [ ! -L "$HERDR_APP_HOME/mods/kit-day" ] && [ ! -e "$HERDR_APP_HOME/mods/kit-private" ] \
  && [ -L "$HERDR_APP_HOME/mods/herdr-signals" ] && [ -f "$HERDR_APP_HOME/layouts/scruffy.json" ] \
  && ! grep -q addon- "$HERDR_APP_HOME/layouts/scruffy.json"; then
  pass "no private/: nothing private linked, dead links removed, exit 0"
else
  fail "no private/: nothing private linked, dead links removed, exit 0"
fi
if [ -z "$(jget "$HERDR_APP_HOME/keys.json" "global.cmd-shift-j")" ] && [ "$(jget "$HERDR_APP_HOME/keys.json" "global.cmd-shift-u")" = "herdr-signals.urgent" ] \
  && ! echo "$OUT" | grep -q "cmd-shift-j"; then
  pass "no private/: no cmd-shift-j (the old day binding dropped), none in the keys line"
else
  fail "no private/: no cmd-shift-j (the old day binding dropped), none in the keys line"
fi
CHK0="$("$PUB/install.sh" --check 2>&1)"
if "$PUB/install.sh" --check >/dev/null 2>&1; then pass "no private/: check clean"; else fail "no private/: check clean"; fi
if [ "$(readlink "$HERDR_APP_HOME/backgrounds/small-moon.jpg")" = "$PUB/herdr/backgrounds/small-moon.jpg" ] \
  && [ "$(readlink "$HERDR_APP_HOME/backgrounds/thumbs/small-moon-day.jpg")" = "$PUB/herdr/backgrounds/thumbs/small-moon-day.jpg" ]; then
  pass "no private/: the kit's own scene pictures are linked"
else
  fail "no private/: the kit's own scene pictures are linked"
fi
if [ "$(readlink "$HERDR_APP_HOME/glyphs/small-moon-light.svg")" = "$PUB/herdr/glyphs/small-moon-light.svg" ] \
  && echo "$CHK0" | grep -qxF "ok    $HERDR_APP_HOME/glyphs/small-moon-light.svg"; then
  pass "no private/: the kit's own glyph layers are linked, and check calls them ok"
else
  fail "no private/: the kit's own glyph layers are linked, and check calls them ok"
fi
# a pull that changes the file behind a glyph link (the link itself unchanged) asks for a restart
"$PUB/install.sh" --no-hooks >/dev/null 2>&1
cp "$PUB/herdr/glyphs/small-moon-mover.svg" "$PUB/mover.keep"
echo '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 14 14" fill="currentColor"/>' > "$PUB/herdr/glyphs/small-moon-mover.svg"
OUT="$("$PUB/install.sh" --no-hooks 2>&1)"
if [ "$(echo "$OUT" | grep -cxF "restart Herdr to load new glyph art")" = "1" ]; then
  pass "no private/: changed glyph art behind a link asks for a restart"
else
  fail "no private/: changed glyph art behind a link asks for a restart"
fi
mv "$PUB/mover.keep" "$PUB/herdr/glyphs/small-moon-mover.svg"

# a link left by an older private override, whose file is gone with private/: check flags it, install puts the kit's picture back
ln -sf "$PUB/private/herdr/backgrounds/small-moon.jpg" "$HERDR_APP_HOME/backgrounds/small-moon.jpg"
ln -sf "$PUB/private/herdr/glyphs/small-moon-mover.svg" "$HERDR_APP_HOME/glyphs/small-moon-mover.svg"
CHK="$("$PUB/install.sh" --check 2>&1)"
"$PUB/install.sh" --no-hooks >/dev/null 2>&1
if echo "$CHK" | grep -qxF "DRIFT $HERDR_APP_HOME/backgrounds/small-moon.jpg" \
  && echo "$CHK" | grep -qxF "DRIFT $HERDR_APP_HOME/glyphs/small-moon-mover.svg" \
  && [ "$(readlink "$HERDR_APP_HOME/glyphs/small-moon-mover.svg")" = "$PUB/herdr/glyphs/small-moon-mover.svg" ] \
  && [ "$(readlink "$HERDR_APP_HOME/backgrounds/small-moon.jpg")" = "$PUB/herdr/backgrounds/small-moon.jpg" ]; then
  pass "no private/: a dead override link is drift, and install puts the kit's picture back"
else
  fail "no private/: a dead override link is drift, and install puts the kit's picture back"
fi

# leftovers in herdr/ (Herdr wrote type stubs into an old mods/kit-day and a settings.json through
# a dead link): a mods/ folder without a mod.json and a top-level settings.json are never linked,
# an old link to either goes, and --check doesn't ask for them
fresh
mkdir -p "$PUB/herdr/mods/kit-day"
echo '// stub' > "$PUB/herdr/mods/kit-day/herdr.d.ts"
echo '{"appearance":"dark"}' > "$PUB/herdr/settings.json"
mkdir -p "$HERDR_APP_HOME/mods"
ln -s "$PUB/herdr/settings.json" "$HERDR_APP_HOME/settings.json"
ln -s "$PUB/herdr/mods/kit-day" "$HERDR_APP_HOME/mods/kit-day"
OUT="$("$PUB/install.sh" --no-hooks 2>&1)"; RC=$?
if [ $RC -eq 0 ] && [ ! -L "$HERDR_APP_HOME/settings.json" ] && [ ! -e "$HERDR_APP_HOME/settings.json" ] \
  && [ ! -L "$HERDR_APP_HOME/mods/kit-day" ] && [ ! -e "$HERDR_APP_HOME/mods/kit-day" ] \
  && [ -L "$HERDR_APP_HOME/mods/kit-rail" ]; then
  pass "leftovers: no link to herdr/settings.json or a mods/ folder without mod.json, old ones removed"
else
  fail "leftovers: no link to herdr/settings.json or a mods/ folder without mod.json, old ones removed"
fi
CHK="$("$PUB/install.sh" --check 2>&1)"; RC=$?
if [ $RC -eq 0 ] && ! echo "$CHK" | grep -q "settings.json$\|mods/kit-day"; then pass "leftovers: check neither lists nor asks for them"; else fail "leftovers: check neither lists nor asks for them"; fi
rm -rf "$PUB/herdr/mods/kit-day" "$PUB/herdr/settings.json"

# no card hook in the checkout (the public cut) and run_cards on: a note, the name hook only, check clean
fresh
rm -f "$PUB/claude/card-hook.mjs"
mkdir -p "$HOME/.config/herdr-kit"
echo '{"run_cards":true}' > "$HOME/.config/herdr-kit/config.json"
OUT="$("$PUB/install.sh" --hooks </dev/null 2>&1)"; RC=$?
S="$HOME/.claude/settings.json"
if [ $RC -eq 0 ] && echo "$OUT" | grep -q "no claude/card-hook.mjs: skipped the card hook" \
  && [ "$(hookcount "$S")" = "6" ] && [ "$(cardcount "$S")" = "" ]; then
  pass "no card hook: run_cards on prints a note and adds the name hook only"
else
  fail "no card hook: run_cards on prints a note and adds the name hook only"
fi
if "$PUB/install.sh" --check 2>&1 | grep -q "ok    $S (name hook)"; then pass "no card hook: check wants the name hook only"; else fail "no card hook: check wants the name hook only"; fi
# the same with an overlay script: the overlay brings its own card hook, so no note
fresh
OVL="$(mktemp -d)/install.sh"
printf '#!/usr/bin/env bash\nexit 0\n' > "$OVL"
mkdir -p "$HOME/.config/herdr-kit"
echo '{"run_cards":true}' > "$HOME/.config/herdr-kit/config.json"
OUT="$(HERDR_KIT_PRIVATE=$OVL "$PUB/install.sh" </dev/null 2>&1)"; RC=$?
if [ $RC -eq 0 ] && ! echo "$OUT" | grep -q "card-hook.mjs" && [ "$(hookcount "$HOME/.claude/settings.json")" = "6" ]; then
  pass "no card hook, an overlay present: no card hook note"
else
  fail "no card hook, an overlay present: no card hook note"
fi

# Herdr version: install warns on any Herdr other than the tested one, then carries on.
fake main
echo "0.1.16" > "$FAKEBIN/version"
OUT="$(run_fake)"; RC=$?
if [ $RC -eq 0 ] && echo "$OUT" | grep -q "warning: tested with Herdr 0.1.15, found 0.1.16"; then
  pass "another Herdr version: install warns and carries on"
else
  fail "another Herdr version: install warns and carries on"
fi
echo "0.1.15" > "$FAKEBIN/version"
fake main
if run_fake | grep -q "warning: tested with Herdr"; then fail "the tested Herdr version: no warning"; else pass "the tested Herdr version: no warning"; fi
printf '0.1.15 (abc123)\nupdate available: 0.2.0\n' > "$FAKEBIN/version"
fake main
if run_fake | grep -q "warning: tested with Herdr"; then fail "the tested Herdr version with extra text: no warning"; else pass "the tested Herdr version with extra text: no warning"; fi
rm -f "$FAKEBIN/version"

# the first install names the config it made, with no Discord hint (Discord is an opt-in extra)
fresh
OUT="$("$REPO/install.sh" 2>&1)"
if echo "$OUT" | grep -q "created $HOME/.config/herdr-kit/config.json (optional settings: README, Config)" && ! echo "$OUT" | grep -qi discord; then
  pass "first install names the config, no Discord hint"
else
  fail "first install names the config, no Discord hint"
fi

# An overlay outside the checkout (HERDR_KIT_PRIVATE): its picture over the kit's is an override, not drift
fresh
OV="$(mktemp -d)"
mkdir -p "$OV/herdr/backgrounds"
cp "$REPO/herdr/backgrounds/bespin.jpg" "$OV/herdr/backgrounds/bespin.jpg"
cat > "$OV/install.sh" <<'SH'
[ "$1" = install ] || exit 0
ln -sfn "$(cd "$(dirname "$0")" && pwd)/herdr/backgrounds/bespin.jpg" "$HERDR_APP_HOME/backgrounds/bespin.jpg"
SH
HERDR_KIT_PRIVATE="$OV/install.sh" "$REPO/install.sh" --no-hooks </dev/null >/dev/null 2>&1
HERDR_KIT_PRIVATE="$OV/install.sh" "$REPO/install.sh" --no-hooks </dev/null >/dev/null 2>&1
OUT="$(HERDR_KIT_PRIVATE="$OV/install.sh" "$REPO/install.sh" --check </dev/null 2>&1)"
OVPIC="$(cd "$OV" && pwd)/herdr/backgrounds/bespin.jpg"
if [ "$(readlink "$HERDR_APP_HOME/backgrounds/bespin.jpg")" = "$OVPIC" ] \
  && echo "$OUT" | grep -q "^ok .*bespin.jpg (private override)" \
  && ! echo "$OUT" | grep -q "DRIFT .*bespin.jpg"; then
  pass "an overlay outside the checkout keeps its picture override"
else
  fail "an overlay outside the checkout keeps its picture override"
fi

echo
if [ $FAILS -eq 0 ]; then echo "all passed"; exit 0; else echo "$FAILS failed"; exit 1; fi
