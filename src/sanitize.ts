export interface SanitizeOptions {
  maxLength: number;
}

// Tool results serialize these bounded values with JSON.stringify. Preserve
// customer text and signed URL bytes; HTML escaping belongs at an HTML sink.
// This is output shaping, not an instruction or authorization filter.
export function sanitize(input: unknown, opts: SanitizeOptions): string {
  if (input === null || input === undefined) return "";
  const str = typeof input === "string" ? input : String(input);
  return str.length > opts.maxLength ? str.slice(0, opts.maxLength) + "…" : str;
}
