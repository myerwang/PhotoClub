# Print-Ready Sticker Base

This rule defines visual layout and print readiness only. It must not decide which subjects may appear.

## Canvas

- Require one active `format_id` from `system/rules/output_formats.md`.
- Supported 7-Eleven formats:
  - `jp_711_photo_l_1051x1500`: `1051 x 1500`
  - `jp_711_photo_2l_1500x2102`: `1500 x 2102`
- Export at the exact registered pixel size.
- Use a portrait canvas and plain white background.
- Follow the sticker-only bleed rule in `styles/sticker.md`.

## Scope Boundary

This rule must not restrict:

- subject identity or type
- number of subjects
- age or gender
- solo or group subjects
- subject combinations
- subject-specific expressions, poses, clothing, props, or themes as eligibility restrictions

Those choices come from the generation request, the selected style's non-restrictive visual-variation defaults, or a separately selected composition rule. Character identity sourcing is handled outside the sticker style rules.

## Required Appearance

- Arrange multiple separate die-cut sticker islands on one flat printable sheet.
- Keep every sticker fully inside the canvas.
- Give every sticker one continuous thick white border.
- Add one thin light-gray die-cut guide outside the white border.
- Add a faint inner highlight and a tiny soft contact shadow directly under the border.
- Keep the edge effect attached to its own sticker.
- Leave generous visible white space for cutting.
- Keep at least 50 px between neighboring outer die-cut guide outlines; prefer 60-80 px.
- Keep every cut line and all sticker artwork inside an outer safe margin equal to about 3% of the canvas width.
- Use about 32 px for `1051 x 1500` and about 45 px for `1500 x 2102`.
- Apply the safe margin once only; do not shrink an already compliant generated sheet into a second inset frame.
- Use the available page width efficiently with the default 3-column layout.
- Do not silently reduce the default 15-island count. Regenerate or adjust island scale when spacing cannot be maintained.

## Forbidden Appearance

- packaging, plastic covers, hanging holes, backing cards, or product mockups
- paper texture that interferes with cutting
- package or display shadows
- readable text, logos, watermarks, or brand labels unless explicitly requested
- overlapping, touching, merging, or shared sticker boundaries
- crossing or touching white borders and die-cut guides
- shadows extending under neighboring stickers
- stickers clipped by the canvas edge
- artwork, borders, guides, or shadows crossing the outer 3%-of-width safe margin
- excessive unused outer whitespace caused by applying the safe margin more than once
- dense packing that removes cut space

## Sticker Edge Model

Each sticker island uses this order:

1. Sticker artwork.
2. Thick white border around the complete island.
3. Thin light-gray die-cut guide outside the border.
4. Faint inner highlight and tiny soft contact shadow attached to the border.

Each island has one continuous outer border and one continuous die-cut guide regardless of its subject content.

## Layout Model

- Default: exactly 3 columns x 5 rows, for 15 independent sticker islands.
- Keep the default unless the current session explicitly requests a different column count, row count, island count, size distribution, or special layout.
- A session override applies only to that generation and must not replace the reusable 3 x 5 default.
- Vary island sizes only when requested or when all 15 grid positions remain visually clear.
- Avoid stickers too small to cut cleanly.
- Do not overlap, partially hide, or connect separate sticker islands.

## Base Prompt Pattern

```text
Create a flat print-ready sticker sheet for the selected registered output format.
Use the exact registered canvas size and a plain pure white background.
Unless the current session explicitly overrides the layout, arrange exactly 15 separate die-cut sticker islands in 3 columns x 5 rows with generous cutting space.
Give every island a thick clean white border, a thin light-gray die-cut guide outside it, and a faint attached edge effect.
No artwork, border, guide, or shadow may touch, overlap, merge, or share a boundary with another island.
Keep at least 50 px of white space between neighboring outer guide lines.
Keep an outer plain-white safe margin equal to about 3% of the canvas width: about 32 px for 1051 x 1500 or 45 px for 1500 x 2102.
Apply this margin once and use the remaining page width efficiently with the default 3-column layout.
No packaging, backing card, plastic cover, hanging hole, product mockup, logo, or watermark.
Do not add any subject identity, count, age, gender, solo/group, or combination restriction from this sticker rule.
For human subjects, follow the selected sticker style's default variation: vary clothing, clothing colors, expressions, gestures, and poses across islands while preserving each identity.
```

## Quality Check

Reject or regenerate if:

- no registered `format_id` was specified
- exported dimensions differ from the selected format
- the result looks like packaged stationery or a product mockup
- the background is not plain white
- any sticker, border, guide, or shadow overlaps or touches another
- less than 50 px of white space remains between neighboring outer guide lines
- any sticker is clipped
- any artwork, border, guide, or shadow crosses the outer 3%-of-width safe margin
- the safe margin was applied twice or produces excessive unused page space
- the default layout is not exactly 3 columns x 5 rows and no explicit session override was provided
- the white border or light-gray die-cut guide is missing
- edge shadows look like large display shadows
- the sticker rule introduces restrictions on subject identity, count, age, gender, or combinations
