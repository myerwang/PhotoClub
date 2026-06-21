---
name: profile
description: Use when creating, replacing, organizing, or using character-consistent image assets from project photos
---

# Character Profile Workflow

Use this project skill for character-consistent photo generation from the PhotoClub repository root (`<root>`).

Normal sessions should start with `system/skills/start/SKILL.md`.

## Mandatory Gate

Before generating:

1. Read `system/rules/character_identity_base.md`.
3. For character-profile creation with built-in `image_gen`, snapshot `$HOME/.codex/generated_images` before generation.
4. After generation, compare the post-generation snapshot with the pre-generation snapshot and copy the new generated file to `profiles/<name>/multiview_reference.png`.
5. If no new generated image file can be identified, stop and do not mark the profile complete.
6. If creating a character profile, do not require `format_id` or style selection.
7. For final styled output, read `system/rules/output_formats.md`.
8. For family sticker sheets, read `system/rules/family_sticker_composition.md`.
9. For sticker output, read `system/rules/print_ready_sticker_base.md`.
10. For final styled output, require either an active registered `format_id` or valid positive-integer custom width and height dimensions accepted by the selected style. If neither is specified, stop and ask for one.
11. Confirm every requested person has a readable `multiview_reference.png` before final styled output.
12. If no character profile exists, do not produce final output; create exactly one character-profile multiview reference image.
13. A profile has no separate success, failure, or approval state. Its availability is determined only by whether `profiles/<name>/multiview_reference.png` exists and is readable.
14. If a profile lacks `multiview_reference.png`, generate the standard multiview reference from all usable photos in the selected input directory before any final output or batch generation.
15. For final styled output, confirm the requested style exists under `styles/`.
16. Do not look for style records inside the character profile. Character profiles are style-free.
17. For family sticker sheets, generate exactly one sheet at a time. Do not batch-generate.
18. Do not continue to the next sheet until the current sheet is accepted or explicitly discarded.

## Character Profile Package Layout

Each character profile must live at:

```text
profiles/<name>/
```

Required files:

- `multiview_reference.png`

Do not copy source photos into `profiles/<name>/`.
Do not create `character_profile.md`.

Forbidden inside a character profile package:

- source-photo copies
- markdown records
- style records
- output-format records
- prompt text or prompt patterns
- generated style samples such as sticker approval images
- print-readiness notes
- written facial feature descriptions

Real character profile packages are local identity data and must stay ignored by git.

## Sticker Output Rules

Session-specific subject choices and one-off requirements belong only to the current generation prompt. Do not persist them into `styles/` unless the user explicitly requests a reusable style change.

For the sticker style, use the reusable default of 3 columns x 5 rows and 15 sticker islands. An explicit current-session request may override the grid, count, size distribution, or other special requirements for that generation only.

- Output format must be explicitly specified.
- Read `system/rules/output_formats.md` at runtime and dynamically resolve every active format. It is the sole authority for registered preset availability, dimensions, and orientation; do not copy its registry into this skill. A validated one-request custom target comes from the current request and is not a registry entry.
- Apply any print bleed/safe-margin requirements from the selected style rule, not from the output photo format.
- User-provided source photos live under `<root>/input/`.
- Generated deliverables go directly under `<root>/output/` unless they are being approved into `profiles/`.
- Do not create subfolders inside `<root>/output/` for finished outputs. One completed image means one image file copied or moved directly into `output/`.
- Use plain white background.
- Each sticker is an independent island.
- Thick white border, thin light-gray die-cut guide, subtle edge effect.
- No sticker, border, guide line, or shadow may touch or overlap another.
- Do not impose subject type, subject count, age, gender, solo/group, or combination restrictions from the sticker style.
- Apply composition restrictions only when a separate explicitly selected composition rule requires them.

## Character Profile Rule

Final image generation requires `profiles/<name>/multiview_reference.png`.

For character-profile creation, all usable photos in the selected input directory are identity inputs and must be treated as the same person.

For all later photo generation, sticker generation, and other styled output, `multiview_reference.png` is the only identity image input. Do not feed the original source photos again for later generation.

Do not use text-only facial descriptions as the main input for image generation.

The character profile artifact must be only one standard multiview image. It must strictly use one landscape `2 x 3` sheet with six consistently scaled chest-up bust views at yaw `0°, -45°, +45°, -90°, +90°, 180°`. Use an eye-level camera, pitch/roll `0°`, approximately `85mm` equivalent focal length, fixed distance, and the front panel as the shared identity anchor. It must not contain written facial feature descriptions, style instructions, prompt text, or source-photo copies.

The chest-up requirement applies only to profile creation. Do not carry profile framing into final-photo instructions. Final-photo composition is defined exclusively by the selected rule under `styles/`.

## Identity Preservation Prompt Rule

When validating or generating a character:

- for profile creation, provide every usable image from the selected input directory directly to the image model and say they are the same person
- for later generation, provide only `multiview_reference.png` as the identity image input
- do not rely on text to identify the person
- say "keep the same person as the provided image reference"
- say "do not reconstruct the face from text"
- do not describe facial features in the generation prompt
- reject outputs that match the words but no longer match the person

Forbidden:

- text-first facial feature extraction
- text-only face reconstruction
- long written facial descriptions used as the primary image prompt
- writing facial feature descriptions into the character profile
- prompt-time facial feature descriptions

## New Character Profile Creation

When creating a new profile:

1. Select one direct child directory under `<root>/input/`.
2. Treat that directory as one person.
3. Use every usable image file inside that directory as direct image input.
4. Use the input directory name directly as the display name and profile id.
5. Do not create profiles from loose image files directly under `<root>/input/`.
6. Snapshot `$HOME/.codex/generated_images` before calling built-in `image_gen`.
7. After generation, compare snapshots to find the new generated image file.
8. Tell the image model that every input image in the directory is the same person.
9. Create exactly one standard multiview reference image from the selected input directory before profile approval.
10. Require exactly six consistently framed chest-up bust views in the mandatory `2 x 3` layout and fixed professional camera specification; reject full-body, knee-up, waist-up, face-only, mixed-scale, mirrored, inconsistent-yaw, labeled, bordered, or decorative results.
11. Do not create multiple outputs from the input directory; the character-profile artifact is one image.
12. In photo-directory mode, do not create or approve a profile from textual facial descriptions. In explicit text-description mode, follow the real-versus-fictional workflow below.
13. Do not save prompt text or style instructions in the profile.
14. Copy the identified generated image file to `profiles/<name>/multiview_reference.png`, replacing the existing file when regenerating the same name.
15. If no new generated image file can be identified and saved, leave any existing profile file untouched and report generation failure.

## Replacement Workflow

1. Generate exactly one new standard multiview reference from all usable images under `input/<name>/`.
2. Save it as `profiles/<name>/multiview_reference.png`; the same name replaces the previous file directly.
3. Verify that the final file exists and is readable.
4. Do not create status records, source-photo copies, markdown profile records, or prompt files.

## Text-description Workflow

1. Accept an optional profile name and one user description.
2. When no name is supplied, infer the recognizable name of a confirmed real person or create a concise name for a fictional subject. Use one safe token and avoid existing profile ids.
3. Decide whether the subject is a real person.
4. For a real person, search for public images of that exact person and feed multiple suitable images directly to `image_gen` as one identity. Do not reconstruct the face from prose.
5. For a fictional subject, generate directly from the description. Do not borrow an unrelated real identity.
6. Generate exactly one standard chest-up `2 x 3` multiview image and write it to `profiles/<name>/multiview_reference.png`.
7. Save no prompt, web image, source note, or other profile artifact. A specified duplicate name replaces the existing final image.
