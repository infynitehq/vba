import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const origin = 'https://vba.infynite.in/';

function meta(attribute: 'name' | 'property', key: string) {
  return html.match(
    new RegExp(`<meta\\s+${attribute}="${key}"\\s+content="([^"]+)"\\s*/>`),
  )?.[1];
}

describe('public search and sharing metadata', () => {
  it('serves canonical and social metadata without running the app', () => {
    expect(html).toContain(`<link rel="canonical" href="${origin}"`);
    expect(meta('name', 'description')).toContain('Game Boy Advance');
    expect(meta('property', 'og:url')).toBe(origin);
    expect(meta('property', 'og:type')).toBe('website');
    expect(meta('name', 'twitter:card')).toBe('summary_large_image');
    expect(meta('property', 'og:image')).toBe(`${origin}og-image.png`);
    expect(meta('name', 'twitter:image')).toBe(meta('property', 'og:image'));
    expect(meta('property', 'og:image:alt')).toBeTruthy();
  });

  it('ships the share image at the advertised dimensions', async () => {
    const image = await sharp(
      readFileSync(new URL('../../public/og-image.png', import.meta.url)),
    ).metadata();
    expect(image.format).toBe('png');
    expect(image.width).toBe(Number(meta('property', 'og:image:width')));
    expect(image.height).toBe(Number(meta('property', 'og:image:height')));
  });

  it('provides valid application structured data', () => {
    const json = html.match(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/,
    )?.[1];
    const data = JSON.parse(json!);
    expect(data['@type']).toBe('WebApplication');
    expect(data.url).toBe(origin);
    expect(data.image).toBe(meta('property', 'og:image'));
  });

  it('lists the homepage in the sitemap and keeps internal players out of search', () => {
    const robots = readFileSync(
      new URL('../../public/robots.txt', import.meta.url),
      'utf8',
    );
    const sitemap = readFileSync(
      new URL('../../public/sitemap.xml', import.meta.url),
      'utf8',
    );
    expect(robots).toContain(`Sitemap: ${origin}sitemap.xml`);
    expect(sitemap).toContain(`<loc>${origin}</loc>`);
    for (const file of ['player.html', 'player-preview.html']) {
      const player = readFileSync(
        new URL(`../../public/${file}`, import.meta.url),
        'utf8',
      );
      expect(player).toContain('<meta name="robots" content="noindex"');
    }
  });
});
