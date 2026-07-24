import crypto from "node:crypto";
import { logger } from "../utils/logger.js";

const TABLE_NAME = "tiktok_verifications";

function getPool(client) {
    const pool = client?.db?.db?.pool;

    if (!pool || typeof pool.query !== "function") {
        throw new Error("PostgreSQL pool is unavailable.");
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
    const randomPart = crypto
        .randomBytes(4)
        .toString("hex")
        .toUpperCase()
        .slice(0, 6);

    return `UC-${randomPart}`;
}

export async function getTikTokVerification(client, discordId) {
    const pool = getPool(client);

    const result = await pool.query(
        `SELECT discord_id, username, verification_code, verified, created_at
         FROM ${TABLE_NAME}
         WHERE discord_id = $1
         LIMIT 1`,
        [discordId]
    );

    return result.rows[0] || null;
}

export async function createOrRefreshTikTokVerification(
    client,
    discordId,
    username
) {
    const pool = getPool(client);
    const cleanUsername = normalizeTikTokUsername(username);

    if (!cleanUsername) {
        throw new Error("A valid TikTok username is required.");
    }

    const code = generateVerificationCode();

    const result = await pool.query(
        `INSERT INTO ${TABLE_NAME}
            (discord_id, username, verification_code, verified, created_at)
         VALUES ($1, $2, $3, FALSE, NOW())
         ON CONFLICT (discord_id)
         DO UPDATE SET
            username = EXCLUDED.username,
            verification_code = EXCLUDED.verification_code,
            verified = FALSE,
            created_at = NOW()
         RETURNING discord_id, username, verification_code, verified, created_at`,
        [discordId, cleanUsername, code]
    );

    return result.rows[0];
}

export async function markTikTokVerificationComplete(client, discordId) {
    const pool = getPool(client);

    const result = await pool.query(
        `UPDATE ${TABLE_NAME}
         SET verified = TRUE
         WHERE discord_id = $1
         RETURNING discord_id, username, verification_code, verified, created_at`,
        [discordId]
    );

    return result.rows[0] || null;
}

export async function deleteTikTokVerification(client, discordId) {
    const pool = getPool(client);

    await pool.query(
        `DELETE FROM ${TABLE_NAME}
         WHERE discord_id = $1`,
        [discordId]
    );

    logger.info("Deleted TikTok verification record", { discordId });
}
