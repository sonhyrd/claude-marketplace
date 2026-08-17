# The recon probe is required, not an accelerator

Fifteen audited PTG runs (2026-07-20 to 2026-07-23) split cleanly on one variable. The five runs that opened `probe.mjs` invoked `playwright test` 5–8 times each. The ten that did not invoked it 9–42 times, and the worst wrote exactly the throwaway artifacts SKILL.md forbids by name (`_recon.spec.ts`, `_debug-notes.spec.ts`) — because with no probe, the test runner is the only interactive channel left. A rule that is prose gets routed around; 5-of-15 adoption after a dedicated probe-first rewrite (`3a1a3f5`) is the measurement of that.

Deleting the probe was the live alternative, and on adoption numbers alone it is the obvious read. It is wrong: the runs that skipped the probe did not do less work, they did the same work through a 90-second-per-question channel. Deleting the probe removes the alternative, not the friction.

Decision: Step 3 completes in exactly one of two states — a probe session that has answered at least one batch, or an exit-2 (browserless) refusal with the source-reading fallback named in the Step 4 Assumptions block. There is no third state, and reaching Step 4 in neither is a HARD STOP, in the same register as the polluted-tree stop.

The HARD-STOP register (rather than an Assumptions-line "say why you skipped it") is deliberate: SKILL.md cannot enforce anything mechanically, so the register is the whole mechanism — and the softer wording is exactly what the other unenforced rules already use, with the run counts above to show for it. The gate ships *after* the probe-ergonomics fixes (`wait`, `eval` `max`/`out`, `storage-state`), because gating a tool people avoid only moves the friction.
