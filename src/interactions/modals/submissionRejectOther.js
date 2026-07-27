import { MessageFlags } from "discord.js";
import { finalizeSubmissionReview } from "../../services/submissionReviewService.js";

export default {
    name: "submission_reject_other",

    async execute(interaction, client, args) {
        const submissionId = args[0];
        const reviewChannelId = args[1];
        const reviewMessageId = args[2];
        const reason = interaction.fields
            .getTextInputValue("rejection_reason")
            .trim();

        await interaction.deferReply({
            flags: MessageFlags.Ephemeral
        });

        await finalizeSubmissionReview({
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
