# Generated specs are hermetic; live traffic exists only as a declared carve-out

A generated spec once slipped through review while writing to a shared staging tenant — live traffic is silent until it pollutes data, rate-limits, or flakes. Deterministic-by-construction beats deterministic-by-luck.

Decision: every generated spec is hermetic by default — all network calls answered by mocks derived from one observed run's real payloads. Step 7 runs a hermetic audit and fails the run on any undeclared live call, even when the spec is green. The single exception is the declared carve-out, used only when the real round-trip IS the acceptance criterion: named in the scenario plan and in a grep-able `// CARVE-OUT:` spec-header line, reads free, writes only with a restore proven in the same spec, and never creating data on a shared tenant.

The header-line declaration (rather than a comment anywhere, or agent judgment) is deliberate: it gives the Step 7 audit a mechanical source of truth to diff the request log against.
