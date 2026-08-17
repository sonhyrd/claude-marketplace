# The first live proof — pw-prove against a real pull request (`#47`)

Everything in `#33` up to this point was reconstructed: measured on fixtures, at the process
boundary, or rescued from a prior session's write-up. This is the first time the built-proof-target
pipeline was pointed at a real application and asked to produce a proof.

**Application:** a Nuxt 4 / Nitro / Vite 8 (Rolldown) multi-tenant recruiting product, on a real open
pull request adding a flag-gated salary (compensation) section to its job editor. 2,015 jobs on the
tenant, 152 API endpoints on the surface under proof. Called *the application* below.

**Run shape:** Steps 1 through 7 of `skills/pw-prove/SKILL.md` at version `0.11.0`, executed as
written. Step 8's delivery was deliberately not run — the deliverable here is the run and its
verdict, not a shipped proof.

**Isolation.** The proof ran in a throwaway `git worktree` cut from the pull request's commit, so the
application's own checkout was never written to. Machine: 8 cores, load average 3.4–6.7 throughout
(other work was running); every number below was measured under that load, not on an idle box.

---

## Part 1 — the numbers, against the numbers this work was justified by

### Bring-up

| Phase | Expected | Measured | Verdict |
|---|---|---|---|
| Config validation | fails in seconds, names the keys | **91 ms** to `exit 4` naming 11 keys; **30 ms** to `CONFIG=ok` once the contract was corrected | as designed |
| Build, cold | 104–201 s | **87 s** (two further forced builds: 87 s, 101 s) | **faster than the low end of the band** |
| Build, reused | pays nothing | **420 ms**, `BUILD_REUSE=hit`, `BUILD_SAVED_SECONDS=87` | as designed |
| Preview serve poll | 20 s budget, binds in under a second | **106 ms**, `READY=yes`, port read from the server's own announcement | as designed |
| **Total cold bring-up** | — | **≈ 88 s** | |

**The development-server control inverts the premise.** `#33` justifies the trade partly by accepting
that bring-up gets slower: a 104–201 s build against a 56 s development-server median. On this
application `pnpm dev` took **100 s to answer its first request** — Nitro built in 17.6 s, the Vite
client warmed up in 61.2 s — against **88 s** for build-plus-preview. The built target was not the
slower bring-up here; it was the faster one. One application is not a median, but the 56 s figure
does not describe this one.

### Navigation — and a measurement error in the justification

| | Server-side (`curl`) | In a browser (`probe.mjs navigate`, warm) |
|---|---|---|
| Built + preview | **6–10 ms** (152 ms on the process's very first hit) | **0.98 / 1.06 / 1.09 s** |
| `pnpm dev` | **17–56 ms** | **1.68 / 3.03 / 3.81 s** |

The `14 ms` first-hit and repeat-hit figures this work was justified by are **server-side response
times**, and the `4.26 s` repeat-hit figure they are compared against is a **browser page load**.
Those are not the same measurement, and the comparison overstates the gain by roughly two orders of
magnitude. Measured like against like on this application:

- server-side, built beats development by ~3–6× (10 ms against 17–56 ms), not 300×;
- in a browser, built beats development by ~2–4× (1.0 s against 1.7–3.8 s).

The gain is real and it is worth having. It is not the gain the arithmetic in `#33` claims, and the
claim should be restated in browser terms before it is relied on again. The residual second in the
built target's browser load is hydration plus **262 asset/script requests** — the module graph is
bundled, not absent.

### Spec run, and the verdict parity check

| Target | Result |
|---|---|
| Built + preview | **3 passed in 40.7 s** (wall clock 42.4 s) |
| `pnpm dev`, same spec, same bound recording | **3 failed in 379 s** — all three timed out at 120 s, the page never left its loading splash |

`#39` closed on the finding that the proof target could change without the verdict changing. **On
this application it does not hold.** The development server could not render the surface under proof
inside a 120 s per-test budget at all, so there is no development-server verdict to compare against
— not a different verdict, no verdict. That is the strongest single argument for the built target
found so far, and it arrived from the direction nobody was watching.

### Mutation check

One bounded source mutation: the `min > max` branch deleted from `validateCompensation`.

| Step | Measured |
|---|---|
| Forced rebuild after mutating (`BUILD_REUSE=never`) | **87 s** |
| Mutation spec run (`-g`, isolated `--output`) | **18.7 s** |
| Forced rebuild after reverting | **101 s** |
| **Cycle total** | **≈ 207 s** |

Expected was "roughly 635 s observed". Measured is **a third of that**, on the same class of
application. The verdict was **RED** — `expect(locator).toHaveText` failed with *element(s) not
found*, because the hint the mutation removed no longer renders. The tree was verified byte-identical
to its pre-mutation state afterwards (`git status` and `git diff` both matched).

**The first mutation attempt produced a false RED, and that is the more important result** — see
finding 5.

### Session-level arithmetic

A median session is one build and six spec runs.

- **Built target:** 88 s bring-up + 6 × 41 s = **334 s**, plus 207 s if the session ends in a mutation
  check.
- **Development server:** 100 s bring-up + 6 × (a run that does not finish). The comparison cannot be
  completed, because the control never produced a passing run.

So the session-level total does come out ahead — decisively — but not for the reason the arithmetic
predicted. It is not navigation latency recovered six times over; it is that the development server
could not run the spec.

---

## Part 2 — what only a real application showed

Twelve behaviours that no fixture in this repository exercises. The first two are defects in shipped
scripts and both would break a real user's run.

### 1. The HAR scrubber destroys the recording when a cookie value is short (CRITICAL)

`har-scrub.mjs` mints a placeholder for **every** cookie value, by design and with no minimum length
or entropy floor, and then substitutes that value **everywhere in the recording**. The application
sets `i18n_redirected=en` (and `=de`). So the two-character strings `en` and `de` became secrets, and
every occurrence of them anywhere in the 9.1 MB recording was replaced:

```
total __PWPROVE_SECRET_13__ / __PWPROVE_SECRET_14__ occurrences: 125,403
```

`har-scrub.mjs bind` refused with `exit 4` and **343 placeholders in the replay match key**
(`languageCo<14>=<13>`, `curr<13>t-user`, `any_<13>tity`). Binding them by hand rebinds only the match
key — 485 substitutions — by design; the other ~124,900 sit in **response bodies**. The first proof
run therefore rendered this:

```
- link "Kandidat__PWPROVE_SECRET_13__"
- paragraph: "0 Bewerbung__PWPROVE_SECRET_13__ sind eingegang__PWPROVE_SECRET_13__ …"
- heading "Dein Briefing konnte nicht gelad__PWPROVE_SECRET_13__ werd__PWPROVE_SECRET_13__"
```

— a German-language application with its translation payload shredded, because the locale cookie was
treated as a credential. All three tests failed at 120 s (479 s of wall clock) against an application
that is not broken.

Two things make this worse than a single bad run. `--verify` reports the recording **clean**, because
over-scrubbing is indistinguishable from scrubbing to a residue check. And a reader of the committed
HAR cannot tell a destroyed recording from a safe one. The run only completed after the placeholders
were substituted back by hand, outside the shipped scripts.

**The fix is a value floor, not a cookie exemption:** a value below some length, or from a closed
low-entropy set, must not be substituted globally. A locale code is the example that surfaced; a
`theme=dark` or `tz=UTC` cookie would do the same.

### 2. `probe.mjs`'s `{"fn": …, "arg": …}` eval form is inert

The second of the three documented `eval` shapes does nothing at all:

```
{"cmd":"eval","expression":{"fn":"(s) => { window.__probeArg = s; return 42 }","arg":{"a":41}}}
  -> [1] eval -> undefined
{"cmd":"eval","expression":"JSON.stringify(window.__probeArg)"}
  -> [2] eval -> undefined
```

No return value, no side effect, and the argument is never passed. `page.evaluate(source, ...args)`
is called with `source` as a **string**, and Playwright evaluates a string as an expression: an arrow
function source evaluates to a function object, which serialises as `undefined`, and the argument is
discarded. The `fn` form has to build a call — `(<source>)(<json arg>)` — or pass a real function.

This shape shipped in `#35` specifically because it is the one a model reaches for first. It has
never worked. The run continued by inlining the call into the string form.

### 3. The config phase over-declares from a generated `.env.example`

`ENV_CONTRACT=.env.example` treats a key with no value as required. This application's `.env.example`
is **generated** from a declarative schema (`config/env.ts`) in which each key carries an explicit
`required` boolean, and vault-leased secrets are emitted as valueless placeholders. Two keys are
`required: true`; eleven of the keys the phase declared missing are `required: false`.

Result: `exit 4` naming eleven keys, in 91 ms, on an application that boots without any of them. The
STOP is fast and legible — the phase does exactly what it says — but the heuristic is wrong for a
generated contract, and it aborts the run before the build. The `REQUIRED_ENV=` form is the documented
escape and it worked; nothing in the output suggests reaching for it.

### 4. `.git/info/exclude` is not a path in a worktree

Step 7's recipe for excluding the bound HAR:

```
grep -qxF '.pw-prove/' .git/info/exclude || printf '.pw-prove/\n' >> .git/info/exclude
→ /bin/bash: .git/info/exclude: Not a directory
```

In a linked worktree `.git` is a **file**, not a directory. The real path comes from
`git rev-parse --git-common-dir`. The failure is silent in the `||` chain and the bound copy — which
carries a live credential — is then not excluded from `git status`.

### 5. The serve phase cannot tell a restarted server from a stale one — and it produced a false RED

The Step-7 mutation check requires the preview server to be restarted so it serves the artifact just
built. The restart failed with `EADDRINUSE` (the previous server had not actually been killed), and
the serve poll answered:

```
SERVE=ok
BASE_URL=http://localhost:36495
```

— because the **old** process answered. The mutation run then failed at 128 s with the page stuck on
its loading splash: the old server was serving code from memory whose hashed chunk files the rebuild
had overwritten, so the browser 404'd its way to nothing.

That failure reads as **RED**, and a RED verdict is the outcome the mutation check is looking for. The
run would have reported "the spec guards the change" on evidence that proves nothing. This is exactly
the silent-always-pass shape `#45` found in the same step, one layer further out: `#45` made sure the
mutation is in the artifact, and nothing yet makes sure the *server* is the one holding that artifact.
Killing the stale process and re-running produced the genuine RED — a failed assertion on the missing
hint, in 18.7 s rather than 128 s.

**A restart needs a liveness identity, not a liveness check.** The serve phase already reads the
server's log; a restart could require a *new* announcement rather than any answer on the port.

### 6. A dual-stack bind is reported as a single family

The preview server logs `Listening on http://[::]:36495`. Both `127.0.0.1` and `localhost` answer.
The serve phase reports `ADDRESS_FAMILY=ipv4` and prints:

> the server is at http://127.0.0.1:36495, not http://localhost:36495 — the bound loopback family is
> ipv4

The requested origin works. The line states as fact something that is false, and it instructs the
reader to carry a different origin everywhere. Harmless here; misleading in a diagnosis.

### 7. `e2e-reviewer` flags pw-prove's own canonical dwell

The Step-5 payoff dwell, written across two lines as a formatter would leave it:

```ts
// JUSTIFIED: proof-clip payoff hold. …
if (process.env.PW_PROVE_CLIP)
  await page.waitForTimeout(2500)
```

produces **three unsuppressed `[P1] #9` hits** from `scan.mjs`. The identical code on one line —
`if (process.env.PW_PROVE_CLIP) { await page.waitForTimeout(2500) }` — produces **zero**. The
`JUSTIFIED` contract says a comment above the enclosing block suppresses; for this shape it does not.
An agent that formats the dwell the way its repository's linter would then reports three P1 findings
against itself.

### 8. Clip fidelity reads a computed config as an empty one

`clip-fidelity.mjs spec` derived *"config carries nothing at all — Playwright's 1280x720 default"*
from a config whose project block is `use: { ...devices[process.env.PROJECT_DEVICE || 'Desktop
Chrome'] }`. The verdict (`pinned`) is right and the audit passed; the stated reason is not. A config
that resolves its device from the environment is invisible to the derivation.

### 9. The application's own e2e auth helper is compiled out of the proof target

`tests/e2e/auth.ts` exports `authViaToken`, which drives the app's `?token=` bootstrap. That bootstrap
sits behind `import.meta.dev` at `useAppInit.ts:243`. Against the built target it does not exist, and
the helper's `waitForFunction` would burn its full 60 s. This is precisely the failure `#44` was
written for, and the guard rule handled it: the rung was recorded absent and skipped.

The rung below it worked on the first attempt — seeding **both** `token` and the `user` record into
client storage, `#44`'s exact prescription. Worth noting for the next reader: the application's own
`login_token` exchange (`useAppInit.ts:223`) is **not** dev-guarded and the user record carries a
`login_auth_token`, so this application has a production-surviving bootstrap rung that its own test
helper does not use.

### 10. The three blockers this ticket was told to expect are not in this application

`#39` recorded three blockers to expect here: a hard-coded `PORT=4100`, a tenant resolved by query
parameter, and an unrunnable `testIgnore` entry. **None of them apply.** They were found in a
different application — the Vite/Vike widget of `#39`'s Claim 2, not this Nuxt product. This
application's start script is `node .output/server/index.mjs` with `PORT` read from the environment,
its tenant is resolved by **subdomain** (`<slug>.localhost:<port>`), and its Playwright config carries
no `testIgnore`. The subdomain scheme matters more than the absent blockers: a proof that dials
`localhost` gets a `307` to `/login` and never sees the product.

### 11. The application overrides the URL locale from the user profile

The diff touched `locales/{de,en,id}.json`, so the locale floor applies. Navigating to `/de/jobs`
landed on `/en/de/jobs` — the app rewrites the locale from the signed-in user's profile. This is the
documented app-controlled-locale branch, and it resolved as the skill says: prove the localization
contract inside the rendered locale and state the override, rather than mocking the user to satisfy
the floor.

### 12. A real list page makes a very large recording

The recon pass over one list route (2,015 jobs) produced a **9.1 MB** `api.har`, which Step 8 would
commit. Nothing in the pipeline warns about this, and it is a real cost to the target repository.

---

## Part 3 — the proof itself

Three scenarios against the built target, all green, all filmed and all three frames read:

| # | Scenario | What its frame shows |
|---|---|---|
| 1 | the flag-gated compensation section renders in the job editor | The Create Job sheet, centred, settled. "Compensation" with its description, Currency `EUR`, Pay period `Per month`, empty Minimum and Maximum in the desktop two-column grid. |
| 2 | the minimum exceeding the maximum warns | Minimum `5000`, Maximum `100` (focused), and in red beneath them: *Minimum can't be greater than maximum.* Nothing occluded. |
| 3 | a negative amount warns | Minimum `-5` (focused), Maximum empty, and beneath: *Salary can't be negative.* |

- **Tests:** 3 passed, 40.7 s, hermetic (carve-outs: `socket.io` transport polling, the third-party
  Intercom messenger). 23 endpoints answered in-browser from the recording, 0 in-spec round trips.
- **Mutation:** RED — deleting the `min_gt_max` branch removes the hint and scenario 2 fails on a
  missing element.
- **Reviewer:** 0 P0, 0 P1/P2 after the dwell was written on one line (see finding 7).
- **Clip fidelity:** `spec` audit exit 0; three frames extracted and read, none illegible, no re-film.
- **Type check:** the generated spec and Page Object contribute no errors. The repository's root
  `tsc` is not clean independently of this work, which is why it ships a scoped type check.

Everything the run generated lived in the throwaway worktree and went with it.

---

## What this changes

1. **Restate the navigation claim in browser terms.** `14 ms against 4.26 s` compares a `curl` to a
   page load. The honest figure on this application is ~1.0 s against ~1.7–3.8 s in a browser.
2. **Bring-up is not the cost the trade assumed.** Build was 87 s against a 100 s development-server
   start, and the mutation cycle was 207 s against an expected ~635 s. The built target is cheaper
   than `#33` budgeted for on both counts.
3. **The parity claim from `#39` does not generalise.** A spec that passes against the built target
   can fail to run at all against the development server. Verdict parity is not a property of the
   change; it is a property of the application.
4. **Two shipped scripts have defects a real run hits immediately** — the HAR over-scrub (finding 1)
   and the inert `fn` eval form (finding 2). Neither is reachable from this repository's fixtures,
   because neither a locale cookie nor a model-shaped `eval` batch appears in them.
5. **The mutation check has one more silent-always-pass hole** (finding 5): a restart that failed
   still reports `SERVE=ok`, and the resulting RED is indistinguishable from a real one.
