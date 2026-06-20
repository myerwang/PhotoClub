# Output Format Registry

Every final output must use exactly two allowed cases: (a) one active registered preset `format_id`, or (b) one-request custom pixel format validated by server/UI and never persisted to the registry.

The registry remains the authority for presets. If the user supplies neither an active registered preset nor validated one-request custom pixel dimensions, stop and ask for the format before generating. Do not infer it silently.

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

### `jp_photo_dsc_1051x1406`

- Status: active
- Label: DSC
- Physical paper size: `89 x 119 mm`
- Pixel size: `1051 x 1406`
- Orientation: selectable (`portrait` or `landscape`)
- Pixel basis: 300 dpi, rounded to nearest whole pixel
- Size source/rationale: Japanese DSC print standard is 89 x 119 mm
- Source image usage: none (textual physical-size standard only; dimensions-only)
- Default use: printable sticker sheets and photo-style outputs intended for DSC-size paper

Rules:

- Portrait output must be exactly `1051 x 1406`; landscape output must be exactly `1406 x 1051`.
- Compose natively in the selected orientation. Do not generate in the opposite orientation and then rotate or crop.
- Do not add borders or generic safe margins because of orientation. Apply a safe margin only when the selected style explicitly requires one.
- Use the paper-size standard above as the authority for dimensions.
- If generation returns another size, regenerate or post-process to the exact dimensions for the selected orientation.

### `jp_photo_kg_1205x1795`

- Status: active
- Label: KG
- Physical paper size: `102 x 152 mm`
- Pixel size: `1205 x 1795`
- Orientation: selectable (`portrait` or `landscape`)
- Pixel basis: 300 dpi, rounded to nearest whole pixel
- Size source/rationale: Japanese KG print standard is 102 x 152 mm
- Source image usage: none (textual physical-size standard only; dimensions-only)
- Default use: printable sticker sheets and photo-style outputs intended for KG-size paper

Rules:

- Portrait output must be exactly `1205 x 1795`; landscape output must be exactly `1795 x 1205`.
- Compose natively in the selected orientation. Do not generate in the opposite orientation and then rotate or crop.
- Do not add borders or generic safe margins because of orientation. Apply a safe margin only when the selected style explicitly requires one.
- Use the paper-size standard above as the authority for dimensions.
- If generation returns another size, regenerate or post-process to the exact dimensions for the selected orientation.

### `jp_photo_mutsugiri_2398x3000`

- Status: active
- Label: 六切
- Physical paper size: `203 x 254 mm`
- Pixel size: `2398 x 3000`
- Orientation: selectable (`portrait` or `landscape`)
- Pixel basis: 300 dpi, rounded to nearest whole pixel
- Size source/rationale: Japanese 六切 print standard is 203 x 254 mm
- Source image usage: none (textual physical-size standard only; dimensions-only)
- Default use: printable sticker sheets and photo-style outputs intended for 六切-size paper

Rules:

- Portrait output must be exactly `2398 x 3000`; landscape output must be exactly `3000 x 2398`.
- Compose natively in the selected orientation. Do not generate in the opposite orientation and then rotate or crop.
- Do not add borders or generic safe margins because of orientation. Apply a safe margin only when the selected style explicitly requires one.
- Use the paper-size standard above as the authority for dimensions.
- If generation returns another size, regenerate or post-process to the exact dimensions for the selected orientation.

### `iso_a4_2480x3508`

- Status: active
- Label: A4
- Physical paper size: `210 x 297 mm`
- Pixel size: `2480 x 3508`
- Orientation: selectable (`portrait` or `landscape`)
- Pixel basis: 300 dpi, rounded to nearest whole pixel
- Size source/rationale: ISO A4 paper standard is 210 x 297 mm
- Source image usage: none (textual physical-size standard only; dimensions-only)
- Default use: printable sticker sheets and photo-style outputs intended for A4 paper

Rules:

- Portrait output must be exactly `2480 x 3508`; landscape output must be exactly `3508 x 2480`.
- Compose natively in the selected orientation. Do not generate in the opposite orientation and then rotate or crop.
- Do not add borders or generic safe margins because of orientation. Apply a safe margin only when the selected style explicitly requires one.
- Use the paper-size standard above as the authority for dimensions.
- If generation returns another size, regenerate or post-process to the exact dimensions for the selected orientation.

### `intl_photo_4x6_1200x1800`

- Status: active
- Label: 4 x 6 inch
- Physical paper size: `4 x 6 inch`
- Pixel size: `1200 x 1800`
- Orientation: selectable (`portrait` or `landscape`)
- Pixel basis: 300 dpi, rounded to nearest whole pixel
- Size source/rationale: North American 4 x 6 inch photo print standard at 300 dpi
- Source image usage: none (textual physical-size standard only; dimensions-only)
- Default use: printable sticker sheets and photo-style outputs intended for 4 x 6 inch paper

Rules:

- Portrait output must be exactly `1200 x 1800`; landscape output must be exactly `1800 x 1200`.
- Compose natively in the selected orientation. Do not generate in the opposite orientation and then rotate or crop.
- Do not add borders or generic safe margins because of orientation. Apply a safe margin only when the selected style explicitly requires one.
- Use the paper-size standard above as the authority for dimensions.
- If generation returns another size, regenerate or post-process to the exact dimensions for the selected orientation.

### `intl_photo_5x7_1500x2100`

- Status: active
- Label: 5 x 7 inch
- Physical paper size: `5 x 7 inch`
- Pixel size: `1500 x 2100`
- Orientation: selectable (`portrait` or `landscape`)
- Pixel basis: 300 dpi, rounded to nearest whole pixel
- Size source/rationale: North American 5 x 7 inch photo print standard at 300 dpi
- Source image usage: none (textual physical-size standard only; dimensions-only)
- Default use: printable sticker sheets and photo-style outputs intended for 5 x 7 inch paper

Rules:

- Portrait output must be exactly `1500 x 2100`; landscape output must be exactly `2100 x 1500`.
- Compose natively in the selected orientation. Do not generate in the opposite orientation and then rotate or crop.
- Do not add borders or generic safe margins because of orientation. Apply a safe margin only when the selected style explicitly requires one.
- Use the paper-size standard above as the authority for dimensions.
- If generation returns another size, regenerate or post-process to the exact dimensions for the selected orientation.

### `intl_photo_8x10_2400x3000`

- Status: active
- Label: 8 x 10 inch
- Physical paper size: `8 x 10 inch`
- Pixel size: `2400 x 3000`
- Orientation: selectable (`portrait` or `landscape`)
- Pixel basis: 300 dpi, rounded to nearest whole pixel
- Size source/rationale: North American 8 x 10 inch photo print standard at 300 dpi
- Source image usage: none (textual physical-size standard only; dimensions-only)
- Default use: printable sticker sheets and photo-style outputs intended for 8 x 10 inch paper

Rules:

- Portrait output must be exactly `2400 x 3000`; landscape output must be exactly `3000 x 2400`.
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
- ratio or size source/rationale
- whether any source image is dimensions-only
- post-processing requirement
