#!/bin/sh
# PreToolUse(Bash) -> rtk hook claude
#
# rtk rewrites bash commands, so its stdout and exit code are meaningful:
# exec through to it rather than wrapping. When rtk is not installed
# (fresh VPS, CI), drain stdin and succeed so Bash is never blocked.
#
# Env: SSS_HOOKS_DISABLED=1 disables. SSS_RTK_BIN overrides the binary.

if [ "${SSS_HOOKS_DISABLED:-0}" = "1" ]; then
	cat >/dev/null 2>&1 || :
	exit 0
fi

rtk_bin="${SSS_RTK_BIN:-rtk}"
if command -v "$rtk_bin" >/dev/null 2>&1; then
	exec "$rtk_bin" hook claude
fi

cat >/dev/null 2>&1 || :
exit 0
