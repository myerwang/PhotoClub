---
name: start
description: Use when starting this photo generation system, checking what is missing, or guiding the user through choosing a character profile, style, output format, and draw count before generation
---

# Start Generation Session

Use this as the entry skill for `/Users/yohji/photo`.

This skill does not generate images. It collects choices and blocks generation until the required selections are complete.

## Required Files To Read

Read these first:

1. `system/rules/output_formats.md`
2. `system/rules/character_identity_base.md`
3. `system/rules/family_sticker_composition.md`
4. `styles/`
5. `docs/SYSTEM_USAGE.md`

Then verify the selected `profiles/<name>/multiview_reference.png` before handing off to generation.

## Selection Rule

All user-facing decisions must be presented as choices.

Use numbered choices when asking in text:

```text
请选择人物设定：
1. baby/img5474
2. baby/44E9544D
3. 创建新人物设定
```

Do not continue by guessing defaults.

## Initialization Checks

Check in this order:

1. Character profile availability
2. Photo style availability
3. Output format availability
4. Draw count

If anything is missing, present only the valid next choices.

## Step 1: Character Profile

List only direct `profiles/<name>/multiview_reference.png` files that exist and are readable.

If character profiles exist, offer:

- each available character profile
- create new character profile

If no character profile records exist, do not offer style or format yet. Offer only:

- create character profile from an input person directory

When creating a new character profile:

- List direct child directories under `/Users/yohji/photo/input/`.
- Treat each `input/<name>/` directory as one person.
- Use all usable images inside the selected directory as direct image inputs.
- Tell the image model that all images inside that directory are the same person.
- Use the selected input directory name directly as the character display name and profile id.
- If the user wants a custom name, ask them to create or rename the input directory before profile creation.
- Do not create profiles from loose image files directly under `input/`.
- First create exactly one standard multiview reference image. This is not a final styled output and is not batch generation.

Character profile creation must use all usable images in the selected input directory as direct image input. The output is exactly one `multiview_reference.png`. Do not create the profile or multiview reference from written facial feature descriptions. Do not store prompt text in the character profile.

## Step 2: Photo Style

After the user selects a character profile, read that profile.

Offer styles from `styles/`.

Treat request-specific additions as session parameters only. Do not write a person's name, subject selection, theme, clothing, pose, count, or other one-off generation request into `styles/` unless the user explicitly asks to modify the reusable style definition.

Do not assign approved, failed, or per-character style status. A character profile is available only when its `multiview_reference.png` exists and is readable.

Style readiness is not stored inside the selected character profile.

## Step 3: Output Format

Read `system/rules/output_formats.md`.

Offer every active `format_id`.

Current options:

- `jp_711_photo_l_1051x1500`: 7-Eleven photo print L size, `1051 x 1500`
- `jp_711_photo_2l_1500x2102`: 7-Eleven photo print 2L size, `1500 x 2102`

If no output format is selected, stop. Final generation requires a registered `format_id`.

## Step 4: Draw Count

If character profile, standard multiview reference, style, and format are available, offer draw-count choices:

```text
请选择抽卡数量：
1. 1组
2. 5组
3. 10组
4. 20组
5. 自定义数量
```

If the selected profile lacks a standard multiview reference, offer only:

```text
请选择抽卡数量：
1. 1组人物多视图
```

## Session Summary

Before image generation, produce this summary and ask for confirmation:

```text
本次生成参数：
- character_profile:
- style:
- format_id:
- draw_count:
- mode: validation | batch
- allowed_output:
```

`mode` rules:

- `validation`: missing standard multiview reference or format confirmation
- `batch`: readable standard multiview reference plus registered output format

## Handoff

After the user confirms the session summary, use `system/skills/profile/SKILL.md`.

Never hand off if:

- no character profile is selected
- no style is selected
- no registered `format_id` is selected
- draw count is missing
- batch mode was requested but the selected profile lacks `multiview_reference.png`
