---
name: release-version-bump
description: Cut a new version of the claude-marketplace repo. Use when bumping the version, preparing a release, updating CHANGELOG.md or changelogs/*.md, tagging a release, or deciding whether a change is a major/minor/patch bump.
---

# Release and Version Bump

This repo follows [Semantic Versioning 2.0.0](https://semver.org/) and [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## Version Bump Checklist

1. **Update CHANGELOG.md**
   - Move `## [Unreleased]` content to new version section with date
   - Format: `## [X.Y.Z] - YYYY-MM-DD`
   - Leave an empty `## [Unreleased]` section at the top
   - Update version comparison links at bottom:
     ```markdown
     [Unreleased]: https://github.com/dashed/claude-marketplace/compare/vX.Y.Z...HEAD
     [X.Y.Z]: https://github.com/dashed/claude-marketplace/compare/vPREVIOUS...vX.Y.Z
     ```

2. **Update individual skill changelogs (if applicable)**
   - Update `./changelogs/<skill-name>.md` for any skills that were added, updated, or modified
   - Document skill-specific changes from marketplace perspective
   - Use skill version from marketplace.json

3. **Update .claude-plugin/marketplace.json**
   - Update `metadata.version` field to new version number

4. **Update README.md**
   - Update version in the "Version" section to match marketplace version
   - Add new skills to "Available Skills" table if any were added

5. **Run validation**
   ```bash
   make validate-strict
   ```
   Ensure all checks pass before proceeding.

6. **Create git commit**
   ```bash
   git add CHANGELOG.md changelogs/ .claude-plugin/marketplace.json README.md
   git commit -m "chore: bump version to vX.Y.Z"
   ```

7. **Create git tag** (use the `v` prefix)
   ```bash
   git tag -a vX.Y.Z -m "Release vX.Y.Z"
   ```

8. **Push changes**
   ```bash
   git push origin master
   git push origin vX.Y.Z
   ```

## Which CHANGELOG to update

`CHANGELOG.md` tracks marketplace-level changes (validation system, tooling, infrastructure, patterns).
`changelogs/*.md` tracks individual skill changes from the marketplace perspective — **not** upstream
plugin development, which stays with the plugin.

Update ONLY `changelogs/<skill-name>.md`:
- Bug fixes in skill documentation
- Minor wording improvements
- Version updates without structural changes

Update BOTH `CHANGELOG.md` AND `changelogs/<skill-name>.md`:
- Implementing new organizational patterns (e.g. progressive disclosure with `references/`)
- Structural improvements that serve as examples for other skills
- Significant skill enhancements that impact marketplace quality

Update ONLY `CHANGELOG.md`:
- Adding new validation rules
- Updating tooling (Makefile, schemas)
- Infrastructure changes
- Adding/removing skills (high-level only)

When to touch `changelogs/`:
- Adding a new skill to marketplace → create a new changelog file with initial version
- Updating skill version in marketplace.json → add a new version section
- Removing a skill → add a "Removed" entry in the main `CHANGELOG.md`

See `./changelogs/README.md` for complete documentation.

## Example changelog entry

```markdown
### Added
- Static validation system with comprehensive checks for marketplace integrity
- JSON schemas for validation: plugin-schema.json, marketplace-schema.json
- Makefile with targets for validation, testing, and linting

### Changed
- Modernized validation workflow to use `uv run` pattern
- Removed unnecessary shebang lines from validator scripts
```

## Precedent: 0.10.0 → 0.11.0 (minor bump)

- **Why**: Added multiple new skills (anki-flashcards, style-writer, pup, etc.) and a significant jj skill update
- **Changed**:
  - `.claude-plugin/marketplace.json`: `"version": "0.10.0"` → `"version": "0.11.0"`
  - `CHANGELOG.md`: moved `## [Unreleased]` content to `## [0.11.0] - 2026-05-23`
  - `README.md`: updated version to `0.11.0`
  - Updated comparison links at bottom of CHANGELOG.md
