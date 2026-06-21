# Style previews

This directory stores one local preview per generated style as `<styleId>.jpg`.
After a successful photo task, the final image from that style's task is resized and overwrites the existing preview.
Styles that have never completed a photo task do not have a preview yet.

Do not commit preview PNG, JPG, JPEG, or WEBP files to Git.
The command `npm run stylepreview -- ...` uses the same update path and records permanent local generation history in `.control/style-history.json`.
