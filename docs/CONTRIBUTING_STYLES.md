# Contributing Photo Styles

This project is an open framework for controlled photo-to-style generation.

## What Contributors May Change

Contributors may add or refine photo style definitions only under `styles/`, such as:

- new visual style prompts
- style-specific negative prompts
- print-readiness notes for a style
- examples of style wording
- style failure modes

Contributions must be scoped to files such as:

- `styles/<style>.md`
- `styles/<thumbnail>.png`

## What Contributors May Not Change

Contributors must not add new files outside `styles/`.

Contributors must not weaken or bypass:

- character profile requirement
- character multiview file requirement
- one-validation-sample-before-batch rule
- output ratio rule
- print-ready sticker island rules
- local-data ignore policy for `input/`, `output/`, and private character profile records

Contributors must not add private user photos, generated outputs, or real character profiles to the public repository.

## Required Flow For New Styles

1. Add or update a style rule document.
2. Add YAML frontmatter containing `style_id`, Chinese display `name`, and `thumbnail`.
3. Generate or update the representative thumbnail whenever the style is created or materially changed.
4. Use a 7-Eleven L portrait ratio thumbnail; `420 x 600` is recommended. It is a lightweight visual selector, not a print-ready output.
5. Keep the thumbnail independent of any real person's identity and make its composition clearly represent the reusable style.
6. Do not use private user photos in git-tracked files.
7. Do not record style references, prompts, or generated style samples inside character profiles.

A style missing any required frontmatter field or its referenced thumbnail is invalid and must not appear as selectable in the control page.

## Current Style

- `sticker`

Future styles should live under `styles/` once added.
