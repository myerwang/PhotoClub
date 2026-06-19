---
style_id: minimalspringfashioneditoria
name: Minimal Spring Fashion Editorial Board
thumbnail: minimalspringfashioneditoria.png
source_url: https://github.com/gpt-image2/awesome-gptimage2-prompts
source_title: gpt-image2/awesome-gptimage2-prompts
source_result: 34
retrieved_at: 2026-06-19T11:04:59.421Z
---

# Style: Minimal Spring Fashion Editorial Board

## Source Prompt

{"type":"fashion editorial layout poster","brand":"MANGO","collection":"25 SPRING COLLECTION","style":"minimal luxury magazine spread, clean white background, soft daylight, airy modern editorial design, high-end fashion lookbook board","subject":{"gender_presentation":"female","pose":"seated in a relaxed pose on a light cane chair, torso angled left, head turned away","face":"intentionally blurred/obscured","outfit":{"outerwear":{"item":"cropped lightweight zip jacket","color":"{argument name=\"jacket color\" default=\"vivid red\"}"},"top":{"item":"semi-sheer fitted long-sleeve knit top","color":"soft white"},"bottom":{"item":"midi skirt","color":"white","pattern":"large black polka dots"}},"accessories":{"bag":"structured black handbag shown in product row and styling variation","shoes":"black flat shoes shown in product row"}},"layout":{"format":"single fashion board with large left hero image and right information column","sections":[{"title":"Style Keywords","position":"top-right","count":3,"labels":["01 轻透 Sheer","02 松弛 Relax","03 细节 Detail"]},{"title":"Coordinate Variation","position":"upper-mid-right","count":2,"labels":["朱和一— / OFF WHITE","浅蓝 / PALE BLUE"]},{"title":"DETAIL","position":"upper-right below coordinate variation","count":3,"labels":["透明边缘感","布料垂坠","柔软结构"]},{"title":"ITEM PICK UP","position":"lower-mid-right","count":5,"labels":["风衣","上衣","裤子","包","鞋"]}],"hero_text":{"headline":"{argument name=\"headline text\" default=\"LIGHT LAYERS\"}","subheadline":"轻层叠穿","body":["春日轻盈叠加，从空气开始","Light layering for spring, built on air and softness.","轻透材质与松弛轮廓的叠加，不是为了展示造型，而是让身体与空气形成关系。","Layering is not about structure, it's about how fabric meets air."]},"additional_note":{"title":"EDITOR'S NOTE","text":"春天的穿搭不需要用力，轻透与柔软的叠加，是季节给予我们的温柔语言。"},"bottom_right_inset":"small minimalist interior window photo strip"},"visual_details":{"color_palette":["red","white","black","soft beige","pale blue"],"materials":["sheer knit","soft draped fabric","smooth zipper detail"],"lighting":"soft natural morning light from the side","composition":"left side dominated by large model image, right side arranged as neat editorial grid with thin divider lines and generous margins"},"rendering_notes":"create a polished fashion campaign slide or magazine-style apparel presentation in bilingual Chinese-English typography, with realistic clothing photography, elegant spacing, understated premium branding, and a calm spring atmosphere"}

## Adaptation Log

- 删除固定姓名、公众人物、性别、年龄、族裔、职业、人数及五官文字描述，人物身份和组合由所选人物参考决定。
- 删除固定分辨率、纵横比、品牌、文案、水印及平台参数；保留来源明确给出的摄影媒介、服装语言、环境、动作、构图、灯光和后期质感。

## Visual Rules

- 采用来源 prompts.json 条目 14456“Minimal Spring Fashion Editorial Board”明确给出的摄影媒介、场景、材质与后期处理，不添加来源外的风格元素。

## Composition

- 采用来源提示词明确指定的景别、机位、人物动作和环境层次；人物属性、人数与组合由当前任务决定。

## Lighting And Color

- 采用来源提示词明确指定的光源、色温、曝光、色彩关系和相机或胶片质感。

## Subject Boundary

- Apply `system/rules/style_base.md`.
- This style defines visual treatment only and does not restrict subject identity, attributes, count, or combinations.
