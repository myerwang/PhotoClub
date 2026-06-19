# Input Directory Rule

Each direct child directory under `input/` represents one person.

```text
input/
  <name>/
    photo1.jpg
    photo2.png
    photo3.heic
```

Rules:

- Put all reference photos for one person in the same `input/<name>/` directory.
- Use multiple photos when available; they improve the standard multiview character reference.
- During character-profile creation, all usable photos in one `input/<name>/` directory must be provided together and treated as the same person.
- Character-profile creation produces exactly one image: `multiview_reference.png`.
- Character-profile creation always normalizes the references into one landscape `2 x 3` sheet of six consistently scaled chest-up bust views, regardless of the crops used by the input photos.
- This chest-up normalization applies only to the character profile. Final-photo composition is outside the input and profile rules and is defined by the selected rule under `styles/`.
- Character-profile creation is complete only after that image is saved as `profiles/<name>/multiview_reference.png`.
- A generated image shown only in the conversation is not complete and must not be treated as a character profile.
- Later generation must use only the approved `multiview_reference.png` as the identity image input, not the original photos in `input/<name>/`.
- The directory name is used directly as the character display name and profile id.
- Do not create a character profile from loose image files directly under `input/`.
- Except for this `README.md`, `input/` should contain person directories only.
- If a person needs a custom name, rename the directory before profile creation.
