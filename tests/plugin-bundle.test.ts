import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const readJson = (path: string) => JSON.parse(readFileSync(resolve(root, path), 'utf8'));

describe('OpenAI plugin bundle', () => {
  it('uses the required manifest location and production listing metadata', () => {
    const manifest = readJson('.codex-plugin/plugin.json');

    expect(manifest.name).toBe('vugola');
    expect(manifest.mcpServers).toBe('./.mcp.json');
    expect(manifest.interface.displayName).toBe('Vugola');
    expect(manifest.interface.shortDescription.length).toBeLessThanOrEqual(30);
    expect(manifest.interface.defaultPrompt.length).toBeGreaterThan(0);
    expect(manifest.interface.defaultPrompt.length).toBeLessThanOrEqual(3);
    expect(manifest.interface.websiteURL).toBe('https://www.vugolaai.com/mcp');
    expect(manifest.interface.supportURL).toBe('https://www.vugolaai.com/contact');
    expect(manifest.interface.privacyPolicyURL).toBe('https://www.vugolaai.com/privacy-policy');
    expect(manifest.interface.termsOfServiceURL).toBe('https://www.vugolaai.com/terms-of-service');
    expect(existsSync(resolve(root, manifest.interface.composerIcon))).toBe(true);
    expect(existsSync(resolve(root, manifest.interface.logo))).toBe(true);
    expect(manifest.interface.screenshots).toEqual([]);
  });

  it('points only at the universal production OAuth MCP', () => {
    const config = readJson('.mcp.json');
    expect(Object.keys(config)).toEqual(['vugola']);
    const server = config.vugola;

    expect(server).toEqual({
      type: 'http',
      url: 'https://www.vugolaai.com/api/mcp',
      oauth_resource: 'https://www.vugolaai.com/api/mcp',
    });
  });

  it('does not ship a fabricated OpenAI app id', () => {
    const manifest = readFileSync(resolve(root, '.codex-plugin/plugin.json'), 'utf8');
    const mcp = readFileSync(resolve(root, '.mcp.json'), 'utf8');

    expect(`${manifest}\n${mcp}`).not.toMatch(/plugin_asdk_app_|asdk_app_|templated_apps_|connector_[a-f0-9]+/);
  });
});
