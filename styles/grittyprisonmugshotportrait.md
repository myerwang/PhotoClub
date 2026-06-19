---
style_id: grittyprisonmugshotportrait
name: Gritty Prison Mugshot Portrait
thumbnail: grittyprisonmugshotportrait.png
source_url: https://github.com/gpt-image2/awesome-gptimage2-prompts
source_title: gpt-image2/awesome-gptimage2-prompts
source_result: 34
retrieved_at: 2026-06-19T11:04:59.421Z
---

# Style: Gritty Prison Mugshot Portrait

## Source Prompt

{
  "parameters": {
    "aspect_ratio": "2:3",
    "version": "6.0",
    "style_type": "Realistic photograph, cinematic lighting, high detail, gritty texture"
  },
signature: “ XSydneyFan " in corner Cursive style
  "subject_description": {
    "demographics": "Beautiful young woman, fair skin.",
    "hair": "Dark long length black hair, some strands falling over her forehead.",
    "details": "Some smudges of black soot and dirt on her face, neck, and hand (not in much amount)."
  },
  "attire": {
    "outerwear": "Bright orange prisoner jumpsuit (boiler suit), slightly oversized. Distressed and dirty, covered in black soot stains.",
    "details": "The number '000' is printed in large black font on the right side of the chest.",
    "under_layer": "Grey crew-neck t-shirt visible underneath.",
    "accessories": "Silver rings on fingers."
  },
  "pose_and_expression": {
    "stance": "Standing in a mugshot lineup stance. Making direct eye contact with the camera.",
    "expression": "Deadpan, serious, nonchalant, looking unimpressed or bored.",
    "right_hand_action": "Raised casually, fingers touching the hair behind her right ear/neck area.",
    "left_hand_action": "Holding a black and white clapperboard/slate in front of her chest."
  },
  "props": {
    "slate_board_content": {
      "main_text": "🚫 ARRESTED 🚫 For illegally Money",
      "date": "12-28 25-26"
    }
  },
  "environment": {
    "setting": "A gritty, dilapidated room. The wall behind is peeling, cracked, and textured, resembling an abandoned concrete building or a ruined police station.",
    "background_elements": [
      "Height chart on the wall.",
      "The word 'POLCIE' written at the top left of the wall."
    ]
  }
}

## Adaptation Log

- 删除固定姓名、公众人物、性别、年龄、族裔、职业、人数及五官文字描述，人物身份和组合由所选人物参考决定。
- 删除固定分辨率、纵横比、品牌、文案、水印及平台参数；保留来源明确给出的摄影媒介、服装语言、环境、动作、构图、灯光和后期质感。

## Visual Rules

- 采用来源 prompts.json 条目 15534“Gritty Prison Mugshot Portrait”明确给出的摄影媒介、场景、材质与后期处理，不添加来源外的风格元素。

## Composition

- 采用来源提示词明确指定的景别、机位、人物动作和环境层次；人物属性、人数与组合由当前任务决定。

## Lighting And Color

- 采用来源提示词明确指定的光源、色温、曝光、色彩关系和相机或胶片质感。

## Subject Boundary

- Apply `system/rules/style_base.md`.
- This style defines visual treatment only and does not restrict subject identity, attributes, count, or combinations.
