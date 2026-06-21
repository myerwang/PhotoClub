# Output Ratio Rule

This file is retained only for compatibility. The authoritative output format list is:

`system/rules/output_formats.md`

Read `system/rules/output_formats.md` at runtime and dynamically apply every active format. Do not copy active IDs, pixel dimensions, or a current-format list into this compatibility file.

Physical-size compatibility notes may describe standards such as Japanese photo sizes, ISO paper sizes, or inch-based photo sizes, but they do not register an output format. Only an active section in `system/rules/output_formats.md` defines the physical size, exact 300 dpi pixel dimensions, selectable orientation, and post-processing target.

The old ratio reference is retained only as an L-size fallback dimension check:

`<root>/比例参考/输出照片比例参考.png`

Rules:

- Output requests have exactly two allowed cases: (a) one active registered preset `format_id`, or (b) one-request custom pixel format validated by server/UI and never persisted to the registry.
- The registry remains the authority for presets.
- Use `system/rules/output_formats.md` as the authority for registered preset dimensions. Validated custom dimensions are authoritative only for the current request.
- Use the old ratio reference only for fallback L-size dimension checks.
- Do not copy its background, composition, colors, panels, or subject layout.
- If image generation returns another size, post-process the final asset to the exact pixel size required by the selected preset or validated custom target.
- Save final production assets under `output/`.
