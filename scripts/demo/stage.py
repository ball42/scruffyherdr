#!/usr/bin/env python3
"""Stage the README screenshot demo in a running Herdr window: four spaces of
pretend Claudes (waiting, working, done, idle) with names, a permission ask
and a decision card, all in /tmp so no personal path shows.

Run it against an isolated test window, never your own Herdr:
  HOME=<test home> HERDR_APP_HOME=<test app home> python3 scripts/demo/stage.py
It writes the names herdr-signals reads to $HOME/.config/herdr-kit/names/.
"""
import json, os, subprocess, sys, time

AGENT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "agent.sh")
if not os.environ.get("HERDR_APP_HOME"):
    sys.exit("stage.py: set HERDR_APP_HOME (and HOME) to a test window's, not your own")
NAMES = os.path.join(os.environ["HOME"], ".config/herdr-kit/names")
os.makedirs(NAMES, exist_ok=True)
NOW = int(time.time() * 1000)


def do(cmd, args):
    r = subprocess.run(["herdr-app", "do", cmd, json.dumps(args)], capture_output=True, text=True)
    return json.loads(r.stdout or "{}")


def name(terminal, title, **extra):
    rec = {"name": title, "hint": None, "session_id": "demo-" + terminal, "at": NOW, "ask": None,
           "tool": None, "card": None, "runs": [], "asks": [], "note_turn": False, "ask_turn": False,
           "menu": None, "perm": None, "ask_text": None, "said": None}
    rec.update(extra)
    with open(os.path.join(NAMES, terminal + ".json"), "w") as f:
        json.dump(rec, f)


PLAN = [
    ("weather-app", [
        ("blocked", "radar overlay", ["● Running the tile tests before I touch the overlay.", "", "  Bash(npm test -- radar)", "",
                                      "  Allow this command?", "  ❯ 1. Yes", "    2. Yes, and don't ask again", "    3. No"],
         {"perm": {"tool": "Bash", "detail": "npm test -- radar"}}),
        ("working", "hourly chart", ["● Reading src/charts/hourly.ts", "● Adding a 48-hour window with a now marker", "",
                                     "  ✻ Drawing… (34s)"], {}),
    ]),
    ("garden-log", [
        ("done", "photo resize", ["● Photos over 4 MB are resized to 2048 px on upload.", "  Tests: 41 passed", "",
                                  "  Ready for review: PR #212"], {}),
    ]),
    ("notes-cli", [
        ("working", "sync conflicts", ["● Two edits to the same note now merge line by line.", "",
                                       "  ✻ Running the merge fixtures… (1m 12s)"], {}),
        ("blocked", "release notes", ["● Which version should this release be?", "", "  ❯ 1. 0.9.0 (new sync)",
                                      "    2. 0.8.3 (fixes only)"],
         {"card": "decide", "ask_text": "Which version should this release be?"}),
    ]),
    ("recipes", [
        ("idle", "import from URL", ["● Imports now read schema.org Recipe data, with a fallback to the page text.", "", "> "], {}),
    ]),
]

for space, agents in PLAN:
    sp = None
    for state, title, lines, extra in agents:
        argv = [AGENT, state, title] + lines
        r = do("space.new", {"name": space, "folder": "/tmp", "argv": argv}) if sp is None \
            else do("tab.new", {"space": sp, "folder": "/tmp", "argv": argv})
        sp = sp or r.get("space")
        t = r.get("terminal")
        print(space, title, t or r.get("error"))
        if t:
            name(t, title, **extra)
