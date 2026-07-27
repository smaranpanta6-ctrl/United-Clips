export default {
    name: "submission_approve",

    async execute(interaction, client, args) {
        const submissionId = args[0];

        if (!submissionId) {
            return interaction.reply({
                content: "❌ Missing submission ID.",
                ephemeral: true
            });
        }

        await interaction.reply({
            content: `✅ Submission #${submissionId} approved.`,
            ephemeral: true
        });
    }
};
