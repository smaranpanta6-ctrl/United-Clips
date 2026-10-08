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

export class DuplicateSubmissionError extends Error {
    constructor(submission) {
        super('This video has already been submitted to this campaign.');
        this.name = 'DuplicateSubmissionError';
        this.submission = submission;
    }
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
            rejection_reason TEXT,
            staff_notes TEXT,
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

    // Serialize duplicates across processes, including during Railway rollouts.
    const connection = await pool.connect();
    try {
    await connection.query('BEGIN');
    await connection.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        JSON.stringify([guildId, campaignId, videoUrl])
    ]);
    const existing = await connection.query(`
        SELECT * FROM campaign_submissions
        WHERE guild_id = $1 AND campaign_id = $2 AND video_url = $3
        LIMIT 1
    `, [guildId, campaignId, videoUrl]);
    if (existing.rows[0]) throw new DuplicateSubmissionError(existing.rows[0]);

    const result = await connection.query(
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

    await connection.query('COMMIT');
    return result.rows[0];
    } catch (error) {
        await connection.query('ROLLBACK');
        throw error;
    } finally {
        connection.release();
    }
}


export async function getSubmission(client, submissionId, guildId) {
    if (!guildId) throw new Error('A server ID is required to load a submission.');
    await ensureSubmissionTable(client);
    const pool = getPool(client);

    const result = await pool.query(
        `SELECT * FROM campaign_submissions WHERE id = $1 AND guild_id = $2 LIMIT 1`,
        [submissionId, guildId]
    );

    return result.rows[0] || null;
}

export async function reviewSubmission(
    client,
    {
        submissionId,
        guildId,
        expectedStatus,
        status,
        reviewedBy,
        rejectionReason = null,
        staffNotes = null
    }
) {
    if (!guildId || !expectedStatus) throw new Error('Server and previous status are required for a review.');
    if (!["approved", "rejected"].includes(status)) {
        throw new Error("Invalid submission review status.");
    }

    await ensureSubmissionTable(client);

    const pool = getPool(client);

    const result = await pool.query(
        `
        UPDATE campaign_submissions
        SET
            status = $2,
            reviewed_by = $3,
            rejection_reason = $4,
            staff_notes = $5,
            reviewed_at = NOW()
        WHERE id = $1 AND guild_id = $6 AND status = $7
        RETURNING *
        `,
        [
            submissionId,
            status,
            reviewedBy,
            status === "rejected"
                ? rejectionReason
                : null,
            staffNotes,
            guildId,
            expectedStatus
        ]
    );

    return result.rows[0] || null;
}

export async function getSubmissionStats(client, guildId, campaignId, userId = null) {
    await ensureSubmissionTable(client);
    const result = await getPool(client).query(`
        SELECT COUNT(*)::int AS submitted,
            COUNT(*) FILTER (WHERE status = 'approved')::int AS approved,
            COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
            COUNT(*) FILTER (WHERE status = 'rejected')::int AS rejected
        FROM campaign_submissions
        WHERE guild_id = $1 AND campaign_id = $2
            AND ($3::text IS NULL OR user_id = $3)
    `, [guildId, String(campaignId), userId]);
    return result.rows[0];
}

export async function listUserSubmissions(client, guildId, userId, limit = 10) {
    await ensureSubmissionTable(client);
    const result = await getPool(client).query(`
        SELECT *
        FROM campaign_submissions
        WHERE guild_id = $1 AND user_id = $2
        ORDER BY created_at DESC, id DESC LIMIT $3
    `, [guildId, userId, Math.min(10, Math.max(1, limit))]);
    return result.rows;
}
