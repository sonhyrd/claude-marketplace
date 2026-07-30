---
name: add-marketplace-skill
description: Add a new skill plugin to this marketplace. Use when creating a new skill under plugins/, writing or reviewing a SKILL.md frontmatter block, or deciding what belongs in SKILL.md versus references/.
---

# Adding a New Skill

## Checklist

1. [ ] Create `plugins/<skill-name>/` directory (kebab-case, matching the skill name)
2. [ ] Create `plugins/<skill-name>/skills/<skill-name>/SKILL.md` with YAML frontmatter
3. [ ] Create `references/` inside the skill directory (if needed for advanced docs)
4. [ ] Add plugin entry to `.claude-plugin/marketplace.json` (with `"skills": ["./skills"]`)
5. [ ] Create `changelogs/<skill-name>.md`
6. [ ] Update `CHANGELOG.md` under `## [Unreleased]`, prefixing each line with `<skill-name> skill:`
7. [ ] Run `make validate`

Copy the shape of an existing plugin under `plugins/` rather than reinventing the layout, and check the
marketplace entry against `schemas/marketplace-schema.json`.

## SKILL.md frontmatter (required)

```yaml
---
name: skill-name
description: Brief description of what the skill does. Use when [specific triggers]. Include contexts that should activate this skill.
---
```

- `name`: kebab-case, max 64 chars, pattern `^[a-z0-9]+(-[a-z0-9]+)*$`
- `description`: 20–1024 chars, and **must include "Use when..." triggers**

The description is the primary activation mechanism — Claude reads *only* the frontmatter when deciding
whether to use a skill, so be specific about the contexts that should trigger it.

Good example:

```yaml
description: Manage and rebase chains of dependent Git branches (stacked branches). Use when working with multiple dependent PRs, feature branches that build on each other, or maintaining clean branch hierarchies. Automates rebasing or merging entire branch chains.
```

## SKILL.md body

The body loads only AFTER the skill triggers. Recommended sections: Overview, When to Use,
Prerequisites, Basic Workflow, Core Commands/Reference, Advanced Usage, Troubleshooting.

- Keep SKILL.md under 500 lines to minimize context bloat
- Challenge each paragraph: "Does Claude really need this?"
- Prefer concise examples over verbose explanations

## Progressive disclosure

Keep SKILL.md focused on common use cases; move detail into `references/`:

```
plugins/git-chain/skills/git-chain/
├── SKILL.md                      (common workflows, ~200 lines)
└── references/
    ├── rebase-options.md         (all rebase flags and options)
    ├── merge-options.md          (all merge flags and strategies)
    └── chain-management.md       (advanced chain operations)
```

Link from SKILL.md:

```markdown
## Advanced Usage

For comprehensive coverage of all flags and advanced patterns, see:
- [references/rebase-options.md](references/rebase-options.md)
```

Guidelines:
- Keep references one level deep from SKILL.md
- Include a table of contents in reference files over ~100 lines
- Reference files should be self-contained and focused on one topic

Optional sibling directories: `scripts/` (executable code) and `assets/` (templates, images).
