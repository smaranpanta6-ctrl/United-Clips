import {
    SlashCommandBuilder,
    ChannelType,
    PermissionFlagsBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} from "discord.js";

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

       const campaignChannel = await interaction.guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: activeCategory.id
});
    console.log("✅ Channel moved to category successfully.");
} catch (err) {
    console.error("❌ Failed to move channel:", err);
}

        campaigns.set(id, {
            id,
            ...data,
            channel: campaignChannel.id,
            category: null,
            members: [],
            submissions: 0,
            views: 0,
            paid: 0,
            status: "Active"
        });

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

        const campaign = campaigns.get(id);

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

            campaign.members.push(interaction.user.id);

            if (!campaign.category) {

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

                const channels = [
                    "information",
                    "rules",
                    "resources",
                    "chat",
                    "viral-examples"
                ];

                for (const ch of channels) {

                    await interaction.guild.channels.create({

                        name: ch,

                        type: ChannelType.GuildText,

                        parent: category.id,

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

                }
            }

            return interaction.reply({
                content: `✅ You joined **${campaign.name}**`,
                ephemeral: true
            });

        }
                if (action === "leave") {

            campaign.members = campaign.members.filter(
                member => member !== interaction.user.id
            );

            if (campaign.category) {

                const category = interaction.guild.channels.cache.get(
                    campaign.category
                );

                if (category) {

                    await category.permissionOverwrites.delete(
                        interaction.user.id
                    ).catch(() => {});

                    const children =
                        interaction.guild.channels.cache.filter(
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

        }

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
