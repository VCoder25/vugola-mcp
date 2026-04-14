export interface ClientConfig {
  baseUrl: string;
  apiKey: string;
  fetch?: typeof fetch;
}

export interface RequestOptions {
  method: "GET" | "POST" | "DELETE";
  body?: unknown;
  timeoutMs: number;
  retryIdempotent: boolean;
  retryDelayMs?: number;
}

export type RequestResult =
  | { ok: true; httpStatus: number; body: unknown }
  | { ok: false; httpStatus: number; body: unknown };

export interface Client {
  request(path: string, opts: RequestOptions): Promise<RequestResult>;
}

export function createClient(cfg: ClientConfig): Client {
  const fetchFn = cfg.fetch ?? fetch;

  async function doRequest(
    path: string,
    opts: RequestOptions
  ): Promise<RequestResult> {
    if (!cfg.apiKey) {
      throw new Error("VUGOLA_API_KEY not set");
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), opts.timeoutMs);
    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${cfg.apiKey}`,
      };
      const init: RequestInit = {
        method: opts.method,
        headers,
        signal: controller.signal,
      };
      if (opts.body !== undefined) {
        headers["content-type"] = "application/json";
        init.body = JSON.stringify(opts.body);
      }
      const res = await fetchFn(cfg.baseUrl + path, init);
      const text = await res.text();
      let body: unknown = {};
      if (text.length > 0) {
        try {
          body = JSON.parse(text);
        } catch {
          body = { raw: text.slice(0, 500) };
        }
      }
      return {
        ok: res.ok,
        httpStatus: res.status,
        body,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    async request(path, opts) {
      const first = await doRequest(path, opts);
      if (first.ok) return first;
      const isRetryable5xx = first.httpStatus >= 500 && first.httpStatus < 600;
      if (opts.retryIdempotent && opts.method === "GET" && isRetryable5xx) {
        await new Promise((r) => setTimeout(r, opts.retryDelayMs ?? 3000));
        return doRequest(path, opts);
      }
      return first;
    },
  };
}
