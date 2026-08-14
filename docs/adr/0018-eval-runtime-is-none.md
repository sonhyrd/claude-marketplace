# The eval runtime is `none`, and the price is an unsandboxed agent on the host

`skills/pw-prove/evals/eval.yaml` declares `environment.type`, which decides where skill-up runs the
agent under test. There are two settings that matter: `docker`, which runs each case in a container,
and `none`, which runs it as a subprocess of the operator's own shell. `none` is fixed. This record
exists because `docker` is the setting a reader would assume is correct, and because choosing `none`
buys a real capability at a real cost — both of which have until now lived only in a header comment
and a `/tmp` handoff file.

## Why `docker` is unusable, on evidence

Under `environment.type: docker`, **file assertions fail for files that demonstrably exist**. Both
levels report it: config-level `expect.files_exist` and judge-level `files_exist` each answer "does
not exist" for a file that is present *and is collected into the run's `outputs/workspace/`*, where
the operator can open it afterwards. The assertion and the artifact disagree, and the assertion is
the one that produces the verdict.

That is fatal to the only cases worth the container. A [wet case](../../CONTEXT.md#wet-case) runs
pw-prove against a repository fixture and judges what the run *did* — which it does by asserting on
the files the run produced. Under `docker` every wet case fails, and it fails **silently in the sense
that matters**: the run is green-shaped, the report names a missing file, and the reading is "the
skill did not write the spec" when the skill wrote the spec. A suite whose failures point at the
subject instead of the instrument is worse than no suite; that is the exact defect the 2026-08-13
run's void verdicts were made of, arriving by a different route.

Two adjacent findings from the same session, recorded here so nobody re-derives them while trying to
make `docker` work:

- **`environment.env` does not expand `${VAR}` or `$VAR`.** It forwards the literal string, so a
  `${CLAUDE_CODE_OAUTH_TOKEN}` placeholder is sent verbatim as the bearer and the run dies on
  `401 Invalid bearer token`.
- **Host environment is not forwarded into the container**, so an unauthenticated agent answers
  every case with `Not logged in · Please run /login`.

Under `none` the agent authenticates from the host's existing login state and no token is needed at
all, which is why both of those problems simply do not exist on this side of the decision.

## Decision

**`environment.type: none`, for the whole suite, dry cases and wet cases alike.** Do not "fix" it
back to `docker`. Nothing in CI will catch you if you do — no CI check reads the eval suite at all,
by decision — so the header comment in `eval.yaml` and this record are the only
tripwires between a one-word edit and a suite that fails every wet case for a reason nobody reads.

**Reversing this requires evidence, not reasoning.** The bar is a file assertion passing under
`docker` with the run directory as proof. An upstream release note claiming the collection path was
fixed is not that; neither is an argument that containers ought to work.

## The price, which is paid on the same line

**`none` means skill-up launches the agent with `--permission-mode=bypassPermissions` against the
real host filesystem.** There is no sandbox. Whatever a case's prompt leads the agent to do, it does
to the machine running the suite, with the operator's own permissions: writes anywhere the operator
can write, arbitrary commands, the network.

Four consequences, stated here rather than in a footnote because each one changes how the suite is
operated:

- **Run the suite only where you would already run a bypassed agent.** It is not a thing to point at
  a machine holding anything you would not hand over. This is the same posture as `pw-prove` itself,
  which is why it is tolerable — but it is a posture, not an absence of risk.
- **A case prompt is executable, not hypothetical.** A case that asks for bring-up gets a server on
  a real port; a case that asks for a file gets a file. Keep cases pointed at the fixtures under
  `skills/pw-prove/evals/files/` and the skill-up run directory, because fixture scoping is the only
  containment this runtime has.
- **Untrusted-input cases are run for real.** `b49` feeds the agent injected page content in order to
  measure a refusal. Under `none` an agent that fails that case is a bypassed agent following
  attacker text on the host. The case is still worth having — that is precisely the behaviour worth
  guarding — but it is authored and reviewed as live code, not as a string.
- **`none` is not isolation, and does not pretend to be.** It gives up the container; it never
  offered `~/.claude` isolation in the first place. The ambient-marketplace-plugin contamination that
  voided the 2026-08-13 run is a *separate* defect with a separate fix (a dedicated config directory
  for the run, asserted by the shared judge). Do not read a green isolation check as evidence about
  the runtime, or this decision as the cause of that contamination.

## The second price: the baseline arm can read the skill off the host

Recorded beside the first because it is the same line of the same decision, and because it was paid
before anyone noticed. **Under `none` there is no filesystem boundary, so every checkout, worktree,
clone and plugin cache of this repository on the machine is a copy of the body under test that a
case can `find` and `cat`.** The `without_skill` arm of an uplift run is the one place where that is
not merely untidy but fatal: uplift is the difference between a run that has the skill and a run that
does not, and an arm that read `SKILL.md` off a second checkout is not a run that does not.

It happened. In the 2026-08-14 uplift run, three of ten baseline arms (`case-15`, `case-28`,
`case-48`) reached another checkout on the host after the Skill tool answered `Unknown skill:
pw-prove`, and two of them were about to be retired for zero uplift on a baseline that still had the
skill. One of thirty-nine *with-skill* runs reached a marketplace plugin path the same way, by
search rather than by injection — so this is a property of the runtime, not of the baseline arm.

Two things follow, and neither is optional:

- **Reduce, then assert.** `scripts/run-evals-isolated.sh` censuses the host copies and writes one
  Claude Code deny rule per copy into the isolated home. Deny rules are enforced under
  `--permission-mode=bypassPermissions` — that is what makes them worth writing — and they cover
  Read, Grep and Glob and **not** Bash, which no prefix list can cover. So the deny rules are a
  reduction, and the assertion is the post-run sweep: every `without_skill` transcript is judged with
  the load question inverted, and a body line in that arm fails the run.
- **A run's own working directory is part of the price.** The workspace used to sit inside
  `skills/pw-prove/`, which put a checkout of the body three `cd ..`s from the agent's cwd. It now
  defaults outside every checkout, and the runner refuses a workspace inside one.
- **The run creates copies of its own, and a census cannot see them.** skill-up installs the skill
  into each `with_skill` case's `/tmp/skill-up-<n>/.claude/skills/pw-prove/`, which exists only while
  the run does. On the first sealed re-measurement `case-48`'s baseline arm was refused the plugin
  cache and every checkout by the deny rules, kept looking, and read the body out of a **concurrent
  case's install**. That path cannot be denied — it is the other agent's own working directory — so a
  `--baseline` run is serialised instead, and the sweep is what proves it worked.

This does not reopen the decision. `docker` still cannot see the files a wet case writes, and a
sandbox that hides the outputs is not an improvement over a runtime that hides nothing. What changes
is that the exposure is now enumerated before each run and asserted after it, rather than assumed
away. **If a future runtime does give the suite a real filesystem boundary, the census and the sweep
stay** — they are what tells you the boundary held.

## Alternatives weighed

- **`docker` for dry cases, `none` for wet cases.** Rejected. `environment` is one key for one
  suite, so this means two `eval.yaml` files, two sets of environment facts, and a verdict whose
  meaning depends on which file produced it — while buying containment only for the cases that never
  needed it. The [wet cases](../../CONTEXT.md#wet-case) are the ones that touch the machine.
- **Fix the collection path upstream and keep `docker`.** Not rejected on the merits — it is the
  right eventual answer, and this record is written so it can be taken later. It is rejected as a
  *blocker*: the suite's job is to measure pw-prove, and waiting on a third-party fix to a path we do
  not own would stall every case behind it.
- **Drop the wet cases and keep the container.** Rejected. The wet pair is the only part of the suite
  that checks pw-prove *does* the job rather than *describes* it. Removing them to preserve a sandbox
  optimises the instrument's safety at the cost of the one measurement it exists to take.

## What this does not establish

Measured against skill-up v0.9.0 with the `claude_code` engine, on Linux, in August 2026. The
file-assertion failure is a property of that combination and has not been isolated to a layer — the
container image, the collection step, or the assertion itself. Nothing here says containers are
unworkable for eval suites in general, only that this one cannot see its own outputs, and that a
suite which cannot see its outputs cannot judge them.
