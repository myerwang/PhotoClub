# Style Subject Base

This shared rule defines subject handling for every reusable photo style. Individual style files must contain only source-traceable visual treatment and must not duplicate or override these subject rules.

## Final Photos

- When character multiview references are provided, feed every selected multiview image directly to the image model.
- Preserve the exact facial identity through the supplied images. The final person must read as the same individual as the approved multiview reference, not a similar-looking substitute, beautified template, younger/older variant, celebrity-like face, or generic fashion model.
- Use the multiview reference as the face and identity anchor for every generation. Style may change clothing, scene, lighting, lens, pose, and post-processing, but must not change face identity.
- Character multiview reference clothing is not part of identity and must never be copied into final photos. Do not reproduce the reference sheet's plain clothing, colors, neckline, texture, or profile-photo wardrobe.
- When a style explicitly defines wardrobe language, follow that wardrobe language and do not replace, soften, reinterpret, or override it. When a style does not define clothing, choose clothing that best fits the photo genre, setting, era, weather, lighting, and editorial mood. Never fall back to character-reference clothing.
- If a requested style would make exact face identity hard to preserve, simplify the style treatment rather than drifting the face.
- Do not describe, infer, or reconstruct facial features in text.
- Keep each person bound to their own reference. Do not mix, swap, duplicate, or omit identities.
- A style controls visual treatment only. It must not restrict subject identity, attributes, count, or combinations.
- Treat any `## Source Prompt` section in a style file as provenance only. Do not execute fixed subject descriptions, facial-feature text, age, gender, ethnicity, named-person cues, subject count, or identity-changing transformations from source prompts.
- If source text conflicts with character identity preservation, the character reference wins.
- Final photos must keep the face visible enough to verify identity. A style must not require a censor block, blur, mosaic, redaction rectangle, phone, hand, hair, sunglasses, helmet, mask, shadow, crop, or prop to hide the face unless the user gives that as a one-off explicit requirement for the current generation.
- The full face must remain inside the image frame. Do not crop off the top of the head, forehead, eyes, nose, mouth, chin, or either side of the face; do not let props, animals, foreground objects, layout panels, or tight crops compress the face area.
- Use surreal or costume-heavy styles as wardrobe, material, lighting, set, lens, and post-processing treatments around the referenced person. Do not turn the referenced person into a different species, a different age, a different sex, a generic fashion model, a celebrity, or an unrelated body template.

## Boundary

- Individual styles may define only source-traceable photography, composition, lens, lighting, color, setting, wardrobe language, material treatment, and post-processing.
- Character-reference handling and identity consistency belong only in this shared rule.
