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

export async function ensurePaymentTables(client) {
    const pool = getPool(client);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS payment_methods (
            guild_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            username TEXT,
            display_name TEXT,
            provider TEXT NOT NULL DEFAULT 'paypal',
            account_email TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (guild_id, user_id, provider)
        )
    `);

    // Existing installations may already have the original, smaller table.
    await pool.query(`
        ALTER TABLE payment_methods
        ADD COLUMN IF NOT EXISTS username TEXT,
        ADD COLUMN IF NOT EXISTS display_name TEXT
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS campaign_earnings (
            id BIGSERIAL PRIMARY KEY,
            guild_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            campaign_name TEXT NOT NULL,
            cycle_name TEXT,
            amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'estimated',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS campaign_earnings_user_idx
        ON campaign_earnings (guild_id, user_id, created_at DESC)
    `);

    await pool.query(`ALTER TABLE campaign_earnings
        ADD COLUMN IF NOT EXISTS record_reference TEXT,
        ADD COLUMN IF NOT EXISTS recorded_by TEXT`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS campaign_earnings_reference_idx
        ON campaign_earnings (guild_id, record_reference) WHERE record_reference IS NOT NULL`);
    await pool.query(`CREATE TABLE IF NOT EXISTS earning_audit (
        id BIGSERIAL PRIMARY KEY, earning_id BIGINT NOT NULL REFERENCES campaign_earnings(id),
        guild_id TEXT NOT NULL, actor_id TEXT NOT NULL, status TEXT NOT NULL,
        recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
}

export async function savePaymentMethod(
    client,
    guildId,
    userId,
    provider,
    accountEmail,
    username,
    displayName
) {
    await ensurePaymentTables(client);

    const pool = getPool(client);

    const result = await pool.query(
        `
        INSERT INTO payment_methods (
            guild_id,
            user_id,
            username,
            display_name,
            provider,
            account_email,
            created_at,
            updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())

        ON CONFLICT (guild_id, user_id, provider)
        DO UPDATE SET
            username = EXCLUDED.username,
            display_name = EXCLUDED.display_name,
            account_email = EXCLUDED.account_email,
            updated_at = NOW()

        RETURNING
            guild_id,
            user_id,
            username,
            display_name,
            provider,
            account_email,
            created_at,
            updated_at
        `,
        [
            guildId,
            userId,
            username,
            displayName,
            provider.toLowerCase(),
            accountEmail.toLowerCase()
        ]
    );

    return result.rows[0];
}

export async function getPaymentMethods(client, guildId, userId) {
    await ensurePaymentTables(client);

    const pool = getPool(client);

    const result = await pool.query(
        `
        SELECT
            provider,
            account_email,
            created_at,
            updated_at
        FROM payment_methods
        WHERE guild_id = $1
          AND user_id = $2
        ORDER BY updated_at DESC
        `,
        [guildId, userId]
    );

    return result.rows;
}

export async function removePaymentMethod(
    client,
    guildId,
    userId,
    provider = "paypal"
) {
    await ensurePaymentTables(client);

    const pool = getPool(client);

    const result = await pool.query(
        `
        DELETE FROM payment_methods
        WHERE guild_id = $1
          AND user_id = $2
          AND provider = $3
        RETURNING provider, account_email
        `,
        [guildId, userId, provider.toLowerCase()]
    );

    return result.rows[0] || null;
}

export async function getUserEarnings(
    client,
    guildId,
    userId,
    limit = 15
) {
    await ensurePaymentTables(client);

    const pool = getPool(client);

    const earningsResult = await pool.query(
        `
        SELECT
            id,
            record_reference,
            campaign_name,
            cycle_name,
            amount,
            status,
            created_at
        FROM campaign_earnings
        WHERE guild_id = $1
          AND user_id = $2
        ORDER BY created_at DESC
        LIMIT $3
        `,
        [guildId, userId, limit]
    );

    const totalResult = await pool.query(
        `
        SELECT
            COALESCE(SUM(amount), 0) AS total_balance
        FROM campaign_earnings
        WHERE guild_id = $1
          AND user_id = $2
          AND status IN ('estimated', 'approved')
        `,
        [guildId, userId]
    );

    return {
        earnings: earningsResult.rows,
        totalBalance: Number(totalResult.rows[0]?.total_balance || 0)
    };
}

/*
Call this function from your campaign/payout system whenever a user earns money.
*/
export async function addCampaignEarning(
    client,
    {
        guildId,
        userId,
        campaignName,
        cycleName = null,
        amount,
        status = "estimated",
        reference = null,
        recordedBy = null
    }
) {
    await ensurePaymentTables(client);

    const numericAmount = Number(amount);

    if (!Number.isFinite(numericAmount) || numericAmount < 0 || numericAmount > 9999999999.99
        || !/^\d{1,10}(\.\d{1,2})?$/.test(String(amount))) {
        throw new Error("Use a non-negative dollar amount with at most two decimal places.");
    }
    if (!guildId || !userId || !campaignName || String(campaignName).length > 100
        || (cycleName && String(cycleName).length > 60)
        || (reference !== null && (!/^[a-zA-Z0-9._:-]{1,80}$/.test(reference) || !recordedBy))) {
        throw new Error("Invalid earning details or reference.");
    }

    const validStatuses = [
        "estimated",
        "approved",
        "paid",
        "cancelled"
    ];

    if (!validStatuses.includes(status)) {
        throw new Error("Invalid earning status.");
    }

    const pool = getPool(client);

    const result = await pool.query(
        `
        WITH inserted AS (INSERT INTO campaign_earnings (
            guild_id,
            user_id,
            campaign_name,
            cycle_name,
            amount,
            status,
            record_reference,
            recorded_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (guild_id, record_reference) WHERE record_reference IS NOT NULL DO NOTHING
        RETURNING *), audited AS (
            INSERT INTO earning_audit (earning_id, guild_id, actor_id, status)
            SELECT id, guild_id, $8, status FROM inserted WHERE $8 IS NOT NULL
            RETURNING id
        ) SELECT * FROM inserted
        `,
        [
            guildId,
            userId,
            campaignName,
            cycleName,
            numericAmount,
            status,
            reference,
            recordedBy
        ]
    );

    if (result.rows[0]) return { ...result.rows[0], created: true };
    const existing = await pool.query(`SELECT id FROM campaign_earnings WHERE guild_id = $1 AND record_reference = $2`, [guildId, reference]);
    return { id: existing.rows[0]?.id, created: false };
}

export async function setEarningStatus(client, { guildId, earningId, status, recordedBy }) {
    if (!['estimated', 'approved', 'paid', 'cancelled'].includes(status) || !recordedBy) {
        throw new Error('Invalid earning status or staff member.');
    }
    await ensurePaymentTables(client);
    const pool = getPool(client);
    const result = await pool.query(`WITH updated AS (
        UPDATE campaign_earnings SET status = $3
        WHERE guild_id = $1 AND id = $2 AND status <> $3 RETURNING *
    ), audited AS (
        INSERT INTO earning_audit (earning_id, guild_id, actor_id, status)
        SELECT id, guild_id, $4, status FROM updated RETURNING id
    ) SELECT * FROM updated`, [guildId, earningId, status, recordedBy]);
    if (result.rows[0]) return result.rows[0];
    const existing = await pool.query(`SELECT * FROM campaign_earnings WHERE guild_id = $1 AND id = $2`, [guildId, earningId]);
    return existing.rows[0] || null;
}
