import {
    ChannelType,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} from "discord.js";

import {
    saveCampaign
} from "../../utils/database.js";
import {
    createCampaignSpreadsheet
} from "../../utils/googleSheets.js";
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

function buildCampaignContent(campaign) {
    const lines = [
        `## ${campaign.emoji || "🎬"} Get Paid To Post ${campaign.name} Edits`,
        "",
        campaign.description,
        "",
        "### 📝 Campaign Information",
        `• **Client:** ${campaign.client}`,
        `• **CPM:** ${campaign.cpm} per 1,000 views`,
        `• **Budget:** ${campaign.budget}`,
        `• **Deadline:** ${campaign.deadline}`,
        `• **Platform:** ${campaign.platform}`,
        "",
        "### 📋 Brief",
        campaign.brief
    ];

    if (campaign.audio) {
        lines.push(
            "",
            "### 🔊 Audio",
            campaign.audio
        );
    }

    lines.push(
        "",
        "## 👇 Join below to start earning"
    );

    return lines.join("\n");
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
    name: "campaign_create_modal",

    async execute(interaction, client) {
        await interaction.deferReply({
            ephemeral: true
        });

        try {
            const draftKey =
                `${interaction.guild.id}:${interaction.user.id}`;

            const draft =
                client.campaignDrafts?.get(draftKey) || {
                    emoji: "🎬",
                    platform: "TikTok"
                };

            client.campaignDrafts?.delete(draftKey);

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
                    .getTextInputValue("campaign_name")
                    .trim();

            const campaignClient =
                interaction.fields
                    .getTextInputValue("campaign_client")
                    .trim();

            const budget =
                interaction.fields
                    .getTextInputValue("campaign_budget")
                    .trim();

            const cpm =
                interaction.fields
                    .getTextInputValue("campaign_cpm")
                    .trim();

          const brief =
    interaction.fields.getTextInputValue(
        "campaign_brief"
    );

            const deadline = draft.deadline;
const description = draft.description;

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
    client: campaignClient,
    budget,
    cpm,

    emoji: draft.emoji || "🎬",
    platform: draft.platform || "TikTok",
    deadline,
    description,
    brief,
    audio: draft.audio || null,

    channel: campaignChannel.id,
    category: null,
    role: null,

    googleSheetId: null,
    googleSheetUrl: null,

    members: [],
    submissions: 0,
    approvedSubmissions: 0,
    pendingSubmissions: 0,
    rejectedSubmissions: 0,
    views: 0,
    paid: 0,
    status: "Active"
};
            
// Post the public campaign immediately.
// Google Sheets must not delay or prevent this message.
const publicMessage = await campaignChannel.send({
    content: buildCampaignContent(campaign),
    components: [
        buildCampaignButtons(campaign)
    ]
});

campaign.publicMessageId = publicMessage.id;

// Save the campaign immediately after creating the Discord post.
await saveCampaign(
    client,
    id,
    campaign
);

// Try Google Sheets separately.
try {
    const googleSheet =
        await createCampaignSpreadsheet(campaign);

    campaign.googleSheetId =
        googleSheet.spreadsheetId;

    campaign.googleSheetUrl =
        googleSheet.spreadsheetUrl;
} catch (googleError) {
    console.error(
        "Google spreadsheet creation failed:",
        googleError
    );

    campaign.googleSheetId = null;
    campaign.googleSheetUrl = null;
}
            const responseLines = [
    "✅ Campaign created successfully.",
    "",
    `**Public campaign:** ${campaignChannel}`
];

if (campaign.googleSheetUrl) {
    responseLines.push(
        `**Campaign spreadsheet:** ${campaign.googleSheetUrl}`
    );
} else {
    responseLines.push(
        "⚠️ Google Sheet creation failed, but the campaign was still created."
    );
}

responseLines.push(
    "",
    "The private workspace will be created when the first member joins."
);

return interaction.editReply({
    content: responseLines.join("\n")
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
