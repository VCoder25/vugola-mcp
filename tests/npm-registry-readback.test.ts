import { describe, expect, it, vi } from 'vitest';
import { fetchRegistry, waitForReleaseTags, waitForReleaseVersion } from '../scripts/npm-registry-readback.mjs';

const integrity = 'sha512-reviewed-test-digest';
const metadata = { name: 'vugola-mcp', version: '1.4.0', dist: { integrity } };
const finalTags = { latest: '1.4.0', 'security-20261023': '1.4.0', 'rollback-20261023': '1.3.1' };

function fixture(responses: Array<{ status: number; body?: unknown }>) {
  let time = 0;
  const fetchFn = vi.fn(async (_url: string, _options: RequestInit) => {
    const next = responses.shift();
    if (!next) throw new Error('Unexpected registry request');
    return { status: next.status, json: async () => next.body };
  });
  const sleep = vi.fn(async (milliseconds: number) => { time += milliseconds; });
  return { fetchFn, sleep, now: () => time, timeoutMs: 6, pollMs: 2 };
}

describe('npm registry readback races', () => {
  it('waits through version 404s and returns only matching release metadata', async () => {
    const options = fixture([{ status: 404 }, { status: 404 }, { status: 200, body: metadata }]);
    await expect(waitForReleaseVersion(integrity, options)).resolves.toEqual(metadata);
    expect(options.fetchFn).toHaveBeenCalledTimes(3);
    for (const [url, request] of options.fetchFn.mock.calls) {
      expect(url).toBe('https://registry.npmjs.org/vugola-mcp/1.4.0');
      expect(request).toMatchObject({ redirect: 'error', cache: 'no-store', headers: { 'Cache-Control': 'no-cache, no-store, max-age=0', Pragma: 'no-cache' } });
      expect(request).not.toHaveProperty('method');
    }
  });

  it('waits for all three final tags after stale latest and missing tag reads', async () => {
    const options = fixture([
      { status: 200, body: { latest: '1.3.1', 'security-20261023': '1.4.0' } },
      { status: 200, body: { latest: '1.4.0', 'security-20261023': '1.4.0' } },
      { status: 200, body: finalTags },
    ]);
    await expect(waitForReleaseTags(options)).resolves.toEqual(finalTags);
    expect(options.fetchFn).toHaveBeenCalledTimes(3);
  });

  it.each([401, 403, 429, 500])('fails immediately on registry status %s', async status => {
    const options = fixture([{ status }, { status: 200, body: metadata }]);
    await expect(waitForReleaseVersion(integrity, options)).rejects.toThrow(`Registry status ${status}`);
    expect(options.fetchFn).toHaveBeenCalledTimes(1);
    expect(options.sleep).not.toHaveBeenCalled();
  });

  it('fails immediately on wrong integrity instead of waiting for a different artifact', async () => {
    const options = fixture([{ status: 200, body: { ...metadata, dist: { integrity: 'wrong' } } }]);
    await expect(waitForReleaseVersion(integrity, options)).rejects.toThrow();
    expect(options.fetchFn).toHaveBeenCalledTimes(1);
    expect(options.sleep).not.toHaveBeenCalled();
  });

  it('does not retry a tags endpoint 404', async () => {
    const options = fixture([{ status: 404 }, { status: 200, body: finalTags }]);
    await expect(waitForReleaseTags(options)).rejects.toThrow('Registry status 404');
    expect(options.fetchFn).toHaveBeenCalledTimes(1);
    expect(options.sleep).not.toHaveBeenCalled();
  });

  it.each([{ ...metadata, name: 'foreign' }, { ...metadata, version: '9.9.9' }])('rejects foreign metadata %j immediately', async body => {
    const options = fixture([{ status: 200, body }]);
    await expect(waitForReleaseVersion(integrity, options)).rejects.toThrow();
    expect(options.fetchFn).toHaveBeenCalledTimes(1);
    expect(options.sleep).not.toHaveBeenCalled();
  });

  it.each([
    { ...finalTags, latest: '9.9.9' },
    { ...finalTags, 'security-20261023': '1.3.1' },
    { ...finalTags, 'rollback-20261023': '1.4.0' },
    { ...finalTags, foreign: '1.4.0' },
    { ...finalTags, 'security-20261023': null },
  ])('fails immediately on unexpected tag state %j', async tags => {
    const options = fixture([{ status: 200, body: tags }]);
    await expect(waitForReleaseTags(options)).rejects.toThrow();
    expect(options.fetchFn).toHaveBeenCalledTimes(1);
    expect(options.sleep).not.toHaveBeenCalled();
  });

  it.each(['version', 'tags'])('stops stale %s reads at its bounded deadline', async kind => {
    const stale = kind === 'version' ? { status: 404 } : { status: 200, body: { latest: '1.3.1' } };
    const options = fixture([stale, stale, stale]);
    const result = kind === 'version' ? waitForReleaseVersion(integrity, options) : waitForReleaseTags(options);
    await expect(result).rejects.toThrow('readback deadline');
    expect(options.fetchFn).toHaveBeenCalledTimes(3);
    expect(options.now()).toBe(6);
  });

  it('refuses foreign registry origins before making a request', async () => {
    const fetchFn = vi.fn();
    await expect(fetchRegistry('https://registry.example.invalid/vugola-mcp/1.4.0', { fetchFn })).rejects.toThrow();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('rejects an attempt to extend polling beyond 60 seconds', async () => {
    const options = { ...fixture([]), timeoutMs: 60001 };
    await expect(waitForReleaseVersion(integrity, options)).rejects.toThrow();
    expect(options.fetchFn).not.toHaveBeenCalled();
  });

  it('fails immediately on malformed JSON or a network failure', async () => {
    for (const fetchFn of [
      vi.fn(async () => ({ status: 200, json: async () => { throw new Error('Malformed JSON'); } })),
      vi.fn(async () => { throw new Error('Network failure'); }),
    ]) {
      const options = { ...fixture([]), fetchFn };
      await expect(waitForReleaseVersion(integrity, options)).rejects.toThrow();
      expect(fetchFn).toHaveBeenCalledTimes(1);
      expect(options.sleep).not.toHaveBeenCalled();
    }
  });
});
