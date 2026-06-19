---
style_id: studiocorporateportraitinset
name: Studio Corporate Portrait with Inset
thumbnail: studiocorporateportraitinset.png
source_url: https://github.com/gpt-image2/awesome-gptimage2-prompts
source_title: gpt-image2/awesome-gptimage2-prompts
source_result: 34
retrieved_at: 2026-06-19T11:04:59.421Z
---

# Style: Studio Corporate Portrait with Inset

## Source Prompt

A polished studio portrait of a {argument name="subject" default="young East Asian woman"} from the chest up, centered and facing forward against a smooth dark charcoal gray backdrop with subtle vignette lighting. She has long, glossy, slightly wavy {argument name="hair color" default="black"} hair falling over both shoulders, with soft straight bangs and a neat center-top part. She wears a tailored double-breasted {argument name="blazer color" default="deep navy"} blazer with 6 visible round gold crest buttons, creating an elegant professional look. Her right hand is raised thoughtfully under her chin with relaxed fingers, forming a poised formal pose. Use soft directional studio lighting from the front-left, high detail skin texture, realistic fabric, gentle shadows, and a premium corporate headshot aesthetic. Compose the image vertically, clean and minimal, with the subject occupying most of the frame. In the bottom-left corner, add 1 small rectangular inset comparison photo on a white background showing the same woman in a simpler ID-style portrait wearing a white collared shirt, and place the text {argument name="corner text" default="GPT Image2"} beneath or overlapping the inset in large black sans-serif letters. Photorealistic, refined, editorial portrait quality.

## Adaptation Log

- 删除固定姓名、公众人物、性别、年龄、族裔、职业、人数及五官文字描述，人物身份和组合由所选人物参考决定。
- 删除固定分辨率、纵横比、品牌、文案、水印及平台参数；保留来源明确给出的摄影媒介、服装语言、环境、动作、构图、灯光和后期质感。

## Visual Rules

- 采用来源 prompts.json 条目 15317“Studio Corporate Portrait with Inset”明确给出的摄影媒介、场景、材质与后期处理，不添加来源外的风格元素。

## Composition

- 采用来源提示词明确指定的景别、机位、人物动作和环境层次；人物属性、人数与组合由当前任务决定。

## Lighting And Color

- 采用来源提示词明确指定的光源、色温、曝光、色彩关系和相机或胶片质感。

## Subject Boundary

- Apply `system/rules/style_base.md`.
- This style defines visual treatment only and does not restrict subject identity, attributes, count, or combinations.
