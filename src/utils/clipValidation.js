export function validateClipUrl(value, platformInput) {
    let url;
    try { url = new URL(String(value).trim()); } catch { return null; }
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    const host = url.hostname.toLowerCase();
    let platform;
    let canonicalUrl;
    if (['www.tiktok.com', 'tiktok.com', 'm.tiktok.com'].includes(host)
        && /^\/@[^/]+\/video\/\d+\/?$/.test(url.pathname)) {
        platform = 'TikTok';
        canonicalUrl = `https://www.tiktok.com${url.pathname.replace(/\/$/, '')}`;
    } else if (['vm.tiktok.com', 'vt.tiktok.com'].includes(host)
        && /^\/[a-z0-9]+\/?$/i.test(url.pathname)) {
        platform = 'TikTok';
        canonicalUrl = `https://${host}${url.pathname.replace(/\/$/, '')}`;
    } else if (['instagram.com', 'www.instagram.com'].includes(host)
        && /^\/(reel|reels|p|tv)\/[a-z0-9_-]+\/?$/i.test(url.pathname)) {
        platform = 'Instagram';
        canonicalUrl = `https://www.instagram.com${url.pathname.replace(/^\/reels\//, '/reel/').replace(/\/$/, '')}/`;
    } else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'].includes(host)) {
        const match = url.pathname.match(/^\/(?:shorts\/)?([a-z0-9_-]{11})\/?$/i);
        const id = host === 'youtu.be' || url.pathname.startsWith('/shorts/')
            ? match?.[1] : url.pathname === '/watch' ? url.searchParams.get('v') : null;
        if (!id || !/^[a-z0-9_-]{11}$/i.test(id)) return null;
        platform = 'YouTube';
        canonicalUrl = `https://www.youtube.com/watch?v=${id}`;
    } else { return null; }
    const input = String(platformInput || '').trim().toLowerCase();
    const accepted = {
        TikTok: ['tiktok', 'tik tok'],
        Instagram: ['instagram', 'instagram reels', 'reels', 'ig'],
        YouTube: ['youtube', 'youtube shorts', 'shorts', 'yt']
    };
    if (!accepted[platform].includes(input)) return null;
    return { videoUrl: canonicalUrl, platform };
}
