export const CAPTION_STYLES = [
  "none",
  "highlighted",
  "scale",
  "minimalist",
  "box",
  "staticbox",
  "glow",
  "hormozi",
] as const;

export type CaptionStyle = (typeof CAPTION_STYLES)[number];

export const CAPTION_STYLE_OPTIONS = CAPTION_STYLES.join(", ");
