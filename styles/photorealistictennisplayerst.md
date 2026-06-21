---
style_id: photorealistictennisplayerst
name: Photorealistic Tennis Player Studio Portrait
source_url: https://github.com/gpt-image2/awesome-gptimage2-prompts
source_title: gpt-image2/awesome-gptimage2-prompts
source_result: 34
retrieved_at: 2026-06-19T11:04:59.421Z
---

# Style: Photorealistic Tennis Player Studio Portrait

## Source Prompt

A photorealistic studio portrait of a {argument name="subject ethnicity and gender" default="young Asian woman"}. She has {argument name="hair style" default="long, wavy dark hair"}, light freckles, and a subtle glisten of sweat on her skin for a fresh, athletic appearance. She is wearing an {argument name="outfit" default="all-white tennis outfit with a fitted short-sleeved polo shirt and a pleated mini skirt"}. She holds a {argument name="prop" default="white tennis racket"} resting casually over her right shoulder, looking directly at the camera with a calm expression. The setting is a {argument name="background" default="seamless, bright white studio backdrop"} with soft, high-key lighting.

## Adaptation Log

- 删除固定姓名、公众人物、性别、年龄、族裔、职业、人数及五官文字描述，人物身份和组合由所选人物参考决定。
- 删除固定分辨率、纵横比、品牌、文案、水印及平台参数；保留来源明确给出的摄影媒介、服装语言、环境、动作、构图、灯光和后期质感。

## Visual Rules

- 采用来源 prompts.json 条目 13965“Photorealistic Tennis Player Studio Portrait”明确给出的摄影媒介、场景、材质与后期处理，不添加来源外的风格元素。

## Composition

- 采用来源提示词明确指定的景别、机位、人物动作和环境层次；人物属性、人数与组合由当前任务决定。

## Lighting And Color

- 采用来源提示词明确指定的光源、色温、曝光、色彩关系和相机或胶片质感。

## Subject Boundary

- Apply `system/rules/style_base.md`.
- This style defines visual treatment only and does not restrict subject identity, attributes, count, or combinations.
