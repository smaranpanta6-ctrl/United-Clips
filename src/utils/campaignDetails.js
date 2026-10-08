// Preserve the wording of campaign terms; never invent a rate or deadline.
export function campaignDetails(campaign = {}) {
    const labels = {
        cpm: /^(?:cpm(?:\s*\(pay rate\))?|pay rate)$/i,
        budget: /^(?:pot|budget|total budget)$/i,
        deadline: /^(?:end date|deadline|ends)$/i,
        platform: /^platforms?$/i,
        minimumViews: /^(?:min(?:imum)? views(?: per video)?)$/i,
        maximumPayout: /^(?:max(?:imum)? pay[ -]?out(?: per video)?)$/i
    };
    const parsed = {};
    for (const line of String(campaign.campaignInfo || '').split('\n')) {
        const cleaned = line.replace(/[*_`]/g, '').replace(/^[^a-z0-9]+/i, '').trim();
        const colon = cleaned.indexOf(':');
        if (colon < 0) continue;
        const label = cleaned.slice(0, colon).trim();
        const value = cleaned.slice(colon + 1).trim();
        for (const [key, pattern] of Object.entries(labels)) {
            if (pattern.test(label) && value) parsed[key] = value;
        }
    }
    return {
        ...campaign,
        ...Object.fromEntries(Object.keys(labels).map(key => [
            key, campaign[key] || parsed[key] || 'See campaign brief'
        ]))
    };
}
