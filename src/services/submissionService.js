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


export async function getSubmission(client, submissionId) {
    await ensureSubmissionTable(client);
    const pool = getPool(client);

    const result = await pool.query(
        `SELECT * FROM campaign_submissions WHERE id = $1 LIMIT 1`,
        [submissionId]
    );

    return result.rows[0] || null;
}

export async function reviewSubmission(
    client,
    {
        submissionId,
        status,
        reviewedBy,
        rejectionReason = null,
        staffNotes = null
    }
) {
    if (!["approved", "rejected"].includes(status)) {
        throw new Error("Invalid submission review status.");
    }

    await ensureSubmissionTable(client);
    const pool = getPool(client);

    await pool.query(`
        ALTER TABLE campaign_submissions
        ADD COLUMN IF NOT EXISTS rejection_reason TEXT
    `);

    await pool.query(`
        ALTER TABLE campaign_submissions
        ADD COLUMN IF NOT EXISTS staff_notes TEXT
    `);

    const result = await pool.query(
        `
        UPDATE campaign_submissions
        SET
            status = $2,
            reviewed_by = $3,
            rejection_reason = $4,
            staff_notes = $5,
            reviewed_at = NOW()
        WHERE id = $1
          AND status = 'pending'
        RETURNING *
        `,
        [
            submissionId,
            status,
            reviewedBy,
            rejectionReason,
            staffNotes
        ]
    );

    return result.rows[0] || null;
}
