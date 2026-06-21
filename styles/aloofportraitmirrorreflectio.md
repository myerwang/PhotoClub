---
style_id: aloofportraitmirrorreflectio
name: Aloof Portrait with Mirror Reflections
source_url: https://github.com/gpt-image2/awesome-gptimage2-prompts
source_title: gpt-image2/awesome-gptimage2-prompts
source_result: 34
retrieved_at: 2026-06-19T11:04:59.421Z
---

# Style: Aloof Portrait with Mirror Reflections

## Source Prompt

{argument name="subject" default="Stunningly beautiful woman"} with a cool, aloof atmospheric vibe, exquisite and refined facial features, cold and glamorous high-end face, long flowing hair, graceful and alluring figure, (character features completely locked and consistent) Scene: Indoor space with {argument name="setting" default="mirrors (bathroom or mirrored wall)"}, multiple reflections, layered depth in the space Pose: Standing in front of the mirror, one hand lightly touching the mirror surface or resting on the countertop, body slightly angled, head gently turned toward the camera Expression: Calm and emotionless, with a hint of cold indifference and detachment Camera angle: Low angle or slight side angle shot, with the mirror reflection clearly visible in the frame Lighting: {argument name="lighting" default="Cool white light"} as the main source, with localized shadows, emphasizing structural contours and three-dimensionality Style: High-end fashion editorial, subtle film grain, low contrast Details: Delicately realistic skin texture, clear yet softly layered and slightly blurred mirror reflections Atmosphere: Restrained, rational, distant, with a touch of surreal unreality Quality: Ultra-sharp 8K, extreme details, cinematic lighting and shadows, beautiful depth-of-field bokeh.

## Adaptation Log

- 删除固定姓名、公众人物、性别、年龄、族裔、职业、人数及五官文字描述，人物身份和组合由所选人物参考决定。
- 删除固定分辨率、纵横比、品牌、文案、水印及平台参数；保留来源明确给出的摄影媒介、服装语言、环境、动作、构图、灯光和后期质感。

## Visual Rules

- 采用来源 prompts.json 条目 15909“Aloof Portrait with Mirror Reflections”明确给出的摄影媒介、场景、材质与后期处理，不添加来源外的风格元素。

## Composition

- 采用来源提示词明确指定的景别、机位、人物动作和环境层次；人物属性、人数与组合由当前任务决定。

## Lighting And Color

- 采用来源提示词明确指定的光源、色温、曝光、色彩关系和相机或胶片质感。

## Subject Boundary

- Apply `system/rules/style_base.md`.
- This style defines visual treatment only and does not restrict subject identity, attributes, count, or combinations.
