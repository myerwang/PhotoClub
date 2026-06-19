# Terms

## Root Photo

An original user-provided image stored under a person directory such as `/Users/yohji/photo/input/<name>/`.

## Input Person Directory

A direct child directory under `/Users/yohji/photo/input/`. One input person directory represents one person, and its directory name becomes the character display name and profile id.

## Character Profile

The required person definition before any final image generation. It is exactly one standard multiview reference image: `profiles/<name>/multiview_reference.png`. It must not include source-photo copies, markdown notes, style content, prompt text, output formats, generated style samples, or written facial feature descriptions. No production image may be generated without this image.

## Character Profile Package

The approved local folder for one person or group. It contains only `multiview_reference.png`. Later production generation uses only this image as the identity image input.

## Style

The visual generation style. Current confirmed style: `sticker`.

## Style Rule

A public, reusable visual rule document under `styles/`. It defines how a style should look and what constraints it must obey, but it does not store person identity data.

## Output Format

A registered final export format under `system/rules/output_formats.md`. Every final output must specify a `format_id`. Current 7-Eleven formats include `jp_711_photo_l_1051x1500` for L size and `jp_711_photo_2l_1500x2102` for 2L size.

## Generation Session

The selected set of `character_profile`, `style`, `format_id`, and `draw_count`. A generation session must be confirmed before image generation starts.

## Person Category

The person grouping under a style, such as `baby`, `male`, `female`, or `family`.

## Validation Sample

A single standard multiview reference image created before character profile approval from all usable source photos in one input person directory.

## Batch Generation

Generating 5, 10, 20, or more outputs from an approved character profile and selected style rule. Batch generation is forbidden without an approved character profile and `multiview_reference.png`.

## Sticker Island

One independent printable sticker element. Its artwork, white border, gray die-cut line, and edge effect must not touch or overlap any other sticker island.

## Die-Cut Guide

The thin light-gray outline outside a sticker's white border, used as a visual cutting guide.
