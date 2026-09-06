"""Tests that the unmigrated repo profiles stay out of the published plugin.

`references/unmigrated-profiles.md` shipped 117 lines of four other
organisations' repo constraints — absolute paths into the author's Mac, a
private fork's internals — inside the MIT-licensed `sss` plugin, to every
installer. The skill never read it: its own header called it "a parking bay,
not a source of truth".

The archive itself is gone. `/sss:delegate-tickets` was retired (#99) and the
parking bay went with it; its five entries are preserved verbatim in #106, and
the plugin no longer ships a `delegate-tickets` directory to put them back in.

What survives is the property that made the move worth doing, and it is not
about that skill. The guarded failure mode is those constraints landing under
`plugins/` — and #99 *raised* that risk rather than retiring it, because
copying the five entries into a public issue leaves the next person who wants
them back holding a paste buffer of exactly the content that must never be
published. So the subject of both tests below is the `plugins/` tree, which is
what it always was; neither one reads the archive, which is why both keep
working now that it is deleted.
"""

from __future__ import annotations

from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
REFERENCES = REPO / "plugins" / "sss" / "skills" / "delegate-tickets" / "references"
OLD_PATH = REFERENCES / "unmigrated-profiles.md"


def test_archive_is_not_under_plugins() -> None:
    """The published plugin ships no copy of the archive, under any name."""
    assert not OLD_PATH.exists(), f"{OLD_PATH} is published to every installer"
    stray = [path for path in (REPO / "plugins").rglob("*.md") if "unmigrated" in path.name]
    assert not stray, f"archive copies still under plugins/: {stray}"


def test_no_plugin_file_points_at_the_old_path() -> None:
    """Nothing the plugin ships sends a reader to the pre-move path."""
    readable = [
        path
        for pattern in ("*.md", "*.json")
        for path in (REPO / "plugins").rglob(pattern)
        if path.is_file() and not path.is_symlink()
    ]
    offenders = [
        path.relative_to(REPO)
        for path in readable
        if "unmigrated-profiles" in path.read_text(encoding="utf-8", errors="ignore")
    ]
    assert not offenders, f"files under plugins/ reference the old path: {offenders}"
