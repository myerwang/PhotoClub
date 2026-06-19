---
style_id: refreshingbeveragecommercial
name: Refreshing Beverage Commercial Portrait
thumbnail: refreshingbeveragecommercial.png
source_url: https://github.com/gpt-image2/awesome-gptimage2-prompts
source_title: gpt-image2/awesome-gptimage2-prompts
source_result: 34
retrieved_at: 2026-06-19T11:04:59.421Z
---

# Style: Refreshing Beverage Commercial Portrait

## Source Prompt

A bright, refreshing commercial photography shot of a {argument name="subject description" default="young handsome East Asian man with dark bangs"} wearing a {argument name="clothing" default="light blue crewneck sweater"}. He is smiling gently at the camera and holding up a clear plastic water bottle with condensation and a blue label that reads "{argument name="product name" default="POCARI SWEAT"}". The background is a soft-focus, airy room with light blue walls, framed pictures, a warm lamp, and a bright blue sky visible through a window on the left. In the bottom left corner, there is white overlay text that reads "{argument name="overlay text line 1" default="포카리 스웨트"}" above a second line reading "{argument name="overlay text line 2" default="이온을 채워, 순간을 살아"}", underlined by a dynamic white swoosh graphic. The lighting is soft, natural, and inviting, emphasizing a clean and hydrating aesthetic.

## Adaptation Log

- 删除固定姓名、公众人物、性别、年龄、族裔、职业、人数及五官文字描述，人物身份和组合由所选人物参考决定。
- 删除固定分辨率、纵横比、品牌、文案、水印及平台参数；保留来源明确给出的摄影媒介、服装语言、环境、动作、构图、灯光和后期质感。

## Visual Rules

- 采用来源 prompts.json 条目 13776“Refreshing Beverage Commercial Portrait”明确给出的摄影媒介、场景、材质与后期处理，不添加来源外的风格元素。

## Composition

- 采用来源提示词明确指定的景别、机位、人物动作和环境层次；人物属性、人数与组合由当前任务决定。

## Lighting And Color

- 采用来源提示词明确指定的光源、色温、曝光、色彩关系和相机或胶片质感。

## Subject Boundary

- Apply `system/rules/style_base.md`.
- This style defines visual treatment only and does not restrict subject identity, attributes, count, or combinations.
