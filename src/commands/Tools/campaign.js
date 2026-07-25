import {
    SlashCommandBuilder,
    ChannelType,
    PermissionFlagsBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} from "discord.js";

import {
    saveMember,
    deleteMember
} from "../../utils/campaignMembers.js";

import {
    saveCampaign,
    getCampaign
} from "../../utils/database.js";

console.log("🔥 CAMPAIGN COMMAND LOADED 🔥");

const STAFF_ROLE_ID = "1529961495402778771";
const ACTIVE_CATEGORY_ID = "1529961507062812752";

const CAMPAIGN_CHANNEL_NAMES = [
    "📤-submit",
    "📢-announcements",
    "💬-chat",
    "⚠️-rules"
];

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
                "### 📊 View Live Details",
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
    const isClosed = campaign.status !== "Active";

    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`campaign_join_${campaign.id}`)
            .setLabel("Join Campaign")
            .setEmoji("🚀")
            .setStyle(ButtonStyle.Success)
            .setDisabled(isClosed),

        new ButtonBuilder()
            .setCustomId(`campaign_status_${campaign.id}`)
            .setLabel("View Live Details")
            .setEmoji("📊")
            .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
            .setCustomId(`campaign_leave_${campaign.id}`)
            .setLabel("Leave Campaign")
            .setEmoji("↩️")
            .setStyle(ButtonStyle.Danger)
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
        content: null,
        embeds: [buildCampaignEmbed(campaign)],
        components: [buildCampaignButtons(campaign)]
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
            deny: [PermissionFlagsBits.ViewChannel]
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
            name: `${campaign.emoji || "🎬"} ${campaign.name}`
                .toUpperCase()
                .slice(0, 100),
            type: ChannelType.GuildCategory,
            permissionOverwrites
        });

    campaign.category = category.id;

    let submitChannel = null;

    for (const channelName of CAMPAIGN_CHANNEL_NAMES) {
        const created =
            await interaction.guild.channels.create({
                name: channelName,
                type: ChannelType.GuildText,
                parent: category.id,
                permissionOverwrites
            });

        if (channelName === "📤-submit") {
            submitChannel = created;
        }
    }

    if (submitChannel) {
        const panel = await submitChannel.send({
            embeds: [buildWorkspaceEmbed(campaign)],
            components: [buildWorkspaceButtons(campaign)]
        });

        await panel.pin().catch(() => null);

        campaign.submitChannel = submitChannel.id;
        campaign.workspacePanel = panel.id;
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
    let category = campaign.category
        ? interaction.guild.channels.cache.get(campaign.category)
        : null;

    if (!category && campaign.category) {
        category = await interaction.guild.channels
            .fetch(campaign.category)
            .catch(() => null);
    }

    if (
        category &&
        category.type === ChannelType.GuildCategory
    ) {
        return category;
    }

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

async function handleJoin(interaction, campaign) {
    if (campaign.status !== "Active") {
        return interaction.reply({
            content: "❌ This campaign is no longer active.",
            ephemeral: true
        });
    }

    if (!Array.isArray(campaign.members)) {
        campaign.members = [];
    }

    if (campaign.members.includes(interaction.user.id)) {
        return interaction.reply({
            content: "❌ You are already in this campaign.",
            ephemeral: true
        });
    }

    await interaction.deferReply({
        ephemeral: true
    });

    const role = await ensureCampaignRole(
        interaction,
        campaign
    );

    const category = await ensureCampaignWorkspace(
        interaction,
        campaign
    );

    await interaction.member.roles.add(
        role,
        `Joined campaign: ${campaign.name}`
    );

    campaign.members.push(interaction.user.id);

    await saveMember(
        interaction.client,
        campaign.id,
        interaction.user.id,
        {
            campaignId: campaign.id,
            userId: interaction.user.id,
            username: interaction.user.username,
            displayName: interaction.member.displayName,
            verified: false,
            tiktok: null,
            clips: [],
            totalViews: 0,
            approvedViews: 0,
            pendingViews: 0,
            rejectedViews: 0,
            payout: 0,
            joinedAt: Date.now()
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
    );

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
                "Your campaign workspace is now unlocked.",
                "Review the rules before submitting content."
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
        .setTimestamp();

    const components = [];

    if (firstChannel) {
        components.push(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setLabel("Open Campaign Workspace")
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
}

async function handleLeave(interaction, campaign) {
    if (!Array.isArray(campaign.members)) {
        campaign.members = [];
    }

    const memberHasRole =
        campaign.role &&
        interaction.member.roles.cache.has(campaign.role);

    const memberIsSaved =
        campaign.members.includes(interaction.user.id);

    if (!memberIsSaved && !memberHasRole) {
        return interaction.reply({
            content: `❌ You are not currently in **${campaign.name}**.`,
            ephemeral: true
        });
    }

    await interaction.deferReply({
        ephemeral: true
    });

    campaign.members = campaign.members.filter(
        memberId => memberId !== interaction.user.id
    );

    await deleteMember(
        interaction.client,
        campaign.id,
        interaction.user.id
    ).catch(() => null);

    const role = campaign.role
        ? interaction.guild.roles.cache.get(campaign.role) ||
          (await interaction.guild.roles
              .fetch(campaign.role)
              .catch(() => null))
        : null;

    if (role) {
        await interaction.member.roles
            .remove(
                role,
                `Left campaign: ${campaign.name}`
            )
            .catch(() => null);
    }

    await saveCampaign(
        interaction.client,
        campaign.id,
        campaign
    );

    await updatePublicCampaignMessage(
        interaction,
        campaign
    );

    return interaction.editReply({
        embeds: [buildLeaveEmbed(campaign)],
        components: []
    });
}

async function handleStatus(interaction, campaign) {
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
        .setTitle(`📊 ${campaign.name} Live Details`)
        .setDescription(
            "These numbers are loaded from the latest saved campaign record."
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
                value: String(campaign.submissions || 0),
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
                    campaign.views || 0
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
            text: "United Clips • Live Campaign Details"
        })
        .setTimestamp();

    return interaction.reply({
        embeds: [statusEmbed],
        ephemeral: true
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
                .setDescription("Open the campaign creation form")
                .addStringOption(option =>
                    option
                        .setName("emoji")
                        .setDescription(
                            "Campaign emoji, for example 🎬"
                        )
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option
                        .setName("platform")
                        .setDescription("Campaign platform")
                        .setRequired(false)
                        .addChoices(
                            {
                                name: "TikTok",
                                value: "TikTok"
                            },
                            {
                                name: "Instagram",
                                value: "Instagram"
                            },
                            {
                                name: "YouTube",
                                value: "YouTube"
                            },
                            {
                                name: "Multiple Platforms",
                                value:
                                    "TikTok, Instagram, YouTube"
                            }
                        )
                )
        ),

    async execute(interaction) {
        if (
            interaction.options.getSubcommand() !==
            "create"
        ) {
            return;
        }

        if (
            !interaction.member.roles.cache.has(
                STAFF_ROLE_ID
            )
        ) {
            return interaction.reply({
                content: "❌ Only staff can create campaigns.",
                ephemeral: true
            });
        }

        const emoji =
            interaction.options.getString("emoji") ||
            "🎬";

        const platform =
            interaction.options.getString("platform") ||
            "TikTok";

        if (!interaction.client.campaignDrafts) {
            interaction.client.campaignDrafts =
                new Map();
        }

        const draftKey =
            `${interaction.guild.id}:${interaction.user.id}`;

        interaction.client.campaignDrafts.set(
            draftKey,
            {
                emoji,
                platform,
                createdAt: Date.now()
            }
        );

        const modal = new ModalBuilder()
            .setCustomId("campaign_create_modal")
            .setTitle("Create Campaign");

        const nameInput = new TextInputBuilder()
            .setCustomId("campaign_name")
            .setLabel("Campaign name")
            .setPlaceholder("Example: Dead Fresh")
            .setStyle(TextInputStyle.Short)
            .setMaxLength(80)
            .setRequired(true);

        const clientInput = new TextInputBuilder()
            .setCustomId("campaign_client")
            .setLabel("Client")
            .setPlaceholder("Example: Lil Baby")
            .setStyle(TextInputStyle.Short)
            .setMaxLength(100)
            .setRequired(true);

        const budgetInput = new TextInputBuilder()
            .setCustomId("campaign_budget")
            .setLabel("Campaign budget")
            .setPlaceholder("Example: $2,000")
            .setStyle(TextInputStyle.Short)
            .setMaxLength(30)
            .setRequired(true);

        const cpmInput = new TextInputBuilder()
            .setCustomId("campaign_cpm")
            .setLabel("CPM")
            .setPlaceholder("Example: $2.00")
            .setStyle(TextInputStyle.Short)
            .setMaxLength(30)
            .setRequired(true);

        const detailsInput = new TextInputBuilder()
            .setCustomId("campaign_details")
            .setLabel("Deadline and instructions")
            .setPlaceholder(
                "Deadline: August 5, 2026\nInstructions: Create clean edits..."
            )
            .setStyle(TextInputStyle.Paragraph)
            .setMaxLength(1000)
            .setRequired(true);

        modal.addComponents(
            new ActionRowBuilder().addComponents(nameInput),
            new ActionRowBuilder().addComponents(clientInput),
            new ActionRowBuilder().addComponents(budgetInput),
            new ActionRowBuilder().addComponents(cpmInput),
            new ActionRowBuilder().addComponents(detailsInput)
        );

        return interaction.showModal(modal);
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

        if (!Array.isArray(campaign.members)) {
            campaign.members = [];
        }

        if (action === "join") {
    return handleJoin(
        interaction,
        campaign
    );
}

if (action === "leave") {
    return handleLeave(
        interaction,
        campaign
    );
}

if (action === "status") {
    return handleStatus(
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
