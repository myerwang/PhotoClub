---
style_id: couplepubportraittransformat
name: Couple Pub Portrait Transformation
source_url: https://github.com/gpt-image2/awesome-gptimage2-prompts
source_title: gpt-image2/awesome-gptimage2-prompts
source_result: 34
retrieved_at: 2026-06-19T11:04:59.421Z
---

# Style: Couple Pub Portrait Transformation

## Source Prompt

Using REFERENCE_0, transform the older couple so they are both looking directly at the camera and smiling. For the man on the left, add a {argument name="man's facial hair" default="full white beard"}, remove his glasses, and dress him in a {argument name="man's clothing" default="green fleece jacket"}. For the woman on the right, add glasses, change her hair to straight with bangs, and dress her in a {argument name="woman's clothing" default="denim jacket and white scarf"}. Have both subjects holding glasses of beer. On the wooden table, add 1 bowl of potato chips and 1 small lit lantern. Replace the background with a {argument name="background setting" default="warm, blurred pub interior with 2 background patrons"}.

## Adaptation Log

- 删除固定姓名、公众人物、性别、年龄、族裔、职业、人数及五官文字描述，人物身份和组合由所选人物参考决定。
- 删除固定分辨率、纵横比、品牌、文案、水印及平台参数；保留来源明确给出的摄影媒介、服装语言、环境、动作、构图、灯光和后期质感。

## Visual Rules

- 采用来源 prompts.json 条目 13751“Couple Pub Portrait Transformation”明确给出的摄影媒介、场景、材质与后期处理，不添加来源外的风格元素。

## Composition

- 采用来源提示词明确指定的景别、机位、人物动作和环境层次；人物属性、人数与组合由当前任务决定。

## Lighting And Color

- 采用来源提示词明确指定的光源、色温、曝光、色彩关系和相机或胶片质感。

## Subject Boundary

- Apply `system/rules/style_base.md`.
- This style defines visual treatment only and does not restrict subject identity, attributes, count, or combinations.
