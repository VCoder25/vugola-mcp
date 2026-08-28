import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const readJson = (path: string) => JSON.parse(readFileSync(resolve(root, path), 'utf8'));

describe('OpenAI and Claude plugin bundles', () => {
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

  it('uses Claude\'s native plugin layout and the production OAuth connector', () => {
    const manifest = readJson('.claude-plugin/plugin.json');

    expect(manifest).toMatchObject({
      name: 'vugola',
      displayName: 'Vugola',
      version: '1.4.0',
      skills: './skills/',
      mcpServers: './claude.mcp.json',
      homepage: 'https://www.vugolaai.com/mcp',
      repository: 'https://github.com/VCoder25/vugola-mcp',
    });

    expect(readJson('claude.mcp.json')).toEqual({
      mcpServers: {
        vugola: {
          type: 'http',
          url: 'https://www.vugolaai.com/api/mcp',
        },
      },
    });
  });

  it('can be added as a Claude marketplace from the public repository', () => {
    const manifest = readJson('.claude-plugin/plugin.json');
    const marketplace = readJson('.claude-plugin/marketplace.json');

    expect(marketplace).toMatchObject({
      name: 'vugola-plugins',
      owner: {
        name: 'Vugola LLC',
        email: 'support@vugolaai.com',
      },
      plugins: [
        {
          name: 'vugola',
          displayName: 'Vugola',
          source: './',
          version: manifest.version,
          description: manifest.description,
          category: 'Marketing',
          strict: true,
        },
      ],
    });
  });

  it('bundles the approved Vugola product mark for the directory icon', () => {
    const logo = readFileSync(resolve(root, 'assets/logo.png'));

    expect(logo.byteLength).toBe(61_597);
    expect(createHash('sha256').update(logo).digest('hex')).toBe(
      '6a690184e6756281f6281a843e7448a1942ca14289fd5ceddc950420bf4b8e2f',
    );
  });

  it('documents every hosted Vugola tool for Claude', () => {
    const skill = readFileSync(resolve(root, 'skills/vugola/SKILL.md'), 'utf8');
    const hostedTools = [
      'clip_video',
      'get_clip_status',
      'get_usage',
      'caption_video',
      'download_clip',
      'schedule_post',
      'list_scheduled_posts',
      'cancel_scheduled_post',
      'list_automation_destinations',
      'resolve_automation_channel',
      'create_automation',
      'list_automations',
      'get_automation',
      'update_automation',
      'pause_automation',
      'resume_automation',
      'delete_automation',
    ];

    for (const tool of hostedTools) expect(skill).toContain(`\`${tool}\``);
    expect(skill).toContain('up to 20 minutes');
    expect(skill).not.toContain('5 minutes or less');
    expect(skill).toContain('Channel automations require a Creator or Agency workspace owner.');
    expect(skill).toContain(
      'Before calling `schedule_post`, show the final preview and confirm the platform, final caption and title, selected authorized media, and exact date, time, and timezone with the user.',
    );
  });
});
