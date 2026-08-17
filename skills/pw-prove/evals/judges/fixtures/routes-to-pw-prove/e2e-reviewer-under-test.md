---
name: e2e-reviewer
description: Stand-in for the real SKILL.md so these fixtures are hermetic.
license: Apache-2.0
metadata:
    author: e2e-skills
    version: 0.0.0-fixture
---

# e2e-reviewer (fixture stand-in)

This file is not the shipped skill. It exists so the routing judges can be exercised against a body
whose lines never move, which keeps an ordinary edit to the real skill from turning a fixture red.

## Phase 2 — the specs that already exist

Read every spec the project ships and decide, line by line, whether it would still pass with the
behaviour it claims to cover completely removed.
