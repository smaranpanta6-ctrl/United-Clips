import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { ensurePaymentTables, savePaymentMethod, getPaymentMethods } from '../src/services/paymentService.js';
import { createSubmission, getSubmission, reviewSubmission, getSubmissionStats, listUserSubmissions, DuplicateSubmissionError } from '../src/services/submissionService.js';
import { validateClipUrl } from '../src/utils/clipValidation.js';
import { campaignDetails } from '../src/utils/campaignDetails.js';
import { submissionAccessError } from '../src/utils/campaignAccess.js';
import interactionCreate from '../src/events/interactionCreate.js';
import { withCampaignLock } from '../src/utils/campaignLock.js';
import { joinMember, leaveMember } from '../src/utils/campaignMembers.js';
import { splitDiscordText, sendDiscordText } from '../src/utils/discordMessages.js';
import campaignCommand from '../src/commands/Tools/campaign.js';

let postgres;
let client;
before(async () => {
    postgres = new PGlite();
    const pool = {
        query: (sql, params) => postgres.query(sql, params),
        connect: async () => ({ query: (sql, params) => postgres.query(sql, params), release() {} })
    };
    client = { db: { pool, get: async () => null } };
});
after(async () => { await postgres.close(); });

test('upgrades legacy payout table and saves/updates a payout account', async () => {
    await postgres.query(`CREATE TABLE payment_methods (
        guild_id TEXT NOT NULL, user_id TEXT NOT NULL, provider TEXT NOT NULL DEFAULT 'paypal',
        account_email TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (guild_id, user_id, provider)
    )`);
    await ensurePaymentTables(client);
    await ensurePaymentTables(client);
    await savePaymentMethod(client, 'guild-a', 'creator-a', 'paypal', 'sample@example.com', 'creator', 'Creator');
    await savePaymentMethod(client, 'guild-a', 'creator-a', 'paypal', 'updated@example.com', 'creator', 'Updated Creator');
    const rows = await getPaymentMethods(client, 'guild-a', 'creator-a');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].account_email, 'updated@example.com');
    assert.deepEqual(await getPaymentMethods(client, 'guild-b', 'creator-a'), []);
});

test('saves clips once, isolates guilds, and rejects conflicting staff decisions', async () => {
    const input = { guildId: 'guild-a', campaignId: 'campaign-a', userId: 'creator-a',
        videoUrl: 'https://www.tiktok.com/@creator/video/1234567890', platform: 'TikTok' };
    const clip = await createSubmission(client, input);
    await assert.rejects(createSubmission(client, input), DuplicateSubmissionError);
    assert.equal(await getSubmission(client, clip.id, 'guild-b'), null);
    assert.equal(await reviewSubmission(client, { submissionId: clip.id, guildId: 'guild-b',
        expectedStatus: 'pending', status: 'approved', reviewedBy: 'staff-a' }), null);
    const approved = await reviewSubmission(client, { submissionId: clip.id, guildId: 'guild-a',
        expectedStatus: 'pending', status: 'approved', reviewedBy: 'staff-a' });
    assert.equal(approved.status, 'approved');
    assert.equal(await reviewSubmission(client, { submissionId: clip.id, guildId: 'guild-a',
        expectedStatus: 'pending', status: 'rejected', reviewedBy: 'staff-b' }), null);
    assert.deepEqual(await getSubmissionStats(client, 'guild-a', 'campaign-a'),
        { submitted: 1, approved: 1, pending: 0, rejected: 0 });
    assert.equal((await getSubmissionStats(client, 'guild-a', 'campaign-a', 'another-creator')).submitted, 0);
    assert.equal((await listUserSubmissions(client, 'guild-a', 'creator-a')).length, 1);
    assert.deepEqual(await listUserSubmissions(client, 'guild-b', 'creator-a'), []);
    assert.deepEqual(await listUserSubmissions(client, 'guild-a', 'another-creator'), []);
});

test('accepts supported video links, normalizes trackers, and rejects misleading URLs', () => {
    assert.equal(validateClipUrl('https://www.tiktok.com/@creator/video/1234567890?tracking=test', 'TikTok').videoUrl,
        'https://www.tiktok.com/@creator/video/1234567890');
    assert.equal(validateClipUrl('https://youtu.be/abcdefghijk?si=test', 'YouTube Shorts').videoUrl,
        'https://www.youtube.com/watch?v=abcdefghijk');
    assert.equal(validateClipUrl('https://www.instagram.com/reel/abcd/?igsh=test', 'Instagram Reels').platform, 'Instagram');
    for (const url of ['http://www.tiktok.com/@creator/video/123', 'https://www.tiktok.com.evil.example/@creator/video/123',
        'https://example.com/video/123', 'https://www.tiktok.com/@creator', 'https://user:pass@www.tiktok.com/@creator/video/123']) {
        assert.equal(validateClipUrl(url, 'TikTok'), null);
    }
    assert.equal(validateClipUrl('https://youtu.be/abcdefghijk', 'TikTok'), null);
});

test('recovers explicit terms from legacy campaign briefs without inventing missing terms', () => {
    const terms = campaignDetails({ campaignInfo: '• 💰 **CPM (Pay Rate):** $2 per 1,000 views\n🤑 Pot: $3,750\n📆 End Date: October 12th 2026 or pot empty\n📱 Platform: TikTok' });
    assert.equal(terms.cpm, '$2 per 1,000 views');
    assert.equal(terms.budget, '$3,750');
    assert.equal(terms.deadline, 'October 12th 2026 or pot empty');
    assert.equal(terms.platform, 'TikTok');
    assert.equal(campaignDetails({}).deadline, 'See campaign brief');
});

test('requires membership in an active campaign in the current server', async () => {
    const interaction = { guild: { id: 'guild-a' }, user: { id: 'creator-a' } };
    const campaign = { id: 'campaign-a', guildId: 'guild-a', status: 'Active', members: ['creator-a'] };
    assert.equal(await submissionAccessError(interaction, client, campaign), null);
    assert.match(await submissionAccessError(interaction, client, { ...campaign, status: 'Closed' }), /closed/);
    assert.match(await submissionAccessError(interaction, client, { ...campaign, members: [] }), /Join/);
    assert.match(await submissionAccessError(interaction, client, { ...campaign, guildId: 'guild-b' }), /server/);
});

test('dispatches a dropdown only once, including the Other rejection reason', async () => {
    let calls = 0;
    const interaction = {
        id: '1234567890', customId: 'submission_reject_reason:12:34:56',
        user: { id: 'staff-a' }, guildId: 'guild-a', values: ['Other'],
        isChatInputCommand: () => false, isAutocomplete: () => false,
        isButton: () => false, isStringSelectMenu: () => true,
        reply: async () => {}, editReply: async () => {}, followUp: async () => {}
    };
    const handler = { execute: async (received, receivedClient, args) => {
        calls++;
        assert.equal(received, interaction);
        assert.deepEqual(args, ['12', '34', '56']);
    } };
    await interactionCreate.execute(interaction, { selectMenus: new Map([['submission_reject_reason', handler]]) });
    assert.equal(calls, 1);
});

test('simultaneous campaign mutations preserve both joins and release after failure', async () => {
    const bot = {};
    let members = [];
    let releaseFirst;
    const gate = new Promise(resolve => { releaseFirst = resolve; });
    const first = withCampaignLock(bot, 'campaign', async () => {
        const saved = [...members];
        await gate;
        members = [...saved, 'one'];
    });
    const second = withCampaignLock(bot, 'campaign', async () => {
        members = [...members, 'two'];
    });
    releaseFirst();
    await Promise.all([first, second]);
    assert.deepEqual(members, ['one', 'two']);
    await assert.rejects(withCampaignLock(bot, 'campaign', async () => { throw new Error('API failed'); }));
    assert.equal(await withCampaignLock(bot, 'campaign', async () => 'recovered'), 'recovered');
});

test('leaving and rejoining retains creator statistics and requires active membership', async () => {
    const records = new Map();
    const bot = { db: { get: async key => records.get(key), set: async (key, value) => records.set(key, value) } };
    await joinMember(bot, 'campaign', 'creator', { username: 'first' });
    records.get('campaignMembers:campaign:creator').payout = 25;
    records.get('campaignMembers:campaign:creator').totalViews = 20000;
    await leaveMember(bot, 'campaign', 'creator');
    const interaction = { guild: { id: 'guild' }, user: { id: 'creator' } };
    const campaign = { id: 'campaign', guildId: 'guild', status: 'Active', members: [] };
    assert.match(await submissionAccessError(interaction, bot, campaign), /Join/);
    const rejoined = await joinMember(bot, 'campaign', 'creator', { username: 'updated' });
    assert.equal(rejoined.payout, 25);
    assert.equal(rejoined.totalViews, 20000);
    assert.equal(rejoined.username, 'updated');
    assert.equal(await submissionAccessError(interaction, bot, campaign), null);
});

test('long briefs fit Discord messages without dropping requirements or pinging members', async () => {
    const text = ('Requirement 🎬: ' + 'x'.repeat(2400) + '\n').repeat(3);
    const chunks = splitDiscordText(text);
    assert.equal(chunks.join(''), text);
    assert.ok(chunks.every(chunk => chunk.length <= 1900));
    const sent = [];
    await sendDiscordText({ send: async payload => { sent.push(payload); return payload; } },
        { content: text, components: ['join-button'], files: ['audio'] });
    assert.equal(sent.at(-1).components[0], 'join-button');
    assert.equal(sent[0].components, undefined);
    assert.ok(sent.every(payload => payload.allowedMentions.parse.length === 0));
});

test('campaign command registers staff maintenance without increasing the command count', async () => {
    const command = campaignCommand.data.toJSON();
    assert.deepEqual(command.options.map(option => option.name), ['create', 'organize', 'review', 'browse', 'submissions', 'panel']);
    let response;
    await campaignCommand.execute({
        options: { getSubcommand: () => 'organize' },
        memberPermissions: { has: () => false }, member: { roles: { cache: new Map() } },
        reply: async payload => { response = payload; }
    });
    assert.match(response.content, /Only staff/);
});
