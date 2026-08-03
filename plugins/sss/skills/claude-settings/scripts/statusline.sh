#!/bin/bash
# Native Claude Code statusline — reads only the stdin JSON Claude Code provides.
# No binary, no cache scraping, no external API calls. Portable macOS + Linux.
# Deployed by the claude-settings skill to ~/.claude/statusline-native.sh
input=$(cat)

if ! command -v jq >/dev/null 2>&1; then
  printf '\033[91m⚠ jq missing — statusline needs jq\033[0m'
  exit 0
fi

j() { printf '%s' "$input" | jq -r "$1 // empty" 2>/dev/null; }

C_HOST=$'\033[1;91m';  C_MODEL=$'\033[1;96m'; C_THINK=$'\033[95m'
C_GIT=$'\033[1;92m';   C_CTX=$'\033[1;94m';   C_COST=$'\033[1;95m'
C_5H=$'\033[93m';      C_DUR=$'\033[90m'
R=$'\033[0m';          SEP=$'\033[37m | '$R

seg=()

# 🖥 host — only when this machine declares a label (set in its own settings.json env)
[ -n "$CLAUDE_HOST_LABEL" ] && seg+=("${C_HOST}🖥 ${CLAUDE_HOST_LABEL}${R}")

# 🤖 model
model=$(j '.model.display_name')
[ -n "$model" ] && seg+=("${C_MODEL}🤖 ${model}${R}")

# 🧠 thinking effort — live, tracks mid-session /effort
effort=$(j '.effort.level')
seg+=("${C_THINK}🧠 ${effort:-default}${R}")

# 🌿 git branch + clean/dirty
dir=$(j '.workspace.current_dir'); dir="${dir:-$PWD}"
branch=$(git -C "$dir" branch --show-current 2>/dev/null)
if [ -n "$branch" ]; then
  [ -z "$(git -C "$dir" status --porcelain 2>/dev/null)" ] && mark="✓" || mark="*"
  seg+=("${C_GIT}🌿 ${branch} ${mark}${R}")
fi

# ⚡ context window
ctx_pct=$(j '.context_window.used_percentage')
ctx_in=$(j '.context_window.total_input_tokens')
if [ -n "$ctx_pct" ]; then
  tok=$(awk -v t="${ctx_in:-0}" 'BEGIN{ if (t>=1000) printf "%.1fk", t/1000; else printf "%d", t }')
  seg+=("${C_CTX}⚡ ${tok} · ${ctx_pct%.*}%${R}")
fi

# 💰 session cost
cost=$(j '.cost.total_cost_usd')
[ -n "$cost" ] && seg+=("${C_COST}💰 \$$(awk -v c="$cost" 'BEGIN{printf "%.2f", c}')${R}")

# ⏱️ 5-hour rate limit
five=$(j '.rate_limits.five_hour.used_percentage')
[ -n "$five" ] && seg+=("${C_5H}⏱️ ${five%.*}%${R}")

# 🕐 session wall-clock
ms=$(j '.cost.total_duration_ms')
if [ -n "$ms" ]; then
  dur=$(awk -v s=$(( ${ms%.*} / 1000 )) 'BEGIN{
    if (s>=3600) printf "%dh%dm", s/3600, (s%3600)/60;
    else if (s>=60) printf "%dm%ds", s/60, s%60;
    else printf "%ds", s }')
  seg+=("${C_DUR}🕐 ${dur}${R}")
fi

out=""
for s in "${seg[@]}"; do [ -z "$out" ] && out="$s" || out="$out$SEP$s"; done
printf '%s' "$out"
