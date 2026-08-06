# Issue tracker

Read by `/to-tickets` (step 5) and `/delegate-tickets` (step 2) to learn where tickets live.

- **Tracker**: GitHub
- **Repo**: `sonhyrd/e2e-skills` — the same repo the code lives in.
- **Always pass `--repo sonhyrd/e2e-skills` on every `gh issue` call.** `gh` run from inside some
  checkouts on this machine resolves to a different upstream, and this repo additionally carries an
  `upstream` remote (`voidmatcha/e2e-skills`) that must never receive issues or pushes.
- **Triage label**: `ready-for-agent` — "Spec is complete; an agent can pick this up."
- **Ticket shape**: one issue per ticket. A ticket names its parent spec issue, states the
  end-to-end behaviour it delivers, lists acceptance criteria as checkboxes, and declares its
  **Blocked by** edges as issue references. Those edges are the dependency DAG; they are never
  re-derived.
- **Externally blocked tickets are filed without the triage label**, with the external blocker
  named in the Blocked by section. A ticket that an agent cannot start must not advertise itself as
  grabbable.
