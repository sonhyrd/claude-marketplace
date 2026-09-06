"""Keep the unmigrated repo profiles out of the published `sss` plugin.

The archive shipped 117 lines of four other organisations' repo constraints --
absolute paths into a personal machine, a private fork's internals -- inside the
MIT-licensed `sss` plugin, to every installer. It went with
`/sss:delegate-tickets` (#99); its five entries are preserved in #106.

The subject of both tests below is the `plugins/` tree, not the archive, which is
why both keep working now that the archive is deleted. Both match on the
archive's *names*, not on its content: a copy filed back under either name is
caught, a paste under a new one is not.
"""

from __future__ import annotations

from pathlib import Path

REPO = Path(__file__).resolve().parent.parent

# Both names the archive has had: `references/unmigrated-profiles.md` inside the
# plugin, and `docs/agents/unmigrated-delegate-profiles.md` after the move out.
OLD_PATH_NAMES = ("unmigrated-profiles", "unmigrated-delegate-profiles")


def test_archive_is_not_under_plugins() -> None:
    """The published plugin ships no copy of the archive, under either name."""
    stray = [path for path in (REPO / "plugins").rglob("*.md") if "unmigrated" in path.name]
    assert not stray, f"archive copies still under plugins/: {stray}"


def test_no_plugin_file_points_at_the_old_path() -> None:
    """Nothing the plugin ships sends a reader to either archive path."""
    readable = [
        path
        for pattern in ("*.md", "*.json")
        for path in (REPO / "plugins").rglob(pattern)
        if path.is_file() and not path.is_symlink()
    ]
    offenders = [
        path.relative_to(REPO)
        for path in readable
        if any(name in path.read_text(encoding="utf-8", errors="ignore") for name in OLD_PATH_NAMES)
    ]
    assert not offenders, f"files under plugins/ reference an old archive path: {offenders}"
