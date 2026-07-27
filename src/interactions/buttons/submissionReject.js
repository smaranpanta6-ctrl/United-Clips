import {
    ActionRowBuilder,
    MessageFlags,
    StringSelectMenuBuilder
} from "discord.js";

export default {
    name: "submission_reject",

    async execute(interaction, client, args) {
        const submissionId = args[0];

        if (!submissionId) {
            return interaction.reply({
                content: "❌ Missing submission ID.",
                flags: MessageFlags.Ephemeral
            });
        }

        const menu = new StringSelectMenuBuilder()
            .setCustomId(
                `submission_reject_reason:${submissionId}:${interaction.channelId}:${interaction.message.id}`
            )
            .setPlaceholder("Choose a rejection reason")
            .addOptions(
                { label: "Wrong sound", value: "Wrong sound", emoji: "🔊" },
                { label: "Does not meet requirements", value: "Does not meet requirements", emoji: "📋" },
                { label: "Botted/Fake engagement", value: "Botted/Fake engagement", emoji: "🤖" },
                { label: "Wrong campaign", value: "Wrong campaign", emoji: "🎯" },
                { label: "Video unavailable", value: "Video unavailable", emoji: "🚫" },
                { label: "Low quality", value: "Low quality", emoji: "📉" },
                { label: "Duplicate", value: "Duplicate", emoji: "♻️" },
                { label: "Other", value: "Other", emoji: "✏️" }
            );

        return interaction.reply({
            content: `Choose why submission #${submissionId} is being rejected:`,
            components: [
                new ActionRowBuilder().addComponents(menu)
            ],
            flags: MessageFlags.Ephemeral
        });
    }
};
