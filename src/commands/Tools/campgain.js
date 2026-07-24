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
    saveCampaign,
    getCampaign,
    deleteCampaign,
    getAllCampaigns
} from "../../utils/database.js";

console.log("🔥 CAMPAIGN COMMAND LOADED 🔥");

const STAFF_ROLE_ID = "1529961495402778771";
const ACTIVE_CATEGORY_ID = "1529961507062812752";

const campaigns = new Map();

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
        const embed = new EmbedBuilder()
            .setColor("#5865F2")
            .setTitle(`🎵 ${data.name}`)
            .setDescription(
`🏷️ **Client**
${data.client}

💰 **Budget**
${data.budget}

📈 **CPM**
${data.cpm}

📅 **Ends**
${data.deadline}

📝 **Description**
${data.description}

🟢 **Status**
Active

👥 **Editors Joined**
0`
            );
                const buttons = new ActionRowBuilder().addComponents(

            new ButtonBuilder()
                .setCustomId(`campaign_join_${id}`)
                .setLabel("🎬 JOIN")
                .setStyle(ButtonStyle.Success),

            new ButtonBuilder()
                .setCustomId(`campaign_leave_${id}`)
                .setLabel("🚪 LEAVE")
                .setStyle(ButtonStyle.Danger),

            new ButtonBuilder()
                .setCustomId(`campaign_status_${id}`)
                .setLabel("📊 STATUS")
                .setStyle(ButtonStyle.Primary)

        );

        await campaignChannel.send({
            embeds: [embed],
            components: [buttons]
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

// Update campaign embed
const campaignChannel = interaction.guild.channels.cache.get(campaign.channel);

if (campaignChannel) {
    const message = (await campaignChannel.messages.fetch({ limit: 1 })).first();

    if (message) {
        const embed = EmbedBuilder.from(message.embeds[0]);

        embed.setDescription(
`🏷️ **Client**
${campaign.client}

💰 **Budget**
${campaign.budget}

📈 **CPM**
${campaign.cpm}

📅 **Ends**
${campaign.deadline}

📝 **Description**
${campaign.description}

🟢 **Status**
${campaign.status}

👥 **Editors Joined**
${campaign.members.length}`
        );

        await message.edit({
            embeds: [embed]
        });
    }
}

return interaction.reply({
    content: `✅ You have successfully joined **${campaign.name}**!\n\nStart edit and make money.`,
    ephemeral: true
});

} // <-- end JOIN

if (action === "leave") {

    campaign.members = campaign.members.filter(
        member => member !== interaction.user.id
    );

    await saveCampaign(interaction.client, campaign.id, campaign);
    const role = interaction.guild.roles.cache.get(campaign.role);

if (role) {
    await interaction.member.roles.remove(role).catch(() => {});
}

    // Update campaign embed after leaving
    const campaignChannel = interaction.guild.channels.cache.get(campaign.channel);

    if (campaignChannel) {
        const message = (await campaignChannel.messages.fetch({ limit: 1 })).first();

        if (message) {
            const embed = EmbedBuilder.from(message.embeds[0]);

            embed.setDescription(
`🏷️ **Client**
${campaign.client}

💰 **Budget**
${campaign.budget}

📈 **CPM**
${campaign.cpm}

📅 **Ends**
${campaign.deadline}

📝 **Description**
${campaign.description}

🟢 **Status**
${campaign.status}

👥 **Editors Joined**
${campaign.members.length}`
            );

            await message.edit({
                embeds: [embed]
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
        content: `🚪 You left **${campaign.name}**`,
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
        content: `🚪 You left **${campaign.name}**`,
        ephemeral: true
    });

} // <-- end LEAVE
        if (action === "status") {

            const embed = new EmbedBuilder()

                .setColor("Green")

                .setTitle(`📊 ${campaign.name}`)

                .setDescription(`

👥 **Editors Joined**
${campaign.members.length}

📤 **Submissions**
${campaign.submissions}

👀 **Views**
${campaign.views}

💸 **Paid**
$${campaign.paid}

🟢 **Status**
${campaign.status}

📅 **Deadline**
${campaign.deadline}

                `);

            return interaction.reply({
                embeds: [embed],
                ephemeral: true
            });

        }

    }

};
