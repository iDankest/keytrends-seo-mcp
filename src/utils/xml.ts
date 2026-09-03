export function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
}

export function extractLocs(xml: string): string[] {
  const locRegex = /<loc\b[^>]*>([\s\S]*?)<\/loc>/gi;
  const locs: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = locRegex.exec(xml)) !== null) {
    const rawContent = match[1];
    const cleaned = decodeXmlEntities(rawContent.trim());
    if (cleaned.length > 0) {
      locs.push(cleaned);
    }
  }

  return locs;
}

export function isSitemapIndex(xml: string): boolean {
  return /<sitemapindex[\s>]/i.test(xml);
}
