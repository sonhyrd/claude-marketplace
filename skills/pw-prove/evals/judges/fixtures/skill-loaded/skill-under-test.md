---
name: pw-prove
description: Stand-in for the real SKILL.md so these fixtures are hermetic.
license: Apache-2.0
metadata:
    author: e2e-skills
    version: 0.0.0-fixture
---

# pw-prove (fixture stand-in)

This file is not the shipped skill. It exists so the `skill-loaded` gate can be exercised against
a body whose lines never move, which keeps an ordinary edit to the real `skills/pw-prove/SKILL.md`
from turning a judge fixture red for no reason.

## Step 1 — the confirmation gate

Ask once before you start anything, and name the branch under proof in the same breath.

## Step 2 — bring-up

Never start a second dev server when one is already answering on the recorded port.
