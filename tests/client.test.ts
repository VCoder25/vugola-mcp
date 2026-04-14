import { describe, it, expect, vi } from "vitest";
import { createClient } from "../src/client.js";

describe("client", () => {
  it("sends Authorization: Bearer header and JSON body on POST", async () => {
    let captured: RequestInit | undefined;
    const fakeFetch: typeof fetch = async (_url, init) => {
      captured = init;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };
    const c = createClient({
      baseUrl: "https://api.vugolaai.com",
      apiKey: "vug_sk_test",
      fetch: fakeFetch,
    });

    const res = await c.request("/clip", {
      method: "POST",
      body: { foo: "bar" },
      timeoutMs: 1000,
      retryIdempotent: false,
    });

    expect(captured?.method).toBe("POST");
    expect(
      (captured?.headers as Record<string, string>).Authorization
    ).toBe("Bearer vug_sk_test");
    expect(captured?.body).toBe(JSON.stringify({ foo: "bar" }));
    expect(res.ok).toBe(true);
    expect(res.body).toEqual({ ok: true });
  });

  it("returns { ok: false, httpStatus, body } on non-2xx without throwing", async () => {
    const fakeFetch: typeof fetch = async () =>
      new Response(JSON.stringify({ error: "video_too_short" }), {
        status: 400,
      });
    const c = createClient({
      baseUrl: "https://api.vugolaai.com",
      apiKey: "vug_sk_test",
      fetch: fakeFetch,
    });
    const res = await c.request("/clip", {
      method: "POST",
      body: {},
      timeoutMs: 1000,
      retryIdempotent: false,
    });
    expect(res.ok).toBe(false);
    expect(res.httpStatus).toBe(400);
    expect(res.body).toEqual({ error: "video_too_short" });
  });

  it("retries idempotent GET once on 5xx", async () => {
    let calls = 0;
    const fakeFetch: typeof fetch = async () => {
      calls++;
      if (calls === 1) return new Response("", { status: 502 });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };
    const c = createClient({
      baseUrl: "https://api.vugolaai.com",
      apiKey: "vug_sk_test",
      fetch: fakeFetch,
    });
    const res = await c.request("/status", {
      method: "GET",
      timeoutMs: 1000,
      retryIdempotent: true,
      retryDelayMs: 0,
    });
    expect(calls).toBe(2);
    expect(res.ok).toBe(true);
  });

  it("does NOT retry POST even on 5xx", async () => {
    let calls = 0;
    const fakeFetch: typeof fetch = async () => {
      calls++;
      return new Response("", { status: 502 });
    };
    const c = createClient({
      baseUrl: "https://api.vugolaai.com",
      apiKey: "vug_sk_test",
      fetch: fakeFetch,
    });
    const res = await c.request("/clip", {
      method: "POST",
      body: {},
      timeoutMs: 1000,
      retryIdempotent: false,
    });
    expect(calls).toBe(1);
    expect(res.ok).toBe(false);
    expect(res.httpStatus).toBe(502);
  });

  it("aborts on timeout and surfaces AbortError", async () => {
    const fakeFetch: typeof fetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(Object.assign(new Error("aborted"), { name: "AbortError" }))
        );
      });
    const c = createClient({
      baseUrl: "https://api.vugolaai.com",
      apiKey: "vug_sk_test",
      fetch: fakeFetch,
    });
    await expect(
      c.request("/status", {
        method: "GET",
        timeoutMs: 50,
        retryIdempotent: false,
      })
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
