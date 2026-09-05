# pr-review — Step 6 reference: Prove

Moved verbatim from `SKILL.md`, whose Step 6 says when to read it. Nothing here changes the procedure `SKILL.md` states.

The last stage. What the review concluded gets written down where `e2e:pw-prove` reads it, and then
a fresh session runs `pw-prove` against it. Nothing here re-reviews and nothing here re-fixes.

### 6a. Ignore the artifact path first

The commit is deliberate: the artifact is written on every review this repo ever gets, so ignoring
it once for everyone beats each contributor's checkout carrying an untracked directory nobody
recognises. `.git/info/exclude` hides it with no commit at all and is the fallback where the repo's
policy forbids touching `.gitignore` — say in `## Fixes` which of the two you used.

Do this **before** 6b, not after. Review findings are not PR content, and an artifact written into
an un-ignored path sits in someone's `git status` from then on — `pw-prove` stages only the spec,
the POM and the HAR, so nothing downstream ever cleans it up.

### 6b. Write the handoff artifact

`.pw-prove/handoff.json` at the repo root. **`pw-prove` owns this schema** — it is the only reader,
and its `SKILL.md` (`plugins/e2e-skills/skills/pw-prove/SKILL.md` in this marketplace, Step 2 step 0)
is where the shape is defined. Write to it; do not
extend it. A key it does not read is a key nobody reads.

**What the schema carries is `pw-prove`'s call, whatever a new key would or would not disturb in
this run.** The reader is the only party that can say what a field means, so routing the request
there is the answer with the information in it.

**Asked mid-run for a field this schema does not have, name the owner and carry on** — the answer is
where the change belongs, not the change. It is two files in two plugins plus a parity test and a
targeted push to the fork, which is a decision of its own and not a step of this review. Say so in
one line and finish the run.

- **`findings` is ordered, and the order is Step 4b's**: overlap-confirmed before single-track,
  Critical before High. "Highest confidence first" is what agreement between tracks bought.
- **Every severity ships**, including the findings Step 4 described rather than applied — OCR Low
  and Spec scope creep among them.
  `pw-prove` decides for itself which findings name a user-observable behaviour worth a scenario,
  and a finding withheld here is one it cannot weigh.
- **`fixes_applied` is the Applied list from 4d**, carrying the commit SHA from 4e.
- A run that applied nothing writes `"fixes_applied": []`. It does not skip the artifact — the
  findings are the payload, and a review that fixed nothing still has them.

### 6c. Spawn a fresh session to run `pw-prove`

`pw-prove` opens with a context gate and refuses above 100k tokens. By here this run is reliably
past it — four tracks, an aggregate report and a fix stage — so the proof runs in a **fresh
session**, in this same checkout:

- **`<NUM>` is the PR number, or the branch name in branch mode, and that is the whole prompt.**
  `BASE` and the findings are in the artifact, which `pw-prove` reads itself in its own Step 2 — the
  handoff is the file, not the prompt. So the spawned line is byte-identical to the one a user
  pastes by hand, and there is one place a run's base comes from.
- **`--worktree active` keeps the proof in the tree Step 1 acquired** and Step 4 committed to, which
  is what makes it a proof of the reviewed code. Not a child worktree: `pw-prove` commits, pushes
  and comments on the PR, and from a child that becomes a merge-back this skill would then own.
- **The prompt rides on `--command`**, so the session boots with it already sent. Creating a bare
  `claude` and sending the slash command afterwards is three calls with a boot race in the middle.
- **The spawn asks nothing.** The user who invoked this skill asked for the proof, and
  `/e2e:pw-prove` arriving as first user input is the *user-invoked* path, so `pw-prove`'s own
  confirmation gate does not fire there either. This run therefore stops for a person nowhere at
  all: `docs/adr/0009-pr-review-spawns-the-proof-in-a-fresh-session.md` is where that trade is
  recorded rather than left to be discovered.
- **`pw-prove` owns everything from the spawn onward**, including the push. Do not run its steps
  ahead of it, and do not push to make its job smaller.
- **Then end the run.** Nothing here waits on that terminal. Holding a session this heavy open
  through a full bring-up and verify loop buys nothing — being too heavy to be useful is the reason
  the fresh session exists — so the proof's outcome is not this run's to report, and saying so is
  part of the close.

**`$ORCA` is the CLI preflight resolved**, not the bare name. On an AppImage machine `orca` is the
desktop launcher, which accepts this command, prints Electron noise and creates nothing — the one
failure that looks from here exactly like a spawn.

**A spawn is claimed on the handle it returned.** Read the terminal handle out of the `--json`;
without one, no session is running whatever the command printed. Preflight proved the CLI answers,
so a spawn that still fails here is a run-time failure rather than an unprovisioned machine, and the
stage prints three things and stops: `.pw-prove/handoff.json`'s path, the exact `/e2e:pw-prove <NUM>`
line, and the working directory to run it from. The artifact is on disk and a fresh
`/e2e:pw-prove <NUM>` picks up the same findings — that standalone path is why the file is written at
all, and taking it is not a failure of this run. **Invoking `pw-prove` inline is never the answer
here**, on any branch: this context is exactly the one its gate turns away, so an inline attempt
spends a turn to arrive at the same paste line.
