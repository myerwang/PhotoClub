---
style_id: cinematiccalligraphyportrait
name: Cinematic Calligraphy Portrait
source_url: https://github.com/gpt-image2/awesome-gptimage2-prompts
source_title: gpt-image2/awesome-gptimage2-prompts
source_result: 34
retrieved_at: 2026-06-19T11:04:59.421Z
---

# Style: Cinematic Calligraphy Portrait

## Source Prompt

A highly realistic, cinematic photograph of a {argument name="subject description" default="young Asian woman"} wearing {argument name="clothing" default="traditional black and white Hanfu"}, sitting at a dark wooden desk in a dimly lit traditional study. She holds a calligraphy brush in her right hand, poised over a blank scroll, while resting her chin on her left hand with a {argument name="expression" default="thoughtful and contemplative"} look directed toward a lattice window on the right. The background features a large wall hanging covered in {argument name="background calligraphy" default="traditional Chinese calligraphy"}. The scene is illuminated by {argument name="lighting style" default="dramatic cinematic lighting with warm and cool contrast"}, featuring a warm glow from a traditional paper lantern on the left and cool natural light streaming from the window. The desk is adorned with an inkstone, a blue and white porcelain brush holder, and a small potted plant, creating a rich, moody atmosphere with exquisite textures.

## Adaptation Log

- 删除固定姓名、公众人物、性别、年龄、族裔、职业、人数及五官文字描述，人物身份和组合由所选人物参考决定。
- 删除固定分辨率、纵横比、品牌、文案、水印及平台参数；保留来源明确给出的摄影媒介、服装语言、环境、动作、构图、灯光和后期质感。

## Visual Rules

- 采用来源 prompts.json 条目 13846“Cinematic Calligraphy Portrait”明确给出的摄影媒介、场景、材质与后期处理，不添加来源外的风格元素。

## Composition

- 采用来源提示词明确指定的景别、机位、人物动作和环境层次；人物属性、人数与组合由当前任务决定。

## Lighting And Color

- 采用来源提示词明确指定的光源、色温、曝光、色彩关系和相机或胶片质感。

## Subject Boundary

- Apply `system/rules/style_base.md`.
- This style defines visual treatment only and does not restrict subject identity, attributes, count, or combinations.
