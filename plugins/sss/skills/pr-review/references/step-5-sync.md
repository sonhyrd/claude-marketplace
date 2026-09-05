# pr-review — Step 5 reference: Sync

Moved verbatim from `SKILL.md`, whose Step 5 says when to read it. Nothing here changes the procedure `SKILL.md` states.

Conditional. It runs after the fix commit and before any proof, because an unsynced key renders as its raw dot-path — a browser pointed at a pre-sync server photographs `board.title` instead of the string the PR added.

Both conditions are load-bearing and neither implies the other:

| Config | Locale diff | Why |
|--------|-------------|-----|
| present | touched | Sync. There is a server, and this PR changed what should be on it. |
| present | untouched | No sync. Otherwise every PR in the two repos that have a config talks to the translation server, including the ones that touch no locale at all. |
| absent | touched | No sync. Locale JSON with no config is a repo with no server to sync to. |
| absent | absent | No sync — and this is every other repo, which is the point. |

Requiring both is also what makes the stage self-disabling everywhere else: the config is the repo saying it has a server, so nothing here maintains a list of repo names.

Run it even when Step 4 applied nothing and committed nothing. The findings are properties of the diff, not of the fixes, and a review that changed no code can still be reviewing a PR whose locale keys are not on the server yet.
