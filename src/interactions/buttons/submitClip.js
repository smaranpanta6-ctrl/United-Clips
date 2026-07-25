import {
    ActionRowBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} from "discord.js";

export default {
    name: "submit_clip",

    async execute(interaction) {
        /*
        The button custom ID should look like:
        submit_clip:CAMPAIGN_ID
        */

        const [, campaignId] = interaction.customId.split(":");

        if (!campaignId) {
            return interaction.reply({
                content: "❌ This campaign button is missing its campaign ID.",
                ephemeral: true
            });
        }

        const modal = new ModalBuilder()
            .setCustomId(`submit_clip_modal:${campaignId}`)
            .setTitle("Submit Your Clip");

        const videoUrlInput = new TextInputBuilder()
            .setCustomId("video_url")
            .setLabel("Video URL")
            .setPlaceholder("https://www.tiktok.com/@username/video/...")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const platformInput = new TextInputBuilder()
            .setCustomId("platform")
            .setLabel("Platform")
            .setPlaceholder("TikTok, Instagram Reels, or YouTube Shorts")
            .setStyle(TextInputStyle.Short)
            .setMaxLength(30)
            .setRequired(true);

        const notesInput = new TextInputBuilder()
            .setCustomId("submission_notes")
            .setLabel("Notes — optional")
            .setPlaceholder("Add any information staff should know.")
            .setStyle(TextInputStyle.Paragraph)
            .setMaxLength(500)
            .setRequired(false);

        modal.addComponents(
            new ActionRowBuilder().addComponents(videoUrlInput),
            new ActionRowBuilder().addComponents(platformInput),
            new ActionRowBuilder().addComponents(notesInput)
        );

        return interaction.showModal(modal);
    }
};
