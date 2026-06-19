# Family Sticker Composition Rule

This project uses a three-person family model for mixed family sticker sheets.

## Active Family Model

Each generated family sticker sheet selects exactly:

- one adult man
- one adult woman
- one baby

All source photos under one baby input directory refer to the same baby and are used only to create that baby's single multiview reference.

There may be multiple approved adult woman profiles. Use only one adult woman profile per generated image. Do not put two adult women in the same generated image.

## Baby Rule

Do not treat multiple baby source photos from one input directory as multiple babies.

Forbidden:

- two baby characters appearing together as siblings
- baby A and baby B as separate identities
- "two babies together" stickers when both are from this same baby profile

Allowed:

- one baby appearing in several different stickers on the same sheet
- one baby solo sticker
- one baby with adult man
- one baby with adult woman
- full family sticker with adult man, adult woman, and one baby

## Adult Rule

Adult solo stickers are forbidden.

If multiple adult women are approved, select exactly one adult woman for a generated image.

Allowed adult compositions:

- adult man + baby
- adult woman + baby
- adult man + adult woman
- adult man + adult woman + baby

Forbidden adult compositions:

- adult man alone
- adult woman alone
- two adult women together
- two adult woman profiles in the same generated image

## Duplicate Identity Rule

Within one sticker island, the same identity may appear at most once.

Do not create cloned duplicates inside a single sticker, such as:

- two copies of the same baby
- two copies of the adult man
- two copies of the selected adult woman

A sticker sheet may contain the same selected identity across multiple separate sticker islands.

## Identity Rule

Every person in the family set must have an approved character profile.

For character-profile creation, provide every usable photo from the selected input directory to the image model and state that all images in that directory are the same person.

For every later family generation, provide only each active person's approved `multiview_reference.png` to the image model. Do not feed original source photos again. Do not generate any family member from text-only facial descriptions.

## Current Status

Approved profiles must be read from `profiles/INDEX.md`. Do not assume any family member is approved unless that index and the profile record both confirm it.

Family batch generation is blocked until a single generated sheet passes user review under this rule.

Generate one sheet at a time. Do not continue to the next draw until the current draw is accepted or explicitly discarded.

For family sticker sheets, prefer 10-19 sticker islands per sheet after the 20% density increase, but never reduce spacing below the print-ready sticker base rule.
