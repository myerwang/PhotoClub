# Profile Bust Multiview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix character-profile output to one consistent bust multiview sheet while leaving final-photo composition exclusively to the selected style rule.

**Architecture:** Put the authoritative layout contract in the character identity rule, mirror the generation and validation requirements in the profile skill, and document the two-stage framing boundary for users and input preparation.

**Tech Stack:** Markdown rules and Codex project skills.

---

### Task 1: Define and propagate the framing contract

**Files:**
- Modify: `system/rules/character_identity_base.md`
- Modify: `system/skills/profile/SKILL.md`
- Modify: `docs/SYSTEM_USAGE.md`
- Modify: `input/README.md`

- [x] **Step 1: Verify the existing rules do not define a mandatory bust framing contract**

Run: `rg -n -i "full.?body|half.?body|head.?and.?shoulders|chest-up|胸像|全身|半身" system/skills/profile/SKILL.md system/rules/character_identity_base.md docs/SYSTEM_USAGE.md input/README.md`

Expected before implementation: no mandatory profile framing contract.

- [x] **Step 2: Add the mandatory 2x3 bust multiview layout and validation criteria**

Specify one landscape sheet with six chest-up views in fixed order, consistent scale, clothing, lighting, and background. Reject full-body, knee-up, waist-up, mixed framing, labels, and decorative presentation.

- [x] **Step 3: Preserve style ownership of final-photo composition**

State that the bust constraint applies only to profile creation and that final-photo composition is owned exclusively by the selected rule under `styles/`.

- [x] **Step 4: Verify the contract appears in every required layer**

Run: `rg -n "2 x 3|chest-up|final-photo|final photo|profile creation only" system/skills/profile/SKILL.md system/rules/character_identity_base.md docs/SYSTEM_USAGE.md input/README.md`

Expected: authoritative layout, workflow enforcement, and two-stage boundary are all present.
