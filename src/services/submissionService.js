function getPool(client) {
    const pool =
        client?.db?.db?.pool ||
        client?.db?.pool ||
        client?.pool;

    if (!pool || typeof pool.query !== "function") {
        throw new Error("PostgreSQL pool is unavailable.");
    }

    return pool;
}

export async function ensureSubmissionTable(client) {
    const pool = getPool(client);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS campaign_submissions (
            id BIGSERIAL PRIMARY KEY,
            guild_id TEXT NOT NULL,
            campaign_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            video_url TEXT NOT NULL,
            platform TEXT NOT NULL,
            notes TEXT,
            status TEXT NOT NULL DEFAULT 'pending',
            reviewed_by TEXT,
            reviewed_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS campaign_submissions_user_idx
        ON campaign_submissions (
            guild_id,
            user_id,
            created_at DESC
        )
    `);
}

export async function createSubmission(
    client,
    {
        guildId,
        campaignId,
        userId,
        videoUrl,
        platform,
        notes = null
    }
) {
    await ensureSubmissionTable(client);

    const pool = getPool(client);

    const result = await pool.query(
        `
        INSERT INTO campaign_submissions (
            guild_id,
            campaign_id,
            user_id,
            video_url,
            platform,
            notes
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
        `,
        [
            guildId,
            campaignId,
            userId,
            videoUrl,
            platform,
            notes
        ]
    );

    return result.rows[0];
}
