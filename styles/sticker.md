---
style_id: sticker
name: 贴纸
thumbnail: sticker.png
---

# Style: Sticker

## Purpose

Printable sticker sheet assets. This file defines visual and print behavior only.

## Required Output

- explicit active registered output `format_id`
- read `system/rules/output_formats.md` at runtime and dynamically resolve every active format
- derive the exact portrait or landscape pixel dimensions from the selected registry section; do not maintain a supported-format list in this style
- export at those exact dimensions without substituting a nearby ratio or rotating and cropping another canvas
- plain white background
- independent sticker islands
- default layout: exactly 3 columns x 5 rows, for 15 sticker islands
- an explicit session request may override columns, rows, island count, size distribution, or other special layout requirements for that generation only
- after a session override, the reusable default remains 3 columns x 5 rows
- thick white border
- thin light-gray die-cut guide outline
- subtle sticker edge effect
- no overlap, touching, merging, or shared border between sticker islands
- sticker-style print bleed requirement below

Subject identity, subject type, subject count, age, gender, and allowed combinations are outside this style rule.

## Visual Language

- Create polished, cute die-cut character stickers rather than photorealistic cutout photos.
- Preserve recognizable identity from the selected multiview references while simplifying forms into clean, friendly illustration.
- Use crisp silhouettes, rounded readable shapes, clear facial expressions, balanced bright colors, restrained soft cel shading, and small purposeful highlights.
- Keep faces and hands clean and legible at print size. Avoid muddy painterly texture, generic emoji faces, excessive realism, plastic 3D rendering, and flat clip-art appearance.
- Each sticker island should read as a complete expressive mini-scene or pose, not merely the same portrait duplicated across the sheet.

## Default Variation

When the selected subjects are people and the current request does not specify otherwise:

- Randomize clothing, clothing colors, facial expressions, gestures, and poses across sticker islands.
- Make the variation intentional and visibly different from island to island; avoid repeated outfits, repeated expressions, and near-duplicate poses.
- Keep every selected person's identity, age, role, and recognizable appearance stable while varying only presentation.
- Do not carry the neutral expression or plain reference clothing from character-profile creation into the final sticker sheet.
- Do not write these randomized final-output choices back into any character profile.

These are visual-variation defaults, not restrictions on which people or combinations may appear. An explicit session request may override them for that generation only.

## Sticker-Style Print Bleed Requirement

This requirement belongs to sticker style generation only. It does not change the registered output photo size, and it must not be applied to non-sticker photo styles.

- Use an outer safe margin equal to approximately 3% of the canvas width on every side.
- Safe-margin examples only: a `1051 x 1500` portrait canvas uses about 32 px, while a `1500 x 2102` portrait canvas uses about 45 px. Calculate all other portrait and landscape margins from the selected canvas width.
- Keep every sticker cut line, artwork, white border, die-cut guide, and edge effect inside that safe margin.
- Leave only this outer margin plain white; do not create a second inset during post-processing.
- Use the available width efficiently with the default 3-column layout.
- Use the full registered canvas size for export; the bleed rule only controls sticker placement within that canvas.
