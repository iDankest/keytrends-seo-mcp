import { extractLocs, isSitemapIndex } from '../../utils/xml.js';
export async function fetchRobots(opts) {
    const cleanSiteUrl = opts.siteUrl.replace(/\/+$/, '');
    const robotsUrl = `${cleanSiteUrl}/robots.txt`;
    try {
        const resp = await opts.http.request(robotsUrl);
        if (!resp.ok) {
            return { status: resp.status, text: resp.text, sitemaps: [] };
        }
        const sitemaps = [];
        const lines = resp.text.split(/\r?\n/);
        for (const line of lines) {
            const match = /^Sitemap:\s*(.+)$/i.exec(line.trim());
            if (match && match[1]) {
                sitemaps.push(match[1].trim());
            }
        }
        return { status: resp.status, text: resp.text, sitemaps };
    }
    catch (err) {
        return {
            status: 0,
            text: err instanceof Error ? err.message : String(err),
            sitemaps: [],
        };
    }
}
export async function fetchSitemapGraph(opts) {
    const { siteUrl, sitemapUrl, http, maxSubSitemaps, collectUrls } = opts;
    const cleanSiteUrl = siteUrl.replace(/\/+$/, '');
    const candidatesTried = [];
    const errors = [];
    const candidateQueue = [];
    if (sitemapUrl && sitemapUrl.trim().length > 0) {
        candidateQueue.push(sitemapUrl.trim());
    }
    candidateQueue.push(`${cleanSiteUrl}/sitemap_index.xml`);
    candidateQueue.push(`${cleanSiteUrl}/sitemap.xml`);
    const robots = await fetchRobots({ siteUrl, http });
    for (const sm of robots.sitemaps) {
        if (!candidateQueue.includes(sm)) {
            candidateQueue.push(sm);
        }
    }
    let entrypoint = null;
    let entrypointXml = null;
    for (const candidate of candidateQueue) {
        candidatesTried.push(candidate);
        try {
            const resp = await http.request(candidate);
            if (resp.status === 200) {
                const locs = extractLocs(resp.text);
                if (locs.length > 0 || isSitemapIndex(resp.text)) {
                    entrypoint = candidate;
                    entrypointXml = resp.text;
                    break;
                }
            }
            else {
                errors.push(`Candidato ${candidate} devolvió HTTP ${resp.status}`);
            }
        }
        catch (err) {
            errors.push(`Error al acceder a ${candidate}: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    if (!entrypoint || !entrypointXml) {
        return {
            entrypoint: null,
            candidates_tried: candidatesTried,
            sub_sitemaps: [],
            total_urls: 0,
            urls: [],
            errors,
        };
    }
    const subSitemaps = [];
    const collectedUrls = [];
    let totalUrls = 0;
    if (isSitemapIndex(entrypointXml)) {
        const childSitemaps = extractLocs(entrypointXml);
        const visited = new Set([entrypoint]);
        const queue = [...childSitemaps];
        while (queue.length > 0 && subSitemaps.length < maxSubSitemaps) {
            const childUrl = queue.shift();
            if (visited.has(childUrl)) {
                continue;
            }
            visited.add(childUrl);
            try {
                const childResp = await http.request(childUrl);
                if (childResp.status === 200) {
                    const isChildIndex = isSitemapIndex(childResp.text);
                    const childLocs = extractLocs(childResp.text);
                    if (isChildIndex) {
                        subSitemaps.push({
                            url: childUrl,
                            url_count: childLocs.length,
                            status: 'ok',
                            is_index: true,
                        });
                        for (const grandChild of childLocs) {
                            if (!visited.has(grandChild)) {
                                queue.push(grandChild);
                            }
                        }
                    }
                    else {
                        subSitemaps.push({
                            url: childUrl,
                            url_count: childLocs.length,
                            status: 'ok',
                            is_index: false,
                        });
                        totalUrls += childLocs.length;
                        if (collectUrls) {
                            collectedUrls.push(...childLocs);
                        }
                    }
                }
                else {
                    subSitemaps.push({
                        url: childUrl,
                        url_count: 0,
                        status: 'error',
                        error: `HTTP ${childResp.status}`,
                        is_index: false,
                    });
                    errors.push(`Sub-sitemap ${childUrl} devolvió HTTP ${childResp.status}`);
                }
            }
            catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                subSitemaps.push({
                    url: childUrl,
                    url_count: 0,
                    status: 'error',
                    error: msg,
                    is_index: false,
                });
                errors.push(`Error en sub-sitemap ${childUrl}: ${msg}`);
            }
        }
    }
    else {
        // Single sitemap file (urlset)
        const locs = extractLocs(entrypointXml);
        totalUrls = locs.length;
        subSitemaps.push({
            url: entrypoint,
            url_count: locs.length,
            status: 'ok',
            is_index: false,
        });
        if (collectUrls) {
            collectedUrls.push(...locs);
        }
    }
    return {
        entrypoint,
        candidates_tried: candidatesTried,
        sub_sitemaps: subSitemaps,
        total_urls: totalUrls,
        urls: collectedUrls,
        errors,
    };
}
//# sourceMappingURL=fetcher.js.map