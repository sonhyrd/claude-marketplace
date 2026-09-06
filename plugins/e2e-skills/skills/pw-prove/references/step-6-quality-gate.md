# pw-prove — Step 6 reference: e2e-reviewer (quality gate)

Moved verbatim from `SKILL.md`, whose Step 6 says when to read it. Nothing here changes the procedure `SKILL.md` states.

### YAGNI audit (immediately after writing code)

```
| Locator       | File          | Used in          | Status  |
|---------------|---------------|------------------|---------|
| submitButton  | login-page.ts | login.spec.ts:18 | IN USE  |
| unusedLocator | login-page.ts | (none)           | DELETED |
```

### PROVES-header audit

The header is reviewer-facing text, so it carries [Step 2's phrasing contract](../SKILL.md#pr-mode-diff--acceptance-criteria) whichever source it came from: a **Then** naming an identifier is rewritten to what a tester sees **before** it is quoted, and the table or the plan is corrected to match. Header and source stay word-for-word identical — that is what this audit reads.

### Clip-fidelity audit

The Step-4 `Effective viewport` line and the Step-5 dwell are **claims**; this checks them. Run it on every generated spec, with the `configPath` from Step 1 and the Assumptions block's viewport line verbatim:

**Exit 0 is the only way to Step 7** — a non-zero exit blocks it exactly as a missing PROVES header does. Fix and re-run:

| Exit | What failed | What to do |
|---|---|---|
| `2` | A `test()` has no `PW_PROVE_CLIP`-gated wait, its dwell sits outside the `test()` body, or the dwell has no `// JUSTIFIED:` line above it | Add the Step-5 dwell **inline in each `test()`** — a call to a helper does not count, and one shared dwell would satisfy tests that hold on nothing. This is the originating regression: without a reader, Step 7's `PW_PROVE_CLIP=1` is **inert** and the clip shows nothing. |
| `3` | The verdict is `pinned:` but the spec carries no `test.use({ viewport })` | Add the pin to the **spec** — never to the project config, never only to the proof config. |
| `4` | The derived verdict disagrees with the declared one | One of the two is wrong. Re-read `code-rules.md` §Viewport pin, then fix the Assumptions line **and** the spec together. |
| `5` | Config ambiguity — a function-export config, or projects whose `use` blocks resolve differently | It refuses rather than guessing. Resolve by hand: read the config, decide the effective viewport, and state the branch and why in the Assumptions block. |
| `1` | Usage error | `--config` and `--verdict` are both required — the verdict is re-derived, never trusted. |

An exit-0 run may still print `WARNING` lines (a gated pin, or a pin over a `deliberate:` viewport). Those are advisory and do not block Step 7 — but each one names a filming-law violation in the committed spec, so fix them before delivering rather than after.

## Script contracts (from `SKILL.md` → Reference)

- Step-6 clip-fidelity audit (re-derives the effective viewport from the config text, fails on a disagreement with the declared verdict, and asserts the committed pin + a JUSTIFIED `PW_PROVE_CLIP`-gated dwell per `test()`; refuses on an ambiguous config): `scripts/clip-fidelity.mjs`
