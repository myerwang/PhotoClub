---
style_id: japanesefujifilmportrait
name: Japanese Fuji film style portrait
source_url: https://github.com/gpt-image2/awesome-gptimage2-prompts
source_title: gpt-image2/awesome-gptimage2-prompts
source_result: 34
retrieved_at: 2026-06-19T11:04:59.421Z
---

# Style: Japanese Fuji film style portrait

## Source Prompt

9:16 vertical — {argument name="film style" default="Japanese Fuji film style"} portrait, single subject

Fujifilm analog aesthetic (Pro 400H / Superia feel), soft pastel tones, slight green-magenta shift, low contrast, gentle highlight roll-off, fine film grain, subtle halation

early morning indoor setting near window, soft curtains, fresh daylight

{argument name="subject" default="young Japanese female idol"}, natural minimal makeup, soft fresh skin texture

outfit: oversized shirt with loose shorts, relaxed homewear style, non-revealing

hair: slightly messy, natural volume, just-woke-up feeling

pose: sitting on bed edge or by window, body slightly leaning forward, shoulders relaxed; one hand loosely holding a small flower or fabric, the other resting naturally

expression: soft, slightly sleepy gaze, calm and natural

lighting: {argument name="lighting" default="soft morning light"}, diffused, gentle shadows

mood: quiet, fresh, intimate everyday moment

quality: ultra-realistic, film grain, slight softness, natural imperfections

## Adaptation Log

- 删除固定姓名、公众人物、性别、年龄、族裔、职业、人数及五官文字描述，人物身份和组合由所选人物参考决定。
- 删除固定分辨率、纵横比、品牌、文案、水印及平台参数；保留来源明确给出的摄影媒介、服装语言、环境、动作、构图、灯光和后期质感。

## Visual Rules

- 采用来源 prompts.json 条目 14301“Japanese Fuji film style portrait”明确给出的摄影媒介、场景、材质与后期处理，不添加来源外的风格元素。

## Composition

- 采用来源提示词明确指定的景别、机位、人物动作和环境层次；人物属性、人数与组合由当前任务决定。

## Lighting And Color

- 采用来源提示词明确指定的光源、色温、曝光、色彩关系和相机或胶片质感。

## Subject Boundary

- Apply `system/rules/style_base.md`.
- This style defines visual treatment only and does not restrict subject identity, attributes, count, or combinations.
