---
name: jira-ticket
description: >-
  Write and create high-quality Jira tickets (Story / Task / Bug / Sub-task) in the hyrd Jira,
  project MAMAS. Trigger when the user asks to draft or file a Jira ticket / issue / story /
  task / bug, wants an existing ticket's Description or Acceptance Criteria reviewed or
  rewritten, or asks to find / recommend a parent ticket or epic for work being filed.
---

# Jira ticket writing

**One ticket = one independently shippable, testable slice of value.** If it can't be tested or
can't finish in a sprint, split it (§Splitting).

## Flow

1. **Type and parent first — they are immutable.** `editJiraIssue` cannot move a ticket across
   hierarchy levels (`"The issue type selected is invalid"`); the only escape is create-new +
   comment + close the old one. Pick the type (§Types), settle the parent (§Parent), then create
   once.
2. **Draft locally** with the canonical template (§Template). The local draft is the single
   source of truth: every later edit re-sends it. Markdown read back from Jira comes escaped —
   re-submitting it ships literal `\[ \]` where checkboxes should be.
3. **Gate** (§Gate). Confirm scope with the user if anything is ambiguous.
4. **Create** via MCP (§Create), then report the key + URL back.

## Types — pick by who gets value

- **Task** (DEFAULT — the user writes mostly tasks) — technical/internal work (refactor, infra,
  config, migration, QA pass). Imperative title, no "As a…" line.
- **Story** — direct user-facing value. Body opens `As a … I want … so that …`.
- **Bug** — a defect. Body carries Steps to reproduce / Expected / Actual + environment & tenant.
- **Sub-task** — a step inside a parent issue. Same title and template rules as the work's type.

## Titles

`[FE] - [Widget] Emit full job description in JobPosting JSON-LD` — area tags joined by ` - `,
one space, then an imperative, single-deliverable title. No trailing dash after the last tag.
Sub-tasks get the prefix too.

Areas: `[FE]` `[BE]` `[Chrysus]` (nuxt-hyrd-chrysus) `[Widget]` (hyrd-widget) `[Paul Api]`
`[Maya]`. Infer from the repo under discussion; ask only if genuinely unclear.
Bug titles: `<area>: <symptom>` after the tags.

## Template — headings exactly as written, no emoji

```
## Description
<what + WHY, 1–3 sentences. Evidence verified against a real environment: tenant, endpoint,
the values actually observed — not assumptions.>

**Links:** <PR · ADR · parent/epic · related tickets>
**Out of scope:** <what this ticket deliberately does NOT do>

## Acceptance Criteria
- [ ] <observable outcome a tester can pass/fail>
```

Story leads with the As-a line. Bug inserts `## Steps to reproduce`, `## Expected`, `## Actual`
before the AC. Detail only the implementer needs (file paths, agreed approach, settled design
decisions) goes under `## Technical notes` at the end — the Description stays readable and the
AC stay behavior-level.

## Acceptance Criteria

Checklist by default; Given/When/Then for flows. Each item is an observable pass/fail, active
voice from the user's POV, phrased as what a tester does and sees — never a code, file, or test
name. **≤6 items** — a seventh means the ticket is too big, split it.

## Parent

When asked to find or recommend a parent:

- Search bounded, or the response blows the context window:
  `project = MAMAS AND issuetype = Epic AND statusCategory != Done AND text ~ "<area keyword>"`
  with `fields: ["summary","status"]` and `maxResults ≤ 20`.
- Verify the candidate with `getJiraIssue`: **Epic (level 1)** parents Task/Story/Bug;
  **Task/Story/Bug (level 0)** parent only Sub-tasks.
- Offer 2–3 candidates with a one-line why each, then set the parent at create time. (A missing
  parent can be added later by edit; a wrong *level* cannot be fixed at all — see Flow 1.)

## Create (MCP)

`mcp__claude_ai_Atlassian_Rovo__createJiraIssue` · `cloudId: "hyrd.atlassian.net"` ·
`projectKey: "MAMAS"` · `contentFormat: "markdown"`.

- **WAF:** Cloudflare rejects payloads that look like injection — symptom is
  `Streamable HTTP error … <!DOCTYPE html>`. Observed bait: raw HTML tags (`<meta …/>`) and
  shell command lines (`curl -s https://…`); backticks do NOT defuse them. Write defused up
  front: spell tags without angle brackets ("a `meta name="…"` tag"), "the page source shows"
  instead of a curl invocation. On the error, defuse further and resend — never resend verbatim.
- Priority / labels / assignee: set only what the user stated or what the parent's siblings
  already use — no invented labels.
- **QA Owner is never auto-filled — set it in the create call or it ships empty.** It is a
  multi-user picker, so the value is a list:
  `additional_fields: { "customfield_10100": [{ "accountId": "<id>" }] }`.
  Who: whoever the user named, else the QA Owner on the parent's siblings
  (`fields: ["customfield_10100"]`, `maxResults ≤ 10`); ask only if both are silent. Current
  rotation — Samuel Prajasantosa `6426ca1bf1b529dfa98f20c0` · Adrianus Vian Habirowo
  `712020:4ea96206-f50a-4408-9863-7ab409362ace` · Tiodor Sianturi
  `712020:c77a0038-9d80-481f-9a9e-caa38025faae`. Anyone else: `lookupJiraAccountId`.

## Gate — before every create

- [ ] Title matches the grammar above; one deliverable
- [ ] Headings exactly `## Description` / `## Acceptance Criteria`
- [ ] WHY in the first paragraph; evidence names where it was verified
- [ ] Every AC testable by QA; ≤6; none reference code, tests, or files
- [ ] No WAF bait in the body; draft kept locally
- [ ] Parent verified via `getJiraIssue`; type and level final
- [ ] `customfield_10100` (QA Owner) in `additional_fields` — sourced, not guessed

## Splitting — vertical, never by layer

Each slice still delivers value end-to-end (never API-only / UI-only). Patterns: workflow steps ·
CRUD operations · business-rule variations · data variations · simple-then-complex · defer
performance · isolate one-time infra · time-boxed spike.

---
Field-failure evidence behind the Create/Flow rules: [references/field-review-2026-07-10.md](references/field-review-2026-07-10.md).
Refs: Atlassian AC & Definition-of-Ready guides · altexsoft AC formats · Humanizing Work story
splitting · INVEST (Bill Wake).
