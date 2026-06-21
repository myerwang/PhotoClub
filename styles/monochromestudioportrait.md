---
style_id: monochromestudioportrait
name: Monochrome Studio Portrait
source_url: https://github.com/gpt-image2/awesome-gptimage2-prompts
source_title: gpt-image2/awesome-gptimage2-prompts
source_result: 34
retrieved_at: 2026-06-19T11:04:59.421Z
---

# Style: Monochrome Studio Portrait

## Source Prompt

A stunning black and white studio portrait of {argument name="subject" default="uploaded person"}. Eye-level medium shot, framed from the waist up. The subject is standing with his arms casually but firmly crossed over his chest. He is looking downward and slightly off-camera to the left with a calm, contemplative posture. He is wearing a {argument name="outfit" default="dark, heavy-textured waffle-knit long-sleeve sweater"} and a delicate silver chain necklace with a small pendant. He is wearing a classic analog watch with a light dial and leather strap on the lower arm. The background is a {argument name="background style" default="stark, graphic vertical split: pure white on the left half and pure deep black on the right half"}. High-end commercial photography, monochrome masterpiece. Soft but dramatic directional studio lighting originating from the left, highlighting the textures of the clothing and skin while casting natural, smooth shadows on the right side. Crisp focus, hyper-realistic,8k resolution, cinematic composition. ar 4:5

## Adaptation Log

- 删除固定姓名、公众人物、性别、年龄、族裔、职业、人数及五官文字描述，人物身份和组合由所选人物参考决定。
- 删除固定分辨率、纵横比、品牌、文案、水印及平台参数；保留来源明确给出的摄影媒介、服装语言、环境、动作、构图、灯光和后期质感。

## Visual Rules

- 采用来源 prompts.json 条目 16526“Monochrome Studio Portrait”明确给出的摄影媒介、场景、材质与后期处理，不添加来源外的风格元素。

## Composition

- 采用来源提示词明确指定的景别、机位、人物动作和环境层次；人物属性、人数与组合由当前任务决定。

## Lighting And Color

- 采用来源提示词明确指定的光源、色温、曝光、色彩关系和相机或胶片质感。

## Subject Boundary

- Apply `system/rules/style_base.md`.
- This style defines visual treatment only and does not restrict subject identity, attributes, count, or combinations.
