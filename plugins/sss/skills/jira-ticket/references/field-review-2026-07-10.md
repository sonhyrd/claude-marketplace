# jira-ticket field review — 2026-07-10

Source: all Claude transcripts invoking `/jira-ticket` (10 sessions, 12 shipped tickets/edits,
Jul 7–10 2026: MAMAS-8789/8790/8817/8818/8821/8822/8825/8857-area/8876/8879/8881/8891 + favicon 8787).
Extraction: grep `createJiraIssue`/`editJiraIssue` tool_use blocks in `~/.claude/projects/*/*.jsonl`.

## Hard failures (cost real calls / duplicate tickets)

| # | Issue | Evidence | Fix in skill |
|---|-------|----------|--------------|
| 1 | **Cloudflare WAF rejects injection-looking descriptions.** Symptom: `Streamable HTTP error: Error POSTing to endpoint: <!DOCTYPE html>…`. Bait: raw HTML tags (`<meta …/>`), shell command lines (`curl -s https://…`). Backticks do not defuse. | MAMAS-8891: 2 failed `editJiraIssue` + 3 recovery calls (08:21–08:23). Final success only after removing the raw tag and the curl line. | §Create WAF rule: write defused up front; on the error, defuse and resend, never resend verbatim. |
| 2 | **Issue type/level is immutable after create.** `editJiraIssue` with a new `issuetype` across hierarchy levels → `"The issue type selected is invalid"`. | MAMAS-8821 (Subtask) could not become a Task; forced create of duplicate MAMAS-8822 + comment + transition to close 8821. 5 calls for one ticket. | Flow step 1: type & parent decided before create; escape hatch documented. |
| 3 | **Round-trip escaping shipped into tickets.** Markdown read back via `getJiraIssue` comes escaped; re-submitting it ships literal `\[ \]` (checkboxes dead) and `\_` artifacts. | Verified in raw payloads: 8822 create, 8825 create, 8817 edit = ESCAPED; all locally-drafted payloads clean. | Flow step 2: local draft is single source of truth; edits re-send it. |
| 4 | **Unbounded JQL parent search blew the context cap.** 138,398-char result. | pickerel 14:15:51 `searchJiraIssuesUsingJql`. | §Parent: bounded JQL recipe (`fields`, `maxResults ≤ 20`). |

## Consistency drift (skill ambiguity → divergent output)

| # | Issue | Evidence |
|---|-------|----------|
| 5 | 4 heading styles for the two mandatory fields: `**Description**`, `## Description`, `### Description`, `### 📝 Description` + `### 🔨 Acceptance Criteria`. Old skill never pinned a level; emoji appeared in the 2 most recent tickets only. | 8891/8876 emoji · butterfish/wentletrap bold · frigatebird/logperch/pickerel `##` |
| 6 | 3 title-prefix grammars: `[FE] - [Widget] - Emit…` (trailing dash), `[FE] - [Widget] Sort…`, `[FE] Add…`; subtasks 8789/8790 created with **no prefix** and retitled by hand later the same day. | wentletrap creates 08:47 vs getJiraIssue 15:38 showing fixed titles |
| 7 | AC-count rule ignored: 8876 shipped 7 ACs incl. an implementation AC naming a test file (`tests/start-job-search-contract.test.ts`) — the old skill's own "no implementation detail" rule. | gannet edit 13:11 |
| 8 | Labels invented ad hoc: `FE` (redundant with title prefix), `fde`, `prod`, `seo, career-page`. No convention existed in the skill. | butterfish/kaluga/mamas-7749/gardeneel |
| 9 | `[Maya]` area used in the field but absent from the skill's area list. | MAMAS-8879 |

## Missing capability (recurring user ask, zero skill support)

| # | Ask | Evidence |
|---|-----|----------|
| 10 | **Find/recommend a parent** — 5 of 10 invocations: "find a good parent", "file a good parent", "recommend me a good parent ticket", "add ticket as child of …", "make 2 ticket under parent one". Sessions improvised JQL (→ issue 4) and set parents post-create by edit. | butterfish, kaluga, frigatebird, pickerel, gardeneel |

## What worked (kept, codified)

- WHY-rich descriptions with **verified evidence** (real tenant, endpoint, observed values) — e.g. 8881's root-vs-entity payload diff, 8891's crawler constraint. Codified in the template.
- **Out of scope** on every ticket — visibly killed scope creep.
- `## Technical notes` separating implementer detail from the readable Description (8787). Codified.
- Links to ADR/PR/parent on every ticket.

## Self-audit metrics (re-run after ~10 more tickets)

Mine transcripts the same way (`createJiraIssue|editJiraIssue` tool_use in `~/.claude/projects/*/*.jsonl`):

1. **Write-calls per shipped ticket** — target 1 create + 0 failed (field: 8891 = 5, 8821/8822 = 5).
2. **Post-create structural edits** (type/parent churn) — target 0.
3. **Escaped payloads** — grep sent descriptions for `\[ \]` — target 0 (field: 3).
4. **Format conformance** — % payloads whose title matches `^\[..\]( - \[..\])* \S` and whose headings are exactly `## Description` / `## Acceptance Criteria` (field: ~40%).
5. **AC discipline** — per ticket: ≤6 items, none matching `test|\.spec|\.ts|\.vue|\.mjs` (field: 2 violations).
6. **User correction rate** — user messages amending a ticket after create (proxy for draft quality).
