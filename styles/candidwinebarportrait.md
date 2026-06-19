---
style_id: candidwinebarportrait
name: Candid Wine Bar Portrait
thumbnail: candidwinebarportrait.png
source_url: https://github.com/gpt-image2/awesome-gptimage2-prompts
source_title: gpt-image2/awesome-gptimage2-prompts
source_result: 34
retrieved_at: 2026-06-19T11:04:59.421Z
---

# Style: Candid Wine Bar Portrait

## Source Prompt

A candid, photorealistic portrait of a young woman with {argument name="hair color" default="long blonde hair"} wearing a {argument name="outfit" default="dark brown leather blazer"}. She is sitting at a table in a {argument name="setting" default="restaurant or wine bar"}, resting her chin on her hand and looking off to the side with {argument name="expression" default="pursed lips"}. In front of her on the white tablecloth are two glasses: a large glass of {argument name="drink" default="red wine"} and a smaller glass of water. The background features brightly lit, modern shelving filled with rows of wine bottles. Warm, ambient lighting, shot on a smartphone.

## Adaptation Log

- 删除固定姓名、公众人物、性别、年龄、族裔、职业、人数及五官文字描述，人物身份和组合由所选人物参考决定。
- 删除固定分辨率、纵横比、品牌、文案、水印及平台参数；保留来源明确给出的摄影媒介、服装语言、环境、动作、构图、灯光和后期质感。

## Visual Rules

- 采用来源 prompts.json 条目 14080“Candid Wine Bar Portrait”明确给出的摄影媒介、场景、材质与后期处理，不添加来源外的风格元素。

## Composition

- 采用来源提示词明确指定的景别、机位、人物动作和环境层次；人物属性、人数与组合由当前任务决定。

## Lighting And Color

- 采用来源提示词明确指定的光源、色温、曝光、色彩关系和相机或胶片质感。

## Subject Boundary

- Apply `system/rules/style_base.md`.
- This style defines visual treatment only and does not restrict subject identity, attributes, count, or combinations.
