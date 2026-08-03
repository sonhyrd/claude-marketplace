# Scanner pattern corpus

One deliberate instance of **every** Tier-3 check `scan.mjs` runs, plus a `// JUSTIFIED:`
twin for each, plus the possessive-quantifier backtracking trap. `golden.txt` is the
scanner's frozen stdout over this tree; `scripts/ci/test-corpus.sh` re-runs the scanner and
requires the output not to move.

This is what proves the shell-to-Node port: the old implementation generated `golden.txt`,
the new one has to reproduce it byte for byte. It outlives the port as the regression net
for the next person who edits a pattern.

## Why the path has an `evals/files` segment

`scan.mjs` excludes `**/evals/files/**` from every tier — *unless the scan root is itself
inside such a tree*, in which case the exclusion is lifted. That is exactly the behavior
this corpus needs: the repo's own smell scan (`scan.mjs .`) must keep reporting zero P0
despite a directory full of deliberate P0s, while `scan.mjs tests/pattern-corpus/evals/files`
sees all of them. The segment is load-bearing, not decoration — do not flatten it away.

## Layout

| File | Holds |
|------|-------|
| `evals/files/pw-hits.spec.ts` | one hit for every Playwright check |
| `evals/files/pw-justified.spec.ts` | the same lines, each with a `// JUSTIFIED:` marker above it — all suppressed except `#7`, which is never exemptible |
| `evals/files/cy-hits.cy.ts` | one hit for every Cypress-only check (`#9b`, `#3b`) and the Cypress form of the shared ones |
| `evals/files/cy-justified.cy.ts` | its suppressed twin |
| `evals/files/cypress/integration/legacy.ts` | the legacy Cypress layout, which has no `.cy.`/`.spec.` suffix and is only reachable through the `;`-separated multi-glob |
| `evals/files/backtracking-trap.spec.ts` | `expect( await x).toBeVisible()` with one and two leading spaces |

## The backtracking trap

Check `#15` (missing `await` on a Playwright `expect`) opens with a possessive quantifier:

```
^\s*+expect\(\s*+(?!await\b)...
```

The `*+` forbids the engine from backtracking into the whitespace. Rewrite it as `\s*` and
the engine consumes the spaces before `await`, fails the `(?!await\b)` lookahead, gives one
space back, and now the lookahead is looking at ` await` — which does not *start* with
`await` — so it succeeds and the line matches. The check inverts its meaning silently.

`backtracking-trap.spec.ts` exists so that inversion cannot happen quietly: those lines
belong to the *awaited-locator* variant of `#15`, and `test-corpus.sh` asserts they never
appear under the base `#15` block.
