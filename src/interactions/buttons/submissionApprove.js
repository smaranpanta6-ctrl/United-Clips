import { MessageFlags } from "discord.js";
import { finalizeSubmissionReview } from "../../services/submissionReviewService.js";

export default {
    name: "submission_approve",

    async execute(interaction, client, args) {
        const submissionId = args[0];

        if (!submissionId) {
            return interaction.reply({
                content: "❌ Missing submission ID.",
                flags: MessageFlags.Ephemeral
            });
        }

        await interaction.deferUpdate();

        await finalizeSubmissionReview({
            interaction,
            client,
            submissionId,
            status: "approved"
        });
    }
};
