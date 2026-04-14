const DASHBOARD = "https://www.vugolaai.com/dashboard/api-key";
const PRICING = "https://www.vugolaai.com/pricing";

const KNOWN_400_CODES: Record<string, string> = {
  video_too_short: "Videos must be at least 2 minutes long.",
  video_too_long: "Videos must be 3 hours or shorter.",
  invalid_url: "That video URL isn't supported.",
  missing_fields: "Vugola rejected the request. A required field was missing.",
  invalid_aspect_ratio: "aspect_ratio must be one of: 9:16, 16:9, 1:1.",
  invalid_caption_style:
    "caption_style must be one of: none, highlighted, scale, minimalist, box.",
};

export function translateHttpError(status: number, body: unknown): string {
  const errObj = (body && typeof body === "object" ? body : {}) as {
    error?: unknown;
  };
  const code = typeof errObj.error === "string" ? errObj.error : "";

  switch (status) {
    case 401:
      return `Your API key was rejected. Check or regenerate it at ${DASHBOARD}`;
    case 402:
      return `Out of credits. They may have been used by another session. Upgrade or top up at ${PRICING}`;
    case 403:
      return `Your Vugola plan doesn't include this feature. See ${PRICING} for plans.`;
    case 404:
      return "Job or post not found. The ID may be wrong or the job may have been deleted.";
    case 408:
      return "Vugola took too long to respond. Try again shortly.";
    case 429:
      return "Vugola rate limit hit. Try again in about a minute.";
    case 400: {
      const canned = KNOWN_400_CODES[code];
      if (canned) return canned;
      return "Vugola rejected the request. Check the input and try again.";
    }
    case 500:
    case 502:
    case 503:
    case 504:
      return "Vugola is having a temporary problem. Try again in a few minutes.";
    default:
      return `Vugola returned an unexpected response (status ${status}). Try again shortly.`;
  }
}

export function translateNetworkError(err: unknown): string {
  if (
    err &&
    typeof err === "object" &&
    "name" in err &&
    (err as { name: unknown }).name === "AbortError"
  ) {
    return "Vugola took too long to respond. Try again shortly.";
  }
  return "Couldn't reach Vugola. Check your internet connection.";
}
