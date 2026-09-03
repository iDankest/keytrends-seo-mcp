import { describe, expect, it } from 'vitest';
import { extractLocs, isSitemapIndex } from '../src/utils/xml.js';

describe('utils/xml', () => {
  it('extractLocs parses loc tags and decodes XML entities', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://keytrends.ai/page?param1=foo&amp;param2=bar&quot;test&quot;</loc>
  </url>
  <url>
    <loc>  https://keytrends.ai/page2?item=1&apos;s  </loc>
  </url>
</urlset>`;

    const locs = extractLocs(xml);
    expect(locs).toHaveLength(2);
    expect(locs[0]).toBe('https://keytrends.ai/page?param1=foo&param2=bar"test"');
    expect(locs[1]).toBe("https://keytrends.ai/page2?item=1's");
  });

  it('extractLocs handles multiline inside <loc>', () => {
    const xml = `<urlset>
      <url>
        <loc>
          https://keytrends.ai/multiline
        </loc>
      </url>
    </urlset>`;
    const locs = extractLocs(xml);
    expect(locs).toEqual(['https://keytrends.ai/multiline']);
  });

  it('isSitemapIndex correctly identifies index vs urlset', () => {
    const indexXml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://keytrends.ai/sitemap-1.xml</loc></sitemap>
</sitemapindex>`;

    const urlsetXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://keytrends.ai/</loc></url>
</urlset>`;

    expect(isSitemapIndex(indexXml)).toBe(true);
    expect(isSitemapIndex(urlsetXml)).toBe(false);
  });
});
