function getPool(client) {
    return (
        client?.db?.db?.pool ||
        client?.db?.pool ||
        client?.pool ||
        null
    );
}

async function ensureNotificationTable(client) {
    const pool = getPool(client);

    if (!pool || typeof pool.query !== "function") {
        throw new Error(
            "PostgreSQL pool is unavailable for campaign notifications."
        );
    }

    await pool.query(`
        CREATE TABLE IF NOT EXISTS campaign_dm_subscribers (
            guild_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            subscribed_at BIGINT NOT NULL,
            PRIMARY KEY (guild_id, user_id)
        )
    `);

    return pool;
}

export async function subscribeToCampaignDMs(
    client,
    guildId,
    userId
) {
    const pool =
        await ensureNotificationTable(client);

    const result = await pool.query(
        `
        INSERT INTO campaign_dm_subscribers (
            guild_id,
            user_id,
            subscribed_at
        )
        VALUES ($1, $2, $3)
        ON CONFLICT (guild_id, user_id)
        DO NOTHING
        RETURNING user_id
        `,
        [
            String(guildId),
            String(userId),
            Date.now()
        ]
    );

    return result.rowCount > 0;
}

export async function unsubscribeFromCampaignDMs(
    client,
    guildId,
    userId
) {
    const pool =
        await ensureNotificationTable(client);

    const result = await pool.query(
        `
        DELETE FROM campaign_dm_subscribers
        WHERE guild_id = $1
          AND user_id = $2
        `,
        [
            String(guildId),
            String(userId)
        ]
    );

    return result.rowCount > 0;
}

export async function isSubscribedToCampaignDMs(
    client,
    guildId,
    userId
) {
    const pool =
        await ensureNotificationTable(client);

    const result = await pool.query(
        `
        SELECT 1
        FROM campaign_dm_subscribers
        WHERE guild_id = $1
          AND user_id = $2
        LIMIT 1
        `,
        [
            String(guildId),
            String(userId)
        ]
    );

    return result.rowCount > 0;
}

export async function getCampaignDMSubscribers(
    client,
    guildId
) {
    const pool =
        await ensureNotificationTable(client);

    const result = await pool.query(
        `
        SELECT user_id
        FROM campaign_dm_subscribers
        WHERE guild_id = $1
        ORDER BY subscribed_at ASC
        `,
        [String(guildId)]
    );

    return result.rows.map(row =>
        String(row.user_id)
    );
}
