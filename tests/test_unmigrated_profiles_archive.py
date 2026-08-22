"""Tests that the unmigrated repo profiles stay out of the published plugin.

`references/unmigrated-profiles.md` shipped 117 lines of four other
organisations' repo constraints — absolute paths into the author's Mac, a
private fork's internals — inside the MIT-licensed `sss` plugin, to every
installer. The skill never read it: its own header calls it "a parking bay, not
a source of truth".

It now lives in `docs/`, which the plugin does not publish, and stays visible as
a to-do with a defined completion condition rather than being buried in scratch.
Each clause below is one property that made the move worth doing; the guarded
failure mode is the archive drifting back into `plugins/`, or losing the header
that says when it may be deleted.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parent.parent
ARCHIVE = REPO / "docs" / "agents" / "unmigrated-delegate-profiles.md"
REFERENCES = REPO / "plugins" / "sss" / "skills" / "delegate-tickets" / "references"
OLD_PATH = REFERENCES / "unmigrated-profiles.md"
TEMPLATE = REFERENCES / "profile-template.md"

MARKDOWN_LINK = re.compile(r"\[[^\]]*\]\(([^)]+)\)")


@pytest.fixture(scope="module")
def archive_text() -> str:
    assert ARCHIVE.is_file(), f"the profile archive is missing from {ARCHIVE}"
    return ARCHIVE.read_text(encoding="utf-8")


def test_archive_is_not_under_plugins() -> None:
    """The published plugin ships no copy of the archive, under any name."""
    assert not OLD_PATH.exists(), f"{OLD_PATH} is published to every installer"
    stray = [
        path
        for path in (REPO / "plugins").rglob("*.md")
        if "unmigrated" in path.name
    ]
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


def test_header_states_the_completion_condition(archive_text: str) -> None:
    """The archive says what retires it, so it reads as a to-do, not a design."""
    header = " ".join(archive_text.split("## ", 1)[0].split())
    assert "docs/agents/delegate-profile.md" in header
    assert "delete this file" in header
    assert "does not read this file" in header


def test_template_pointer_resolves_from_the_new_location(archive_text: str) -> None:
    """The `profile-template.md` link is relative to `docs/agents/`, not the plugin."""
    assert TEMPLATE.is_file(), "the template the archive points at is gone"
    hrefs = [
        href
        for href in MARKDOWN_LINK.findall(archive_text)
        if "profile-template.md" in href
    ]
    assert hrefs, "the archive no longer points at the profile template"
    for href in hrefs:
        resolved = (ARCHIVE.parent / href).resolve()
        assert resolved == TEMPLATE.resolve(), f"broken template link: {href}"


def test_no_entry_claims_the_fork_still_ships_the_generator(archive_text: str) -> None:
    """The e2e fork retired `playwright-test-generator` (`652c696`).

    Naming it in the header, as the correction the move made, is the point;
    an *entry* still describing the fork's bundle as containing it is the
    stale claim.
    """
    entries = archive_text[archive_text.index("\n## ") :]
    assert "playwright-test-generator" not in entries
    assert "cypress-debugger" not in entries
