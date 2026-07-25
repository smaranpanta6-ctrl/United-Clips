import {
    SlashCommandBuilder,
    ChannelType,
    PermissionFlagsBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
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

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function cleanChannelName(name) {
    return String(name)
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80);
}

function buildCampaignEmbed(campaign) {
    const members = Array.isArray(campaign.members)
        ? campaign.members.length
        : 0;

    const emoji = campaign.emoji || "🎬";

    return new EmbedBuilder()
        .setColor(
            campaign.status === "Active"
                ? "#57F287"
                : "#747F8D"
        )
        .setTitle(
            `${emoji} ${campaign.name}`
        )
        .setDescription(
            campaign.description ||
                "Join this campaign to begin earning."
        )
        .addFields(
            {
                name: "📋 Campaign",
                value: [
                    `**Client:** ${campaign.client}`,
                    `**Platform:** ${
                        campaign.platform || "TikTok"
                    }`,
                    `**Deadline:** ${campaign.deadline}`
                ].join("\n"),
                inline: false
            },
            {
                name: "💸 Payment",
                value: [
                    `**Budget:** ${campaign.budget}`,
                    `**CPM:** ${campaign.cpm}`
                ].join("\n"),
                inline: true
            },
            {
                name: "📊 Status",
                value: [
                    `**Members:** ${members}`,
                    `**Status:** ${
                        campaign.status === "Active"
                            ? "🟢 Active"
                            : "⚫ Closed"
                    }`
                ].join("\n"),
                inline: true
            }
        )
        .setFooter({
            text: "Join below to unlock the private campaign workspace."
        })
        .setTimestamp();
}

function buildCampaignButtons(campaign) {
    const isClosed = campaign.status !== "Active";

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
            .setLabel("View Details")
            .setEmoji("📊")
            .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
            .setCustomId(
                `campaign_leave_${campaign.id}`
            )
            .setLabel("Leave")
            .setEmoji("↩️")
            .setStyle(ButtonStyle.Secondary)
    );
}

function buildWorkspaceEmbed(campaign) {
    const emoji = campaign.emoji || "🎬";

    return new EmbedBuilder()
        .setColor("#57F287")
        .setTitle(
            `${emoji} ${campaign.name} Workspace`
        )
        .setDescription(
            [
                `Manage your clips for **${campaign.name}** using the buttons below.`,
                "",
                "### 📤 Submit Clip",
                "Submit your video link for staff review.",
                "",
                "### 📊 My Stats",
                "View campaign totals, members, submissions, views, and payout information.",
                "",
                "### ↩️ Leave Campaign",
                "Remove your campaign role and workspace access."
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
        .setFooter({
            text: "United Clips • Campaign Workspace"
        })
        .setTimestamp();
}

function buildWorkspaceButtons(campaign) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(
                `submit_clip:${campaign.id}`
            )
            .setLabel("Submit Clip")
            .setEmoji("📤")
            .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
            .setCustomId(
                `campaign_status_${campaign.id}`
            )
            .setLabel("My Stats")
            .setEmoji("📊")
            .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
            .setCustomId(
                `campaign_leave_${campaign.id}`
            )
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

/*
|--------------------------------------------------------------------------
| PUBLIC CAMPAIGN MESSAGE
|--------------------------------------------------------------------------
*/

async function findPublicCampaignMessage(
    interaction,
    campaign
) {
    const channel =
        interaction.guild.channels.cache.get(
            campaign.channel
        );

    if (!channel || !channel.isTextBased()) {
        return null;
    }

    const messages = await channel.messages.fetch({
        limit: 25
    });

    return (
        messages.find(message =>
            message.author.id ===
                interaction.client.user.id &&
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
    const message =
        await findPublicCampaignMessage(
            interaction,
            campaign
        );

    if (!message) {
        return;
    }

    await message.edit({
        content: null,
        embeds: [
            buildCampaignEmbed(campaign)
        ],
        components: [
            buildCampaignButtons(campaign)
        ]
    });
}

/*
|--------------------------------------------------------------------------
| CAMPAIGN ROLE
|--------------------------------------------------------------------------
*/

async function ensureCampaignRole(
    interaction,
    campaign
) {
    let role = campaign.role
        ? interaction.guild.roles.cache.get(
              campaign.role
          )
        : null;

    if (role) {
        return role;
    }

    role =
        await interaction.guild.roles.create({
            name: `${
                campaign.emoji || "🎬"
            } ${campaign.name}`.slice(0, 100),
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

/*
|--------------------------------------------------------------------------
| PRIVATE CAMPAIGN WORKSPACE
|--------------------------------------------------------------------------
*/

async function createCampaignWorkspace(
    interaction,
    campaign
) {
    const role =
        interaction.guild.roles.cache.get(
            campaign.role
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
        }
    ];

    if (role) {
        permissionOverwrites.push({
            id: role.id,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory
            ]
        });
    }

    const category =
        await interaction.guild.channels.create({
            name: `${
                campaign.emoji || "🎬"
            } ${campaign.name}`
                .toUpperCase()
                .slice(0, 100),
            type: ChannelType.GuildCategory,
            permissionOverwrites
        });

    campaign.category = category.id;

    let submitChannel = null;

    for (const channelName of CAMPAIGN_CHANNEL_NAMES) {
        const channel =
            await interaction.guild.channels.create({
                name: channelName,
                type: ChannelType.GuildText,
                parent: category.id,
                permissionOverwrites
            });

        if (channelName === "📤-submit") {
            submitChannel = channel;
        }
    }

    if (submitChannel) {
        const panel =
            await submitChannel.send({
                embeds: [
                    buildWorkspaceEmbed(campaign)
                ],
                components: [
                    buildWorkspaceButtons(campaign)
                ]
            });

        await panel.pin().catch(() => null);

        campaign.submitChannel =
            submitChannel.id;

        campaign.workspacePanel =
            panel.id;
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
        ? interaction.guild.channels.cache.get(
              campaign.category
          )
        : null;

    if (
        category &&
        category.type ===
            ChannelType.GuildCategory
    ) {
        return category;
    }

    await ensureCampaignRole(
        interaction,
        campaign
    );

    category =
        await createCampaignWorkspace(
            interaction,
            campaign
        );

    return category;
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
                    item.type ===
                        ChannelType.GuildText &&
                    item.name === name
            );

        if (channel) {
            return channel;
        }
    }

    return (
        interaction.guild.channels.cache.find(
            item =>
                item.parentId === categoryId &&
                item.type ===
                    ChannelType.GuildText
        ) || null
    );
}

/*
|--------------------------------------------------------------------------
| BUTTON ACTIONS
|--------------------------------------------------------------------------
*/

async function handleJoin(
    interaction,
    campaign
) {
    if (campaign.status !== "Active") {
        return interaction.reply({
            content:
                "❌ This campaign is no longer active.",
            ephemeral: true
        });
    }

    if (!Array.isArray(campaign.members)) {
        campaign.members = [];
    }

    if (
        campaign.members.includes(
            interaction.user.id
        )
    ) {
        return interaction.reply({
            content:
                "❌ You are already in this campaign.",
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

    const category =
        await ensureCampaignWorkspace(
            interaction,
            campaign
        );

    await interaction.member.roles.add(
        role,
        `Joined campaign: ${campaign.name}`
    );

    campaign.members.push(
        interaction.user.id
    );

    await saveMember(
        interaction.client,
        campaign.id,
        interaction.user.id,
        {
            campaignId: campaign.id,
            userId: interaction.user.id,
            username:
                interaction.user.username,
            displayName:
                interaction.member.displayName,
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

    const firstChannel =
        findFirstWorkspaceChannel(
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
                "Your private campaign workspace is now unlocked.",
                "Review the rules before submitting content."
            ].join("\n")
        )
        .addFields(
            {
                name: "Platform",
                value: String(
                    campaign.platform ||
                        "TikTok"
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
                value: String(
                    campaign.deadline
                ),
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
}

async function handleLeave(
    interaction,
    campaign
) {
    if (!Array.isArray(campaign.members)) {
        campaign.members = [];
    }

    if (
        !campaign.members.includes(
            interaction.user.id
        )
    ) {
        return interaction.reply({
            content: `❌ You are not currently in **${campaign.name}**.`,
            ephemeral: true
        });
    }

    await interaction.deferReply({
        ephemeral: true
    });

    campaign.members =
        campaign.members.filter(
            memberId =>
                memberId !==
                interaction.user.id
        );

    await deleteMember(
        interaction.client,
        campaign.id,
        interaction.user.id
    );

    const role = campaign.role
        ? interaction.guild.roles.cache.get(
              campaign.role
          )
        : null;

    if (role) {
        await interaction.member.roles
            .remove(
                role,
                `Left campaign: ${campaign.name}`
            )
            .catch(() => null);
    }

    /*
     * The workspace is NOT deleted when the
     * last member leaves. It stays ready for
     * future members.
     */

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
        embeds: [
            buildLeaveEmbed(campaign)
        ],
        components: []
    });
}

async function handleStatus(
    interaction,
    campaign
) {
    const numericBudget =
        Number(
            String(campaign.budget)
                .replace(/[$,]/g, "")
                .trim()
        ) || 0;

    const numericPaid =
        Number(
            String(campaign.paid || 0)
                .replace(/[$,]/g, "")
                .trim()
        ) || 0;

    const remainingBudget = Math.max(
        0,
        numericBudget - numericPaid
    );

    const members = Array.isArray(
        campaign.members
    )
        ? campaign.members.length
        : 0;

    const statusEmbed =
        new EmbedBuilder()
            .setColor(
                campaign.status === "Active"
                    ? "#57F287"
                    : "#747F8D"
            )
            .setTitle(
                `📊 ${campaign.name} Overview`
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
                    value: String(members),
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
                    name: "👀 Total Views",
                    value: Number(
                        campaign.views || 0
                    ).toLocaleString(
                        "en-US"
                    ),
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
                        campaign.status ===
                        "Active"
                            ? "🟢 Active"
                            : "⚫ Closed",
                    inline: true
                },
                {
                    name: "📅 Deadline",
                    value: String(
                        campaign.deadline
                    ),
                    inline: true
                },
                {
                    name: "🏷️ Client",
                    value: String(
                        campaign.client
                    ),
                    inline: true
                }
            )
            .setTimestamp();

    return interaction.reply({
        embeds: [statusEmbed],
        ephemeral: true
    });
}

/*
|--------------------------------------------------------------------------
| COMMAND
|--------------------------------------------------------------------------
*/

export default {
    data: new SlashCommandBuilder()
        .setName("campaign")
        .setDescription(
            "Create and manage campaigns"
        )
        .setDMPermission(false)
        .addSubcommand(subcommand =>
            subcommand
                .setName("create")
                .setDescription(
                    "Create a new campaign"
                )

                .addStringOption(option =>
                    option
                        .setName("name")
                        .setDescription(
                            "Campaign name"
                        )
                        .setRequired(true)
                )

                .addStringOption(option =>
                    option
                        .setName("client")
                        .setDescription(
                            "Client or campaign label"
                        )
                        .setRequired(true)
                )

                .addStringOption(option =>
                    option
                        .setName("budget")
                        .setDescription(
                            "Budget, for example $3,200"
                        )
                        .setRequired(true)
                )

                .addStringOption(option =>
                    option
                        .setName("cpm")
                        .setDescription(
                            "CPM, for example $1.00"
                        )
                        .setRequired(true)
                )

                .addStringOption(option =>
                    option
                        .setName("deadline")
                        .setDescription(
                            "Campaign deadline"
                        )
                        .setRequired(true)
                )

                .addStringOption(option =>
                    option
                        .setName("description")
                        .setDescription(
                            "Campaign description"
                        )
                        .setRequired(true)
                )

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
                        .setDescription(
                            "Content platform"
                        )
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
                                value: "TikTok, Instagram, YouTube"
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
                content:
                    "❌ Only staff can create campaigns.",
                ephemeral: true
            });
        }

        await interaction.deferReply({
            ephemeral: true
        });

        try {
            const activeCategory =
                await interaction.guild.channels.fetch(
                    ACTIVE_CATEGORY_ID
                );

            if (
                !activeCategory ||
                activeCategory.type !==
                    ChannelType.GuildCategory
            ) {
                return interaction.editReply({
                    content:
                        "❌ ACTIVE_CATEGORY_ID is not a valid category."
                });
            }

            const emoji =
                interaction.options.getString(
                    "emoji"
                ) || "🎬";

            const data = {
                name:
                    interaction.options.getString(
                        "name",
                        true
                    ),
                client:
                    interaction.options.getString(
                        "client",
                        true
                    ),
                budget:
                    interaction.options.getString(
                        "budget",
                        true
                    ),
                cpm:
                    interaction.options.getString(
                        "cpm",
                        true
                    ),
                deadline:
                    interaction.options.getString(
                        "deadline",
                        true
                    ),
                description:
                    interaction.options.getString(
                        "description",
                        true
                    ),
                emoji,
                platform:
                    interaction.options.getString(
                        "platform"
                    ) || "TikTok"
            };

            const id = Date.now().toString();

            const cleanName =
                cleanChannelName(data.name) ||
                `campaign-${id.slice(-6)}`;

            const campaignChannel =
                await interaction.guild.channels.create({
                    name: `${emoji}-${cleanName}`.slice(
                        0,
                        100
                    ),
                    type: ChannelType.GuildText,
                    parent: activeCategory.id
                });

            const campaign = {
                id,
                ...data,
                channel: campaignChannel.id,
                category: null,
                submitChannel: null,
                workspacePanel: null,
                role: null,
                members: [],
                submissions: 0,
                views: 0,
                paid: 0,
                status: "Active"
            };

            await saveCampaign(
                interaction.client,
                id,
                campaign
            );

            /*
             * Create the role and private
             * workspace immediately.
             */
            await ensureCampaignRole(
                interaction,
                campaign
            );

            await createCampaignWorkspace(
                interaction,
                campaign
            );

            await campaignChannel.send({
                embeds: [
                    buildCampaignEmbed(campaign)
                ],
                components: [
                    buildCampaignButtons(campaign)
                ]
            });

            return interaction.editReply({
                content: [
                    "✅ Campaign created successfully.",
                    "",
                    `**Public campaign:** ${campaignChannel}`,
                    `**Private workspace:** <#${campaign.submitChannel}>`
                ].join("\n")
            });
        } catch (error) {
            console.error(
                "Campaign creation failed:",
                error
            );

            return interaction.editReply({
                content:
                    "❌ The campaign could not be created. Check Railway logs for the exact error."
            });
        }
    },

    async button(interaction) {
        const parts =
            interaction.customId.split("_");

        const prefix = parts[0];
        const action = parts[1];
        const id = parts
            .slice(2)
            .join("_");

        if (
            prefix !== "campaign" ||
            !action ||
            !id
        ) {
            return interaction.reply({
                content:
                    "❌ Invalid campaign button.",
                ephemeral: true
            });
        }

        const campaign = await getCampaign(
            interaction.client,
            id
        );

        if (!campaign) {
            return interaction.reply({
                content:
                    "❌ Campaign not found.",
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

        return interaction.reply({
            content:
                "❌ Unknown campaign action.",
            ephemeral: true
        });
    }
};
