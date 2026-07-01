const BAD_SUBJECT_PATTERNS = [
  /\b(?:young|older|elderly|teenage?|adult|middle-aged)\b/iu,
  /\b(?:East Asian|Asian|Japanese|Korean|Chinese|South Asian|Russian|blonde)\b/iu,
  /\b(?:woman|man|girl|boy|female|male|actor|actress|model|idol|cosplayer|commuter|warrior|cowboy|alien)\b/iu,
  /\b(?:eyes?|nose|mouth|lips?|jawline|cheeks?|face shape|facial features?|skin tone|beard|stubble)\b/iu,
  /\b(?:censor(?:ed)?|obscur(?:e|ed|ing)|blur(?:red)?|mosaic|redacted|block over (?:the )?face|face block)\b/iu,
  /\b(?:phone|hand|hair|mask|helmet|sunglasses|shadow)\b.{0,60}\b(?:cover|hide|obscur|block)\b.{0,40}\bface\b/iu,
  /\bface\b.{0,80}\b(?:cover|hide|obscur|block|blur|censor|redact)\b/iu,
];

const VISUAL_PATTERNS = [
  /\b(?:photography|photo|portrait|editorial|cinematic|film|35mm|DSLR|smartphone|camera|lens|bokeh|depth of field|flash|lighting|light|shadow|color|palette|grain|contrast|background|setting|studio|street|interior|exterior|composition|framing|crop|angle|perspective|texture|material|wardrobe|outfit|dress|suit|jacket|robe|costume|environment|scene|mood|atmosphere|realistic|photorealistic)\b/iu,
  /摄影|照片|人像|电影感|胶片|镜头|灯光|色彩|背景|构图|质感|材质|服装|场景|氛围|写实/u,
];

function splitSentences(text) {
  return text
    .replace(/\{argument\s+name="[^"]+"\s+default="([^"]*)"\}/giu, '$1')
    .split(/(?<=[.!?。！？])\s+|\n+/u)
    .map((part) => part.trim())
    .filter(Boolean);
}

function isBadSubjectSentence(sentence) {
  return BAD_SUBJECT_PATTERNS.some((pattern) => pattern.test(sentence));
}

function hasVisualValue(sentence) {
  return VISUAL_PATTERNS.some((pattern) => pattern.test(sentence));
}

function fallbackFromStyle(style) {
  return [
    ...(Array.isArray(style?.visualRules) ? style.visualRules : []),
    ...(Array.isArray(style?.composition) ? style.composition : []),
    ...(Array.isArray(style?.lighting) ? style.lighting : []),
  ]
    .map((item) => String(item)
      .replace(/prompts\.json 条目 \d+“[^”]+”/giu, 'source record')
      .replace(/来源“[^”]+”提示词/giu, 'source prompt')
      .replace(/^采用来源提示词明确指定的/u, 'Use the source-defined ')
      .trim())
    .filter(Boolean)
    .join(' ');
}

export function sanitizeStyleSourcePrompt(sourcePrompt, style = {}) {
  const fallback = fallbackFromStyle(style).replace(/\s+/g, ' ').trim();
  if (fallback) return fallback;
  const kept = splitSentences(sourcePrompt)
    .filter((sentence) => {
      if (!isBadSubjectSentence(sentence)) return true;
      return hasVisualValue(sentence) && !/\b(?:eyes?|nose|mouth|lips?|jawline|cheeks?|censor|obscur|blur|mosaic|redacted|alien)\b/iu.test(sentence);
    });
  const candidate = kept.join(' ').replace(/\s+/g, ' ').trim();
  if (candidate.length >= 24 && hasVisualValue(candidate)) return candidate;
  return 'Reusable visual treatment only: preserve camera, lighting, setting, wardrobe language, materials, color grading, composition, and post-processing from the source; subject identity comes only from the selected character reference.';
}
