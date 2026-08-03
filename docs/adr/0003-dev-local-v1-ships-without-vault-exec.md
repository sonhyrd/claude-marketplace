# 3. `dev-local` v1 ships without `agent-native vault exec`

- **Status:** Accepted
- **Date:** 2026-08-03

## Context

The agreed design for `dev-local` (`nuxt-hyrd-chrysus`, `docs/agents/dev-local-standard.md`) says
the generated dev script must **wrap** the long-lived process in
`agent-native vault exec --key K [--app A] -- <cmd>`, so that secrets exist only in the spawned
process's environment and only key names are ever visible. Materialising a `.env` is ruled out by
design.

That design is sound and is not being abandoned. It is being **deferred**, because
`agent-native vault exec` does not exist.

Verified against the `agent-native` source, not its issues: the product has an encrypted
`app_secrets` vault with `saveCredential` / `resolveCredential` / `readAppSecret`, but that is a
**server-side, in-app** store for template apps. There is no `vault` CLI subcommand and no `exec`
subcommand. The contract in `sonhyrd/paul-dispatch-app#11` — the `--key` / `--app` flags, the
all-or-nothing behaviour, the 64–68 lease-failure exit-code block — is a *specification*. The binary
is also not installed on the development Mac, so nothing can be confirmed by running it either.

Auditing the first customer repo removed the urgency. `hyrdrocks/hyrd-widget`'s only genuine secrets
— `JIRA_TOKEN`, `HYRD_ADMIN_LOGIN`, `HYRD_ADMIN_PASSWORD`, `HYRD_TRANS_TOKEN` — are all **Tooling
Scope**, read in `script/` and `.agents/` and never by the application. Its 13 client keys are
`VITE_`-inlined and public by construction. The app needs no secret to boot, so the vault is not on
the critical path for Bring-up.

## Decision

`dev-local` v1 emits: portless ownership of Local Config, a preflight that refuses with the exact
fix, the `portless get` patch replacing the `dev-login` port heuristic, and the Liveness Proof. It
does **not** emit a secret wrapper. Secrets reach processes by whatever mechanism the target repo
already uses.

`Lease` remains in [the vocabulary](../../plugins/sss/skills/config-schema/references/vocabulary.md)
as the named future step, and `config-schema` still classifies `class: 'secret'` keys — so the
`--key` list is ready the day the binary ships.

## Considered options

- **Generate the wrapper anyway, behind a preflight that refuses when `agent-native` is absent.**
  Rejected: every flag would be copied from an issue and unverified against a binary. If the shipped
  CLI differs, every repo the skill has touched carries a wrong dev script. Generating against a
  written contract instead of verified source is the specific mistake this project has already
  corrected for twice.
- **Implement `vault exec` in agent-native first.** Correct ordering in principle, but it makes a
  marketplace skill block on a feature in a separate product on an unknown timeline.

## Consequences

- The rule "never materialise a `.env`, wrap the process instead" is documented but **enforced by
  nothing** in v1. This is the real cost and should not be described as solved.
- The motivating failure is unaffected: the `/e2e:pw-prove` Step 3 stall was a 502 from a missing
  upstream URL, which portless ownership and the Liveness Proof address on their own.
