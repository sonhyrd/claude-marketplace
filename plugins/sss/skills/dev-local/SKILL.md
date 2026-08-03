---
name: dev-local
description: >-
  Make a fresh checkout or worktree actually bootable, and prove it. Gives every port to portless so
  no component holds a port literal, emits a preflight that refuses with the exact fix instead of
  attempting sudo or silently repairing, replaces hand-rolled port-discovery heuristics with
  `portless get`, and ends in a Liveness Proof — one authenticated 2xx through the app's own API
  layer, which is the only evidence that bring-up worked. Use when a fresh worktree will not start,
  when two worktrees fight over the same port, when the dev server serves a 200 on `/` while every
  proxied API call returns 502 or 401, when an e2e run stalls at bring-up, when a script guesses
  which port the dev server is on, or when the user asks to set up, provision, or fix local
  development for a repo. No tmux. It writes files into the working tree and commits nothing.
argument-hint: "[path-to-repo]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Grep
  - Glob
  - Bash(git:*)
  - Bash(portless:*)
  - Bash(pnpm:*)
  - Bash(npm:*)
  - Bash(curl:*)
  - Bash(node:*)
---

# dev-local

Take a repo from "just checked out" to Bring-up, and prove it with a Liveness Proof.

The failure this exists to prevent: an e2e run stalled at bring-up because the worktree had no
`.env`, so every proxy returned 502 while the dev server built and served fine. A 200 on `/`, a
registered route and a green `portless doctor` are **all compatible with a completely dead backend**
— none of them crosses the proxy layer where the fault lives.

Vocabulary — Local Config, Bring-up, Liveness Proof, Lease — is defined in
[config-schema's vocabulary](../config-schema/references/vocabulary.md), which owns those terms.

## Prerequisites

- **[portless](https://github.com/vercel-labs/portless)** installed, Node 24+.
- **Run [`config-schema`](../config-schema/SKILL.md) first** where run-time config is also broken.
  Ports are this skill's job; missing config keys are not, and a repo can fail bring-up for either.

## Non-negotiables

- **Refuse, never repair.** Never attempt `sudo`, never write to a trust store, never install a
  daemon. Print the exact command and exit non-zero. On a headless box with no TTY this is the only
  correct behaviour, and portless already refuses this way — do not wrap or swallow it.
- **No tmux.** No log parsing, no readiness polling, no port discovery. portless makes all of it
  unnecessary, and it was most of what the reference implementations spent their code on.
- **No port literal anywhere.** Not in a config, not in a script, not in a comment as "usually 3000".
- **Never print a secret**, and never echo a minted token.
- **Commit nothing.** Files land unstaged; review is `git diff`.

## Steps

### 1. Preflight — refuse with the exact fix

Check, and on any failure print the fix and stop:

| check | fix to print |
|---|---|
| `portless` on PATH | `npm install -g portless` |
| Node ≥ 24 | portless requires it |
| proxy reachable | `portless proxy start` — and if privileged ports are refused, the unprivileged form: `portless proxy start --port 1355 --https --wildcard` |
| CA trusted for Node clients | `NODE_EXTRA_CA_CERTS="${PORTLESS_CA:-$HOME/.portless/ca.pem}"` |
| `NODE_ENV` explicitly set | `devDefault` is unreachable when it is unset — deliberately |

`--wildcard` is required for any app that is multi-tenant by subdomain.

### 2. Give ports to portless

Add `portless.json` naming the app and the underlying script — the real dev command keeps its own
name and gains no port flag:

```json
{ "name": "<app>", "script": "dev:server" }
```

```
"dev":        "portless run"        // or PORTLESS_WILDCARD=1 portless run
"dev:server": "<the real dev command, no --port>"
```

**Remove every `--port` flag from dev scripts.** An explicit `--port` beats portless's injected
`PORT` and silently reintroduces the collision. A variant like `"dev:agent": "... --port 3000"` is
exactly the trap.

### 3. Replace port-discovery heuristics with `portless get`

Search the repo for scripts that guess where the server is — `lsof` over listening ports, curling
candidates looking for a marker, "take the lowest port because workers grab higher ones". Replace
each with `portless get <name>`.

`portless get` is a pure function of cwd and app name, so it resolves **before the server is up** —
which is exactly when a test runner's `webServer.url` needs it. Keep any "never starts a server"
constraint such a script already has; it just stops guessing.

### 4. One URL for the test runner

`baseURL` and `webServer.url` must be the **same resolved value**, in this order:

```
E2E_BASE_URL  →  PORTLESS_URL (set when the runner is a child of `portless run`)  →  portless get <name>
```

Two different hosts here is how a run passes against a server nobody is testing. If resolution
fails, throw naming `portless doctor` rather than falling back to a literal.

Browser and Node need different CA treatment, and both are needed:

- Browser: `ignoreHTTPSErrors: true` covers Chromium not trusting the local CA.
- Node: it does **not** cover direct API calls from test helpers — set `NODE_EXTRA_CA_CERTS`.

### 5. Liveness Proof

One authenticated request through the app's **own** API layer, expecting 2xx — and the same request
**without** credentials, expecting 401.

The negative case is not optional. Without it, a 200 proves only that something answered; the pair
proves the app's proxy layer is answering, which is the exact thing every other signal misses.

Ordering, which is not circular: lease or load secrets → mint the token against the upstream
directly → start the server through portless → prove liveness with the token.

### 6. Report

State plainly which checks passed, whether the Liveness Proof returned 2xx **and** whether the
unauthenticated request returned 401. If bring-up did not complete, say so and name the blocker. Do
not report success on a green dev server alone — that is the claim that hid the 502s.

## Secrets

v1 emits **no secret wrapper**. `agent-native vault exec` is a specification, not a shipped binary —
verified against the `agent-native` source, which has an in-app encrypted `app_secrets` store but no
`vault` CLI. Secrets reach processes by whatever mechanism the repo already uses. See
[ADR 0003](../../../../docs/adr/0003-dev-local-v1-ships-without-vault-exec.md).

When it does ship, the rule is fixed and must not be softened: **never `export` a secret and then
send a command into a shell.** The process's command line must *be* the `vault exec` invocation, so
only key names are ever visible. `config-schema`'s `class: 'secret'` output is already the `--key`
list.

## Known limits

- `portless`'s worktree prefix uses only the branch's **last path segment**
  (`sonhyrd/ABC-123` → `ABC-123`), and `main`/`master` get no prefix. Collision-free only for
  distinct last segments — flag it rather than assuming uniqueness.
- Prefixes apply only in a *linked* worktree, when `git worktree list` shows more than one.
- A proxy started once with `sudo` can permanently break unprivileged certificate generation
  (`fixOwnership` does not cover `ca.srl`): 0-byte certs, dead handshakes, a silent proxy log, and a
  **green** `portless doctor`. If handshakes fail while doctor is green, check ownership under
  `~/.portless` before anything else.
- One-time machine provisioning has no owner. This skill prints the command; nothing runs it.
