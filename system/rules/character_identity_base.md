# Character Identity Base Rule

Final-photo character identity must be preserved from the approved standard multiview reference, not reconstructed from text.

## Hard Rule

Character profiles may be created either from an input-directory photo set or from the control page's explicit text-description mode.

After `multiview_reference.png` is approved, it is the only identity image input for all later generated photos, sticker sheets, and other styled outputs.

Character-profile creation is valid only when the image generation path can produce a real image file that can be saved as `profiles/<name>/multiview_reference.png`.

For the built-in `image_gen` path, generated files are discovered by taking a file-list snapshot of `$HOME/.codex/generated_images` before generation and comparing it with a second snapshot after generation. Do not rely on file modification time because generated image timestamps may not match the current session time.

Text cues are only workflow instructions, exclusions, and review notes. They must not replace the multiview reference as model input.

Prompt-time facial feature descriptions are forbidden for photo-based profiles and all later final-photo generation. They are allowed only as the initial design input for a fictional character in explicit text-description profile mode.

Text-first reconstruction of a real person's face is forbidden. A real person requested through text-description mode must first be identified and grounded with directly supplied public image references found through internet search.

Do not turn reference photos or search results into a long written facial description and then ask the image model to regenerate a real person. Supply the selected images directly.

Character profiles must not store textual facial feature descriptions. The profile output is exactly one file: `profiles/<name>/multiview_reference.png`.

Character profiles must not store source-photo copies, markdown records, style records, output format records, generated style samples, prompt text, prompt patterns, negative prompts, or print-readiness notes.

## Profile Naming Rule

When creating a new character profile:

1. In photo-directory mode, each direct child directory under `/Users/yohji/photo/input/` represents one person and its name is the profile id.
2. In text-description mode, use the specified name when present. When omitted, let the same AI task infer a recognizable real-person name or create a concise fictional-character name, avoiding existing profile ids.
3. A specified existing name replaces its `multiview_reference.png` directly.
4. Keep input directory names and profile directory names simple single tokens without underscores or hyphens.

## Standard Multiview Rule

Every new production-ready character profile must include exactly one standard multiview reference image generated from all usable photos in one input directory.

The input directory may contain multiple photos, but they are all references for the same person and must produce one output image only: `multiview_reference.png`.

Required views:

- top-left: front
- top-center: left three-quarter
- top-right: right three-quarter
- bottom-left: left side
- bottom-center: right side
- bottom-right: back

Professional camera specification:

- use fixed yaw angles `0°, -45°, +45°, -90°, +90°, 180°` in the required panel order
- keep pitch and roll at `0°`; rotate only around the subject's vertical axis
- use an eye-level camera, approximately `85mm` equivalent portrait focal length, fixed camera distance, and neutral perspective
- treat the front `yaw 0°` panel as the identity anchor and constrain every synthesized view to that same identity
- generate all six views together under one shared identity constraint; do not generate unrelated panels independently

### Mandatory Profile Framing

The character-profile image must strictly follow this layout:

- one landscape image containing a `2 x 3` grid
- exactly six chest-up bust views, framed consistently from the upper chest to slightly above the head
- the same head size, body scale, camera height, and subject distance in every panel
- one person only, centered separately in each panel
- consistent plain light-colored clothing, hair state, neutral expression, lighting, and plain near-white background
- closed mouth and relaxed neutral expression in every panel
- anatomically correct left/right views without mirrored duplication
- consistent ears, hairline, hair volume, accessories, head outline, and shoulder height across all views
- clean continuous presentation with no visible grid lines, labels, captions, borders, props, scenery, or decorative elements

Reject the profile result if any panel is full-body, knee-up, waist-up, tightly face-cropped, differently scaled, or uses a different framing from the other panels.

Also reject if the sheet uses wide-angle perspective, different camera heights, inconsistent yaw, mirrored left/right panels, changing clothing or expression, beautification, or identity drift between panels.

This chest-up framing is mandatory for character-profile creation only. It exists to maximize facial identity consistency. Character-profile rules must not define final-photo framing; final-photo composition is owned exclusively by the selected rule under `styles/`.

Rules for photo-directory mode:

- Use all usable original files under `/Users/yohji/photo/input/<person>/` directly when creating the profile and its multiview reference.
- Tell the image model that every image in the selected input directory is the same person.
- A profile must not be created from loose image files directly under `/Users/yohji/photo/input/`; those files must first be moved into a person directory.
- Generate the multiview reference from direct image input, not from written facial feature descriptions.
- Generate the multiview reference with the mandatory `2 x 3` chest-up bust layout above even when source photos use other crops.
- The only generated output of character-profile creation is `multiview_reference.png`.
- Save the only character-profile output as `profiles/<person>/multiview_reference.png`.
- Before generation with built-in `image_gen`, snapshot `$HOME/.codex/generated_images`; after generation, diff the snapshot to identify the new generated image file and copy that exact file to `profiles/<person>/multiview_reference.png`.
- If no new generated image file can be identified after snapshot comparison, do not mark the profile complete.
- Do not store the multiview generation prompt or any prompt pattern in the character profile.
- If a view cannot be inferred reliably from source images, mark it as missing instead of inventing identity details.
- The multiview reference replaces the source photos for later generation. After approval, later generation must use `multiview_reference.png` as the only identity image input.

## Required Generation Method

When creating or validating a character profile:

1. Provide all usable original image files from the selected input person directory directly to the image model as identity references.
2. Tell the model that all provided images are the same person.
3. Tell the model to create exactly one standard multiview reference image for that person.
4. Use short non-feature text constraints only to prevent common drift.
5. Do not ask the model to recreate the person from any written facial description.
6. Do not put facial feature descriptions into profile records, multiview prompts, validation prompts, or production generation prompts.
7. Do not save prompt text inside the character profile.
8. Do not treat a generated conversation preview as success unless the exact generated file has been found and saved to `profiles/<person>/multiview_reference.png`.

Approved method:

- input directory photo set direct input for profile creation only
- standard multiview reference direct input for all later generation
- save-capable generation path that writes or exposes the generated file so it can be copied to `profiles/<person>/multiview_reference.png`
- short non-feature identity-preservation instruction
- short drift-prevention negatives
- user review before approval

Forbidden method:

- long textual facial feature extraction
- text-only face reconstruction
- using written facial feature notes as the primary image prompt
- storing facial feature descriptions under `profiles/<name>/`
- storing markdown profile records, style prompts, or prompt patterns under `profiles/<name>/`
- accepting a conversation-only generated preview as a completed character profile
- prompt-time descriptions of face shape, eye spacing, nose-mouth relationship, jawline, cheeks, or other facial geometry outside fictional text-description profile creation
- approving an output because it matches the words while no longer matching the source photo

## Text-description Profile Mode

This mode is an additional profile-creation path. It does not replace photo-directory mode.

1. Decide whether the described subject is a real person.
2. For a real person, search the internet for clear public images of that exact person, choose multiple reliable and complementary views, and supply the selected images directly to image generation as references of the same identity. Never reconstruct a real face from name or prose alone.
3. For a fictional or non-real person, generate directly from the user's description. Existing fictional film, game, anime, or literary characters remain in this branch.
4. If reality cannot be established confidently, use the fictional branch; never attach photos of an unrelated same-name person.
5. Apply the same standard `2 x 3` chest-up multiview specification and save only `profiles/<name>/multiview_reference.png`.
6. Do not retain web images, source notes, prompts, descriptions, or classification records in the profile directory.
7. After creation, all final-photo generation uses only the resulting multiview image. The original description and any web references are not reused.

## Why

Long facial descriptions cause identity drift because the model averages the description into a generic face.

Direct image input keeps the person anchored to the actual visual reference. Written facial descriptions pull the model toward an averaged generic face and are not allowed in production prompts.

## Text Limit

Allowed text may include:

- required accessories or clothing cues
- source-photo exclusions
- forbidden age, gender, or role drift
- known failure modes from prior tests

Text must not describe facial structure. Do not mention eye spacing, nose-mouth relationship, jawline, cheeks, face outline, or similar face-geometry details in profile records, multiview prompts, validation prompts, or generation prompts.

Forbidden production prompt identity wording:

- face shape descriptions
- eye descriptions
- nose or mouth descriptions
- jawline, cheek, or face-outline descriptions
- attractiveness or beautification descriptions
- any written description intended to substitute for direct image input

## Approved Baseline Method

The accepted baseline method uses the input directory photo set to create a standard multiview reference, then uses only that multiview reference for later generation.

## Rejection Criteria

Reject a validation sample if:

- the face becomes a generic attractive template
- glasses, hairstyle, or other anchor features are removed
- the result looks like a different person despite matching the written description
