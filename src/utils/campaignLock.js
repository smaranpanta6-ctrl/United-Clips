// Serialize campaign mutations within the bot's single Railway replica.
// Read the latest campaign inside the operation, after acquiring this lock.
const clients = new WeakMap();

export async function withCampaignLock(client, campaignId, operation) {
    let queues = clients.get(client);
    if (!queues) clients.set(client, queues = new Map());
    const previous = queues.get(campaignId) || Promise.resolve();
    let release;
    const current = new Promise(resolve => { release = resolve; });
    queues.set(campaignId, current);
    await previous;
    try {
        return await operation();
    } finally {
        release();
        if (queues.get(campaignId) === current) queues.delete(campaignId);
    }
}
