import {
    ChannelType,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} from "discord.js";

import {
    saveCampaign
} from "../../utils/database.js";

const ACTIVE_CATEGORY_ID = "1529961507062812752";

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

function splitDetails(value) {
    const text = String(value || "").trim();

    const lines = text
        .split("\n")
        .map(line => line.trim())
        .filter(Boolean);

    const deadlineLine = lines.find(line =>
        /^deadline\s*:/i.test(line)
    );

    const deadline = deadlineLine
        ? deadlineLine
              .replace(/^deadline\s*:/i, "")
              .trim()
        : lines[0] || "Not specified";

    const descriptionLines = lines.filter(
        line => line !== deadlineLine
    );

    const description =
        descriptionLines
            .join("\n")
            .replace(/^instructions?\s*:/i, "")
            .trim() ||
        "Create and submit content for this campaign.";

    return {
        deadline,
        description
    };
}

function buildCampaignEmbed(campaign) {
    return new EmbedBuilder()
        .setColor("#57F287")
        .setAuthor({
            name: `${campaign.emoji || "🎬"} ${campaign.name}`
        })
        .setTitle("Track Your Campaign Clips")
        .setDescription(
            [
                campaign.description,
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
                    `**Platform:** ${campaign.platform}`,
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
                    "**Members:** 0",
                    "**Submissions:** 0",
                    "**Status:** 🟢 Active"
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
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`campaign_join_${campaign.id}`)
            .setLabel("Join Campaign")
            .setEmoji("🚀")
            .setStyle(ButtonStyle.Success),

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

export default {
    customId: "campaign_create_modal",

    async execute(interaction) {
        await interaction.deferReply({
            ephemeral: true
        });

        try {
            const draftKey =
                `${interaction.guild.id}:${interaction.user.id}`;

            const draft =
                interaction.client.campaignDrafts?.get(
                    draftKey
                ) || {
                    emoji: "🎬",
                    platform: "TikTok"
                };

            interaction.client.campaignDrafts?.delete(
                draftKey
            );

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

            const name =
                interaction.fields
                    .getTextInputValue(
                        "campaign_name"
                    )
                    .trim();

            const client =
                interaction.fields
                    .getTextInputValue(
                        "campaign_client"
                    )
                    .trim();

            const budget =
                interaction.fields
                    .getTextInputValue(
                        "campaign_budget"
                    )
                    .trim();

            const cpm =
                interaction.fields
                    .getTextInputValue(
                        "campaign_cpm"
                    )
                    .trim();

            const details =
                interaction.fields.getTextInputValue(
                    "campaign_details"
                );

            const {
                deadline,
                description
            } = splitDetails(details);

            const id = Date.now().toString();

            const cleanName =
                cleanChannelName(name) ||
                `campaign-${id.slice(-6)}`;

            const campaignChannel =
                await interaction.guild.channels.create({
                    name: `${draft.emoji}-${cleanName}`.slice(
                        0,
                        100
                    ),
                    type: ChannelType.GuildText,
                    parent: activeCategory.id
                });

            const campaign = {
                id,
                name,
                client,
                budget,
                cpm,
                deadline,
                description,
                emoji: draft.emoji || "🎬",
                platform:
                    draft.platform || "TikTok",
                channel: campaignChannel.id,
                category: null,
                submitChannel: null,
                workspacePanel: null,
                role: null,
                members: [],
                submissions: 0,
                approvedSubmissions: 0,
                pendingSubmissions: 0,
                rejectedSubmissions: 0,
                views: 0,
                approvedViews: 0,
                paid: 0,
                status: "Active",
                createdAt: Date.now()
            };

            await saveCampaign(
                interaction.client,
                id,
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
                    "",
                    "The private workspace will be created when the first member joins."
                ].join("\n")
            });
        } catch (error) {
            console.error(
                "Campaign modal creation failed:",
                error
            );

            return interaction.editReply({
                content:
                    "❌ Campaign creation failed. Check the Railway logs for the exact error."
            });
        }
    }
};
