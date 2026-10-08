import { ensureSubmissionTable } from './submissionService.js';
import { ensurePaymentTables } from './paymentService.js';
import { getAllCampaigns, getCampaign } from '../utils/database.js';
import { campaignBelongsToGuild } from '../utils/campaignAccess.js';

const ACTOR = 'clockworks~tiktok-video-scraper';
const BUDGET_KEY = '__apify_video_tracking__';
export const MONTHLY_TRACKING_CAP_MICROS = 5_000_000;
const ready = new WeakSet();
const poolFor = client => client?.db?.db?.pool || client?.db?.pool || client?.pool;
const videoId = url => String(url || '').match(/\/video\/(\d+)/)?.[1] || null;
const monthKey = date => date.toISOString().slice(0, 7);
const nextMonth = date => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));

export async function ensureTrackingTables(client) {
    if (ready.has(client)) return;
    await ensureSubmissionTable(client);
    await ensurePaymentTables(client);
    const pool = poolFor(client);
    await pool.query(`ALTER TABLE campaign_submissions
        ADD COLUMN IF NOT EXISTS tracked_views BIGINT,
        ADD COLUMN IF NOT EXISTS last_tracked_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS last_tracking_attempt TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS tracking_error TEXT,
        ADD COLUMN IF NOT EXISTS estimated_amount NUMERIC(12,2)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS clip_tracking_settings (
        guild_id TEXT PRIMARY KEY, enabled BOOLEAN NOT NULL DEFAULT FALSE,
        interval_minutes INTEGER NOT NULL DEFAULT 15 CHECK (interval_minutes BETWEEN 5 AND 120),
        next_due TIMESTAMPTZ NOT NULL DEFAULT NOW(), last_success TIMESTAMPTZ,
        last_error TEXT
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS clip_tracking_month (
        guild_id TEXT NOT NULL, month TEXT NOT NULL, reserved_micros INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY(guild_id,month), CHECK(reserved_micros BETWEEN 0 AND 5000000)
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS clip_tracking_runs (
        id BIGSERIAL PRIMARY KEY, guild_id TEXT NOT NULL, month TEXT NOT NULL,
        charge_limit_micros INTEGER NOT NULL, targets JSONB NOT NULL, urls JSONB NOT NULL,
        apify_run_id TEXT, status TEXT NOT NULL DEFAULT 'reserved',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), finished_at TIMESTAMPTZ
    )`);
    ready.add(client);
}

export async function configureTracking(client, guildId, { enabled = null, intervalMinutes = null } = {}) {
    if (intervalMinutes !== null && (!Number.isInteger(intervalMinutes) || intervalMinutes < 5 || intervalMinutes > 120)) {
        throw new Error('Choose a refresh interval between 5 and 120 minutes.');
    }
    await ensureTrackingTables(client);
    await poolFor(client).query(`INSERT INTO clip_tracking_settings(guild_id,enabled,interval_minutes)
        VALUES($1,COALESCE($2,FALSE),COALESCE($3,15)) ON CONFLICT(guild_id) DO UPDATE SET
        enabled=COALESCE($2,clip_tracking_settings.enabled),
        interval_minutes=COALESCE($3,clip_tracking_settings.interval_minutes),
        next_due=CASE WHEN $2 IS TRUE THEN NOW() ELSE clip_tracking_settings.next_due END`, [guildId, enabled, intervalMinutes]);
    return getTrackingStatus(client, guildId);
}

export async function getTrackingStatus(client, guildId) {
    await ensureTrackingTables(client);
    const result = await poolFor(client).query(`SELECT s.*, COALESCE(m.reserved_micros,0) AS reserved_micros
        FROM clip_tracking_settings s LEFT JOIN clip_tracking_month m ON m.guild_id=$3 AND m.month=$2
        WHERE s.guild_id=$1`, [guildId, monthKey(new Date()), BUDGET_KEY]);
    return result.rows[0] || { enabled: false, interval_minutes: 15, reserved_micros: 0 };
}

export function estimateClipEarnings(views, terms) {
    if (!terms || !Number.isSafeInteger(views) || views < 0
        || !Number.isFinite(terms.cpm) || terms.cpm < 0
        || !Number.isSafeInteger(terms.minimumViews) || terms.minimumViews < 0) return null;
    const amount = views < terms.minimumViews ? 0 : views * terms.cpm / 1000;
    const capped = terms.maximumPayout === null || terms.maximumPayout === undefined
        ? amount : Math.min(amount, terms.maximumPayout);
    if (!Number.isFinite(capped) || capped < 0 || capped > 9999999999.99) return null;
    return Math.floor((capped + Number.EPSILON) * 100) / 100;
}

export function estimateRunChargeMicros(data, cap) {
    if (!Number.isFinite(data.usageTotalUsd) || data.usageTotalUsd < 0) return cap;
    const events = data.pricingInfo?.pricingPerEvent?.actorChargeEvents;
    if (data.pricingInfo?.pricingModel !== 'PAY_PER_EVENT' || !events || !data.chargedEventCounts) return cap;
    let eventCharge = 0;
    for (const [key,count] of Object.entries(data.chargedEventCounts)) {
        const event = events[key];
        const prices = Object.values(event?.eventTieredPricingUsd || {}).map(value => value.tieredEventPriceUsd);
        if (Number.isFinite(event?.eventPriceUsd)) prices.push(event.eventPriceUsd);
        if (!prices.length || prices.some(price => !Number.isFinite(price) || price < 0)
            || !Number.isSafeInteger(count) || count < 0) return cap;
        eventCharge += count * Math.max(...prices);
    }
    // Use the highest tier price plus resource usage and a storage/read allowance.
    // This deliberately over-reserves rather than understating uncertain billing.
    return Math.min(cap, Math.max(1000, Math.ceil((data.usageTotalUsd + eventCharge) * 1e6) + 1000));
}

export async function reserveTrackingRun(client, guildId, targets, urls, now = new Date(), force = false) {
    await ensureTrackingTables(client);
    if (!urls.length || urls.length > 100 || urls.some(url => !/^https:\/\/www\.tiktok\.com\/@[^/]+\/video\/\d+$/.test(url))) return null;
    const pool = poolFor(client);
    const connection = await pool.connect();
    try {
        await connection.query('BEGIN');
        const config = (await connection.query('SELECT * FROM clip_tracking_settings WHERE guild_id=$1 FOR UPDATE', [guildId])).rows[0];
        if (!config?.enabled || (!force && new Date(config.next_due) > now) || nextMonth(now) - now < 600000) {
            await connection.query('ROLLBACK'); return null;
        }
        const month = monthKey(now);
        await connection.query('INSERT INTO clip_tracking_month(guild_id,month) VALUES($1,$2) ON CONFLICT DO NOTHING', [BUDGET_KEY, month]);
        const budget = (await connection.query('SELECT reserved_micros FROM clip_tracking_month WHERE guild_id=$1 AND month=$2 FOR UPDATE', [BUDGET_KEY, month])).rows[0];
        const remaining = MONTHLY_TRACKING_CAP_MICROS - Number(budget.reserved_micros);
        // Reserve more than the current $0.003/video FREE price. Apify enforces this run cap.
        // Retain the entire reservation after uncertain failures so retries cannot overspend.
        const cap = Math.min(remaining, Math.max(20000, urls.length * 10000));
        if (cap < urls.length * 3000 + 1000) {
            await connection.query('UPDATE clip_tracking_settings SET next_due=$2,last_error=$3 WHERE guild_id=$1',
                [guildId, nextMonth(now), 'Monthly tracking budget reached; updates resume next month.']);
            await connection.query('COMMIT'); return null;
        }
        await connection.query('UPDATE clip_tracking_month SET reserved_micros=reserved_micros+$3 WHERE guild_id=$1 AND month=$2', [BUDGET_KEY, month, cap]);
        const remainingSeconds = (nextMonth(now) - now) / 1000;
        const adaptiveSeconds = Math.ceil((urls.length * 6000 + 1000) * remainingSeconds / Math.max(1, remaining));
        const due = new Date(now.getTime() + Math.max(config.interval_minutes * 60, adaptiveSeconds) * 1000);
        await connection.query('UPDATE clip_tracking_settings SET next_due=$2,last_error=NULL WHERE guild_id=$1', [guildId, due]);
        const run = (await connection.query(`INSERT INTO clip_tracking_runs(guild_id,month,charge_limit_micros,targets,urls)
            VALUES($1,$2,$3,$4,$5) RETURNING *`, [guildId, month, cap, JSON.stringify(targets), JSON.stringify(urls)])).rows[0];
        await connection.query('COMMIT'); return run;
    } catch (error) { await connection.query('ROLLBACK'); throw error; }
    finally { connection.release(); }
}

async function apifyRequest(path, options = {}, fetcher = fetch) {
    const response = await fetcher(`https://api.apify.com/v2/${path}`, { ...options,
        headers: { Authorization: `Bearer ${process.env.APIFY_TOKEN}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`Apify HTTP ${response.status}`);
    return response.json();
}

export async function launchTrackingRun(client, run, fetcher = fetch) {
    const pool = poolFor(client);
    try {
        const result = await apifyRequest(`actors/${ACTOR}/runs?timeout=300&maxItems=${run.urls.length}&maxTotalChargeUsd=${(run.charge_limit_micros / 1e6).toFixed(6)}&restartOnError=false&forcePermissionLevel=LIMITED_PERMISSIONS`, {
            method: 'POST', body: JSON.stringify({ postURLs: run.urls, shouldDownloadVideos: false,
                shouldDownloadCovers: false, shouldDownloadSubtitles: false, shouldDownloadSlideshowImages: false })
        }, fetcher);
        if (!result.data?.id) throw new Error('Apify returned no run ID');
        await pool.query("UPDATE clip_tracking_runs SET apify_run_id=$2,status='running' WHERE id=$1", [run.id, result.data.id]);
        return result.data.id;
    } catch (error) {
        await pool.query("UPDATE clip_tracking_runs SET status='uncertain',finished_at=NOW() WHERE id=$1", [run.id]);
        await pool.query('UPDATE clip_tracking_settings SET last_error=$2 WHERE guild_id=$1', [run.guild_id, error.message]);
        return null;
    }
}

export async function applyTrackingResult(client, submissionId, guildId, item) {
    if (item?.errorCode || !Number.isSafeInteger(item?.playCount) || item.playCount < 0) return false;
    const pool = poolFor(client);
    const row = (await pool.query('SELECT * FROM campaign_submissions WHERE id=$1 AND guild_id=$2 AND status=$3', [submissionId, guildId, 'approved'])).rows[0];
    if (!row || !videoId(row.video_url) || videoId(row.video_url) !== (videoId(item.webVideoUrl) || String(item.id || ''))) return false;
    const campaign = await getCampaign(client, row.campaign_id);
    if (!campaign || campaign.status !== 'Active') return false;
    const estimate = estimateClipEarnings(item.playCount, campaign.trackingTerms);
    const connection = await pool.connect();
    try {
        await connection.query('BEGIN');
        const updated = await connection.query(`UPDATE campaign_submissions SET tracked_views=$3,last_tracked_at=NOW(),last_tracking_attempt=NOW(),tracking_error=NULL,estimated_amount=$4
            WHERE id=$1 AND guild_id=$2 AND status='approved' RETURNING id`, [row.id, guildId, item.playCount, estimate]);
        if (!updated.rows.length) { await connection.query('ROLLBACK'); return false; }
        if (estimate !== null) await connection.query(`INSERT INTO campaign_earnings(guild_id,user_id,campaign_name,amount,status,record_reference,recorded_by)
            VALUES($1,$2,$3,$4,'estimated',$5,'app:tracking')
            ON CONFLICT(guild_id,record_reference) WHERE record_reference IS NOT NULL DO UPDATE SET amount=EXCLUDED.amount
            WHERE campaign_earnings.status='estimated' AND campaign_earnings.recorded_by='app:tracking'`,
            [guildId, row.user_id, campaign.name, estimate, `auto:clip:${row.id}`]);
        await connection.query('COMMIT'); return true;
    } catch (error) { await connection.query('ROLLBACK'); throw error; }
    finally { connection.release(); }
}

export async function getTrackedStats(client, guildId, campaignId, userId = null) {
    await ensureTrackingTables(client);
    const result = await poolFor(client).query(`SELECT COALESCE(SUM(tracked_views),0) AS views,
        COALESCE(SUM(estimated_amount),0) AS estimated, MAX(last_tracked_at) AS checked_at
        FROM campaign_submissions WHERE guild_id=$1 AND campaign_id=$2 AND status='approved' AND ($3::text IS NULL OR user_id=$3)`, [guildId, campaignId, userId]);
    return { views: Number(result.rows[0].views), estimated: Number(result.rows[0].estimated), checkedAt: result.rows[0].checked_at };
}

async function finishRuns(client) {
    const pool = poolFor(client);
    const pending = await pool.query("SELECT * FROM clip_tracking_runs WHERE status='running' ORDER BY id LIMIT 5");
    for (const run of pending.rows) {
        const data = (await apifyRequest(`actor-runs/${run.apify_run_id}`)).data;
        if (['READY','RUNNING','TIMING-OUT','ABORTING'].includes(data.status)) continue;
        let success = false;
        if (data.status === 'SUCCEEDED' && data.defaultDatasetId) {
            const items = await apifyRequest(`datasets/${data.defaultDatasetId}/items?clean=true&limit=100`);
            for (const target of run.targets) {
                const item = items.find(entry => videoId(target.video_url) === (videoId(entry.webVideoUrl) || String(entry.id || '')));
                if (item && await applyTrackingResult(client, target.id, run.guild_id, item)) success = true;
                else await pool.query('UPDATE campaign_submissions SET last_tracking_attempt=NOW(),tracking_error=$3 WHERE id=$1 AND guild_id=$2', [target.id, run.guild_id, 'Video count unavailable; the last successful count is preserved.']);
            }
            // A probe has no submission targets and cannot create earnings.
            if (!run.targets.length) success = items.some(item => !item.errorCode && Number.isSafeInteger(item.playCount));
        }
        const retained = estimateRunChargeMicros(data, run.charge_limit_micros);
        const connection = await pool.connect();
        try {
            await connection.query('BEGIN');
            const finished = await connection.query("UPDATE clip_tracking_runs SET status=$2,finished_at=NOW() WHERE id=$1 AND status='running' RETURNING id", [run.id, success ? 'succeeded' : 'failed']);
            if (finished.rows.length) {
                await connection.query('UPDATE clip_tracking_month SET reserved_micros=reserved_micros-$3 WHERE guild_id=$1 AND month=$2', [BUDGET_KEY, run.month, run.charge_limit_micros-retained]);
                await connection.query(`UPDATE clip_tracking_settings SET last_success=CASE WHEN $2 THEN NOW() ELSE last_success END,last_error=$3 WHERE guild_id=$1`, [run.guild_id, success, success ? null : 'Some video counts were unavailable; previous counts are preserved.']);
            }
            await connection.query('COMMIT');
        } catch (error) { await connection.query('ROLLBACK'); throw error; }
        finally { connection.release(); }
    }
}

export async function trackingTick(client) {
    if (!process.env.APIFY_TOKEN) return;
    await ensureTrackingTables(client);
    const pool = poolFor(client);
    const guard = await pool.connect();
    let locked = false;
    try {
        locked = (await guard.query("SELECT pg_try_advisory_lock(hashtextextended('united-clips-tracker',0)) AS locked")).rows[0].locked;
        if (!locked) return;
        await finishRuns(client);
        const configs = (await pool.query('SELECT * FROM clip_tracking_settings WHERE enabled=TRUE AND next_due<=NOW()')).rows;
        for (const config of configs) {
            const activeRun = await pool.query("SELECT id FROM clip_tracking_runs WHERE guild_id=$1 AND status IN ('running','reserved') LIMIT 1", [config.guild_id]);
            if (activeRun.rows.length) continue;
            const guild = client.guilds.cache.get(config.guild_id);
            if (!guild) continue;
            const campaigns = await getAllCampaigns(client);
            const active = [];
            for (const campaign of campaigns) if (campaign.status === 'Active' && await campaignBelongsToGuild({guild},campaign)) active.push(campaign.id);
            const rows = (await pool.query(`SELECT id,video_url FROM campaign_submissions WHERE guild_id=$1 AND status='approved'
                AND platform='TikTok' AND campaign_id=ANY($2::text[]) ORDER BY last_tracking_attempt ASC NULLS FIRST,id LIMIT 100`, [config.guild_id, active])).rows.filter(row => videoId(row.video_url));
            if (!rows.length) {
                await pool.query('UPDATE clip_tracking_settings SET next_due=NOW()+INTERVAL \'1 minute\' WHERE guild_id=$1', [config.guild_id]);
                continue;
            }
            const run = await reserveTrackingRun(client,config.guild_id,rows,[...new Set(rows.map(row=>row.video_url))]);
            if (run) await launchTrackingRun(client,run);
        }
        // Preserve uncertain reservations after a restart; do not replay a potentially charged POST.
        await pool.query("UPDATE clip_tracking_runs SET status='uncertain',finished_at=NOW() WHERE status='reserved' AND created_at<NOW()-INTERVAL '10 minutes'");
    } finally {
        if (locked) await guard.query("SELECT pg_advisory_unlock(hashtextextended('united-clips-tracker',0))");
        guard.release();
    }
}

export function startClipTracking(client) {
    if (client.clipTrackingTimer) return;
    let busy = false;
    const tick = async () => {
        if (busy) return;
        busy = true;
        try { await trackingTick(client); }
        catch { console.error('Clip tracking check failed; existing view counts are preserved.'); }
        finally { busy = false; }
    };
    client.clipTrackingTimer = setInterval(tick,60000);
    client.clipTrackingTimer.unref();
    void tick();
}
