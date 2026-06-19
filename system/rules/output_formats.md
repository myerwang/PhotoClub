# Output Format Registry

Every final output must specify one registered `format_id`.

If the user does not specify an output format, stop and ask for the format before generating. Do not infer it silently.

## Available Formats

### `jp_711_photo_l_1051x1500`

- Status: active
- Label: 7-Eleven photo print L size
- Japanese context: convenience-store photo printing, L size
- Physical paper size: `89 x 127 mm`
- Pixel size: `1051 x 1500`
- Orientation: selectable (`portrait` or `landscape`)
- Pixel basis: 300 dpi, rounded to nearest whole pixel
- Size source: 7-Eleven photo print supports L/2L photo paper; Japanese L print standard is 89 x 127 mm
- Ratio-source fallback: `/Users/yohji/photo/比例参考/输出照片比例参考.png`
- Ratio-source fallback usage: dimensions only
- Default use: printable sticker sheets and photo-style outputs intended for this L-size print workflow

Rules:

- Portrait output must be exactly `1051 x 1500`; landscape output must be exactly `1500 x 1051`.
- Compose natively in the selected orientation. Do not generate in the opposite orientation and then rotate or crop.
- Do not add borders or generic safe margins because of orientation. Apply a safe margin only when the selected style explicitly requires one.
- Use the paper-size standard above as the authority for dimensions.
- The ratio-source file may be used only as a fallback dimension check.
- Do not copy the ratio-source file's background, composition, colors, panels, or subject layout.
- If generation returns another size, regenerate or post-process to the exact dimensions for the selected orientation.

### `jp_711_photo_2l_1500x2102`

- Status: active
- Label: 7-Eleven photo print 2L size
- Japanese context: convenience-store photo printing, 2L size
- Physical paper size: `127 x 178 mm`
- Pixel size: `1500 x 2102`
- Orientation: selectable (`portrait` or `landscape`)
- Pixel basis: 300 dpi, rounded to nearest whole pixel
- Size source: 7-Eleven photo print supports L/2L photo paper; Japanese 2L print standard is 127 x 178 mm
- Default use: printable sticker sheets and photo-style outputs intended for this 2L-size print workflow

Rules:

- Portrait output must be exactly `1500 x 2102`; landscape output must be exactly `2102 x 1500`.
- Compose natively in the selected orientation. Do not generate in the opposite orientation and then rotate or crop.
- Do not add borders or generic safe margins because of orientation. Apply a safe margin only when the selected style explicitly requires one.
- Use the paper-size standard above as the authority for dimensions.
- If generation returns another size, regenerate or post-process to the exact dimensions for the selected orientation.

## Adding Formats

New formats may be added here when needed.

Each format must define:

- `format_id`
- label
- intended print/use context
- physical paper size
- exact pixel size
- orientation
- pixel basis
- ratio or size source
- whether any source image is dimensions-only
- post-processing requirement
