import {
    EmbedBuilder,
    MessageFlags
} from "discord.js";

import { getColor } from "../../config/bot.js";
import { createSubmission } from "../../services/submissionService.js";

function isValidUrl(value) {
    try {
        const url = new URL(value);
        return url.protocol === "https:" || url.protocol === "http:";
    } catch {
        return false;
    }
}

export default {
    name: "submit_clip_modal",

    async execute(interaction, client) {
        await interaction.deferReply({
            flags: MessageFlags.Ephemeral
        });

        const [, campaignId] = interaction.customId.split(":");

        if (!campaignId) {
            return interaction.editReply({
                content: "❌ This submission is missing its campaign ID."
            });
        }

        const videoUrl = interaction.fields
            .getTextInputValue("video_url")
            .trim();

        const platform = interaction.fields
            .getTextInputValue("platform")
            .trim();

        const notes = interaction.fields
            .getTextInputValue("submission_notes")
            .trim();

        if (!isValidUrl(videoUrl)) {
            return interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle("❌ Invalid Video Link")
                        .setDescription(
                            "Enter a valid TikTok, Instagram, or YouTube video URL."
                        )
                        .setColor(getColor("error"))
                ]
            });
        }

        const submission = await createSubmission(client, {
            guildId: interaction.guild.id,
            campaignId,
            userId: interaction.user.id,
            videoUrl,
            platform,
            notes: notes || null
        });

        return interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setTitle("✅ Clip Submitted")
                    .setDescription(
                        "Your clip was submitted successfully and is waiting for staff review."
                    )
                    .addFields(
                        {
                            name: "Submission ID",
                            value: `#${submission.id}`,
                            inline: true
                        },
                        {
                            name: "Platform",
                            value: submission.platform,
                            inline: true
                        },
                        {
                            name: "Status",
                            value: "🟡 Pending",
                            inline: true
                        },
                        {
                            name: "Video",
                            value: submission.video_url,
                            inline: false
                        }
                    )
                    .setColor(getColor("success"))
                    .setTimestamp()
            ]
        });
    }
};
