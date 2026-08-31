import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const manifest = JSON.parse(readFileSync(resolve(root, 'server.json'), 'utf8'));
const readme = readFileSync(resolve(root, 'README.md'), 'utf8');

describe('official MCP Registry manifest', () => {
  it('keeps the hosted OAuth server as the no-key connection', () => {
    expect(manifest.title).toBe('Vugola');
    expect(manifest.websiteUrl).toBe('https://www.vugolaai.com/mcp');
    expect(manifest.remotes).toEqual([
      {
        type: 'streamable-http',
        url: 'https://www.vugolaai.com/api/mcp',
      },
    ]);
  });

  it('publishes directory branding from the Vugola domain', () => {
    expect(manifest.icons).toEqual([
      {
        src: 'https://www.vugolaai.com/integrations/vugola-mark.png',
        mimeType: 'image/png',
        sizes: ['1024x1024'],
      },
    ]);
  });

  it('keeps the API-key package fallback pinned to the latest public npm release', () => {
    expect(manifest.packages).toHaveLength(1);
    expect(manifest.packages[0]).toMatchObject({
      registryType: 'npm',
      identifier: 'vugola-mcp',
      version: '1.3.1',
      transport: { type: 'stdio' },
    });
    expect(manifest.packages[0].environmentVariables).toEqual([
      expect.objectContaining({
        name: 'VUGOLA_API_KEY',
        isRequired: true,
        isSecret: true,
      }),
    ]);
    expect(manifest.packages[0].environmentVariables[0].description).toContain('active paid Vugola plan');
    expect(manifest.packages[0].environmentVariables[0].description).not.toMatch(/trial/i);
  });

  it('keeps public MCP access guidance aligned with the paid-plan gate', () => {
    expect(readme).toContain('MCP access is included with every active paid Vugola plan');
    expect(readme).not.toMatch(/\$1|3-day trial/i);
  });
});
