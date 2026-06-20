# Output Ratio Rule

This file is retained only for compatibility. The authoritative output format list is:

`system/rules/output_formats.md`

Current registered formats:

- `jp_711_photo_l_1051x1500` - 89 x 127 mm, 1051 x 1500 px
- `jp_711_photo_2l_1500x2102` - 127 x 178 mm, 1500 x 2102 px
- `jp_photo_dsc_1051x1406` - 89 x 119 mm, 1051 x 1406 px
- `jp_photo_kg_1205x1795` - 102 x 152 mm, 1205 x 1795 px
- `jp_photo_mutsugiri_2398x3000` - 203 x 254 mm, 2398 x 3000 px
- `iso_a4_2480x3508` - 210 x 297 mm, 2480 x 3508 px
- `intl_photo_4x6_1200x1800` - 4 x 6 inch, 1200 x 1800 px
- `intl_photo_5x7_1500x2100` - 5 x 7 inch, 1500 x 2100 px
- `intl_photo_8x10_2400x3000` - 8 x 10 inch, 2400 x 3000 px

Authoritative print sizes:

- L: `89 x 127 mm`, exported as `1051 x 1500` at 300 dpi.
- 2L: `127 x 178 mm`, exported as `1500 x 2102` at 300 dpi.
- DSC: `89 x 119 mm`, exported as `1051 x 1406` at 300 dpi.
- KG: `102 x 152 mm`, exported as `1205 x 1795` at 300 dpi.
- 六切: `203 x 254 mm`, exported as `2398 x 3000` at 300 dpi.
- A4: `210 x 297 mm`, exported as `2480 x 3508` at 300 dpi.
- 4 x 6 inch: exported as `1200 x 1800` at 300 dpi.
- 5 x 7 inch: exported as `1500 x 2100` at 300 dpi.
- 8 x 10 inch: exported as `2400 x 3000` at 300 dpi.

The old ratio reference is retained only as an L-size fallback dimension check:

`/Users/yohji/photo/比例参考/输出照片比例参考.png`

Rules:

- Output requests must specify one registered `format_id`.
- Use `system/rules/output_formats.md` as the authority for final dimensions.
- Use the old ratio reference only for fallback L-size dimension checks.
- Do not copy its background, composition, colors, panels, or subject layout.
- If image generation returns another size, post-process the final asset to the exact pixel size required by the selected `format_id`.
- Save final production assets under `output/`.
