---
style_id: highcontrastmonochromestudio
name: High-Contrast Monochrome Studio Portrait
thumbnail: highcontrastmonochromestudio.png
source_url: https://github.com/gpt-image2/awesome-gptimage2-prompts
source_title: gpt-image2/awesome-gptimage2-prompts
source_result: 34
retrieved_at: 2026-06-19T11:04:59.421Z
---

# Style: High-Contrast Monochrome Studio Portrait

## Source Prompt

Create a 4:5 high-contrast, black-and-white studio portrait of a {argument name="subject" default="handsome man"} in the uploaded image. He is seated in a slumped, pensive posture on a {argument name="furniture" default="minimalist dark wooden chair"}. His right elbow rests on his knee, with his head leaning heavily into his palm, while his left hand loosely grips a white disposable coffee cup with a black plastic lid. He is wearing classic black Wayfarer-style sunglasses, hiding his eyes and adding to the stoic, moody atmosphere.Suit: An oversized, structured black blazer and matching wide-leg trousers. The fabric is a heavy, matte wool. Four small black buttons are visible on the sleeve cuff. Footwear: Crisp, bright white ribbed cotton socks creating a sharp visual break between the dark trousers and shoes. Shoes: Highly polished black leather Oxford shoes with thin laces and a slight sheen on the toe box. Background: A minimalist, sterile studio setting with a {argument name="background" default="light grey or off-white textured plaster wall"}. A soft, vertical shadow or curtain edge is visible on the far left. Lighting: Soft, diffused side-lighting that creates gentle gradients on the man's face and deep, dramatic folds in the oversized suit. The lighting emphasizes the high-contrast "black on white" aesthetic. Floor: A light, seamless studio floor that catches the soft shadows cast by the chair legs and the man's shoes. Color Grade: Pure monochrome (black and white) with a wide dynamic range—deep blacks and bright, clean whites. Film Quality: Sharp focus on the subject with a very subtle film grain, mimicking professional editorial fashion photography (reminiscent of 1990s minimalist campaigns).

## Adaptation Log

- 删除固定姓名、公众人物、性别、年龄、族裔、职业、人数及五官文字描述，人物身份和组合由所选人物参考决定。
- 删除固定分辨率、纵横比、品牌、文案、水印及平台参数；保留来源明确给出的摄影媒介、服装语言、环境、动作、构图、灯光和后期质感。

## Visual Rules

- 采用来源 prompts.json 条目 15184“High-Contrast Monochrome Studio Portrait”明确给出的摄影媒介、场景、材质与后期处理，不添加来源外的风格元素。

## Composition

- 采用来源提示词明确指定的景别、机位、人物动作和环境层次；人物属性、人数与组合由当前任务决定。

## Lighting And Color

- 采用来源提示词明确指定的光源、色温、曝光、色彩关系和相机或胶片质感。

## Subject Boundary

- Apply `system/rules/style_base.md`.
- This style defines visual treatment only and does not restrict subject identity, attributes, count, or combinations.
