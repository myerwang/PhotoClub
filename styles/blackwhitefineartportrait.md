---
style_id: blackwhitefineartportrait
name: Black-and-White Fine Art Portrait
source_url: https://github.com/gpt-image2/awesome-gptimage2-prompts
source_title: gpt-image2/awesome-gptimage2-prompts
source_result: 34
retrieved_at: 2026-06-19T11:04:59.421Z
---

# Style: Black-and-White Fine Art Portrait

## Source Prompt

A cinematic, black-and-white portrait of a {argument name="subject" default="young man"} sitting on a {argument name="furniture" default="wooden chair"} in a vintage indoor setting. He is positioned sideways, leaning forward slightly, resting his head gently on his folded arms placed over the backrest of the chair. His posture is relaxed but heavy, conveying emotional depth and quiet introspection. He gazes downward, lost in thought, with a soft, melancholic expression.

He has slightly messy dark hair, subtle texture, and light stubble or a short beard, adding realism and character. A few strands of hair fall naturally across his forehead. He wears a {argument name="clothing" default="simple, slightly oversized white shirt"} with soft fabric folds, enhancing the candid, natural aesthetic.

Lighting is soft and natural, coming from a large window behind or to the side of him. The light wraps gently around his face and arms, creating delicate highlights while casting deep, dramatic shadows across the room. The lighting is diffused yet high-contrast, evoking classic analog film photography.

The environment is a vintage interior—aged wooden furniture, textured walls, and a large window with visible panes. The background is softly blurred but still readable, adding depth and context without distracting from the subject.

Mood is emotional, quiet, and introspective—capturing loneliness, contemplation, and stillness.

Color grading: monochrome (black and white) with rich contrast, deep blacks, soft highlights, and a film-like tonal range.

Depth of field is shallow, focusing sharply on the subject’s face and arms while smoothly blurring the background.

Style: fine art photography, cinematic film still, analog aesthetic, high dynamic range, subtle grain, timeless mood.

Camera details: 50mm or 85mm lens, f/1.8–f/2.2 aperture, natural light photography, strong subject isolation, gentle vignette.

Composition: vertical frame (4:5 or 9:16), subject slightly off-center, using the chair as a framing element for a layered, storytelling composition.
Generate image using uploaded image as reference

## Adaptation Log

- 删除固定姓名、公众人物、性别、年龄、族裔、职业、人数及五官文字描述，人物身份和组合由所选人物参考决定。
- 删除固定分辨率、纵横比、品牌、文案、水印及平台参数；保留来源明确给出的摄影媒介、服装语言、环境、动作、构图、灯光和后期质感。

## Visual Rules

- 采用来源 prompts.json 条目 15520“Black-and-White Fine Art Portrait”明确给出的摄影媒介、场景、材质与后期处理，不添加来源外的风格元素。

## Composition

- 采用来源提示词明确指定的景别、机位、人物动作和环境层次；人物属性、人数与组合由当前任务决定。

## Lighting And Color

- 采用来源提示词明确指定的光源、色温、曝光、色彩关系和相机或胶片质感。

## Subject Boundary

- Apply `system/rules/style_base.md`.
- This style defines visual treatment only and does not restrict subject identity, attributes, count, or combinations.
