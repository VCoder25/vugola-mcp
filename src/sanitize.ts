const INJECTION_PATTERN = /^(ignore|forget|system:|assistant:|user:|new instructions?)/im;

export interface SanitizeOptions {
  maxLength: number;
}

export function sanitize(input: unknown, opts: SanitizeOptions): string {
  if (input === null || input === undefined) return "";
  const str = typeof input === "string" ? input : String(input);

  if (INJECTION_PATTERN.test(str)) {
    return "<content-suppressed: possible injection>";
  }

  const escaped = str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  if (escaped.length > opts.maxLength) {
    return escaped.slice(0, opts.maxLength) + "…";
  }
  return escaped;
}
