import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

const REGISTRY = 'https://registry.npmjs.org';
const VERSION_URL = `${REGISTRY}/vugola-mcp/1.4.0`;
const TAGS_URL = `${REGISTRY}/-/package/vugola-mcp/dist-tags`;

// Only reads are retried. Callers keep publication and tag writes outside this module.
export async function fetchRegistry(url, { fetchFn = fetch, timeoutMs = 30000 } = {}) {
  assert.equal(new URL(url).origin, REGISTRY);
  return fetchFn(url, {
    signal: AbortSignal.timeout(timeoutMs),
    redirect: 'error',
    cache: 'no-store',
    headers: { 'Cache-Control': 'no-cache, no-store, max-age=0', Pragma: 'no-cache' },
  });
}

export function assertReleaseTags(tags) {
  assert.ok(tags && typeof tags === 'object' && !Array.isArray(tags), 'Invalid registry tags');
  assert.ok(Object.keys(tags).every(tag => ['latest', 'security-20261023', 'rollback-20261023'].includes(tag)), 'Unexpected registry tag');
  assert.ok(['1.3.1', '1.4.0'].includes(tags.latest), 'Unexpected latest version');
  assert.ok(!Object.hasOwn(tags, 'security-20261023') || tags['security-20261023'] === '1.4.0', 'Unexpected candidate tag');
  assert.ok(!Object.hasOwn(tags, 'rollback-20261023') || tags['rollback-20261023'] === '1.3.1', 'Unexpected rollback tag');
}

async function poll(read, { fetchFn = fetch, timeoutMs = 60000, pollMs = 2000, now = Date.now, sleep = delay } = {}) {
  assert.ok(Number.isInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 60000);
  assert.ok(Number.isInteger(pollMs) && pollMs > 0);
  const deadline = now() + timeoutMs;
  while (true) {
    const remaining = deadline - now();
    assert.ok(remaining > 0, 'Registry visibility did not converge within the readback deadline');
    const value = await read({ fetchFn, timeoutMs: Math.min(30000, remaining) });
    if (value !== undefined) return value;
    const waitMs = Math.min(pollMs, deadline - now());
    assert.ok(waitMs > 0, 'Registry visibility did not converge within the readback deadline');
    await sleep(waitMs);
  }
}

export async function waitForReleaseVersion(expectedIntegrity, options) {
  return poll(async requestOptions => {
    const response = await fetchRegistry(VERSION_URL, requestOptions);
    if (response.status === 404) return undefined;
    assert.equal(response.status, 200, `Registry status ${response.status}`);
    const metadata = await response.json();
    assert.equal(metadata.name, 'vugola-mcp');
    assert.equal(metadata.version, '1.4.0');
    assert.equal(metadata.dist.integrity, expectedIntegrity);
    return metadata;
  }, options);
}

export async function readReleaseTags(options) {
  const response = await fetchRegistry(TAGS_URL, options);
  assert.equal(response.status, 200, `Registry status ${response.status}`);
  const tags = await response.json();
  assertReleaseTags(tags);
  return tags;
}

export async function waitForReleaseTags(options) {
  return poll(async requestOptions => {
    const tags = await readReleaseTags(requestOptions);
    return tags.latest === '1.4.0' && tags['security-20261023'] === '1.4.0' && tags['rollback-20261023'] === '1.3.1'
      ? tags : undefined;
  }, options);
}
