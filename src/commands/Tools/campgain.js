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

function buildCampaignPost(campaign) {
    const members = Array.isArray(campaign.members)
        ? campaign.members.length
        : 0;

    return [
        `# ${campaign.name}`,
        campaign.description,
        "",
        "## 📋 Campaign Details",
        `**Client:** ${campaign.client}`,
        "**Platforms:** TikTok, Instagram, YouTube",
        `**Deadline:** ${campaign.deadline}`,
        "",
        "## 💸 Payment Details",
        `**Budget:** ${campaign.budget}`,
        `**CPM:** ${campaign.cpm}`,
        "",
        "## 🚀 Join the Campaign",
        "Join below to unlock the campaign workspace, submission channel, announcements, and chat.",
        "",
        `**Members Joined:** ${members}`,
        `**Status:** ${
            campaign.status === "Active"
                ? "🟢 Active"
                : "⚫ Closed"
        }`
    ].join("\n");
}

function buildCampaignButtons(campaign) {
    const isClosed = campaign.status !== "Active";

    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`campaign_join_${campaign.id}`)
            .setLabel("Join")
            .setEmoji("🚀")
            .setStyle(ButtonStyle.Success)
            .setDisabled(isClosed),

        new ButtonBuilder()
            .setCustomId(`campaign_status_${campaign.id}`)
            .setLabel("View Status")
            .setEmoji("📊")
            .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
            .setCustomId(`campaign_leave_${campaign.id}`)
            .setLabel("Leave")
            .setEmoji("↩️")
            .setStyle(ButtonStyle.Secondary)
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
    const channel = interaction.guild.channels.cache.get(
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
        content: buildCampaignPost(campaign),
        embeds: [],
        components: [buildCampaignButtons(campaign)]
    });
}

async function createCampaignWorkspace(
    interaction,
    campaign
) {
    const role = interaction.guild.roles.cache.get(
        campaign.role
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
                PermissionFlagsBits.ReadMessageHistory
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
            name: campaign.name.toUpperCase().slice(0, 100),
            type: ChannelType.GuildCategory,
            permissionOverwrites
        });

    campaign.category = category.id;

    for (const channelName of CAMPAIGN_CHANNEL_NAMES) {
        await interaction.guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parent: category.id,
            permissionOverwrites
        });
    }

    await saveCampaign(
        interaction.client,
        campaign.id,
        campaign
    );

    return category;
}

async function ensureCampaignRole(
    interaction,
    campaign
) {
    let role = campaign.role
        ? interaction.guild.roles.cache.get(campaign.role)
        : null;

    if (role) {
        return role;
    }

    role = await interaction.guild.roles.create({
        name: campaign.name.slice(0, 100),
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
        category.type === ChannelType.GuildCategory
    ) {
        return category;
    }

    category = await createCampaignWorkspace(
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
        "💬-chat",
        "📤-submit"
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

    return (
        interaction.guild.channels.cache.find(
            item =>
                item.parentId === categoryId &&
                item.type === ChannelType.GuildText
        ) || null
    );
}

async function deleteCampaignWorkspace(
    interaction,
    campaign
) {
    if (!campaign.category) {
        return;
    }

    const category =
        interaction.guild.channels.cache.get(
            campaign.category
        );

    if (!category) {
        campaign.category = null;
        return;
    }

    const childChannels =
        interaction.guild.channels.cache.filter(
            channel =>
                channel.parentId === category.id
        );

    for (const [, channel] of childChannels) {
        await channel.delete().catch(() => null);
    }

    await category.delete().catch(() => null);

    campaign.category = null;
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

    const category = await ensureCampaignWorkspace(
        interaction,
        campaign
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
        .setTitle("You're In")
        .setDescription(
            [
                `You successfully joined **${campaign.name}**.`,
                "",
                "Your campaign workspace has been unlocked.",
                "Review the rules and instructions before submitting content."
            ].join("\n")
        )
        .addFields(
            {
                name: "Client",
                value: String(campaign.client),
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
            text: `${interaction.guild.name} • Campaign access granted`
        })
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

    if (!campaign.members.includes(interaction.user.id)) {
        return interaction.reply({
            content: `❌ You are not currently in **${campaign.name}**.`,
            ephemeral: true
        });
    }

    await interaction.deferReply({
        ephemeral: true
    });

    campaign.members = campaign.members.filter(
        memberId =>
            memberId !== interaction.user.id
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

    if (campaign.members.length === 0) {
        await deleteCampaignWorkspace(
            interaction,
            campaign
        );
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

    const members = Array.isArray(campaign.members)
        ? campaign.members.length
        : 0;

    const statusEmbed = new EmbedBuilder()
        .setColor(
            campaign.status === "Active"
                ? "#57F287"
                : "#747F8D"
        )
        .setTitle("📊 Campaign Overview")
        .setDescription(
            `Live details for **${campaign.name}**`
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
                ).toLocaleString(),
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
            text: `${interaction.guild.name} • Live campaign status`
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
                .setDescription("Create a campaign")
                .addStringOption(option =>
                    option
                        .setName("name")
                        .setDescription("Campaign name")
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName("client")
                        .setDescription("Label or client")
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName("budget")
                        .setDescription(
                            "Campaign budget, for example $3,200"
                        )
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName("cpm")
                        .setDescription(
                            "Campaign CPM, for example $1.00"
                        )
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName("deadline")
                        .setDescription("Campaign deadline")
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

            const data = {
                name: interaction.options.getString(
                    "name",
                    true
                ),
                client: interaction.options.getString(
                    "client",
                    true
                ),
                budget: interaction.options.getString(
                    "budget",
                    true
                ),
                cpm: interaction.options.getString(
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
                    )
            };

            const id = Date.now().toString();

            const channelName = data.name
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-+|-+$/g, "")
                .slice(0, 90);

            const campaignChannel =
                await interaction.guild.channels.create({
                    name:
                        channelName ||
                        `campaign-${id.slice(-6)}`,
                    type: ChannelType.GuildText,
                    parent: activeCategory.id
                });

            const campaign = {
                id,
                ...data,
                channel: campaignChannel.id,
                category: null,
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

            await campaignChannel.send({
                content: buildCampaignPost(campaign),
                components: [
                    buildCampaignButtons(campaign)
                ]
            });

            return interaction.editReply({
                content: `✅ Campaign created: ${campaignChannel}`
            });
        } catch (error) {
            console.error(
                "Campaign creation failed:",
                error
            );

            return interaction.editReply({
                content:
                    "❌ The campaign could not be created. Check the Railway logs for the exact error."
            });
        }
    },

    async button(interaction) {
        const parts =
            interaction.customId.split("_");

        const prefix = parts[0];
        const action = parts[1];
        const id = parts.slice(2).join("_");

        if (prefix !== "campaign" || !action || !id) {
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

        return interaction.reply({
            content: "❌ Unknown campaign action.",
            ephemeral: true
        });
    }
};
