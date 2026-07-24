import {
    ActionRowBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    MessageFlags
} from "discord.js";

import { infoEmbed } from "../utils/embeds.js";
import {
    createTikTokVerification
} from "../services/tiktokVerificationService.js";
import {
    handleInteractionError,
    replyUserError,
    ErrorTypes
} from "../utils/errorHandler.js";
import { logger } from "../utils/logger.js";
import { InteractionHelper } from "../utils/interactionHelper.js";

export async function handleVerificationButton(interaction, client) {
    try {
        if (!interaction.guild) {
            return await replyUserError(interaction, {
                type: ErrorTypes.UNKNOWN,
                message: "This button can only be used inside a server."
            });
        }

        const modalId = `tiktok_verify_modal_${interaction.user.id}`;

        const usernameInput = new TextInputBuilder()
            .setCustomId("tiktok_username")
            .setLabel("Your TikTok username")
            .setPlaceholder("@username or username")
            .setStyle(TextInputStyle.Short)
            .setMinLength(2)
            .setMaxLength(50)
            .setRequired(true);

        const modal = new ModalBuilder()
            .setCustomId(modalId)
            .setTitle("Verify your TikTok")
            .addComponents(
                new ActionRowBuilder().addComponents(usernameInput)
            );

        // A modal must be shown before deferring the interaction.
        await interaction.showModal(modal);

        const submitted = await interaction
            .awaitModalSubmit({
                filter: modalInteraction =>
                    modalInteraction.customId === modalId &&
                    modalInteraction.user.id === interaction.user.id,
                time: 120_000
            })
            .catch(() => null);

        if (!submitted) {
            return;
        }

        await InteractionHelper.safeDefer(submitted, {
            flags: MessageFlags.Ephemeral
        });

        const username = submitted.fields
            .getTextInputValue("tiktok_username")
            .trim();

        const record = await createTikTokVerification(
            client,
            submitted.user.id,
            username
        );

        logger.info("TikTok verification started", {
            guildId: submitted.guild.id,
            userId: submitted.user.id,
            username: record.username
        });

        return await InteractionHelper.safeEditReply(submitted, {
            embeds: [
                infoEmbed(
                    "📱 TikTok Verification Started",
                    [
                        `TikTok account: **@${record.username}**`,
                        "",
                        "Put this exact code anywhere in your TikTok bio:",
                        "",
                        `\`${record.verification_code}\``,
                        "",
                        "After saving your TikTok bio, wait about 30–60 seconds.",
                        "",
                        "Then run:",
                        "",
                        "`/verify check`",
                        "",
                        "Do not click the verification button again, because it will generate a new code."
                    ].join("\n")
                )
            ]
        });

    } catch (error) {
        logger.error("Error in TikTok verification button handler", {
            error: error.message,
            guildId: interaction.guild?.id,
            userId: interaction.user?.id
        });

        await handleInteractionError(
            interaction,
            error,
            {
                command: "verify_button",
                action: "tiktok_verification_start"
            }
        );
    }
}

export default {
    customId: "verify_user",
    execute: handleVerificationButton
};
