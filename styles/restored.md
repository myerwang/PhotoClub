---
style_id: restored
name: 旧照修复
source_url: https://github.com/EvoLinkAI/awesome-gpt-image-2-API-and-Prompts
source_title: EvoLinkAI/awesome-gpt-image-2-API-and-Prompts
source_result: 2
retrieved_at: 2026-06-19T06:31:22.135Z
---

# Style: Restored Family Portrait

## Source Prompt

A restored vintage family snapshot, photographed indoors in soft natural light, showing a {argument name="adult subject" default="young mother"} seated and holding a {argument name="child subject" default="toddler"} on her lap in a close, centered waist-up portrait. The adult has short softly curled auburn hair in a voluminous 1960s-inspired bob, wears a sleeveless black dress and a thin gold necklace, and wraps both arms protectively around the child. The child has fine light blond hair and wears a plain white long-sleeve outfit. Compose the image with a warm nostalgic color cast, gentle film softness, subtle grain, and the look of a carefully repaired old printed photograph. Place them in front of a cream-colored curtain patterned with small brown teddy bear motifs, with a softly blurred interior window frame visible along the top background. Preserve realistic skin tones, natural posture, and the intimate family-photo feeling, as if an old damaged photograph has been professionally reimagined and restored. Square crop, centered composition, shallow depth of field, authentic analog photo texture, no modern styling, no text.

## Adaptation Log

- 删除固定姓名、性别、年龄、族裔、身份、人数及五官文字描述，改由所选人物参考决定。
- 删除模型、尺寸、纵横比和负面参数；只保留来源明确给出的摄影、场景、服装语言、构图、灯光和后期质感。

## Visual Rules

- 采用来源“Restored Family Portrait”提示词明确给出的摄影或视觉处理、环境、材质和后期质感，不增加来源之外的风格元素。

## Composition

- 采用来源提示词明确指定的景别、机位、人物动作和环境布局；人物属性、人数与组合由当前任务决定。

## Lighting And Color

- 采用来源提示词明确指定的照明方式、色彩关系、曝光和成像质感。

## Subject Boundary

- Apply `system/rules/style_base.md`.
- This style defines visual treatment only and does not restrict subject identity, attributes, count, or combinations.
