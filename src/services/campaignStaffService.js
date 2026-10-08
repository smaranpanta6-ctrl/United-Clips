import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { getAllCampaigns, getCampaign, saveCampaign } from '../utils/database.js';
import { campaignBelongsToGuild } from '../utils/campaignAccess.js';
import { withCampaignLock } from '../utils/campaignLock.js';
import { getGoogleClients } from '../utils/googleSheets.js';
import { ensureTrackingTables } from './clipTrackingService.js';

const STAFF_ROLE = process.env.STAFF_ROLE_ID || '1529961495402778771';
const STAFF_LOG = process.env.STAFF_LOG_CHANNEL_ID || '1529961616114978987';
export const PAYOUT_HEADERS = ['Creator', 'Discord User ID', 'Approved Views', 'CPM', 'Unpaid Earnings USD',
    'Paid (staff note)', 'Payment Date (staff note)', 'Notes', 'PayPal Email', 'Estimated USD',
    'Approved To Pay USD', 'Paid In Ledger USD', 'Cancelled USD', 'Approved Clips', 'Pending Clips',
    'Rejected Clips', 'Last Synced UTC', 'Earning IDs / Status / USD'];
const poolFor = client => client?.db?.db?.pool || client?.db?.pool || client?.pool;
const cents = amount => Math.round(Number(amount || 0) * 100);
const money = amount => amount / 100;
const sheetCache = new WeakMap();
const panelCache = new WeakMap();
const timers = new WeakMap();
function cacheFor(storage, client) {
    if (!storage.has(client)) storage.set(client, new Map());
    return storage.get(client);
}

// Auto records are tied to submission IDs. Legacy manual records can only be
// assigned by name when that name uniquely identifies a campaign in this guild.
export async function getCampaignPayoutRows(client, campaign, campaigns = [campaign]) {
    await ensureTrackingTables(client);
    const pool = poolFor(client);
    const clips = (await pool.query('SELECT * FROM campaign_submissions WHERE guild_id = $1 AND campaign_id = $2 ORDER BY id',
        [campaign.guildId, campaign.id])).rows;
    const uniqueName = campaigns.filter(item => item.guildId === campaign.guildId && item.name === campaign.name).length === 1;
    const earnings = (await pool.query(`SELECT e.* FROM campaign_earnings e
        WHERE e.guild_id = $1 AND ((e.record_reference LIKE 'auto:clip:%' AND EXISTS (
            SELECT 1 FROM campaign_submissions s WHERE s.guild_id = e.guild_id AND s.campaign_id = $2 AND s.user_id = e.user_id
            AND e.record_reference = 'auto:clip:' || s.id::text))
        OR ($4::boolean AND e.campaign_name = $3 AND (e.record_reference IS NULL OR e.record_reference NOT LIKE 'auto:clip:%')))
        ORDER BY e.id`, [campaign.guildId, campaign.id, campaign.name, uniqueName])).rows;
    const users = new Map();
    const get = id => {
        if (!users.has(id)) users.set(id, { id, views: 0, approvedClips: 0, pending: 0, rejected: 0,
            estimated: 0, approved: 0, paid: 0, cancelled: 0, records: [] });
        return users.get(id);
    };
    for (const id of campaign.members || []) get(id);
    for (const clip of clips) {
        const user = get(clip.user_id);
        if (clip.status === 'approved') { user.approvedClips++; user.views += Number(clip.tracked_views || 0); }
        else if (clip.status === 'pending') user.pending++;
        else if (clip.status === 'rejected') user.rejected++;
    }
    for (const earning of earnings) {
        const user = get(earning.user_id);
        if (['estimated', 'approved', 'paid', 'cancelled'].includes(earning.status)) user[earning.status] += cents(earning.amount);
        user.records.push(`#${earning.id} ${earning.status} $${Number(earning.amount).toFixed(2)}`);
    }
    if (!users.size) return [];
    const methods = (await pool.query(`SELECT user_id, account_email, username, display_name FROM payment_methods
        WHERE guild_id = $1 AND provider = 'paypal' AND user_id = ANY($2::text[])`, [campaign.guildId, [...users.keys()]])).rows;
    const byId = new Map(methods.map(method => [method.user_id, method]));
    return [...users.values()].sort((a, b) => a.id.localeCompare(b.id)).map(user => {
        const method = byId.get(user.id);
        return [method?.display_name || method?.username || user.id, user.id, user.views,
            campaign.trackingTerms?.cpm ?? campaign.cpm ?? 'See brief', money(user.estimated + user.approved),
            '', '', '', method?.account_email || '', money(user.estimated), money(user.approved), money(user.paid),
            money(user.cancelled), user.approvedClips, user.pending, user.rejected, '', user.records.join('\n').slice(0, 49000)];
    });
}

// Only A:E and I:R are bot managed. Never overwrite staff F:H, even if those
// cells contain formulas, checkboxes or notes. Update by stable Discord ID.
export function payoutWriteData(existing, rows, timestamp) {
    const data = [{ range: 'Payouts!A1:R1', values: [PAYOUT_HEADERS] }];
    const positions = new Map();
    for (let i = 1; i < existing.length; i++) {
        const id = String(existing[i]?.[1] || '');
        if (id && positions.has(id)) throw new Error('Duplicate creator IDs in Payouts; resolve duplicate rows before syncing.');
        if (id) positions.set(id, i + 1);
    }
    let next = Math.max(existing.length + 1, 2);
    for (const row of rows) {
        const at = positions.get(row[1]) || next++;
        data.push({ range: `Payouts!A${at}:E${at}`, values: [row.slice(0, 5)] });
        const details = row.slice(8); details[8] = timestamp;
        data.push({ range: `Payouts!I${at}:R${at}`, values: [details] });
    }
    return data;
}

export async function syncCampaignPayoutSheet(client, campaign, campaigns, { clients, force = false } = {}) {
    if (!campaign.googleSheetId || !campaign.guildId) return false;
    const rows = await getCampaignPayoutRows(client, campaign, campaigns);
    const fingerprint = JSON.stringify(rows);
    const cache = cacheFor(sheetCache, client);
    if (!force && cache.get(campaign.id) === fingerprint) return false;
    const { sheets, drive } = clients || getGoogleClients();
    const permissions = await drive.permissions.list({ fileId: campaign.googleSheetId, fields: 'permissions(type)', pageSize: 100 });
    if (permissions.data.permissions?.some(permission => ['anyone', 'domain'].includes(permission.type))) {
        throw new Error('Payout sync requires a private campaign spreadsheet.');
    }
    const metadata = await sheets.spreadsheets.get({ spreadsheetId: campaign.googleSheetId, fields: 'sheets(properties)' });
    const payoutSheet = metadata.data.sheets?.find(sheet => sheet.properties.title === 'Payouts');
    if (!payoutSheet) throw new Error('Campaign spreadsheet is missing its Payouts tab.');
    const old = await sheets.spreadsheets.values.get({ spreadsheetId: campaign.googleSheetId,
        range: 'Payouts!A1:R2500', valueRenderOption: 'UNFORMATTED_VALUE' });
    const existing = old.data.values || [];
    if (existing.length >= 2500 || rows.length + existing.length > 2500) throw new Error('Payout sheet needs a larger reviewed sync range.');
    if (existing[0]?.[1] && existing[0][1] !== 'Discord User ID') throw new Error('Payouts headers changed; sync stopped to preserve staff data.');
    await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: campaign.googleSheetId,
        requestBody: { valueInputOption: 'RAW', data: payoutWriteData(existing, rows, new Date().toISOString()) } });
    if (existing[0]?.[8] !== 'PayPal Email') {
        const sheetId = payoutSheet.properties.sheetId;
        await sheets.spreadsheets.batchUpdate({ spreadsheetId: campaign.googleSheetId, requestBody: { requests: [
            { updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: 1, frozenColumnCount: 2 } }, fields: 'gridProperties.frozenRowCount,gridProperties.frozenColumnCount' } },
            { repeatCell: { range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 18 },
                cell: { userEnteredFormat: { wrapStrategy: 'WRAP', backgroundColor: { red: 0.94, green: 0.94, blue: 0.94 }, textFormat: { bold: true } } }, fields: 'userEnteredFormat(wrapStrategy,backgroundColor,textFormat.bold)' } },
            { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 5 }, properties: { pixelSize: 180 }, fields: 'pixelSize' } },
            { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 8, endIndex: 18 }, properties: { pixelSize: 180 }, fields: 'pixelSize' } },
            { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 17, endIndex: 18 }, properties: { pixelSize: 360 }, fields: 'pixelSize' } },
            { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 50 }, fields: 'pixelSize' } }
        ] } });
    }
    cache.set(campaign.id, fingerprint);
    return true;
}

export function campaignStaffPayload(campaign) {
    const closed = campaign.status === 'Closed';
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`campaign_staff_pause_${campaign.id}`).setLabel('Pause Campaign').setStyle(ButtonStyle.Secondary).setDisabled(campaign.status !== 'Active'),
        new ButtonBuilder().setCustomId(`campaign_staff_resume_${campaign.id}`).setLabel('Resume Campaign').setStyle(ButtonStyle.Success).setDisabled(campaign.status !== 'Paused'),
        new ButtonBuilder().setCustomId(`campaign_staff_end_${campaign.id}`).setLabel('End Campaign').setStyle(ButtonStyle.Danger).setDisabled(closed));
    const components = [row];
    if (campaign.googleSheetUrl) components.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel('Open Payout Sheet').setStyle(ButtonStyle.Link).setURL(campaign.googleSheetUrl)));
    return { embeds: [new EmbedBuilder().setColor(closed ? '#747F8D' : campaign.status === 'Paused' ? '#FEE75C' : '#57F287')
        .setTitle(`${campaign.name} • Staff Controls`.slice(0, 256))
        .setDescription(`**Status: ${campaign.status}**\n\nOpen the sheet’s **Payouts** tab for creator IDs, PayPal emails and earnings. **Approved To Pay USD** is the staff-approved unpaid amount. Estimated earnings still need review.\n\nPause blocks new joins, submissions and future view checks. Resume restores them. End closes the campaign and preserves its history. Payments are sent by staff outside Discord.`)
        .setFooter({ text: `Campaign ${campaign.id} • Campaign Team only` })], components, allowedMentions: { parse: [] } };
}

export async function publishCampaignStaffPanel(client, guild, campaign) {
    const channel = await guild.channels.fetch(STAFF_LOG).catch(() => null);
    if (!channel?.isTextBased() || channel.permissionsFor(guild.roles.everyone)?.has(PermissionFlagsBits.ViewChannel)) return false;
    const fingerprint = JSON.stringify([campaign.status, campaign.googleSheetUrl]);
    const cache = cacheFor(panelCache, client);
    if (cache.get(campaign.id) === fingerprint) return true;
    let message = campaign.staffControlMessageId ? await channel.messages.fetch(campaign.staffControlMessageId).catch(() => null) : null;
    if (!message) {
        const recent = await channel.messages.fetch({ limit: 100 });
        message = recent.find(item => item.author.id === client.user.id && item.components.some(row => row.components.some(button => button.customId === `campaign_staff_pause_${campaign.id}`)));
    }
    const payload = campaignStaffPayload(campaign);
    if (message) await message.edit(payload);
    else message = await channel.send(payload);
    if (campaign.staffControlMessageId !== message.id) await withCampaignLock(client, campaign.id, async () => {
        const latest = await getCampaign(client, campaign.id);
        if (latest) await saveCampaign(client, campaign.id, { ...latest, staffControlMessageId: message.id });
    });
    await refreshCreatorButtons(client, guild, campaign);
    cache.set(campaign.id, fingerprint);
    return true;
}

export async function changeCampaignStatus(client, campaignId, guildId, action, actorId) {
    return withCampaignLock(client, campaignId, async () => {
        const campaign = await getCampaign(client, campaignId);
        if (!campaign || campaign.guildId !== guildId) throw new Error('This campaign is not available in this server.');
        const next = { pause: 'Paused', resume: 'Active', end: 'Closed' }[action];
        if (!next) throw new Error('Unknown staff action.');
        if (campaign.status === 'Closed') throw new Error('This campaign has already ended. Its history is preserved.');
        if (action === 'pause' && campaign.status !== 'Active') throw new Error('This campaign is already paused.');
        if (action === 'resume' && campaign.status !== 'Paused') throw new Error('Only a paused campaign can be resumed.');
        const updated = { ...campaign, status: next, statusChangedAt: Date.now(), statusChangedBy: actorId };
        if (action === 'end') Object.assign(updated, { closedAt: Date.now(), closedBy: actorId });
        await saveCampaign(client, campaignId, updated);
        return updated;
    });
}

async function refreshCreatorButtons(client, guild, campaign) {
    for (const [channelId, messageId] of [[campaign.channel, campaign.publicMessageId], [campaign.submitChannel, campaign.workspacePanel]]) {
        if (!channelId || !messageId) continue;
        const channel = await guild.channels.fetch(channelId).catch(() => null);
        const message = await channel?.messages?.fetch(messageId).catch(() => null);
        if (!message || message.author.id !== client.user.id) continue;
        const components = message.components.map(row => new ActionRowBuilder().addComponents(row.components.map(component => {
            const button = ButtonBuilder.from(component);
            if ([`campaign_join_${campaign.id}`, `submit_clip:${campaign.id}`].includes(component.customId)) button.setDisabled(campaign.status !== 'Active');
            return button;
        })));
        const embeds = message.embeds.map(embed => {
            const data = embed.toJSON();
            for (const field of data.fields || []) field.value = field.value.replace(/\*\*Status:\*\*[^\n]*/, `**Status:** ${campaign.status}`);
            return data;
        });
        await message.edit({ components, embeds, allowedMentions: { parse: [] } });
    }
    if (campaign.status === 'Closed' && guild.id === '1529960735390826536') {
        const archive = await guild.channels.fetch('1557639878005497877').catch(() => null);
        const brief = await guild.channels.fetch(campaign.channel).catch(() => null);
        if (archive && brief && brief.parentId !== archive.id) await brief.setParent(archive.id, { lockPermissions: false, reason: 'Archive ended campaign and preserve history' });
    }
}

export async function handleCampaignStaffButton(interaction) {
    const allowed = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) || interaction.member?.roles?.cache?.has(STAFF_ROLE);
    if (!interaction.guild || !allowed) return interaction.reply({ content: 'Only the Campaign Team can use these controls.', flags: MessageFlags.Ephemeral });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const [, , action, ...parts] = interaction.customId.split('_');
    try {
        const campaign = await changeCampaignStatus(interaction.client, parts.join('_'), interaction.guild.id, action, interaction.user.id);
        let refreshed = true;
        try {
            await publishCampaignStaffPanel(interaction.client, interaction.guild, campaign);
        } catch { refreshed = false; }
        return interaction.editReply({ content: `**${campaign.name}** is now **${campaign.status}**. ${campaign.status === 'Active' ? 'Joins, submissions and future checks are enabled.' : 'New joins, submissions and future checks are stopped; history and earnings are preserved.'}${refreshed ? '' : ' Some buttons could not refresh; the saved status still applies.'}` });
    } catch (error) { return interaction.editReply({ content: error.message }); }
}

export async function campaignStaffTick(client) {
    const campaigns = await getAllCampaigns(client);
    for (const campaign of campaigns) {
        const guild = client.guilds.cache.get(campaign.guildId);
        if (!guild || !await campaignBelongsToGuild({ guild }, campaign)) continue;
        // Do not republish stale campaigns whose channels no longer exist.
        if (!await guild.channels.fetch(campaign.channel).catch(() => null)) continue;
        try { await publishCampaignStaffPanel(client, guild, campaign); }
        catch { console.error(`Campaign staff panel unavailable: ${campaign.id}`); }
        try { await syncCampaignPayoutSheet(client, campaign, campaigns); }
        catch { console.error(`Private payout sheet sync unavailable: ${campaign.id}`); }
    }
}

export function startCampaignStaffSync(client) {
    if (timers.has(client)) return;
    let busy = false;
    const tick = async () => {
        if (busy) return;
        busy = true;
        try { await campaignStaffTick(client); }
        catch { console.error('Campaign staff sync unavailable.'); }
        finally { busy = false; }
    };
    const timer = setInterval(tick, 60_000); timer.unref?.(); timers.set(client, timer);
    void tick();
}
