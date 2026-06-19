---
style_id: photorealisticshibuyastreets
name: Photorealistic Shibuya Street Selfie
thumbnail: photorealisticshibuyastreets.png
source_url: https://github.com/gpt-image2/awesome-gptimage2-prompts
source_title: gpt-image2/awesome-gptimage2-prompts
source_result: 34
retrieved_at: 2026-06-19T11:04:59.421Z
---

# Style: Photorealistic Shibuya Street Selfie

## Source Prompt

A photorealistic selfie of a young Japanese woman standing on a sunny city street in {argument name="location" default="Shibuya, Japan"}. She has a soft smile, fair skin, light makeup, and {argument name="hair style" default="long wavy brown hair with see-through bangs"}. She is wearing a {argument name="clothing" default="white textured blouse"} with a delicate necklace and a beige shoulder bag strap visible. The background features a bustling urban environment with a crosswalk, pedestrians on the sidewalk, and a large white commercial building displaying the text {argument name="building text" default="MODI"} at the top along with a digital billboard. On the left side of the frame, a vertical street sign clearly displays the text {argument name="street sign text" default="渋谷区 神南一丁目 8"}. The image has a bright, natural daylight aesthetic typical of a casual social media photo.

## Adaptation Log

- 删除固定姓名、公众人物、性别、年龄、族裔、职业、人数及五官文字描述，人物身份和组合由所选人物参考决定。
- 删除固定分辨率、纵横比、品牌、文案、水印及平台参数；保留来源明确给出的摄影媒介、服装语言、环境、动作、构图、灯光和后期质感。

## Visual Rules

- 采用来源 prompts.json 条目 13732“Photorealistic Shibuya Street Selfie”明确给出的摄影媒介、场景、材质与后期处理，不添加来源外的风格元素。

## Composition

- 采用来源提示词明确指定的景别、机位、人物动作和环境层次；人物属性、人数与组合由当前任务决定。

## Lighting And Color

- 采用来源提示词明确指定的光源、色温、曝光、色彩关系和相机或胶片质感。

## Subject Boundary

- Apply `system/rules/style_base.md`.
- This style defines visual treatment only and does not restrict subject identity, attributes, count, or combinations.
