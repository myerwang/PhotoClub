---
style_id: minimalstudioportraitneutral
name: Minimal Studio Portrait in Neutral Tones
thumbnail: minimalstudioportraitneutral.png
source_url: https://github.com/gpt-image2/awesome-gptimage2-prompts
source_title: gpt-image2/awesome-gptimage2-prompts
source_result: 34
retrieved_at: 2026-06-19T11:04:59.421Z
---

# Style: Minimal Studio Portrait in Neutral Tones

## Source Prompt

A highly realistic studio portrait of a {argument name="subject gender" default="female"} in her mid-20s with a naturally fit build, framed from the chest up at eye level, centered against a smooth warm beige studio backdrop with no distractions. She has long, thick, dark {argument name="hair color" default="black"} hair styled in loose, slightly messy natural waves with strong volume and a soft center part, falling over both shoulders. Her pose is relaxed and confident, facing the camera straight on with a calm, neutral, self-assured expression. She wears 2 visible clothing layers: a plain white crew-neck T-shirt underneath a lightweight taupe-gray casual zip jacket worn open, with a minimal modern streetwear look in muted neutral tones. Include a small subtle earring visible on one ear. Use professional studio lighting with a soft frontal key light, gentle fill, soft natural shadows, accurate skin tones, and very light separation from the background. Shoot with an 85mm portrait lens look at f/2.8, tack-sharp on the subject with shallow depth of field, editorial fashion portrait style, natural balanced color grading, minimal retouching, ultra-detailed, no filters, no noise, no motion blur, no cartoonish features.

## Adaptation Log

- 删除固定姓名、公众人物、性别、年龄、族裔、职业、人数及五官文字描述，人物身份和组合由所选人物参考决定。
- 删除固定分辨率、纵横比、品牌、文案、水印及平台参数；保留来源明确给出的摄影媒介、服装语言、环境、动作、构图、灯光和后期质感。

## Visual Rules

- 采用来源 prompts.json 条目 15603“Minimal Studio Portrait in Neutral Tones”明确给出的摄影媒介、场景、材质与后期处理，不添加来源外的风格元素。

## Composition

- 采用来源提示词明确指定的景别、机位、人物动作和环境层次；人物属性、人数与组合由当前任务决定。

## Lighting And Color

- 采用来源提示词明确指定的光源、色温、曝光、色彩关系和相机或胶片质感。

## Subject Boundary

- Apply `system/rules/style_base.md`.
- This style defines visual treatment only and does not restrict subject identity, attributes, count, or combinations.
