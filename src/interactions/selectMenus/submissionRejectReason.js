import {
    ActionRowBuilder,
    MessageFlags,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} from "discord.js";

import {
    finalizeSubmissionReview
} from "../../services/submissionReviewService.js";

export default {
    name: "submission_reject_reason",

    async execute(interaction, client, args) {
        const submissionId = args[0];
        const reviewChannelId = args[1];
        const reviewMessageId = args[2];
        const reason = interaction.values[0];

        if (reason === "Other") {
            const modal = new ModalBuilder()
                .setCustomId(
                    `submission_reject_other:${submissionId}:${reviewChannelId}:${reviewMessageId}`
                )
                .setTitle("Reject Submission");

            const reasonInput =
                new TextInputBuilder()
                    .setCustomId(
                        "rejection_reason"
                    )
                    .setLabel(
                        "Rejection reason"
                    )
                    .setStyle(
                        TextInputStyle.Paragraph
                    )
                    .setMaxLength(500)
                    .setRequired(true);

            modal.addComponents(
                new ActionRowBuilder()
                    .addComponents(reasonInput)
            );

            return interaction.showModal(modal);
        }

        await interaction.deferReply({
            flags: MessageFlags.Ephemeral
        });

        return finalizeSubmissionReview({
            interaction,
            client,
            submissionId,
            status: "rejected",
            rejectionReason: reason,
            reviewChannelId,
            reviewMessageId
        });
    }
};
