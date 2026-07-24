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
} from "../../utils/database.js"

console.log("🔥 CAMPAIGN COMMAND LOADED 🔥");

const STAFF_ROLE_ID = "1529961495402778771";
const ACTIVE_CATEGORY_ID = "1529961507062812752";

const campaigns = new Map();
function buildCampaignPost(campaign) {
    return [
        `# ${campaign.name}`,
        campaign.description,
        "",
        "## 📋 Campaign Details",
        `**Client:** ${campaign.client}`,
        `**Platforms:** TikTok, Instagram, YouTube`,
        `**Deadline:** ${campaign.deadline}`,
        "",
        "## 💸 Payment Details",
        `**Budget:** ${campaign.budget}`,
        `**CPM:** ${campaign.cpm}`,
        "",
        "## 🚀 Join the Campaign",
        "Join below to unlock the campaign workspace, submission channel, announcements, and chat.",
        "",
        `**Members Joined:** ${campaign.members?.length || 0}`,
        `**Status:** ${campaign.status === "Active" ? "🟢 Active" : "⚫ Closed"}`
    ].join("\n");
}

function buildCampaignButtons(campaign) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`campaign_join_${campaign.id}`)
            .setLabel("Join")
            .setEmoji("🚀")
            .setStyle(ButtonStyle.Success),

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

export default {
    data: new SlashCommandBuilder()
        .setName("campaign")
        .setDescription("Create and manage campaigns")
        .setDMPermission(false)

        .addSubcommand(sub =>
            sub
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
                        .setDescription("Label / Client")
                        .setRequired(true)
                )

                .addStringOption(option =>
                    option
                        .setName("budget")
                        .setDescription("Budget")
                        .setRequired(true)
                )

                .addStringOption(option =>
                    option
                        .setName("cpm")
                        .setDescription("CPM")
                        .setRequired(true)
                )

                .addStringOption(option =>
                    option
                        .setName("deadline")
                        .setDescription("Deadline")
                        .setRequired(true)
                )

                .addStringOption(option =>
                    option
                        .setName("description")
                        .setDescription("Campaign description")
                        .setRequired(true)
                )
        ),
    

 async execute(interaction) {
if (interaction.options.getSubcommand() !== "create") return;

    if (!interaction.member.roles.cache.has(STAFF_ROLE_ID)) {
        return interaction.reply({
            content: "❌ Only staff can create campaigns.",
            ephemeral: true
        });
    }

    await interaction.deferReply({ ephemeral: true });

    const data = {
        name: interaction.options.getString("name"),
        client: interaction.options.getString("client"),
        budget: interaction.options.getString("budget"),
        cpm: interaction.options.getString("cpm"),
        deadline: interaction.options.getString("deadline"),
        description: interaction.options.getString("description")
    };

        const id = Date.now().toString();

        const channelName = data.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 90);

        const activeCategory =
            await interaction.guild.channels.fetch(ACTIVE_CATEGORY_ID);

       if (!activeCategory || activeCategory.type !== ChannelType.GuildCategory) {
    return interaction.editReply({
        content: "❌ ACTIVE_CATEGORY_ID is not a category."
    });
}

console.log("Category:", activeCategory.name);
console.log("ID:", activeCategory.id);
console.log("Type:", activeCategory.type);
        const campaignChannel = await interaction.guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: activeCategory.id
});

console.log("Parent:", campaignChannel.parentId);
console.log("Expected:", ACTIVE_CATEGORY_ID);

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

await saveCampaign(interaction.client, id, campaign);

console.log("========== AFTER SAVE ==========");
console.log("Campaign ID:", id);

const raw = await interaction.client.db.get(`campaigns:${id}`);
console.log("Raw DB:", raw);

const loaded = await getCampaign(interaction.client, id);
console.log("Loaded Campaign:", loaded);
        await campaignChannel.send({
    content: buildCampaignPost(campaign),
    components: [buildCampaignButtons(campaign)]
});

        await interaction.editReply({
            content: `✅ Campaign created: ${campaignChannel}`
        });

    },
async button(interaction) {

    const [, action, id] = interaction.customId.split("_");

    console.log("========== BUTTON CLICKED ==========");
    console.log("Custom ID:", interaction.customId);
    console.log("Action:", action);
    console.log("Campaign ID:", id);
    console.log("Campaigns in Map:", [...campaigns.keys()]);

   const campaign = await getCampaign(interaction.client, id);

console.log("Campaign fetched:", campaign);

if (!campaign) {
    return interaction.reply({
        content: "❌ Campaign not found.",
        ephemeral: true
    });
}

    if (action === "join") {

        if (campaign.members.includes(interaction.user.id)) {
            return interaction.reply({
                content: "❌ You're already in this campaign.",
                ephemeral: true
            });
        }

        // leave the rest of your code exactly the same...
           campaign.members.push(interaction.user.id);

await saveCampaign(interaction.client, campaign.id, campaign);
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
        
        let role = interaction.guild.roles.cache.get(campaign.role);

if (!role) {
    role = await interaction.guild.roles.create({
        name: campaign.name,
        mentionable: true,
        reason: `Campaign role for ${campaign.name}`
    });

    campaign.role = role.id;
    await saveCampaign(interaction.client, campaign.id, campaign);
}

await interaction.member.roles.add(role);

const existingCategory = interaction.guild.channels.cache.get(campaign.category);

if (!campaign.category || !existingCategory) {

                const category =
                    await interaction.guild.channels.create({

                        name: campaign.name.toUpperCase(),

                        type: ChannelType.GuildCategory,

                        permissionOverwrites: [

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
                                    PermissionFlagsBits.SendMessages
                                ]
                            },

                            {
                                id: interaction.user.id,
                                allow: [
                                    PermissionFlagsBits.ViewChannel,
                                    PermissionFlagsBits.SendMessages
                                ]
                            }

                        ]

                    });

               campaign.category = category.id;
await saveCampaign(interaction.client, campaign.id, campaign);

console.log("Category ID:", category.id);

console.log("========== CREATING CAMPAIGN CHANNELS ==========");

const channels = [
    "📤-submit",
    "📢-announcements",
    "💬-chat",
    "⚠️-rules"
];

for (const ch of channels) {

    console.log("Creating:", ch);
    console.log("Parent:", category.id);

    const created = await interaction.guild.channels.create({
        name: ch,
        type: ChannelType.GuildText,
        parent: category.id,

        permissionOverwrites: [
            {
                id: interaction.guild.roles.everyone.id,
                deny: [PermissionFlagsBits.ViewChannel]
            },
            {
                id: STAFF_ROLE_ID,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages
                ]
            },
            {
                id: interaction.user.id,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages
                ]
            }
        ]
    });

    console.log(
        created.name,
        "parentId =",
        created.parentId
    );
}

           } else {

    const category =
        interaction.guild.channels.cache.get(campaign.category);

    if (category) {

        await category.permissionOverwrites.create(
            interaction.user.id,
            {
                ViewChannel: true,
                SendMessages: true
            }
        );

        const children = interaction.guild.channels.cache.filter(
            c => c.parentId === category.id
        );

        for (const [, channel] of children) {
            await channel.permissionOverwrites.create(
                interaction.user.id,
                {
                    ViewChannel: true,
                    SendMessages: true
                }
            );
        }

    }

} 

// Update the public campaign post after joining
const publicCampaignChannel = interaction.guild.channels.cache.get(
    campaign.channel
);

if (publicCampaignChannel) {
    const message = (
        await publicCampaignChannel.messages.fetch({ limit: 10 })
    ).find(msg =>
        msg.author.id === interaction.client.user.id &&
        msg.components.some(row =>
            row.components.some(
                component =>
                    component.customId === `campaign_join_${campaign.id}`
            )
        )
    );

    if (message) {
        await message.edit({
            content: buildCampaignPost(campaign),
            components: [buildCampaignButtons(campaign)]
        });
    }
}

const category = interaction.guild.channels.cache.get(campaign.category);

const firstCampaignChannel = category
    ? interaction.guild.channels.cache.find(
        channel =>
            channel.parentId === category.id &&
            channel.type === ChannelType.GuildText
    )
    : null;

const joinEmbed = new EmbedBuilder()
    .setColor("#57F287")
    .setTitle("You're In")
    .setDescription(
        [
            `You successfully joined **${campaign.name}**.`,
            "",
            "Your private campaign workspace has been unlocked.",
            "Read the rules and campaign instructions before submitting content."
        ].join("\n")
    )
    .addFields(
        {
            name: "Client",
            value: campaign.client,
            inline: true
        },
        {
            name: "CPM",
            value: campaign.cpm,
            inline: true
        },
        {
            name: "Deadline",
            value: campaign.deadline,
            inline: true
        }
    )
    .setFooter({
        text: `${interaction.guild.name} • Campaign access granted`
    })
    .setTimestamp();

const joinComponents = [];

if (firstCampaignChannel) {
    joinComponents.push(
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel("Open Campaign Workspace")
                .setEmoji("↗️")
                .setStyle(ButtonStyle.Link)
                .setURL(
                    `https://discord.com/channels/${interaction.guild.id}/${firstCampaignChannel.id}`
                )
        )
    );
}

return interaction.reply({
    embeds: [joinEmbed],
    components: joinComponents,
    ephemeral: true
});

} // <-- end JOIN

if (action === "leave") {

    campaign.members = campaign.members.filter(
        member => member !== interaction.user.id
    );
await deleteMember(
    interaction.client,
    campaign.id,
    interaction.user.id
);
    await saveCampaign(interaction.client, campaign.id, campaign);
    const role = interaction.guild.roles.cache.get(campaign.role);

if (role) {
    await interaction.member.roles.remove(role).catch(() => {});
}

    // Update the public campaign post after leaving
const publicCampaignChannel = interaction.guild.channels.cache.get(
    campaign.channel
);

if (publicCampaignChannel) {
    const message = (
        await publicCampaignChannel.messages.fetch({ limit: 10 })
    ).find(msg =>
        msg.author.id === interaction.client.user.id &&
        msg.components.some(row =>
            row.components.some(
                component =>
                    component.customId === `campaign_join_${campaign.id}`
            )
        )
    );

    if (message) {
        await message.edit({
            content: buildCampaignPost(campaign),
            components: [buildCampaignButtons(campaign)]
        });
    }
}
    // Last editor leaves
    if (campaign.members.length === 0 && campaign.category) {

    const category = interaction.guild.channels.cache.get(campaign.category);

    if (category) {

        const children = interaction.guild.channels.cache.filter(
            c => c.parentId === category.id
        );

        for (const [, channel] of children) {
            await channel.delete().catch(() => {});
        }

        await category.delete().catch(() => {});
    }

    campaign.category = null;
    await saveCampaign(interaction.client, campaign.id, campaign);

   return interaction.reply({
    embeds: [
        new EmbedBuilder()
            .setColor("#ED4245")
            .setTitle("Campaign Left")
            .setDescription(
                `You have left **${campaign.name}** and your campaign access has been removed.`
            )
            .setTimestamp()
    ],
    ephemeral: true
});
}

    // Remove permissions only
    if (campaign.category) {

        const category = interaction.guild.channels.cache.get(campaign.category);

        if (category) {

            await category.permissionOverwrites.delete(interaction.user.id).catch(() => {});

            const children = interaction.guild.channels.cache.filter(
                c => c.parentId === category.id
            );

            for (const [, channel] of children) {
                await channel.permissionOverwrites.delete(
                    interaction.user.id
                ).catch(() => {});
            }

        }

    }

   return interaction.reply({
    embeds: [
        new EmbedBuilder()
            .setColor("#ED4245")
            .setTitle("Campaign Left")
            .setDescription(
                `You have left **${campaign.name}** and your campaign access has been removed.`
            )
            .setTimestamp()
    ],
    ephemeral: true
});

} // <-- end LEAVE
                       } // end leave

        if (action === "status") {
            const numericBudget =
                Number(
                    String(campaign.budget)
                        .replace(/[$,]/g, "")
                        .trim()
                ) || 0;

            const numericPaid = Number(campaign.paid) || 0;
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
                .setTitle("📊 Campaign Overview")
                .setDescription(
                    `Details for **${campaign.name}**`
                )
                .addFields(
                    {
                        name: "💰 Budget Remaining",
                        value: `$${remainingBudget.toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                        })}`,
                        inline: true
                    },
                    {
                        name: "📈 CPM",
                        value: String(campaign.cpm),
                        inline: true
                    },
                    {
                        name: "👥 Members",
                        value: String(campaign.members.length),
                        inline: true
                    },
                    {
                        name: "📤 Submissions",
                        value: String(campaign.submissions || 0),
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
                        value: `$${Number(
                            campaign.paid || 0
                        ).toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                        })}`,
                        inline: true
                    },
                    {
                        name: "🟢 Status",
                        value: String(campaign.status),
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
    }
};
