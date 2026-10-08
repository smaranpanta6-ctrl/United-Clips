import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { ensurePaymentTables, savePaymentMethod, getPaymentMethods, addCampaignEarning, getUserEarnings, setEarningStatus } from '../src/services/paymentService.js';
import { createSubmission, getSubmission, reviewSubmission, getSubmissionStats, listUserSubmissions, DuplicateSubmissionError } from '../src/services/submissionService.js';
import { validateClipUrl } from '../src/utils/clipValidation.js';
import { campaignDetails } from '../src/utils/campaignDetails.js';
import { submissionAccessError } from '../src/utils/campaignAccess.js';
import interactionCreate from '../src/events/interactionCreate.js';
import { withCampaignLock } from '../src/utils/campaignLock.js';
import { joinMember, leaveMember } from '../src/utils/campaignMembers.js';
import { splitDiscordText, sendDiscordText } from '../src/utils/discordMessages.js';
import campaignCommand from '../src/commands/Tools/campaign.js';
import paymentCommand from '../src/commands/Payments/payments.js';
import campaignCreateModal from '../src/interactions/modals/campaignCreateModal.js';
import { getCampaignPayoutRows, payoutWriteData, syncCampaignPayoutSheet, changeCampaignStatus, handleCampaignStaffButton } from '../src/services/campaignStaffService.js';
import { ensureTrackingTables, configureTracking, reserveTrackingRun, launchTrackingRun, applyTrackingResult,
    getTrackedStats, estimateClipEarnings, estimateRunChargeMicros } from '../src/services/clipTrackingService.js';

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
    assert.deepEqual(command.options.map(option => option.name), ['create', 'organize', 'review', 'browse', 'submissions', 'panel', 'close', 'tracking', 'terms']);
    let response;
    await campaignCommand.execute({
        options: { getSubcommand: () => 'organize' },
        memberPermissions: { has: () => false }, member: { roles: { cache: new Map() } },
        reply: async payload => { response = payload; }
    });
    assert.match(response.content, /Only staff/);
});

test('staff earnings deduplicate references, isolate guilds, and audit status changes', async () => {
    const details = { guildId: 'ledger-guild', userId: 'ledger-creator', campaignName: 'Reviewed Campaign',
        amount: 12.34, status: 'approved', reference: 'submission-123-october', recordedBy: 'staff' };
    const first = await addCampaignEarning(client, details);
    assert.equal(first.created, true);
    const duplicate = await addCampaignEarning(client, { ...details, amount: 99 });
    assert.equal(duplicate.created, false);
    assert.equal(duplicate.id, first.id);
    const earnings = await getUserEarnings(client, details.guildId, details.userId);
    assert.equal(earnings.earnings.length, 1);
    assert.equal(earnings.totalBalance, 12.34);
    assert.deepEqual((await getUserEarnings(client, 'other-ledger-guild', details.userId)).earnings, []);
    assert.equal(await setEarningStatus(client, { guildId: 'other-ledger-guild', earningId: first.id, status: 'paid', recordedBy: 'staff' }), null);
    await setEarningStatus(client, { guildId: details.guildId, earningId: first.id, status: 'paid', recordedBy: 'staff' });
    await setEarningStatus(client, { guildId: details.guildId, earningId: first.id, status: 'paid', recordedBy: 'staff' });
    assert.equal((await getUserEarnings(client, details.guildId, details.userId)).totalBalance, 0);
    const audit = await postgres.query('SELECT status FROM earning_audit WHERE earning_id=$1 ORDER BY id', [first.id]);
    assert.deepEqual(audit.rows.map(row => row.status), ['approved', 'paid']);
    for (const amount of [-1, 1.001, Infinity, 10000000000]) {
        await assert.rejects(addCampaignEarning(client, { ...details, reference: 'invalid', amount }));
    }
    await assert.rejects(addCampaignEarning(client, { ...details, reference: 'invalid reference' }));
});

test('payment records require staff permission at execution time', async () => {
    assert.deepEqual(paymentCommand.data.toJSON().options.map(option => option.name), ['post', 'record', 'status', 'ledger']);
    let response;
    await paymentCommand.execute({ guild: { id: 'guild' }, memberPermissions: { has: () => false },
        member: { roles: { cache: new Map() } }, reply: async payload => { response = payload; } });
    assert.match(response.content, /Only the campaign team/);
});

test('staff ledger shows the selected creator payout account only in its own guild and a private reply', async () => {
    await savePaymentMethod(client,'payout-lookup-guild','lookup-creator','paypal','creator@example.com','Creator','Creator');
    let deferred;
    let reply;
    const interaction = { client, guild:{id:'payout-lookup-guild',name:'Test'}, memberPermissions:{has:()=>true},
        options:{getSubcommand:()=> 'ledger',getUser:()=>({id:'lookup-creator',username:'Creator'})},
        deferReply:async payload=>{deferred=payload;},editReply:async payload=>{reply=payload;} };
    await paymentCommand.execute(interaction,{},client);
    assert.equal(deferred.flags,64);
    assert.equal(reply.embeds[0].toJSON().fields.find(field=>field.name==='PayPal recipient').value,'creator@example.com');
    assert.deepEqual(reply.allowedMentions.parse,[]);
    await paymentCommand.execute({...interaction,guild:{id:'other-payout-lookup-guild',name:'Other'}},{},client);
    assert.match(reply.embeds[0].toJSON().fields.find(field=>field.name==='PayPal recipient').value,/No PayPal account saved/);
});

test('campaign close persists before buttons refresh and retains campaign history', async () => {
    const stored = new Map([['campaigns:close-test', { id: 'close-test', guildId: 'close-guild', channel: 'brief-channel',
        name: 'Closing Campaign', status: 'Active', members: ['creator'], views: 3000, paid: 2 }]]);
    const channel = { id: 'brief-channel', isTextBased: () => true, messages: { fetch: async () => new Map() } };
    const bot = { user: { id: 'bot' }, db: { get: async key => stored.get(key),
        set: async (key, value) => stored.set(key, value), list: async () => [...stored.keys()] } };
    let reply;
    await campaignCommand.execute({ client: bot, guild: { id: 'close-guild', channels: { cache: new Map([['brief-channel', channel]]) } },
        user: { id: 'staff' }, memberPermissions: { has: () => true },
        options: { getSubcommand: () => 'close', getChannel: () => channel },
        deferReply: async () => {}, editReply: async response => { reply = response; } });
    const result = stored.get('campaigns:close-test');
    assert.equal(result.status, 'Closed');
    assert.equal(result.closedBy, 'staff');
    assert.equal(result.views, 3000);
    assert.equal(result.paid, 2);
    assert.deepEqual(result.members, ['creator']);
    assert.match(reply.content, /history and earnings are preserved/);
    assert.match(await submissionAccessError({ guild: { id: 'close-guild' } }, bot, result), /closed/);
});

test('silent campaign creation explicitly uses the active category and survives optional Sheets failure', async () => {
    const activeId = process.env.ACTIVE_CATEGORY_ID || '1531525611057582182';
    const stored = new Map();
    const bot = { db: { get: async key => stored.get(key), set: async (key, value) => stored.set(key, value) } };
    let creation;
    let reply;
    const sent = [];
    const guild = { id: 'creation-guild', channels: {
        fetch: async id => ({ id, type: 4 }), create: async options => {
            creation = options;
            return { id: 'created-brief', send: async payload => { sent.push(payload); return { id: 'brief-message' }; } };
        }
    } };
    const base = { client: bot, guild, user: { id: 'staff' }, memberPermissions: { has: () => true } };
    await campaignCommand.execute({ ...base, options: { getSubcommand: () => 'create', getAttachment: () => null,
        getString: () => null, getBoolean: () => false }, showModal: async () => {} });
    const originalGoogleClientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    delete process.env.GOOGLE_OAUTH_CLIENT_ID;
    try {
        const fields = { campaign_name: 'Category Check', campaign_client: 'Test', campaign_info: 'Platform: TikTok\nCPM: $0',
            campaign_brief: 'Test workflow only.', campaign_description: 'Not a live campaign.' };
        await campaignCreateModal.execute({ ...base, fields: { getTextInputValue: key => fields[key] },
            deferReply: async () => {}, editReply: async value => { reply = value; } }, bot);
    } finally {
        if (originalGoogleClientId === undefined) delete process.env.GOOGLE_OAUTH_CLIENT_ID;
        else process.env.GOOGLE_OAUTH_CLIENT_ID = originalGoogleClientId;
    }
    assert.equal(creation.parent, activeId);
    assert.equal(sent.length, 1);
    const campaign = [...stored.values()][0];
    assert.equal(campaign.guildId, guild.id);
    assert.equal(campaign.channel, 'created-brief');
    assert.equal(campaign.status, 'Active');
    assert.match(reply.content, /created successfully/);
    assert.match(reply.content, /Sheet creation failed/);
});

test('tracking estimates require explicit terms, enforce minimums and caps, and never invent counts', () => {
    assert.equal(estimateClipEarnings(2000,null),null);
    assert.equal(estimateClipEarnings(499,{cpm:2,minimumViews:500}),0);
    assert.equal(estimateClipEarnings(2500,{cpm:2,minimumViews:500,maximumPayout:3}),3);
    assert.equal(estimateClipEarnings(-1,{cpm:2,minimumViews:0}),null);
    assert.equal(estimateRunChargeMicros({},20000),20000);
    const billing = {usageTotalUsd:0.003,chargedEventCounts:{result:1},pricingInfo:{pricingModel:'PAY_PER_EVENT',
        pricingPerEvent:{actorChargeEvents:{result:{eventTieredPricingUsd:{FREE:{tieredEventPriceUsd:0.003},GOLD:{tieredEventPriceUsd:0.001}}}}}}};
    assert.equal(estimateRunChargeMicros(billing,20000),7000);
    assert.equal(estimateRunChargeMicros({...billing,usageTotalUsd:100},20000),20000);
});

test('TikTok updates match the exact approved video and preserve staff-set payout status', async () => {
    const campaign = {id:'tracked-campaign',guildId:'tracked-guild',name:'Tracked Campaign',status:'Active',
        trackingTerms:{cpm:2,minimumViews:500,maximumPayout:3}};
    const bot = {db:{pool:client.db.pool,get:async key=>key==='campaigns:tracked-campaign'?campaign:null}};
    await ensureTrackingTables(bot);
    const clip = await createSubmission(bot,{guildId:'tracked-guild',campaignId:campaign.id,userId:'tracked-creator',
        videoUrl:'https://www.tiktok.com/@creator/video/246813579',platform:'TikTok'});
    const item = {playCount:2500,webVideoUrl:clip.video_url};
    assert.equal(await applyTrackingResult(bot,clip.id,'tracked-guild',item),false);
    await reviewSubmission(bot,{guildId:'tracked-guild',submissionId:clip.id,expectedStatus:'pending',status:'approved',reviewedBy:'staff'});
    assert.equal(await applyTrackingResult(bot,clip.id,'other-guild',item),false);
    assert.equal(await applyTrackingResult(bot,clip.id,'tracked-guild',{...item,webVideoUrl:'https://www.tiktok.com/@creator/video/111'}),false);
    assert.equal(await applyTrackingResult(bot,clip.id,'tracked-guild',item),true);
    assert.equal((await getTrackedStats(bot,'tracked-guild',campaign.id)).views,2500);
    const earning = (await getUserEarnings(bot,'tracked-guild','tracked-creator')).earnings[0];
    assert.equal(Number(earning.amount),3);
    await setEarningStatus(bot,{guildId:'tracked-guild',earningId:earning.id,status:'paid',recordedBy:'staff'});
    assert.equal(await applyTrackingResult(bot,clip.id,'tracked-guild',{...item,playCount:1000}),true);
    assert.equal(await applyTrackingResult(bot,clip.id,'tracked-guild',{...item,errorCode:'PRIVATE'}),false);
    const after = (await getUserEarnings(bot,'tracked-guild','tracked-creator')).earnings[0];
    assert.equal(after.status,'paid');
    assert.equal(Number(after.amount),3);
    assert.equal((await getTrackedStats(bot,'tracked-guild',campaign.id)).views,1000);
});

test('tracking reserves a shared monthly cap across guilds and uncertain runs cannot be retried as free', async () => {
    const bot = {db:client.db};
    await configureTracking(bot,'budget-guild',{enabled:true,intervalMinutes:15});
    await configureTracking(bot,'budget-other',{enabled:true,intervalMinutes:15});
    const urls = Array.from({length:100},(_,i)=>`https://www.tiktok.com/@creator/video/${100000000+i}`);
    const date = new Date('2030-01-02T00:00:00Z');
    let first;
    for (let i=0;i<5;i++) {
        const run = await reserveTrackingRun(bot,i%2?'budget-other':'budget-guild',[],urls,date,true);
        assert.equal(run.charge_limit_micros,1000000);
        first ??= run;
    }
    assert.equal(await reserveTrackingRun(bot,'budget-guild',[],urls,date,true),null);
    const total = (await postgres.query('SELECT SUM(reserved_micros) AS total FROM clip_tracking_month WHERE month=$1',['2030-01'])).rows[0];
    assert.equal(Number(total.total),5000000);
    let requested;
    assert.equal(await launchTrackingRun(bot,first,async(url,options)=>{
        requested={url:new URL(url),body:JSON.parse(options.body)};
        throw new Error('Simulated network failure');
    }),null);
    assert.equal(requested.url.searchParams.get('maxTotalChargeUsd'),'1.000000');
    assert.equal(requested.url.searchParams.get('forcePermissionLevel'),'LIMITED_PERMISSIONS');
    assert.equal(requested.body.shouldDownloadVideos,false);
    assert.equal((await postgres.query('SELECT status FROM clip_tracking_runs WHERE id=$1',[first.id])).rows[0].status,'uncertain');
    assert.equal(Number((await postgres.query('SELECT SUM(reserved_micros) AS total FROM clip_tracking_month WHERE month=$1',['2030-01'])).rows[0].total),5000000);
    assert.ok(await reserveTrackingRun(bot,'budget-guild',[],urls,new Date('2030-02-02T00:00:00Z'),true));
});

test('private campaign payout sheets map PayPal and ledger totals by guild and preserve staff cells', async () => {
    const campaign = {id:'sheet-campaign',guildId:'sheet-guild',name:'Sheet Campaign',status:'Active',members:['sheet-creator'],trackingTerms:{cpm:2}};
    await ensureTrackingTables(client);
    await savePaymentMethod(client,'sheet-guild','sheet-creator','paypal','correct@example.com','=Creator','Creator');
    await savePaymentMethod(client,'other-sheet-guild','sheet-creator','paypal','wrong@example.com','Other','Other');
    await addCampaignEarning(client,{guildId:'sheet-guild',userId:'sheet-creator',campaignName:campaign.name,amount:1.23,status:'estimated'});
    await addCampaignEarning(client,{guildId:'sheet-guild',userId:'sheet-creator',campaignName:campaign.name,amount:2.34,status:'approved'});
    await addCampaignEarning(client,{guildId:'sheet-guild',userId:'sheet-creator',campaignName:campaign.name,amount:3.45,status:'paid'});
    await addCampaignEarning(client,{guildId:'other-sheet-guild',userId:'sheet-creator',campaignName:campaign.name,amount:100,status:'approved'});
    const rows = await getCampaignPayoutRows(client,campaign,[campaign]);
    assert.equal(rows[0][1],'sheet-creator'); assert.equal(rows[0][8],'correct@example.com');
    assert.equal(rows[0][4],3.57); assert.equal(rows[0][9],1.23); assert.equal(rows[0][10],2.34); assert.equal(rows[0][11],3.45);
    const writes = payoutWriteData([['Creator','Discord User ID'],['Creator','sheet-creator',0,2,0,'yes','=DATE(2026,10,7)','keep this']],rows,'2030-01-01');
    assert.deepEqual(writes.map(write=>write.range),['Payouts!A1:R1','Payouts!A2:E2','Payouts!I2:R2']);
    assert.equal(writes[2].values[0][8],'2030-01-01');
    assert.throws(()=>payoutWriteData([[],['A','same'],['B','same']],[],'now'),/Duplicate/);
    const ambiguous = await getCampaignPayoutRows(client,campaign,[campaign,{...campaign,id:'duplicate-name'}]);
    assert.equal(ambiguous[0][4],0);
    let write;
    const api = {drive:{permissions:{list:async()=>({data:{permissions:[{type:'user'}]}})}},sheets:{spreadsheets:{
        get:async()=>({data:{sheets:[{properties:{title:'Payouts',sheetId:1}}]}}),batchUpdate:async()=>{},values:{
            get:async()=>({data:{values:[['Creator','Discord User ID']]}}),batchUpdate:async request=>{write=request;}
        }}}};
    const configured = {...campaign,googleSheetId:'private-sheet'};
    assert.equal(await syncCampaignPayoutSheet(client,configured,[campaign],{clients:api,force:true}),true);
    assert.equal(write.requestBody.valueInputOption,'RAW'); assert.equal(write.spreadsheetId,'private-sheet');
    api.drive.permissions.list=async()=>({data:{permissions:[{type:'anyone'}]}});
    await assert.rejects(syncCampaignPayoutSheet(client,configured,[campaign],{clients:api,force:true}),/private campaign/);
});

test('staff controls deny creators, persist pause/resume/end, and reject cross-guild changes', async () => {
    let saved = {id:'control-campaign',guildId:'control-guild',name:'Control',status:'Active'};
    const bot = {db:{get:async()=>saved,set:async(key,value)=>{saved=value;}}};
    let reply;
    await handleCampaignStaffButton({guild:{id:'control-guild'},memberPermissions:{has:()=>false},member:{roles:{cache:new Map()}},
        reply:async value=>{reply=value;},customId:'campaign_staff_end_control-campaign',client:bot});
    assert.equal(reply.flags,64); assert.match(reply.content,/Only the Campaign Team/); assert.equal(saved.status,'Active');
    await assert.rejects(changeCampaignStatus(bot,saved.id,'other-guild','end','staff'),/not available/);
    assert.equal((await changeCampaignStatus(bot,saved.id,'control-guild','pause','staff')).status,'Paused');
    assert.match(await submissionAccessError({guild:{id:'control-guild'}},bot,saved),/paused/);
    assert.equal((await changeCampaignStatus(bot,saved.id,'control-guild','resume','staff')).status,'Active');
    assert.equal((await changeCampaignStatus(bot,saved.id,'control-guild','end','staff')).status,'Closed');
    assert.equal(saved.closedBy,'staff'); await assert.rejects(changeCampaignStatus(bot,saved.id,'control-guild','resume','staff'),/already ended/);
});

