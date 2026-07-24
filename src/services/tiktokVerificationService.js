import crypto from "node:crypto";

const TABLE_NAME = "tiktok_verifications";

function getPool(client) {
    const pool = client?.db?.db?.pool;

    if (!pool || typeof pool.query !== "function") {
        throw new Error("PostgreSQL is unavailable.");
    }

    return pool;
}

export function normalizeTikTokUsername(value) {
    return String(value || "")
        .trim()
        .replace(/^https?:\/\/(www\.)?tiktok\.com\/@/i, "")
        .replace(/^@/, "")
        .split(/[/?#]/)[0]
        .trim();
}

export function generateVerificationCode() {
    const random = crypto
        .randomBytes(5)
        .toString("base64url")
        .replace(/[^A-Z0-9]/gi, "")
        .toUpperCase()
        .slice(0, 6);

    return `UC-${random}`;
}

export async function createTikTokVerification(
    client,
    discordId,
    username
) {
    const pool = getPool(client);
    const cleanUsername = normalizeTikTokUsername(username);

    if (!cleanUsername) {
        throw new Error("Enter a valid TikTok username.");
    }

    // Generates a fresh code every time /verify start is used.
    const code = generateVerificationCode();

    const result = await pool.query(
        `INSERT INTO ${TABLE_NAME}
            (discord_id, username, verification_code, verified, created_at)
         VALUES ($1, $2, $3, FALSE, CURRENT_DATE)
         ON CONFLICT (discord_id)
         DO UPDATE SET
            username = EXCLUDED.username,
            verification_code = EXCLUDED.verification_code,
            verified = FALSE,
            created_at = CURRENT_DATE
         RETURNING
            discord_id,
            username,
            verification_code,
            verified,
            created_at`,
        [discordId, cleanUsername, code]
    );

    return result.rows[0];
}

export async function getTikTokVerification(client, discordId) {
    const pool = getPool(client);

    const result = await pool.query(
        `SELECT
            discord_id,
            username,
            verification_code,
            verified,
            created_at
         FROM ${TABLE_NAME}
         WHERE discord_id = $1
         LIMIT 1`,
        [discordId]
    );

    return result.rows[0] || null;
}

export async function markTikTokVerified(client, discordId) {
    const pool = getPool(client);

    const result = await pool.query(
        `UPDATE ${TABLE_NAME}
         SET verified = TRUE
         WHERE discord_id = $1
         RETURNING
            discord_id,
            username,
            verification_code,
            verified,
            created_at`,
        [discordId]
    );

    return result.rows[0] || null;
}
