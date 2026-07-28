import {
    SlashCommandBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder
} from "discord.js";

import {
    saveMember,
    getMember,
    deleteMember
} from "../../utils/campaignMembers.js";

import {
    saveCampaign,
    getCampaign
} from "../../utils/database.js";

console.log("🔥 CAMPAIGN COMMAND LOADED 🔥");

const STAFF_ROLE_ID = "1529961495402778771";
const ACTIVE_CATEGORY_ID = "1531525611057582182";

const CAMPAIGN_CHANNEL_NAMES = [
    "📢-announcements",
    "📤-submit",
    "💬-chat",
    "⚠️-rules",
    "🛡️-staff-review"
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

   let submitChannel = null;
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
        const isStaffReview =
            channelName === "🛡️-staff-review";

        const channelPermissions =
            isStaffReview
                ? [
                      {
                          id:
                              interaction.guild.roles
                                  .everyone.id,
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
                              PermissionFlagsBits.EmbedLinks
                          ]
                      },
                      {
                          id: role.id,
                          deny: [
                              PermissionFlagsBits.ViewChannel
                          ]
                      }
                  ]
                : permissionOverwrites;

        created =
            await interaction.guild.channels.create({
                name: channelName,
                type: ChannelType.GuildText,
                parent: category.id,
                permissionOverwrites:
                    channelPermissions
            });
    }

    if (channelName === "📤-submit") {
        submitChannel = created;
    }

    if (
        channelName ===
        "🛡️-staff-review"
    ) {
        staffReviewChannel = created;
    }
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

    await interaction.member.fetch();

    const alreadySaved =
        campaign.members.includes(interaction.user.id);

    const alreadyHasRole =
        campaign.role &&
        interaction.member.roles.cache.has(campaign.role);

    if (alreadySaved && alreadyHasRole) {
        return interaction.reply({
            content: `❌ You are already in **${campaign.name}**.`,
            ephemeral: true
        });
    }

    await interaction.deferReply({
        ephemeral: true
    });

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
        console.error(
            `Failed to join campaign ${campaign.id}:`,
            error
        );

        return interaction.editReply({
            content: [
                "❌ I could not add you to this campaign.",
                "",
                "Check that the bot has **Manage Roles** and **Manage Channels**, and that its role is above the campaign role."
            ].join("\n")
        });
    }
}

async function handleLeave(interaction, campaign) {
    await interaction.deferReply({
        ephemeral: true
    });

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

        if (!savedMember && !hasRole && !isInMembers) {
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

        await deleteMember(
            interaction.client,
            campaign.id,
            interaction.user.id
        ).catch(error => {
            console.error(
                "Could not delete member record:",
                error
            );
        });

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

const statsResult = await pool.query(
    `
    SELECT
        COUNT(*)::int AS submitted,
        COUNT(*) FILTER (
            WHERE status = 'approved'
        )::int AS approved,
        COUNT(*) FILTER (
            WHERE status = 'pending'
        )::int AS pending,
        COUNT(*) FILTER (
            WHERE status = 'rejected'
        )::int AS rejected
    FROM campaign_submissions
    WHERE guild_id = $1
      AND campaign_id = $2
      AND user_id = $3
    `,
    [
        interaction.guild.id,
        String(campaign.id),
        interaction.user.id
    ]
);

const stats = statsResult.rows[0] || {};

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

const approvedViews = Number(
    member.approvedViews || 0
);

const payout = Number(
    member.payout || 0
);

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
            name: "💵 Earnings",
            value: `$${payout.toFixed(2)}`,
            inline: true
        }
    )
    .setFooter({
        text:
            "Your personal campaign statistics"
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
        ),

    async execute(interaction) {
        const subcommand =
            interaction.options.getSubcommand();

        if (subcommand !== "create") {
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
    }
};
