# Output Ratio Rule

This file is retained only for compatibility. The authoritative output format list is:

`system/rules/output_formats.md`

Current registered formats:

`jp_711_photo_l_1051x1500`
`jp_711_photo_2l_1500x2102`

Authoritative print sizes:

- L: `89 x 127 mm`, exported as `1051 x 1500` at 300 dpi.
- 2L: `127 x 178 mm`, exported as `1500 x 2102` at 300 dpi.

The old ratio reference is retained only as an L-size fallback dimension check:

`/Users/yohji/photo/比例参考/输出照片比例参考.png`

Rules:

- Output requests must specify one registered `format_id`.
- Use `system/rules/output_formats.md` as the authority for final dimensions.
- Use the old ratio reference only for fallback L-size dimension checks.
- Do not copy its background, composition, colors, panels, or subject layout.
- If image generation returns another size, post-process the final asset to the exact pixel size required by the selected `format_id`.
- Save final production assets under `output/`.
