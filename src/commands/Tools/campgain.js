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
        .setDescription("Campaign Management")
        .setDMPermission(false)

        .addSubcommand(sub =>
            sub

                .setName("create")
                .setDescription("Create a campaign")

                .addStringOption(o =>
                    o.setName("name")
                        .setDescription("Campaign Name")
                        .setRequired(true)
                )

                .addStringOption(o =>
                    o.setName("artist")
                        .setDescription("Artist")
                        .setRequired(true)
                )

                .addStringOption(o =>
                    o.setName("song")
                        .setDescription("Song")
                        .setRequired(true)
                )

                .addStringOption(o =>
                    o.setName("label")
                        .setDescription("Label")
                        .setRequired(true)
                )

                .addStringOption(o =>
                    o.setName("budget")
                        .setDescription("Budget")
                        .setRequired(true)
                )

                .addStringOption(o =>
                    o.setName("cpm")
                        .setDescription("CPM")
                        .setRequired(true)
                )

                .addStringOption(o =>
                    o.setName("deadline")
                        .setDescription("Deadline")
                        .setRequired(true)
                )

                .addStringOption(o =>
                    o.setName("description")
                        .setDescription("Brief")
                        .setRequired(true)
                )

                .addStringOption(o =>
                    o.setName("rules")
                        .setDescription("Rules")
                        .setRequired(true)
                )

                .addStringOption(o =>
                    o.setName("resources")
                        .setDescription("Resources")
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

            id: Date.now().toString(),

            name: interaction.options.getString("name"),

            artist: interaction.options.getString("artist"),

            song: interaction.options.getString("song"),

            label: interaction.options.getString("label"),

            budget: interaction.options.getString("budget"),

            cpm: interaction.options.getString("cpm"),

            deadline: interaction.options.getString("deadline"),

            description: interaction.options.getString("description"),

            rules: interaction.options.getString("rules"),

            resources: interaction.options.getString("resources"),

            members: [],

            submissions: 0,

            paid: 0,

            views: 0,

            status: "Active",

            category: null

        };

        campaigns.set(data.id, data);

        const activeCategory =
            await interaction.guild.channels.fetch(ACTIVE_CATEGORY_ID);

        if (!activeCategory) {

            return interaction.editReply({
                content: "❌ Active Campaign category not found."
            });

        }

        const channelName = data.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "")
            .slice(0, 90);

        const campaignChannel =
            await interaction.guild.channels.create({

                name: channelName,

                type: ChannelType.GuildText,

                parent: activeCategory.id

            });

        data.channel = campaignChannel.id;
                const embed = new EmbedBuilder()

            .setColor("#2B2D31")

            .setTitle(`🎵 ${data.artist} - ${data.song}`)

            .setDescription(
`## 💰 Campaign Information

**🏷️ Label**
${data.label}

**💵 Budget**
${data.budget}

**📈 CPM**
${data.cpm}

**📅 Deadline**
${data.deadline}

**📝 Brief**
${data.description}

---

Click **JOIN** below to participate in this campaign.

🟢 **Status:** Active

👥 **Editors Joined:** ${data.members.length}
`
            );

        const buttons = new ActionRowBuilder()

            .addComponents(

                new ButtonBuilder()

                    .setCustomId(`campaign_join_${data.id}`)

                    .setLabel("JOIN")

                    .setEmoji("🚀")

                    .setStyle(ButtonStyle.Success),

                new ButtonBuilder()

                    .setCustomId(`campaign_leave_${data.id}`)

                    .setLabel("LEAVE")

                    .setEmoji("🚪")

                    .setStyle(ButtonStyle.Danger),

                new ButtonBuilder()

                    .setCustomId(`campaign_status_${data.id}`)

                    .setLabel("STATUS")

                    .setEmoji("📈")

                    .setStyle(ButtonStyle.Secondary)

            );

        await campaignChannel.send({

            embeds: [embed],

            components: [buttons]

        });

        await interaction.editReply({

            content: `✅ Campaign created successfully in ${campaignChannel}.`

        });

    },

    async button(interaction) {

        const [, action, id] = interaction.customId.split("_");

        const campaign = campaigns.get(id);

        if (!campaign) {

            return interaction.reply({

                content: "❌ Campaign no longer exists.",

                ephemeral: true

            });

        }

        if (action === "join") {

            if (campaign.members.includes(interaction.user.id)) {

                return interaction.reply({

                    content: "❌ You already joined this campaign.",

                    ephemeral: true

                });

            }

            campaign.members.push(interaction.user.id);
            
