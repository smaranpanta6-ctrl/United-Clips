export async function saveMember(
    client,
    campaignId,
    userId,
    data
) {
    if (!client?.db) {
        throw new Error("Database client is unavailable.");
    }

    if (!campaignId || !userId) {
        throw new Error(
            "campaignId and userId are required."
        );
    }

    return client.db.set(
        `campaignMembers:${campaignId}:${userId}`,
        data
    );
}

export async function getMember(
    client,
    campaignId,
    userId
) {
    if (!client?.db) {
        throw new Error("Database client is unavailable.");
    }

    if (!campaignId || !userId) {
        return null;
    }

    return (
        await client.db.get(
            `campaignMembers:${campaignId}:${userId}`
        )
    ) || null;
}

export async function joinMember(client, campaignId, userId, profile) {
    const previous = await getMember(client, campaignId, userId);
    const member = {
        verified: false, tiktok: null, clips: [], totalViews: 0,
        approvedViews: 0, pendingViews: 0, rejectedViews: 0, payout: 0,
        ...previous, ...profile, campaignId, userId,
        active: true, joinedAt: previous?.joinedAt || Date.now(),
        rejoinedAt: previous ? Date.now() : null, leftAt: null
    };
    await saveMember(client, campaignId, userId, member);
    return member;
}

export async function leaveMember(client, campaignId, userId) {
    const previous = await getMember(client, campaignId, userId);
    if (!previous) return null;
    const member = { ...previous, active: false, leftAt: Date.now() };
    await saveMember(client, campaignId, userId, member);
    return member;
}

export async function updateMember(
    client,
    campaignId,
    userId,
    updates
) {
    const currentMember =
        await getMember(
            client,
            campaignId,
            userId
        );

    if (!currentMember) {
        return null;
    }

    const updatedMember = {
        ...currentMember,
        ...updates,
        campaignId,
        userId,
        updatedAt: Date.now()
    };

    await saveMember(
        client,
        campaignId,
        userId,
        updatedMember
    );

    return updatedMember;
}

export async function deleteMember(
    client,
    campaignId,
    userId
) {
    if (!client?.db) {
        throw new Error("Database client is unavailable.");
    }

    if (!campaignId || !userId) {
        return false;
    }

    return client.db.delete(
        `campaignMembers:${campaignId}:${userId}`
    );
}

export async function getCampaignMembers(
    client,
    campaignId
) {
    if (!client?.db) {
        throw new Error("Database client is unavailable.");
    }

    if (!campaignId) {
        return [];
    }

    const keys = await client.db.keys(
        `campaignMembers:${campaignId}:*`
    );

    const members = [];

    for (const key of keys || []) {
        const data = await client.db.get(key);

        if (data) {
            members.push(data);
        }
    }

    return members;
}
