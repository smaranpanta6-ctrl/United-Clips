import {
    ChannelType,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags
} from "discord.js";

import {
    saveCampaign
} from "../../utils/database.js";
import {
    createCampaignSpreadsheet,
    getGoogleErrorSummary
} from "../../utils/googleSheets.js";
const ACTIVE_CATEGORY_ID = "1531525611057582182";

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
function formatCampaignInfo(value) {
    return String(value || "")
        .split("\n")
        .map(line => line.trim())
        .filter(Boolean)
        .map(line => {
            const separatorIndex = line.indexOf(":");

            if (separatorIndex === -1) {
                return `• ${line}`;
            }

            const label =
                line.slice(0, separatorIndex).trim();

            const content =
                line.slice(separatorIndex + 1).trim();

            return `• **${label}:** ${content}`;
        })
        .join("\n");
}
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
        `## ${campaign.emoji || "💸"} Get Paid To Post ${campaign.name} Edits/Highlights!`,
        "",
        "Click **Join Campaign** and follow the campaign details to begin earning!",
        "",
        campaign.description,
        "",
        "### 📝 Campaign Info",
        "",
        formatCampaignInfo(campaign.campaignInfo),
        "",
        "### Brief",
        "",
        `• ${campaign.brief}`,
        "",
        "## 👇 JOIN BELOW TO START EARNING NOW!"
    ];

    if (campaign.audioLink) {
        lines.push(
            "",
            "### 🔊 TikTok Audio Link",
            campaign.audioLink
        );
    }

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
            flags: MessageFlags.Ephemeral
        });

        try {
            const draftKey =
                `${interaction.guild.id}:${interaction.user.id}`;

            const draft =
    client.campaignDrafts?.get(draftKey) || {
        audioFile: null,
        audioLink: null
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

           const campaignInfo =
    interaction.fields
        .getTextInputValue("campaign_info")
        .trim();

const brief =
    interaction.fields
        .getTextInputValue("campaign_brief")
        .trim();

const description =
    interaction.fields
        .getTextInputValue("campaign_description")
        .trim();
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

    emoji: "💸",
    campaignInfo,
    description,
    brief,

    audioLink: draft.audioLink || null,
    audioFile: draft.audioFile || null,

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
const messagePayload = {
    content: buildCampaignContent(campaign),
    components: [
        buildCampaignButtons(campaign)
    ]
};

if (campaign.audioFile?.url) {
    messagePayload.files = [
        {
            attachment: campaign.audioFile.url,
            name:
                campaign.audioFile.name ||
                "campaign-audio.mp3"
        }
    ];
}

const publicMessage =
    await campaignChannel.send(messagePayload);
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
        getGoogleErrorSummary(googleError)
    );

    campaign.googleSheetId = null;
    campaign.googleSheetUrl = null;
}

await saveCampaign(
    client,
    id,
    campaign
);

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
