export async function saveMember(client, campaignId, userId, data) {
    return client.db.set(
        `campaignMembers:${campaignId}:${userId}`,
        data
    );
}

export async function getMember(client, campaignId, userId) {
    return client.db.get(
        `campaignMembers:${campaignId}:${userId}`
    );
}

export async function deleteMember(client, campaignId, userId) {
    return client.db.delete(
        `campaignMembers:${campaignId}:${userId}`
    );
}

export async function getCampaignMembers(client, campaignId) {
    const keys = await client.db.keys(
        `campaignMembers:${campaignId}:*`
    );

    const members = [];

    for (const key of keys) {
        const data = await client.db.get(key);

        if (data) members.push(data);
    }

    return members;
}
