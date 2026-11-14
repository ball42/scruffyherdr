#!/bin/bash
# A pretend Claude for README screenshots: sets the tab title, reports a
# state over OSC 7501 (as Claude Code's Herdr integration does), prints a
# screen and waits. Started by stage.py.
state=$1; shift; title=$1; shift
printf '\033]0;%s\007' "$title"
printf '\033]7501;state=%s:app=claude-code\007' "$state"
printf '%s\n' "$@"
exec sleep 100000
