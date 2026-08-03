# The warm lead is a browser load, not a curl

`docs/adr/0007` established the **warm lead**: "one request against the route under proof immediately before filming, so the clip opens on a compiled app. One request, no extra test run, no new dependency." It was implemented as a `curl` of the route.

It did not work. A real pw-prove run against a Nuxt app published a 1:09 clip whose first ~25s was the dev server compiling — the exact failure 0007 wrote the warm lead to prevent — and the cost vanished on the next run, the signature of a per-boot cache being filled.

The curl warms the wrong half. It fetches the HTML document and stops: it executes no JS, so it never requests the client module graph and never makes Vite discover its dependencies. Vite's own documentation is explicit that a dependency encountered after server start makes it "re-run the dep bundling process and reload the page if needed" — a pass driven by real module requests, which a curl does not make. On a Vite-family dev server (Nuxt, SvelteKit, Remix-vite) the curl buys the SSR render and almost nothing of what the browser is about to pay. On Next.js/webpack it buys much more, which is why the defect read as intermittent rather than as a hole in the contract.

There is no way to pay that cost inside the recorded context. Playwright's video is context-scoped: recording begins at context creation and is flushed at context close, with no delayed-start and no trim option. Whatever the first test's context does is in the film by construction.

Decision: the warm lead is a **real browser load performed by a separate, short-lived process** — `probe.mjs warm <url>`. It reuses the probe's existing pinned-Playwright resolution and browserless refusal (exit 2), launches a browser with no video, no HAR and no storageState, navigates the route under proof, absorbs the dep-discovery pass with a short networkidle grace, and closes. The only artifact it leaves is server-side cache state. `curl` is retained as the browserless fallback, and falling back to it is reported as a warm miss for the same reason a non-2xx warm is: the document is warm and the module graph is not.

This is not a new dependency. The probe already drives the target project's own pinned Playwright, and by Step 7 that project necessarily has one — the proof run is about to use it.

Trade-offs weighed. **Post-processing the recording to trim the boot** stays rejected, but one of 0007's two reasons for rejecting it has expired: `docs/adr/0012` made ffmpeg/ffprobe a real dependency (`preflight.mjs` gates `HOSTING_READY` on both, and `publish-proof.mjs` already runs a stream-copy concat), so "re-adds an external video dependency and an editing step" is no longer true. The surviving reason is sufficient on its own and is the one that mattered: an edited clip is no longer a faithful recording of the run, and this bundle exists to refuse artifacts that assert more than they witnessed. Moving the boot *out* of the recording is faithful; cutting it *out* afterwards is not.

**A `globalSetup` in `playwright.proof.config.ts`** would also run before any context exists, and so would also be unfilmed. Rejected: it needs the per-run route, and `docs/adr/0008` makes that file static, project-agnostic and never edited per run. The warm belongs on the command line, next to `PW_PROVE_W`/`PW_PROVE_H`, for the same reason those do.

**Reusing the Step-3 recon daemon** was rejected: it is closed by Step 7, and reopening it would put a long-lived browser and a socket back into the flow to do work a one-shot process does in a single call.

The run ledger records `warm` as its own phase, so the question this record was written to answer — what does the warm lead actually cost, and did it land? — is answerable from `~/.ptg/ledger.jsonl` rather than from watching a clip.
