import {
    SlashCommandBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    PermissionFlagsBits,
    ChannelType
} from "discord.js";

import {
    joinMember,
    getMember,
    leaveMember
} from "../../utils/campaignMembers.js";

import {
    saveCampaign,
    getCampaign,
    getAllCampaigns
} from "../../utils/database.js";

import {
    subscribeToCampaignDMs,
    unsubscribeFromCampaignDMs,
    isSubscribedToCampaignDMs
} from "../../utils/campaignNotifications.js";
import { campaignBelongsToGuild } from '../../utils/campaignAccess.js';
import { getSubmissionStats, getSubmission, listUserSubmissions } from '../../services/submissionService.js';
import { withCampaignLock } from '../../utils/campaignLock.js';
import { sendDiscordText } from '../../utils/discordMessages.js';
import { configureTracking, getTrackedStats } from '../../services/clipTrackingService.js';

console.log("🔥 CAMPAIGN COMMAND LOADED 🔥");

const STAFF_ROLE_ID = process.env.STAFF_ROLE_ID || "1529961495402778771";
const ACTIVE_CATEGORY_ID = process.env.ACTIVE_CATEGORY_ID || "1531525611057582182";

const CAMPAIGN_CHANNEL_NAMES = [
    "📢-announcements",
    "📤-submit",
    "💬-chat",
    "⚠️-rules",
    "🛡️-staff-review"
];

async function browseCampaigns(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const campaigns = await getAllCampaigns(interaction.client);
    const available = [];
    for (const campaign of campaigns) {
        if (campaign.status === 'Active' && await campaignBelongsToGuild(interaction, campaign)) available.push(campaign);
    }
    return interaction.editReply({ embeds: [new EmbedBuilder().setColor('#5865F2').setTitle('Active Campaigns')
        .setDescription(available.length
            ? available.slice(0, 20).map(campaign => `[${String(campaign.name || 'Campaign').replace(/[\[\]]/g, '')}](https://discord.com/channels/${interaction.guild.id}/${campaign.channel})`).join('\n')
            : 'No active campaigns are available yet. Watch announcements for the next campaign.')
        .setFooter({ text: `${available.length} active campaigns • Read the full brief before joining` })] });
}

async function showMySubmissions(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const submissions = await listUserSubmissions(interaction.client, interaction.guild.id, interaction.user.id);
    const embed = new EmbedBuilder().setColor('#5865F2').setTitle('My Submissions')
        .setDescription(submissions.length ? 'Your latest 10 submissions. Staff decisions appear here as they are recorded.' : 'No clips submitted yet. Browse campaigns and use Submit Clip in a joined campaign workspace.');
    for (const submission of submissions) {
        const campaign = await getCampaign(interaction.client, submission.campaign_id);
        embed.addFields({ name: `#${submission.id} • ${campaign?.name || 'Campaign'} • ${submission.status}`.slice(0, 256),
            value: `[Open ${submission.platform} video](${submission.video_url})${submission.rejection_reason ? `\nReason: ${submission.rejection_reason.slice(0, 80)}` : ''}`
                + (submission.status === 'approved' ? `\nViews: ${submission.tracked_views === null || submission.tracked_views === undefined ? 'Awaiting check' : Number(submission.tracked_views).toLocaleString('en-US')}` : '')
                + (submission.last_tracked_at ? ` · Checked <t:${Math.floor(new Date(submission.last_tracked_at).getTime()/1000)}:R>` : '')
                + (submission.tracking_error ? '\nView count unavailable; last successful count preserved.' : '') });
    }
    return interaction.editReply({ embeds: [embed] });
}

async function publishCreatorPanel(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const rows = [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('campaign_browse_all').setLabel('Browse Campaigns').setEmoji('🎬').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('campaign_submissions_all').setLabel('My Submissions').setEmoji('📋').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('payment_balance').setLabel('My Earnings').setEmoji('💰').setStyle(ButtonStyle.Secondary))];
    if (interaction.guild.id === '1529960735390826536') rows.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel('Verify Account').setStyle(ButtonStyle.Link).setURL('https://discord.com/channels/1529960735390826536/1529961561324519514'),
        new ButtonBuilder().setLabel('Choose Niches').setStyle(ButtonStyle.Link).setURL('https://discord.com/channels/1529960735390826536/1529961568278941857'),
        new ButtonBuilder().setLabel('Payout Settings').setStyle(ButtonStyle.Link).setURL('https://discord.com/channels/1529960735390826536/1529961578286284992'),
        new ButtonBuilder().setLabel('Get Support').setStyle(ButtonStyle.Link).setURL('https://discord.com/channels/1529960735390826536/1529961601124401295')));
    const message = await interaction.channel.send({
        embeds: [new EmbedBuilder().setColor('#5865F2').setTitle('United Clips • Creator Hub')
            .setDescription('**Create. Submit. Track.**\n\n1. Verify your account, choose your niches, and set up your payout details.\n2. Browse active campaigns and read the full brief.\n3. Join a campaign to unlock its workspace and submit your video.\n4. Check your submissions and recorded earnings privately below.\n\nCampaign terms and staff review determine eligibility. Approved clips do not automatically trigger a payment.')
            .setFooter({ text: 'United Clips • Private replies for your submissions and earnings' })],
        components: rows, allowedMentions: { parse: [] }
    });
    await message.pin().catch(() => null);
    return interaction.editReply({ content: 'Creator Hub published and pinned in this channel.' });
}

async function organizeUnitedClips(interaction) {
    await interaction.deferReply({ ephemeral: true });
    if (interaction.guild.id !== '1529960735390826536') {
        return interaction.editReply({ content: 'This layout is configured for United Clips.' });
    }
    const channels = await interaction.guild.channels.fetch();
    const staff = channels.get('1529961602101543034');
    const renames = [
        ['1529961561324519514', '1️⃣・verify-account', 'Verify your TikTok ownership using the bot. Never post verification codes or passwords publicly.'],
        ['1529961568278941857', '2️⃣・choose-niches', 'Choose the campaign categories you want to hear about. Update your selections any time.'],
        ['1529961578286284992', '3️⃣・payout-settings', 'Manage your payout account and view recorded earnings privately through the bot buttons.'],
        ['1529961538709098616', '🚀・start-here', 'Start here: verify your account, choose niches, set up payouts, and read each campaign brief before joining.'],
        ['1529961601124401295', '🎫・support', 'Open a private ticket for verification, submissions, or payout questions. Include your campaign and submission ID when relevant.'],
        ['1529961616114978987', '📋・bot-logs', 'Private bot activity and troubleshooting logs for the campaign team.'],
        ['1529961607969378395', '📥・submission-review', 'Private staff space for submission review and recovery.'],
        ['1529961658598817864', '🛠️・campaign-admin', 'Private campaign operations. Use /campaign create to publish a brief and /campaign review to recover a submission panel.'],
        [ACTIVE_CATEGORY_ID, '💸 Active Campaigns', null]
    ];
    const failures = [];
    let changed = 0;
    for (const [id, name, topic] of renames) {
        const channel = channels.get(id);
        if (!channel) continue;
        try {
            if (channel.name !== name || (topic && channel.topic !== topic)) {
                await channel.edit({ name, ...(topic ? { topic } : {}), reason: 'United Clips channel organization' });
                changed++;
            }
        } catch { failures.push(channel.name); }
    }
    const categoryNames = new Map([
        ['👋 Welcome', '👋 Start Here'], ['🎫 TICKETS', '🎫 Help & Support'], ['🛠️ STAFF', '🛡️ Campaign Team']
    ]);
    for (const channel of channels.values()) {
        if (channel?.type !== ChannelType.GuildCategory || !categoryNames.has(channel.name)) continue;
        try { await channel.setName(categoryNames.get(channel.name), 'United Clips channel organization'); changed++; }
        catch { failures.push(channel.name); }
    }
    // Preserve every channel ID, message, and explicit permission overwrite.
    // These legacy channels were left outside all categories by the old setup.
    const legacyIds = ['1531274807096770687', '1529961625032069120', '1529961626365857822',
        '1529961632237748325', '1529961633365884979', '1529961639565197503',
        '1529961641524068473', '1529961644908871781', '1529961655386247209',
        '1529961656434823218', '1529961658598817864', '1529961657546182726'];
    if (staff?.parentId) {
        for (const id of legacyIds) {
            const channel = channels.get(id);
            if (!channel || channel.parentId) continue;
            try {
                await channel.setParent(staff.parentId, { lockPermissions: false, reason: 'Organize legacy workspaces without changing access' });
                changed++;
            } catch { failures.push(channel.name); }
        }
    }
    return interaction.editReply({ content: `Organized ${changed} channels and categories. Existing messages, roles, and access settings are preserved.${failures.length ? `\nCould not update: ${failures.join(', ')}` : ''}` });
}

async function recoverSubmissionPanel(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const id = interaction.options.getInteger('submission', true);
    const submission = await getSubmission(interaction.client, id, interaction.guild.id);
    if (!submission) return interaction.editReply({ content: `Submission #${id} was not found in this server.` });
    const campaign = await getCampaign(interaction.client, submission.campaign_id);
    const channel = campaign?.staffReviewChannel
        ? await interaction.guild.channels.fetch(campaign.staffReviewChannel).catch(() => null) : null;
    if (!channel?.isTextBased() || channel.permissionsFor(interaction.guild.roles.everyone)?.has(PermissionFlagsBits.ViewChannel)) {
        return interaction.editReply({ content: 'Set up a private staff review channel for this campaign before recovering its panel.' });
    }
    await channel.send({
        embeds: [new EmbedBuilder().setTitle(`Clip Submission #${submission.id}`).setColor('#5865F2')
            .addFields(
                { name: 'Campaign', value: campaign.name },
                { name: 'Creator', value: `<@${submission.user_id}>`, inline: true },
                { name: 'Status', value: submission.status, inline: true },
                { name: 'Platform', value: submission.platform, inline: true },
                { name: 'Video', value: submission.video_url },
                { name: 'Notes', value: submission.notes || 'No notes provided.' })],
        components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`submission_approve_${submission.id}`).setLabel('Approve').setStyle(ButtonStyle.Success).setDisabled(submission.status === 'approved'),
            new ButtonBuilder().setCustomId(`submission_reject_${submission.id}`).setLabel('Reject').setStyle(ButtonStyle.Danger).setDisabled(submission.status === 'rejected'))],
        allowedMentions: { parse: [] }
    });
    return interaction.editReply({ content: `Recovered submission #${id} in <#${channel.id}>.` });
}

async function closeCampaign(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const channel = interaction.options.getChannel('channel', true);
    const campaigns = await getAllCampaigns(interaction.client);
    const campaign = campaigns.find(item => item.channel === channel.id);
    if (!campaign || !await campaignBelongsToGuild(interaction, campaign)) {
        return interaction.editReply({ content: 'Choose this campaign’s public brief channel.' });
    }
    return withCampaignLock(interaction.client, campaign.id, async () => {
        const latest = await getCampaign(interaction.client, campaign.id);
        latest.status = 'Closed';
        latest.closedAt = Date.now();
        latest.closedBy = interaction.user.id;
        await saveCampaign(interaction.client, latest.id, latest);
        let refreshed = true;
        try { await updatePublicCampaignMessage(interaction, latest); }
        catch { refreshed = false; }
        return interaction.editReply({ content: `Closed **${latest.name}**. New joins and submissions are blocked; history and earnings are preserved.${refreshed ? '' : ' The brief buttons could not be refreshed, but the campaign is closed in the database.'}` });
    });
}

async function manageTracking(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const state = await configureTracking(interaction.client, interaction.guild.id, {
        enabled: interaction.options.getBoolean('enabled'), intervalMinutes: interaction.options.getInteger('interval')
    });
    return interaction.editReply({ embeds: [new EmbedBuilder().setTitle('TikTok View Tracking').setColor('#5865F2')
        .setDescription('Tracks approved TikTok clips in active campaigns. Estimated earnings require staff to set the published rate with /campaign terms. This does not send payments.')
        .addFields(
            { name: 'Status', value: state.enabled ? 'Enabled' : 'Disabled', inline: true },
            { name: 'Target interval', value: `${state.interval_minutes} minutes`, inline: true },
            { name: 'Monthly cap', value: '$5 USD across this bot’s TikTok video tracking', inline: true },
            { name: 'Used / reserved this month', value: `$${(Number(state.reserved_micros)/1e6).toFixed(3)}`, inline: true },
            { name: 'Last successful check', value: state.last_success ? `<t:${Math.floor(new Date(state.last_success).getTime()/1000)}:R>` : 'No successful checks yet', inline: true },
            { name: 'Next planned check', value: state.enabled && state.next_due ? `<t:${Math.floor(new Date(state.next_due).getTime()/1000)}:R>` : 'Tracking is disabled', inline: true })
        .setFooter({ text: state.last_error || 'Intervals slow down to preserve the budget. Counts reflect the provider’s latest data.' })] });
}

async function setTrackingTerms(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const channel = interaction.options.getChannel('channel', true);
    const campaign = (await getAllCampaigns(interaction.client)).find(item => item.channel === channel.id);
    if (!campaign || !await campaignBelongsToGuild(interaction, campaign)) return interaction.editReply({ content: 'Choose the public brief channel for this campaign.' });
    return withCampaignLock(interaction.client, campaign.id, async () => {
        const latest = await getCampaign(interaction.client,campaign.id);
        latest.trackingTerms = { cpm: interaction.options.getNumber('cpm',true), minimumViews: interaction.options.getInteger('minimum_views',true),
            maximumPayout: interaction.options.getNumber('maximum_per_clip'), setBy: interaction.user.id, setAt: Date.now() };
        await saveCampaign(interaction.client,latest.id,latest);
        return interaction.editReply({ content: `Saved the calculation terms for **${latest.name}**. Use the same USD rate and requirements as the published brief. Future successful checks update estimates for approved TikTok clips; staff-approved or paid earnings are preserved.` });
    });
}

function memberCount(campaign) {
    return Array.isArray(campaign.members)
        ? campaign.members.length
        : 0;
}

function moneyNumber(value) {
    return (
        Number(
            String(value ?? 0)
                .replace(/[$,]/g, "")
                .trim()
        ) || 0
    );
}

function buildCampaignEmbed(campaign) {
    const emoji = campaign.emoji || "🎬";

    return new EmbedBuilder()
        .setColor(
            campaign.status === "Active"
                ? "#57F287"
                : "#747F8D"
        )
        .setAuthor({
            name: `${emoji} ${campaign.name}`
        })
        .setTitle("Track Your Campaign Clips")
        .setDescription(
            [
                campaign.description ||
                    "Join this campaign to begin earning.",
                "",
                "### 🚀 Join Campaign",
                "Unlock the private campaign workspace.",
                "",
                "### 📊 Campaign Details",
                "Check current members, submissions, views, budget, and payouts.",
                "",
                "### ↩️ Leave Campaign",
                "Remove your campaign role and workspace access."
            ].join("\n")
        )
        .addFields(
            {
                name: "📋 Campaign Details",
                value: [
                    `**Client:** ${campaign.client}`,
                    `**Platform:** ${campaign.platform || "TikTok"}`,
                    `**Deadline:** ${campaign.deadline}`
                ].join("\n"),
                inline: true
            },
            {
                name: "💸 Payment Details",
                value: [
                    `**Budget:** ${campaign.budget}`,
                    `**CPM:** ${campaign.cpm}`
                ].join("\n"),
                inline: true
            },
            {
                name: "📈 Current Status",
                value: [
                    `**Members:** ${memberCount(campaign)}`,
                    `**Submissions:** ${campaign.submissions || 0}`,
                    `**Status:** ${
                        campaign.status === "Active"
                            ? "🟢 Active"
                            : "⚫ Closed"
                    }`
                ].join("\n"),
                inline: false
            }
        )
        .setFooter({
            text: "United Clips • Campaign Tracking"
        })
        .setTimestamp();
}

function buildCampaignButtons(campaign) {
    const isClosed =
        campaign.status !== "Active";

    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(
                `campaign_join_${campaign.id}`
            )
            .setLabel("Join Campaign")
            .setEmoji("🚀")
            .setStyle(ButtonStyle.Success)
            .setDisabled(isClosed),

        new ButtonBuilder()
            .setCustomId(
                `campaign_status_${campaign.id}`
            )
            .setLabel("Campaign Details")
            .setEmoji("📊")
            .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
            .setCustomId(
                `campaign_leave_${campaign.id}`
            )
            .setLabel("Leave Campaign")
            .setEmoji("↩️")
            .setStyle(ButtonStyle.Danger),

        new ButtonBuilder()
            .setCustomId(
                `campaign_notify_${campaign.id}`
            )
            .setLabel("Enable Campaign DMs")
            .setEmoji("🔔")
            .setStyle(ButtonStyle.Secondary)
    );
}

function buildWorkspaceEmbed(campaign) {
    return new EmbedBuilder()
        .setColor("#57F287")
        .setAuthor({
            name: `${campaign.emoji || "🎬"} ${campaign.name}`
        })
        .setTitle("Campaign Workspace")
        .setDescription(
            [
                `Use this panel to manage your clips for **${campaign.name}**.`,
                "",
                "### 📤 Submit Clip",
                "Submit a video URL for staff review.",
                "",
                "### 📊 My Stats",
                "View the latest campaign numbers.",
                "",
                "### ↩️ Leave Campaign",
                "Leave the campaign and remove your access."
            ].join("\n")
        )
        .addFields(
            {
                name: "Platform",
                value: String(campaign.platform || "TikTok"),
                inline: true
            },
            {
                name: "CPM",
                value: String(campaign.cpm),
                inline: true
            },
            {
                name: "Deadline",
                value: String(campaign.deadline),
                inline: true
            }
        )
        .setFooter({
            text: "United Clips • Campaign Workspace"
        })
        .setTimestamp();
}

function buildWorkspaceButtons(campaign) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`submit_clip:${campaign.id}`)
            .setLabel("Submit Clip")
            .setEmoji("📤")
            .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
    .setCustomId(`campaign_mystats_${campaign.id}`)
    .setLabel("My Stats")
    .setEmoji("📊")
    .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
            .setCustomId(`campaign_leave_${campaign.id}`)
            .setLabel("Leave Campaign")
            .setEmoji("↩️")
            .setStyle(ButtonStyle.Danger)
    );
}

function buildLeaveEmbed(campaign) {
    return new EmbedBuilder()
        .setColor("#ED4245")
        .setTitle("Campaign Left")
        .setDescription(
            `You left **${campaign.name}** and your campaign access was removed.`
        )
        .setTimestamp();
}

async function findPublicCampaignMessage(interaction, campaign) {
    const channel =
        interaction.guild.channels.cache.get(campaign.channel) ||
        (await interaction.guild.channels
            .fetch(campaign.channel)
            .catch(() => null));

    if (!channel || !channel.isTextBased()) {
        return null;
    }

    const messages = await channel.messages.fetch({
        limit: 50
    });

    return (
        messages.find(message =>
            message.author.id === interaction.client.user.id &&
            message.components.some(row =>
                row.components.some(
                    component =>
                        component.customId ===
                        `campaign_join_${campaign.id}`
                )
            )
        ) || null
    );
}

async function updatePublicCampaignMessage(
    interaction,
    campaign
) {
    const message = await findPublicCampaignMessage(
        interaction,
        campaign
    );

    if (!message) {
        return;
    }

    await message.edit({
        components: [
            buildCampaignButtons(campaign)
        ]
    });
}

async function ensureCampaignRole(interaction, campaign) {
    let role = campaign.role
        ? interaction.guild.roles.cache.get(campaign.role)
        : null;

    if (!role && campaign.role) {
        role = await interaction.guild.roles
            .fetch(campaign.role)
            .catch(() => null);
    }

    if (role) {
        return role;
    }

    role = await interaction.guild.roles.create({
        name: `${campaign.emoji || "🎬"} ${campaign.name}`.slice(
            0,
            100
        ),
        mentionable: true,
        reason: `Campaign role for ${campaign.name}`
    });

    campaign.role = role.id;

    await saveCampaign(
        interaction.client,
        campaign.id,
        campaign
    );

    return role;
}
function formatCampaignInfoForWorkspace(value) {
    return String(value || "")
        .split("\n")
        .map(line => line.trim())
        .filter(Boolean)
        .map(line => {
            const separatorIndex = line.indexOf(":");

            if (separatorIndex === -1) {
                return `• ${line}`;
            }

            const label =
                line.slice(0, separatorIndex).trim();

            const content =
                line.slice(separatorIndex + 1).trim();

            return `• **${label}:** ${content}`;
        })
        .join("\n");
}

function formatBriefForWorkspace(value) {
    return String(value || "")
        .split("\n")
        .map(line => line.trim())
        .filter(Boolean)
        .map(line =>
            line.startsWith("•")
                ? line
                : `• ${line}`
        )
        .join("\n");
}

function buildAnnouncementMessage(campaign) {
    return [
        `## 📝 Campaign ${campaign.name} Info:`,
        "",
        formatCampaignInfoForWorkspace(
            campaign.campaignInfo
        ),
        "",
        "**Brief:**",
        "",
        formatBriefForWorkspace(
            campaign.brief
        )
    ].join("\n");
}

function buildRulesMessage(campaign) {
    const lines = [
        "# ❌ Rules:",
        "",
        "• Must be audible at all times, including during the intro.",
        "• Must have at least 7 seconds of the edit using only the required song.",
        "• Content must be original and of appropriate quality.",
        "• No controversial, hateful, illegal or offensive topics.",
        "• The song must be clearly audible for at least 7 seconds.",
        "• Do not talk badly about the artist or client.",
        "• Do not portray the artist or client negatively.",
        "• The sound must be used intentionally.",
        "• Do not use only a few seconds of the sound in a long video.",
        "• The video must use the actual required sound.",
        "• Do not slow down, speed up or replace the required sound.",
        "• Do not promote other artists unless the brief permits it.",
        "• No engagement baiting submissions.",
        "• No fake views, bots, paid engagement or manipulated traffic.",
        "• No background-audio-only edits where the edit never appears.",
        "• Do not submit stolen, copied or reposted content.",
        "• Do not submit videos already commissioned by another clipping server.",
        "• Do not submit the same video more than once.",
        "• The video must remain public until the campaign has paid.",
        "• Staff may reject any submission that does not meet campaign quality standards.",
        "",
        "*Posts must stay up until the campaign has paid, or you may not receive payment.*",
        "",
        "**Brief:**",
        "",
        formatBriefForWorkspace(
            campaign.brief
        )
    ];

    if (campaign.audioLink) {
        lines.push(
            "",
            "## 🚨 Use this sound when posting, or you may not get paid:",
            "",
            "the required sound at 7% volume or higher or if the required sound is missing/muted/replaced, the submission may be rejected.",
            "",
            "**SOUND LINK TO USE:**",
            campaign.audioLink
        );
    }

    if (campaign.audioFile?.url) {
        lines.push(
            "",
            "## 🔊 Audio Download",
            "",
            "*You may use any part, but make sure the required sound is attached when posting.*"
        );
    }

    return lines.join("\n");
}

function buildChatMessage(campaign) {
    return [
        `# 💬 ${campaign.name} Chat`,
        "",
        "Use this channel for campaign questions and discussion.",
        "",
        "• Ask staff for clarification.",
        "• Share editing ideas.",
        "• Help other editors.",
        "• Do not spam.",
        "• Do not submit clips in this channel.",
        "",
        "Use the submit channel to send your finished clip."
    ].join("\n");
}
async function createCampaignWorkspace(
    interaction,
    campaign
) {
    const role = await ensureCampaignRole(
        interaction,
        campaign
    );

    const permissionOverwrites = [
        {
            id: interaction.guild.roles.everyone.id,
            deny: [
                PermissionFlagsBits.ViewChannel
            ]
        },
        {
            id: STAFF_ROLE_ID,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.ManageMessages
            ]
        },
        {
            id: role.id,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory
            ]
        }
    ];

    const category =
        await interaction.guild.channels.create({
            name:
                `${campaign.emoji || "🎬"} ${campaign.name}`
                    .toUpperCase()
                    .slice(0, 100),

            type: ChannelType.GuildCategory,
            permissionOverwrites
        });

    campaign.category = category.id;

   let announcementsChannel = null;
let rulesChannel = null;
let submitChannel = null;
let chatChannel = null;
let staffReviewChannel = null;

for (
    const channelName
    of CAMPAIGN_CHANNEL_NAMES
) {
    let created =
        interaction.guild.channels.cache.find(
            channel =>
                channel.parentId === category.id &&
                channel.type === ChannelType.GuildText &&
                channel.name === channelName
        );

    if (!created) {
       const isChat =
    channelName === "💬-chat";

const isStaffReview =
    channelName === "🛡️-staff-review";

const channelPermissions =
    isStaffReview
        ? [
              {
                  id: interaction.guild.roles.everyone.id,
                  deny: [
                      PermissionFlagsBits.ViewChannel
                  ]
              },
              {
                  id: STAFF_ROLE_ID,
                  allow: [
                      PermissionFlagsBits.ViewChannel,
                      PermissionFlagsBits.SendMessages,
                      PermissionFlagsBits.ReadMessageHistory,
                      PermissionFlagsBits.ManageMessages
                  ]
              },
              {
                  id: interaction.client.user.id,
                  allow: [
                      PermissionFlagsBits.ViewChannel,
                      PermissionFlagsBits.SendMessages,
                      PermissionFlagsBits.ReadMessageHistory,
                      PermissionFlagsBits.ManageMessages,
                      PermissionFlagsBits.EmbedLinks,
                      PermissionFlagsBits.AttachFiles
                  ]
              },
              {
                  id: role.id,
                  deny: [
                      PermissionFlagsBits.ViewChannel
                  ]
              }
          ]
        : [
              {
                  id: interaction.guild.roles.everyone.id,
                  deny: [
                      PermissionFlagsBits.ViewChannel
                  ]
              },
              {
                  id: STAFF_ROLE_ID,
                  allow: [
                      PermissionFlagsBits.ViewChannel,
                      PermissionFlagsBits.SendMessages,
                      PermissionFlagsBits.ReadMessageHistory,
                      PermissionFlagsBits.ManageMessages
                  ]
              },
              {
                  id: interaction.client.user.id,
                  allow: [
                      PermissionFlagsBits.ViewChannel,
                      PermissionFlagsBits.SendMessages,
                      PermissionFlagsBits.ReadMessageHistory,
                      PermissionFlagsBits.EmbedLinks,
                      PermissionFlagsBits.AttachFiles
                  ]
              },
              {
                  id: role.id,
                  allow: isChat
                      ? [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.SendMessages,
                            PermissionFlagsBits.ReadMessageHistory
                        ]
                      : [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.ReadMessageHistory
                        ],
                  deny: isChat
                      ? []
                      : [
                            PermissionFlagsBits.SendMessages,
                            PermissionFlagsBits.CreatePublicThreads,
                            PermissionFlagsBits.CreatePrivateThreads,
                            PermissionFlagsBits.SendMessagesInThreads
                        ]
              }
          ];

        created =
            await interaction.guild.channels.create({
                name: channelName,
                type: ChannelType.GuildText,
                parent: category.id,
                permissionOverwrites:
                    channelPermissions
            });
    }

    if (channelName === "📢-announcements") {
    announcementsChannel = created;
}

if (channelName === "⚠️-rules") {
    rulesChannel = created;
}

if (channelName === "📤-submit") {
    submitChannel = created;
}

if (channelName === "💬-chat") {
    chatChannel = created;
}

if (channelName === "🛡️-staff-review") {
    staffReviewChannel = created;
}
}
    if (announcementsChannel) {
    const announcementPayload = {
        content: buildAnnouncementMessage(campaign)
    };
    const announcementMessage =
        await sendDiscordText(announcementsChannel,
            announcementPayload
        );

    await announcementMessage
        .pin()
        .catch(() => null);

    campaign.announcementsChannel =
        announcementsChannel.id;

    campaign.announcementMessageId =
        announcementMessage.id;
}
    if (rulesChannel) {
    const rulesPayload = {
        content:
            buildRulesMessage(campaign)
    };

    if (campaign.audioFile?.url) {
        rulesPayload.files = [
            {
                attachment:
                    campaign.audioFile.url,

                name:
                    campaign.audioFile.name ||
                    "campaign-audio.mp3"
            }
        ];
    }

    const rulesMessage =
        await sendDiscordText(rulesChannel,
            rulesPayload
        );

    await rulesMessage
        .pin()
        .catch(() => null);

    campaign.rulesChannel =
        rulesChannel.id;

    campaign.rulesMessageId =
        rulesMessage.id;
}
    if (chatChannel) {
    const chatMessage =
        await chatChannel.send({
            content:
                buildChatMessage(campaign)
        });

    await chatMessage
        .pin()
        .catch(() => null);

    campaign.chatChannel =
        chatChannel.id;

    campaign.chatMessageId =
        chatMessage.id;
}
if (staffReviewChannel) {
    const sheetMessage =
        await staffReviewChannel.send({
            content: campaign.googleSheetUrl
                ? [
                      "## 📊 Campaign Spreadsheet",
                      "",
                      `**Campaign:** ${campaign.name}`,
                      "",
                      `[Open Google Sheet](${campaign.googleSheetUrl})`,
                      "",
                      "Approved and rejected submissions for this campaign will be recorded here."
                  ].join("\n")
                : [
                      "## ⚠️ Campaign Spreadsheet",
                      "",
                      `**Campaign:** ${campaign.name}`,
                      "",
                      "The Google spreadsheet was not created successfully."
                  ].join("\n")
        });

    await sheetMessage.pin().catch(() => null);

    campaign.staffReviewChannel =
        staffReviewChannel.id;

    campaign.sheetMessageId =
        sheetMessage.id;
}
    if (submitChannel) {
        let existingPanel = null;

        if (campaign.workspacePanel) {
            existingPanel =
                await submitChannel.messages
                    .fetch(campaign.workspacePanel)
                    .catch(() => null);
        }

        if (!existingPanel) {
            const recentMessages =
                await submitChannel.messages.fetch({
                    limit: 20
                });

            existingPanel = recentMessages.find(
                message =>
                    message.author.id ===
                        interaction.client.user.id &&
                    message.components.some(row =>
                        row.components.some(
                            component =>
                                component.customId ===
                                `campaign_mystats_${campaign.id}`
                        )
                    )
            );
        }

        if (!existingPanel) {
            existingPanel =
                await submitChannel.send({
                    embeds: [
                        buildWorkspaceEmbed(campaign)
                    ],
                    components: [
                        buildWorkspaceButtons(campaign)
                    ]
                });

            await existingPanel
                .pin()
                .catch(() => null);
        }

        campaign.submitChannel =
            submitChannel.id;

        campaign.workspacePanel =
            existingPanel.id;
    }

    await saveCampaign(
        interaction.client,
        campaign.id,
        campaign
    );

    return category;
}

async function ensureCampaignWorkspace(
    interaction,
    campaign
) {
    let category = null;

    // First, find the saved category by ID.
    if (campaign.category) {
        category =
            interaction.guild.channels.cache.get(
                campaign.category
            ) ||
            (await interaction.guild.channels
                .fetch(campaign.category)
                .catch(() => null));
    }

    if (
        category &&
        category.type === ChannelType.GuildCategory
    ) {
        return category;
    }

    // If the saved ID is missing, search by category name.
    const expectedName =
        `${campaign.emoji || "🎬"} ${campaign.name}`
            .toUpperCase()
            .slice(0, 100);

    category = interaction.guild.channels.cache.find(
        channel =>
            channel.type === ChannelType.GuildCategory &&
            channel.name === expectedName
    );

    if (category) {
        campaign.category = category.id;

        await saveCampaign(
            interaction.client,
            campaign.id,
            campaign
        );

        return category;
    }

    // Create a new workspace only when none exists.
    return createCampaignWorkspace(
        interaction,
        campaign
    );
}

function findFirstWorkspaceChannel(
    interaction,
    categoryId
) {
    const preferredNames = [
        "⚠️-rules",
        "📢-announcements",
        "📤-submit",
        "💬-chat"
    ];

    for (const name of preferredNames) {
        const channel =
            interaction.guild.channels.cache.find(
                item =>
                    item.parentId === categoryId &&
                    item.type === ChannelType.GuildText &&
                    item.name === name
            );

        if (channel) {
            return channel;
        }
    }

    return null;
}
async function handleNotificationToggle(
    interaction,
    campaign
) {
    const currentlySubscribed =
        await isSubscribedToCampaignDMs(
            interaction.client,
            interaction.guild.id,
            interaction.user.id
        );

    if (currentlySubscribed) {
        await unsubscribeFromCampaignDMs(
            interaction.client,
            interaction.guild.id,
            interaction.user.id
        );

        return interaction.reply({
            content: [
                "🔕 **Campaign DMs disabled.**",
                "",
                "You will no longer receive private messages when new campaigns are created.",
                "",
                "Press the button again anytime to turn them back on."
            ].join("\n"),
            ephemeral: true
        });
    }

    await subscribeToCampaignDMs(
        interaction.client,
        interaction.guild.id,
        interaction.user.id
    );

    let dmWorked = true;

    await interaction.user.send({
        content: [
            "## 🔔 United Clips Campaign DMs Enabled",
            "",
            `You will now receive a private message whenever a new campaign is created in **${interaction.guild.name}**.`,
            "",
            "You can disable notifications by pressing the notification button again."
        ].join("\n")
    }).catch(() => {
        dmWorked = false;
    });

    return interaction.reply({
        content: dmWorked
            ? [
                  "✅ **Campaign DMs enabled.**",
                  "",
                  "You will now receive a private message whenever a new campaign is created.",
                  "",
                  "I sent you a confirmation DM."
              ].join("\n")
            : [
                  "✅ **Campaign notifications enabled.**",
                  "",
                  "However, Discord blocked my confirmation DM.",
                  "",
                  "Enable **Direct Messages** for this server so future campaign notifications can reach you."
              ].join("\n"),
        ephemeral: true
    });
}
async function handleJoin(interaction, campaign) {
    if (campaign.status !== "Active") {
        return interaction.editReply({
            content: "❌ This campaign is no longer active.",
        });
    }

    if (!Array.isArray(campaign.members)) {
        campaign.members = [];
    }

    await interaction.member.fetch();

    const alreadySaved =
        campaign.members.includes(interaction.user.id);

    const alreadyHasRole =
        campaign.role &&
        interaction.member.roles.cache.has(campaign.role);

    if (alreadySaved && alreadyHasRole) {
        return interaction.editReply({
            content: `❌ You are already in **${campaign.name}**.`,
        });
    }

    try {
        // Creates or finds the campaign role.
        const role = await ensureCampaignRole(
            interaction,
            campaign
        );

        if (!role) {
            return interaction.editReply({
                content:
                    "❌ I could not create or find the campaign role."
            });
        }

        if (!role.editable) {
            return interaction.editReply({
                content: [
                    "❌ I cannot assign the campaign role.",
                    "",
                    "Move the bot role above the campaign role in **Server Settings → Roles** and enable **Manage Roles**."
                ].join("\n")
            });
        }

        // Creates or finds the private campaign workspace.
        const category = await ensureCampaignWorkspace(
            interaction,
            campaign
        );

        if (!category) {
            return interaction.editReply({
                content:
                    "❌ I could not create or find the campaign workspace."
            });
        }

        /*
         * Remove the personal ViewChannel deny that was added
         * when this member previously left the campaign.
         */
        await category.permissionOverwrites
            .delete(interaction.user.id)
            .catch(error => {
                console.error(
                    "Failed to remove old campaign permission deny:",
                    error
                );
            });

        /*
         * Some child channels may have their own personal overwrite.
         * Remove those too so rejoining always restores access.
         */
        const workspaceChannels =
            interaction.guild.channels.cache.filter(
                channel =>
                    channel.parentId === category.id
            );

        for (const channel of workspaceChannels.values()) {
            await channel.permissionOverwrites
                .delete(interaction.user.id)
                .catch(() => null);
        }

        // Automatically give the campaign role.
        await interaction.member.roles.add(
            role,
            `Joined campaign: ${campaign.name}`
        );

        // Refresh the member and verify Discord applied the role.
        await interaction.member.fetch();

        if (!interaction.member.roles.cache.has(role.id)) {
            return interaction.editReply({
                content: [
                    "❌ Discord did not apply the campaign role.",
                    "",
                    "Make sure the bot has **Manage Roles** and its role is above the campaign role."
                ].join("\n")
            });
        }

        if (!campaign.members.includes(interaction.user.id)) {
            campaign.members.push(interaction.user.id);
        }

        await joinMember(
            interaction.client,
            campaign.id,
            interaction.user.id,
            {
                campaignId: campaign.id,
                userId: interaction.user.id,
                username: interaction.user.username,
                displayName: interaction.member.displayName,
            }
        );

        await saveCampaign(
            interaction.client,
            campaign.id,
            campaign
        );

        await updatePublicCampaignMessage(
            interaction,
            campaign
        ).catch(error => {
            console.error(
                "Failed to update public campaign message:",
                error
            );
        });

        const firstChannel = findFirstWorkspaceChannel(
            interaction,
            category.id
        );

        const joinEmbed = new EmbedBuilder()
            .setColor("#57F287")
            .setTitle("✅ Campaign Joined")
            .setDescription(
                [
                    `You successfully joined **${campaign.name}**.`,
                    "",
                    `The **${role.name}** role was automatically added.`,
                    "Your private campaign workspace is now unlocked.",
                    "",
                    "Review the rules before submitting content."
                ].join("\n")
            )
            .addFields(
                {
                    name: "Platform",
                    value: String(
                        campaign.platform || "TikTok"
                    ),
                    inline: true
                },
                {
                    name: "CPM",
                    value: String(campaign.cpm),
                    inline: true
                },
                {
                    name: "Deadline",
                    value: String(campaign.deadline),
                    inline: true
                }
            )
            .setTimestamp();

        const components = [];

        if (firstChannel) {
            components.push(
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setLabel(
                            "Open Campaign Workspace"
                        )
                        .setEmoji("↗️")
                        .setStyle(ButtonStyle.Link)
                        .setURL(
                            `https://discord.com/channels/${interaction.guild.id}/${firstChannel.id}`
                        )
                )
            );
        }

        return interaction.editReply({
            embeds: [joinEmbed],
            components
        });
    } catch (error) {
    console.error("========== CAMPAIGN JOIN ERROR ==========");
    console.error(error);
    console.error(error?.stack);
    console.error("Campaign ID:", campaign?.id);
    console.error("Campaign name:", campaign?.name);
    console.error("Campaign role:", campaign?.role);
    console.error("Campaign category:", campaign?.category);
    console.error("=========================================");

    const errorMessage =
        error?.rawError?.message ||
        error?.message ||
        String(error);

    return interaction.editReply({
        content: [
            "❌ **Campaign join failed.**",
            "",
            "```",
            errorMessage.slice(0, 1500),
            "```",
            "",
            "Send me a screenshot of this exact error."
        ].join("\n")
    });
}
}

async function handleLeave(interaction, campaign) {
    try {
        await interaction.member.fetch();

        if (!Array.isArray(campaign.members)) {
            campaign.members = [];
        }

        const savedMember = await getMember(
            interaction.client,
            campaign.id,
            interaction.user.id
        ).catch(() => null);

        let role = null;

        if (campaign.role) {
            role =
                interaction.guild.roles.cache.get(
                    campaign.role
                ) ||
                (await interaction.guild.roles
                    .fetch(campaign.role)
                    .catch(() => null));
        }

        if (!role) {
            role = interaction.guild.roles.cache.find(
                guildRole =>
                    guildRole.name ===
                    `${campaign.emoji || "🎬"} ${campaign.name}`
            );
        }

        const hasRole =
            role &&
            interaction.member.roles.cache.has(role.id);

        const isInMembers =
            campaign.members.includes(
                interaction.user.id
            );

        if ((!savedMember || savedMember.active === false) && !hasRole && !isInMembers) {
            return interaction.editReply({
                content:
                    `❌ You are not currently in **${campaign.name}**.`
            });
        }

        if (role && hasRole) {
            if (!role.editable) {
                return interaction.editReply({
                    content: [
                        "❌ I cannot remove the campaign role.",
                        "",
                        "Move the bot role above the campaign role and enable **Manage Roles**."
                    ].join("\n")
                });
            }

            await interaction.member.roles.remove(
                role,
                `Left campaign: ${campaign.name}`
            );

            await interaction.member.fetch();

            if (
                interaction.member.roles.cache.has(
                    role.id
                )
            ) {
                return interaction.editReply({
                    content:
                        "❌ Discord did not remove the campaign role."
                });
            }
        }

        campaign.members = campaign.members.filter(
            memberId =>
                memberId !== interaction.user.id
        );

        await leaveMember(
            interaction.client,
            campaign.id,
            interaction.user.id
        );

        const category = campaign.category
            ? interaction.guild.channels.cache.get(
                  campaign.category
              ) ||
              (await interaction.guild.channels
                  .fetch(campaign.category)
                  .catch(() => null))
            : null;

        if (
            category &&
            category.type === ChannelType.GuildCategory
        ) {
            await category.permissionOverwrites.edit(
                interaction.user.id,
                {
                    ViewChannel: false
                },
                {
                    reason:
                        `Left campaign: ${campaign.name}`
                }
            );

            const workspaceChannels =
                interaction.guild.channels.cache.filter(
                    channel =>
                        channel.parentId === category.id
                );

            for (
                const channel
                of workspaceChannels.values()
            ) {
                await channel.permissionOverwrites.edit(
                    interaction.user.id,
                    {
                        ViewChannel: false
                    }
                ).catch(() => null);
            }
        }

        await saveCampaign(
            interaction.client,
            campaign.id,
            campaign
        );

        return interaction.editReply({
            content: [
                `✅ You left **${campaign.name}**.`,
                "",
                "Your campaign role and workspace access were removed."
            ].join("\n"),
            embeds: [],
            components: []
        });
    } catch (error) {
        console.error(
            `Campaign leave failed for ${campaign.id}:`,
            error
        );

        return interaction.editReply({
            content: [
                "❌ Leaving the campaign failed.",
                "",
                "Check the Railway logs for the exact error."
            ].join("\n")
        });
    }
}
async function handleStatus(interaction, campaign) {
    await interaction.deferReply({ ephemeral: true });
    const stats = await getSubmissionStats(interaction.client, interaction.guild.id, campaign.id);
    const tracked = await getTrackedStats(interaction.client, interaction.guild.id, campaign.id);
    campaign = {
        ...campaign, submissions: stats.submitted, approvedSubmissions: stats.approved,
        pendingSubmissions: stats.pending, rejectedSubmissions: stats.rejected
    };
    const numericBudget = moneyNumber(campaign.budget);
    const numericPaid = moneyNumber(campaign.paid);

    const remainingBudget = Math.max(
        0,
        numericBudget - numericPaid
    );

    const statusEmbed = new EmbedBuilder()
        .setColor(
            campaign.status === "Active"
                ? "#57F287"
                : "#747F8D"
        )
        .setTitle(`📊 ${campaign.name} Details`)
        .setDescription(
            "Submission counts come from the database. Views and payouts show the latest recorded totals."
        )
        .addFields(
            {
                name: "💰 Budget Remaining",
                value: `$${remainingBudget.toLocaleString(
                    "en-US",
                    {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                    }
                )}`,
                inline: true
            },
            {
                name: "📈 CPM",
                value: String(campaign.cpm),
                inline: true
            },
            {
                name: "👥 Members",
                value: String(memberCount(campaign)),
                inline: true
            },
            {
                name: "📤 Submissions",
                value: String(
                    campaign.submissions || 0
                ),
                inline: true
            },
            {
                name: "✅ Approved",
                value: String(
                    campaign.approvedSubmissions || 0
                ),
                inline: true
            },
            {
                name: "⏳ Pending",
                value: String(
                    campaign.pendingSubmissions || 0
                ),
                inline: true
            },
            {
                name: "❌ Rejected",
                value: String(
                    campaign.rejectedSubmissions || 0
                ),
                inline: true
            },
            {
                name: "👀 Total Views",
                value: Number(
                    tracked.views
                ).toLocaleString("en-US"),
                inline: true
            },
            {
                name: "💸 Paid Out",
                value: `$${numericPaid.toLocaleString(
                    "en-US",
                    {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                    }
                )}`,
                inline: true
            },
            {
                name: "Status",
                value:
                    campaign.status === "Active"
                        ? "🟢 Active"
                        : "⚫ Closed",
                inline: true
            },
            {
                name: "📅 Deadline",
                value: String(campaign.deadline),
                inline: true
            },
            {
                name: "🏷️ Client",
                value: String(campaign.client),
                inline: true
            }
        )
        .setFooter({
            text: "United Clips • Latest recorded campaign details"
        })
        .setTimestamp();

    return interaction.editReply({
        embeds: [statusEmbed],
    });
}
async function handleMyStats(interaction, campaign) {
    await interaction.deferReply({
        ephemeral: true
    });

    const member = await getMember(
        interaction.client,
        campaign.id,
        interaction.user.id
    );

    if (!member) {
        return interaction.editReply({
            content:
                "❌ You haven't joined this campaign yet."
        });
    }

    const pool =
    interaction.client?.db?.db?.pool ||
    interaction.client?.db?.pool ||
    interaction.client?.pool;

if (!pool || typeof pool.query !== "function") {
    return interaction.editReply({
        content:
            "❌ The submission database is unavailable."
    });
}

const stats = await getSubmissionStats(
    interaction.client, interaction.guild.id, campaign.id, interaction.user.id
);

const submitted = Number(
    stats.submitted || 0
);

const approved = Number(
    stats.approved || 0
);

const pending = Number(
    stats.pending || 0
);

const rejected = Number(
    stats.rejected || 0
);

const tracked = await getTrackedStats(interaction.client, interaction.guild.id, campaign.id, interaction.user.id);
const approvedViews = tracked.views;

const embed = new EmbedBuilder()
    .setColor("#5865F2")
    .setTitle(
        `📊 My Stats — ${campaign.name}`
    )
    .addFields(
        {
            name: "📤 Submitted Clips",
            value: String(submitted),
            inline: true
        },
        {
            name: "✅ Approved",
            value: String(approved),
            inline: true
        },
        {
            name: "⏳ Pending",
            value: String(pending),
            inline: true
        },
        {
            name: "❌ Rejected",
            value: String(rejected),
            inline: true
        },
        {
            name: "👀 Approved Views",
            value:
                approvedViews.toLocaleString(
                    "en-US"
                ),
            inline: true
        },
        {
            name: "💵 Estimated Earnings",
            value: campaign.trackingTerms ? `$${tracked.estimated.toFixed(2)}` : 'Awaiting staff calculation terms',
            inline: true
        }
    )
    .setFooter({
        text:
            tracked.checkedAt ? `View counts checked ${new Date(tracked.checkedAt).toISOString()}` : 'No successful video view checks yet'
    })
    .setTimestamp();

return interaction.editReply({
    embeds: [embed]
});
}
export default {
    data: new SlashCommandBuilder()
        .setName("campaign")
        .setDescription("Create and manage campaigns")
        .setDMPermission(false)
        .addSubcommand(subcommand =>
            subcommand
                .setName("create")
                .setDescription(
                    "Create a new clipping campaign"
                )
                .addAttachmentOption(option =>
                    option
                        .setName("audio_file")
                        .setDescription(
                            "Upload the campaign audio file"
                        )
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option
                        .setName("audio_link")
                        .setDescription(
                            "Paste the TikTok audio link"
                        )
                        .setMaxLength(1000)
                        .setRequired(false)
                )
                .addBooleanOption(option => option.setName('notify_members').setDescription('Send alerts to subscribed creators (default: true)'))
        )
        .addSubcommand(subcommand => subcommand.setName('organize').setDescription('Organize the United Clips channel names and layout'))
        .addSubcommand(subcommand => subcommand.setName('review').setDescription('Recover a saved submission panel in its private staff channel')
            .addIntegerOption(option => option.setName('submission').setDescription('Submission ID to recover').setMinValue(1).setRequired(true)))
        .addSubcommand(subcommand => subcommand.setName('browse').setDescription('Browse active campaigns in this server'))
        .addSubcommand(subcommand => subcommand.setName('submissions').setDescription('View your own recent submissions and review decisions'))
        .addSubcommand(subcommand => subcommand.setName('panel').setDescription('Publish the creator hub in this channel'))
        .addSubcommand(subcommand => subcommand.setName('close').setDescription('Close joins and submissions while preserving history')
            .addChannelOption(option => option.setName('channel').setDescription('Public campaign brief channel').addChannelTypes(ChannelType.GuildText).setRequired(true)))
        .addSubcommand(sub => sub.setName('tracking').setDescription('Configure TikTok view tracking within the $5 monthly cap')
            .addBooleanOption(o=>o.setName('enabled').setDescription('Enable or disable TikTok view tracking'))
            .addIntegerOption(o=>o.setName('interval').setDescription('Target refresh interval in minutes; slows to preserve budget').setMinValue(5).setMaxValue(120)))
        .addSubcommand(sub => sub.setName('terms').setDescription('Set reviewed calculation terms from the published campaign brief')
            .addChannelOption(o=>o.setName('channel').setDescription('Public campaign brief channel').addChannelTypes(ChannelType.GuildText).setRequired(true))
            .addNumberOption(o=>o.setName('cpm').setDescription('Published USD rate per 1,000 views').setMinValue(0).setMaxValue(10000).setRequired(true))
            .addIntegerOption(o=>o.setName('minimum_views').setDescription('Published minimum views per clip (0 if none)').setMinValue(0).setRequired(true))
            .addNumberOption(o=>o.setName('maximum_per_clip').setDescription('Published maximum USD payout per clip; omit if none').setMinValue(0).setMaxValue(9999999999.99))),

    async execute(interaction) {
        const subcommand =
            interaction.options.getSubcommand();

        if (subcommand === 'browse') return browseCampaigns(interaction);
        if (subcommand === 'submissions') return showMySubmissions(interaction);

        if (
            !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) && !interaction.member.roles.cache.has(
                STAFF_ROLE_ID
            )
        ) {
            return interaction.reply({
                content:
                    "❌ Only staff can manage campaigns.",
                ephemeral: true
            });
        }

        if (subcommand === 'organize') return organizeUnitedClips(interaction);
        if (subcommand === 'review') return recoverSubmissionPanel(interaction);
        if (subcommand === 'panel') return publishCreatorPanel(interaction);
        if (subcommand === 'close') return closeCampaign(interaction);
        if (subcommand === 'tracking') return manageTracking(interaction);
        if (subcommand === 'terms') return setTrackingTerms(interaction);
        if (subcommand !== 'create') return;

        const audioFile =
            interaction.options.getAttachment(
                "audio_file"
            );

        const audioLink =
            interaction.options.getString(
                "audio_link"
            );

        const draftKey =
            `${interaction.guild.id}:${interaction.user.id}`;

        interaction.client.campaignDrafts ??=
            new Map();

        interaction.client.campaignDrafts.set(
            draftKey,
            {
                audioFile: audioFile
                    ? {
                          url: audioFile.url,
                          name: audioFile.name,
                          contentType:
                              audioFile.contentType,
                          size: audioFile.size
                      }
                    : null,

                audioLink:
                    audioLink?.trim() || null,

                notifyMembers: interaction.options.getBoolean('notify_members') !== false,

                createdAt: Date.now()
            }
        );

        const modal =
            new ModalBuilder()
                .setCustomId(
                    "campaign_create_modal"
                )
                .setTitle("Create Campaign");

        const campaignNameInput =
    new TextInputBuilder()
        .setCustomId("campaign_name")
        .setLabel("Campaign Name")
        .setPlaceholder("Example: Zemi - Mira")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(100);

const campaignClientInput =
    new TextInputBuilder()
        .setCustomId("campaign_client")
        .setLabel("Client")
        .setPlaceholder("Example: Zemi")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(100);

const campaignInfoInput =
    new TextInputBuilder()
        .setCustomId("campaign_info")
        .setLabel("Campaign Information")
        .setPlaceholder(
            "Paste CPM, pot, minimum views, end date and platform"
        )
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(2000);

const campaignBriefInput =
    new TextInputBuilder()
        .setCustomId("campaign_brief")
        .setLabel("Campaign Brief")
        .setPlaceholder(
            "Example: Open brief edits, sports highlights allowed."
        )
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(2000);

const campaignDescriptionInput =
    new TextInputBuilder()
        .setCustomId("campaign_description")
        .setLabel("Campaign Description")
        .setPlaceholder(
            "Example: Get paid to post Zemi - Mira edits on TikTok."
        )
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(1000);

modal.addComponents(
    new ActionRowBuilder().addComponents(
        campaignNameInput
    ),
    new ActionRowBuilder().addComponents(
        campaignClientInput
    ),
    new ActionRowBuilder().addComponents(
        campaignInfoInput
    ),
    new ActionRowBuilder().addComponents(
        campaignBriefInput
    ),
    new ActionRowBuilder().addComponents(
        campaignDescriptionInput
    )
);

try {
    return await interaction.showModal(modal);
} catch (error) {
    console.error("CAMPAIGN MODAL OPEN FAILED:");
    console.error(error);
    console.error(error?.stack);

    if (!interaction.replied && !interaction.deferred) {
        return interaction.reply({
            content:
                "❌ The campaign modal could not open. Check the Railway logs.",
            ephemeral: true
        });
    }
}
    },

    async button(interaction) {
       const parts = interaction.customId.split("_");

        const prefix = parts[0];
        const action = parts[1];
        const id = parts.slice(2).join("_");

        if (prefix !== "campaign" || !action || !id) {
            return interaction.reply({
                content: "❌ Invalid campaign button.",
                ephemeral: true
            });
        }

        if (id === 'all' && action === 'browse') return browseCampaigns(interaction);
        if (id === 'all' && action === 'submissions') return showMySubmissions(interaction);

        if (action === 'join' || action === 'leave') {
            await interaction.deferReply({ ephemeral: true });
            return withCampaignLock(interaction.client, id, async () => {
                const latest = await getCampaign(interaction.client, id);
                if (!latest || !await campaignBelongsToGuild(interaction, latest)) {
                    return interaction.editReply({ content: 'This campaign is not available in this server.' });
                }
                return action === 'join' ? handleJoin(interaction, latest) : handleLeave(interaction, latest);
            });
        }

        const campaign = await getCampaign(
            interaction.client,
            id
        );

        if (!campaign) {
            return interaction.reply({
                content: "❌ Campaign not found.",
                ephemeral: true
            });
        }

        if (!await campaignBelongsToGuild(interaction, campaign)) {
            return interaction.reply({ content: 'This campaign is not available in this server.', ephemeral: true });
        }

        if (!Array.isArray(campaign.members)) {
            campaign.members = [];
        }

if (action === "status") {
    return handleStatus(
        interaction,
        campaign
    );
}

        if (action === "notify") {
    return handleNotificationToggle(
        interaction,
        campaign
    );
}
        if (action === "mystats") {
            return handleMyStats(
                interaction,
                campaign
            );
        }

        return interaction.reply({
            content: "❌ Unknown campaign action.",
            ephemeral: true
        });
    }
};
