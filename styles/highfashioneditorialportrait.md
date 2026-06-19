---
style_id: highfashioneditorialportrait
name: High-Fashion Editorial Portrait Prompt
thumbnail: highfashioneditorialportrait.png
source_url: https://github.com/gpt-image2/awesome-gptimage2-prompts
source_title: gpt-image2/awesome-gptimage2-prompts
source_result: 34
retrieved_at: 2026-06-19T11:04:59.421Z
---

# Style: High-Fashion Editorial Portrait Prompt

## Source Prompt

A high-fashion editorial portrait of a {argument name="subject" default="woman"} in a {argument name="setting" default="minimalist studio setting"}. She is leaning slightly forward and tilting her head, creating a dynamic, asymmetrical composition. Her expression is neutral and confident, with a slightly intense gaze directed toward the camera.

She wears a structured, oversized {argument name="clothing" default="gray blazer"} with a subtle textured pattern over a soft white dress. Around her neck is a sheer black scarf that drapes loosely and flows downward, adding contrast and movement. Her hands are partially tucked into the blazer, with sheer black gloves visible.

Her hair is styled in a slightly messy, effortless updo with loose strands framing her face. She wears bold, modern silver earrings. Her makeup is natural and dewy, with softly defined eyes and neutral lips.

The lighting is soft and diffused, creating gentle shadows and a clean, editorial feel. The background is minimal, featuring smooth, light gray tones with subtle curved shapes that add depth without distraction.

The color palette is muted and sophisticated: gray, white, and black dominate the scene. The overall mood is elegant, contemporary, and slightly moody, resembling a luxury fashion magazine shoot. Style keywords: fashion editorial, minimalist, soft lighting, neutral tones, modern elegance, high detail, shallow depth of field, studio photography, cinematic composition.

## Adaptation Log

- 删除固定姓名、公众人物、性别、年龄、族裔、职业、人数及五官文字描述，人物身份和组合由所选人物参考决定。
- 删除固定分辨率、纵横比、品牌、文案、水印及平台参数；保留来源明确给出的摄影媒介、服装语言、环境、动作、构图、灯光和后期质感。

## Visual Rules

- 采用来源 prompts.json 条目 15961“High-Fashion Editorial Portrait Prompt”明确给出的摄影媒介、场景、材质与后期处理，不添加来源外的风格元素。

## Composition

- 采用来源提示词明确指定的景别、机位、人物动作和环境层次；人物属性、人数与组合由当前任务决定。

## Lighting And Color

- 采用来源提示词明确指定的光源、色温、曝光、色彩关系和相机或胶片质感。

## Subject Boundary

- Apply `system/rules/style_base.md`.
- This style defines visual treatment only and does not restrict subject identity, attributes, count, or combinations.
