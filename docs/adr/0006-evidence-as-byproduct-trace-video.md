# Evidence as a byproduct: trace/video over the bespoke film + R2 watch page

The old generator proved a change with a hand-built film: `record.mjs` re-ran the spec through a throwaway film spec to capture one chaptered video, extracted a 30-frame contact sheet, assembled a self-contained `watch.html`, and hosted it on R2 as the required "watch link." That machinery (a whole second run, an image the agent had to Read, chapter/QA gates) was a large slice of the 25-minute complaint and re-invented what Playwright already ships.

Decision (pw-prove only): the proof evidence is a **byproduct of the single Step-7 proof run**, not a separate step.

- The proof run enables `use: { video: 'on', trace: 'on' }` via an **ephemeral Playwright config passed with `--config`** — the committed `playwright.config` is never touched, so no future CI run films the whole suite (the regression the old throwaway film spec existed to avoid). There is no `--video` CLI flag; `--config` is the sanctioned override. `--trace on` is additionally a real CLI flag.
- Playwright records **one webm per test**, so the single chaptered "proof film" retires along with its whole vocabulary (Chapter, Contact sheet, Static chapter, Film QA gate, Refilm budget, State-isolation rule). Each clip is scoped to one AC instead.
- The delivered artifact is the **per-AC video**: `host-video.mjs` (a lean strip of `host-on-r2.mjs` — R2 upload + the same degenerate-key/empty-file/token-redaction gates, no watch.html/contact-sheet/chapters) uploads each webm and the PR comment lists one URL per AC alongside the mutation-check verdict.
- The `trace.zip` falls out of the same run for free but is **local-only**: the agent uses it for Step-7 healing and the playwright-debugger handoff; it is not uploaded or linked. A reviewer wanting time-travel re-runs the spec.

Trade-offs weighed: keeping a mandatory *native video* (rather than dropping visual evidence to a trace-only drag-drop artifact) was chosen deliberately — a clickable per-AC clip in the PR is worth the one extra upload call, and it keeps parity of intent with the old watch-link habit while removing the second run and the QA ceremony. Delivering the trace too (via `trace.playwright.dev/?trace=<url>`) was rejected as one artifact type too many for the default path.

Net effect on the motivating case: film→host→contact-sheet-QA (~10 min of second-run + image Read + hosting) collapses to a webm that already exists plus one upload call.
