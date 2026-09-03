export function decodeXmlEntities(text) {
    return text
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/g, "'");
}
export function extractLocs(xml) {
    const locRegex = /<loc\b[^>]*>([\s\S]*?)<\/loc>/gi;
    const locs = [];
    let match;
    while ((match = locRegex.exec(xml)) !== null) {
        const rawContent = match[1];
        const cleaned = decodeXmlEntities(rawContent.trim());
        if (cleaned.length > 0) {
            locs.push(cleaned);
        }
    }
    return locs;
}
export function isSitemapIndex(xml) {
    return /<sitemapindex[\s>]/i.test(xml);
}
//# sourceMappingURL=xml.js.map