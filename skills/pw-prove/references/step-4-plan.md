# pw-prove — Step 4 reference: Plan

Moved verbatim from `SKILL.md`, whose Step 4 says when to read it. Nothing here changes the procedure `SKILL.md` states.

- **PR-mode — notify-and-continue.** Post the plan as the audit trail and continue **immediately** to Step 5. Silence is consent; the user interrupts to redirect. Never wait, never enter a planning mode. Every side-question resolves from the contract as a stated Assumptions line — asking any of them is a bug:

  | Would-be question | Resolution (state it, don't ask it) |
  |---|---|
  | POM or flat? | POM always — `code-rules.md` › Structure Detection |
  | Selector strategy? | `code-rules.md` › Selector Priority (testid tier-1 when the project configures it) |
  | Dirty worktree? | `git stash -u` → checkout → restore after (Step 3) |
  | Real backend or mocks? | Hermetic — HAR replays reads, hand-mock the mutation (`code-rules.md` › Network Determinism) |
  | Which locale? | Default — plus one non-default-locale scenario when the diff touches locale files |
  | Auth? | The Step 3 token-source ladder |

### Scenarios

```
## Scenario 1: [descriptive title]
- Given: [precondition]
- When: [user action]
- Then: [expected result the user sees]
```

Cover at minimum one happy path + one error/edge case. **PR-mode:** at minimum one scenario per AC from the Step 2 table (happy path), plus the error/edge case the diff implies. An unaddressed AC is a coverage gap.

**Coverage floors (PR-mode):**

- **Locale floor** — the diff touches locale/i18n files (`locales/**`, `messages.*.json`, `*.i18n.*`) → at least one scenario runs in a **non-default locale**, every locator in it locale-safe (role/testid — never default-language text).
  - **App-controlled locale** — if the app overrides the URL/browser locale from the user's profile on mount, prove the diff's localization contract **inside the rendered locale** (changed keys resolve, no raw key leaks, locators stay locale-safe) and record the override as an Assumptions line. Do not mock the user just to satisfy the floor.
- **Gated surfaces stay visible** — a surface unreachable with the available auth keeps its scenario marked `unproven — gated: <what blocks it>`, and that marker flows into the Step 8 report's `ACs` line. Silently dropping a gated surface is a coverage lie.

### Locator Mapping Table

```
| Locator name | File          | Selector                                 | Used in | New/Existing |
|--------------|---------------|------------------------------------------|---------|--------------|
| submitButton | login-page.ts | getByRole('button', { name: 'Sign in' }) | 1, 2    | New          |
| emailInput   | login-page.ts | getByLabel('Email')                      | 1, 2    | New          |
```

**Rules:** don't create any locator not listed · no getter methods — `readonly` properties · `.nth()`/`.first()`/`.last()` need `// JUSTIFIED: <reason>` on the line above · **POM always:** the File column is the Page Object file (`<testDir>/pages/<Feature>Page.ts`) even when existing specs are flat.

### Assumptions (required block in the PR-mode plan)

**Profile** is the Step-1 verdict, and it is **one line, never zero** when a `.pw-prove/profile.md` was read:

- `Profile: .pw-prove/profile.md — N entries applied (<the ones that steered a decision>)`
- `Profile: .pw-prove/profile.md — read, nothing applicable to this change`
- `Profile: .pw-prove/profile.md — CONTRADICTED on <what>: profile says <x>, Step 3 observed <y>; ran on the observation`

No file found → no line. **A contradiction must produce its line**: it is the signal that the profile has rotted, and it is the only thing that will make anyone go and fix it.

**Handoff** is the Step-2 verdict, and it is **one line, never zero** when a `.pw-prove/handoff.json` was found:

- `Handoff: .pw-prove/handoff.json — current (head <sha7>), N findings folded into the AC table`
- `Handoff: .pw-prove/handoff.json — stale (recorded head <sha7>, HEAD is <sha7>); dropped, ACs derived from the diff alone`

No file found → no line. A stale handoff **must** produce its line: dropping it silently is how a reader ends up believing the review's findings were carried when they were not.

**Spec set** is what Step 7 will run, and PR-mode states it here so a surprising film is caught in
the plan rather than at minute fifty: the spec this run writes, plus every spec already on the branch
that the PR's diff touches under `testDir` (resolved by the command in Step 7). Name the carried
files and their scenario count — `Spec set: people-filter.spec.ts (3 carried) + this run's
people-export.spec.ts (2 new)`.

**Effective viewport** is resolved here, from the Step-1 `configPath`, by the rule in `code-rules.md` → Clip Fidelity — state the value *and* which branch produced it (`deliberate: <w>x<h>` when the config carries an explicit `viewport:` key or a mobile descriptor, `pinned: 1600x900` when it carries only a desktop descriptor or nothing). Step 5 writes the pin; Step 7 sizes the recording to match.
