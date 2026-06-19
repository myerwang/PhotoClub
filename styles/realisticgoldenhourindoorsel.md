---
style_id: realisticgoldenhourindoorsel
name: Realistic Golden-Hour Indoor Selfie
thumbnail: realisticgoldenhourindoorsel.png
source_url: https://github.com/gpt-image2/awesome-gptimage2-prompts
source_title: gpt-image2/awesome-gptimage2-prompts
source_result: 34
retrieved_at: 2026-06-19T11:04:59.421Z
---

# Style: Realistic Golden-Hour Indoor Selfie

## Source Prompt

A realistic casual indoor selfie of a {argument name="person" default="adult woman"} taken at arm’s length on a smartphone, framed from mid-chest up in a square composition. She has shoulder-length, slightly messy wavy {argument name="hair color" default="auburn red"} hair with natural volume and soft frizz, center-parted, lit by warm golden-hour sunlight coming from a large window or sliding glass door on the left side of the frame. She wears a simple {argument name="shirt color" default="white"} short-sleeve V-neck T-shirt. The pose is relaxed and natural with both forearms faintly visible from holding the phone, creating an authentic unpolished selfie perspective. The setting is a real apartment or home interior: bright vertical window and door frames on the left, beige walls, and a dark brown sofa in the back right. Lighting is soft, warm, and organic, with sun highlights on the hair, shoulders, and arms, mild indoor shadows, realistic skin texture, and no glamor retouching. Overall look should feel candid, believable, and minimally styled, like a genuine phone photo rather than a polished AI portrait. Use natural proportions, subtle image noise, ordinary home background detail, and straightforward smartphone camera realism.

## Adaptation Log

- 删除固定姓名、公众人物、性别、年龄、族裔、职业、人数及五官文字描述，人物身份和组合由所选人物参考决定。
- 删除固定分辨率、纵横比、品牌、文案、水印及平台参数；保留来源明确给出的摄影媒介、服装语言、环境、动作、构图、灯光和后期质感。

## Visual Rules

- 采用来源 prompts.json 条目 16559“Realistic Golden-Hour Indoor Selfie”明确给出的摄影媒介、场景、材质与后期处理，不添加来源外的风格元素。

## Composition

- 采用来源提示词明确指定的景别、机位、人物动作和环境层次；人物属性、人数与组合由当前任务决定。

## Lighting And Color

- 采用来源提示词明确指定的光源、色温、曝光、色彩关系和相机或胶片质感。

## Subject Boundary

- Apply `system/rules/style_base.md`.
- This style defines visual treatment only and does not restrict subject identity, attributes, count, or combinations.
