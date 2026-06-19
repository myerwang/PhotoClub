---
style_id: dreamyorientalfemaleportrait
name: Dreamy Oriental female portrait prompt
thumbnail: dreamyorientalfemaleportrait.png
source_url: https://github.com/gpt-image2/awesome-gptimage2-prompts
source_title: gpt-image2/awesome-gptimage2-prompts
source_result: 34
retrieved_at: 2026-06-19T11:04:59.421Z
---

# Style: Dreamy Oriental female portrait prompt

## Source Prompt

{argument name="主题" default="梦幻东方女性人像"}，成年女性，近景肖像，精致五官，白皙通透肌肤，细腻但干净的皮肤质感，祖母绿色眼睛，柔和迷人眼神，棕色微卷发自然散落；
{argument name="配饰" default="米白色蕾丝头饰"}，青绿色蝴蝶点缀，珍珠装饰，服饰为精致蕾丝礼服，结构清晰，纹理干净不过度复杂，祖母绿宝石饰品；
光影为柔和暖金色侧逆光，轮廓光清晰但不过曝，皮肤有轻微高光但不过度反射，整体光线干净通透，背景柔和虚化，浅景深；
高级人像摄影质感，细节清晰但克制，无颗粒感，无噪点，真实物理光影，8K，商业级质感。比例：9:16

## Adaptation Log

- 删除固定姓名、公众人物、性别、年龄、族裔、职业、人数及五官文字描述，人物身份和组合由所选人物参考决定。
- 删除固定分辨率、纵横比、品牌、文案、水印及平台参数；保留来源明确给出的摄影媒介、服装语言、环境、动作、构图、灯光和后期质感。

## Visual Rules

- 采用来源 prompts.json 条目 15927“Dreamy Oriental female portrait prompt”明确给出的摄影媒介、场景、材质与后期处理，不添加来源外的风格元素。

## Composition

- 采用来源提示词明确指定的景别、机位、人物动作和环境层次；人物属性、人数与组合由当前任务决定。

## Lighting And Color

- 采用来源提示词明确指定的光源、色温、曝光、色彩关系和相机或胶片质感。

## Subject Boundary

- Apply `system/rules/style_base.md`.
- This style defines visual treatment only and does not restrict subject identity, attributes, count, or combinations.
