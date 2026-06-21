---
style_id: editorialstudioportraitblaze
name: Editorial Studio Portrait in Blazer
source_url: https://github.com/gpt-image2/awesome-gptimage2-prompts
source_title: gpt-image2/awesome-gptimage2-prompts
source_result: 34
retrieved_at: 2026-06-19T11:04:59.421Z
---

# Style: Editorial Studio Portrait in Blazer

## Source Prompt

A highly realistic editorial studio portrait of a {argument name="subject gender" default="woman"} in their late 30s with a naturally fit build, shown in a half-body composition at eye level. The subject stands facing the camera in a relaxed, confident posture with both hands tucked casually into pockets, wearing a dark charcoal tailored blazer over a muted olive-gray crew-neck t-shirt and dark trousers. The hair is {argument name="hair style" default="shoulder-length dark brown wavy hair with a natural side part"}, slightly tousled and softly framing the shoulders. Keep the expression calm, neutral, and self-assured. Use an 85mm portrait lens look at f/2.8 with the subject sharply in focus and the background softly blurred. Lighting is clean professional studio lighting with 1 softbox key light from the front, subtle fill to reduce harsh shadows, and 1 gentle rim light around the hair and shoulders. The background is a seamless studio backdrop with a soft warm beige-to-light taupe gradient, minimal texture, and no distractions. Color grading should be natural and balanced, with realistic skin tones, soft contrast, and no heavy retouching or filters. The overall mood is understated, modern, polished, and premium, like a fashion or corporate editorial portrait. Ultra-detailed, photorealistic, 8k, no noise, no motion blur, no distortions, no props, no jewelry, no text.

## Adaptation Log

- 删除固定姓名、公众人物、性别、年龄、族裔、职业、人数及五官文字描述，人物身份和组合由所选人物参考决定。
- 删除固定分辨率、纵横比、品牌、文案、水印及平台参数；保留来源明确给出的摄影媒介、服装语言、环境、动作、构图、灯光和后期质感。

## Visual Rules

- 采用来源 prompts.json 条目 15245“Editorial Studio Portrait in Blazer”明确给出的摄影媒介、场景、材质与后期处理，不添加来源外的风格元素。

## Composition

- 采用来源提示词明确指定的景别、机位、人物动作和环境层次；人物属性、人数与组合由当前任务决定。

## Lighting And Color

- 采用来源提示词明确指定的光源、色温、曝光、色彩关系和相机或胶片质感。

## Subject Boundary

- Apply `system/rules/style_base.md`.
- This style defines visual treatment only and does not restrict subject identity, attributes, count, or combinations.
