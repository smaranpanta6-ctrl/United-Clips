import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    MessageFlags
} from "discord.js";

import {
    infoEmbed,
    successEmbed
} from "../utils/embeds.js";

import {
    createTikTokVerification,
    getTikTokVerification,
    markTikTokVerified
} from "../services/tiktokVerificationService.js";

import { verifyUser } from "../services/verificationService.js";
import { getTikTokBio } from "../utils/apify.js";

import {
    handleInteractionError,
    replyUserError,
    ErrorTypes
} from "../utils/errorHandler.js";

import { logger } from "../utils/logger.js";
import { InteractionHelper } from "../utils/interactionHelper.js";

function createDoneButton(userId, disabled = false) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`tiktok_verification_done_${userId}`)
            .setLabel("Done — Check My Bio")
            .setEmoji("✅")
            .setStyle(ButtonStyle.Success)
            .setDisabled(disabled)
    );
}

function createInstructionsEmbed(record) {
    return infoEmbed(
        "📱 TikTok Verification Started",
        [
            `TikTok account: **@${record.username}**`,
            "",
            "Put this exact code anywhere in your TikTok bio:",
            "",
            `\`${record.verification_code}\``,
            "",
            "After saving your TikTok bio, press the button below.",
            "",
            "The bot will check your bio automatically and give you access if the code is found.",
            "",
            "Do not click the original **Verify TikTok** button again because it will create a new code."
        ].join("\n")
    );
}

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
            .setTitle("Verify Your TikTok")
            .addComponents(
                new ActionRowBuilder().addComponents(usernameInput)
            );

        await interaction.showModal(modal);

        const submitted = await interaction.awaitModalSubmit({
            filter: modalInteraction =>
                modalInteraction.customId === modalId &&
                modalInteraction.user.id === interaction.user.id,
            time: 120_000
        }).catch(() => null);

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

        await InteractionHelper.safeEditReply(submitted, {
            embeds: [createInstructionsEmbed(record)],
            components: [createDoneButton(submitted.user.id)]
        });

        logger.info("TikTok verification started", {
            guildId: submitted.guild.id,
            userId: submitted.user.id,
            username: record.username
        });

        const responseMessage = await submitted.fetchReply();

        const collector = responseMessage.createMessageComponentCollector({
            filter: buttonInteraction =>
                buttonInteraction.customId ===
                    `tiktok_verification_done_${submitted.user.id}` &&
                buttonInteraction.user.id === submitted.user.id,
            time: 10 * 60 * 1000
        });

        collector.on("collect", async doneInteraction => {
            try {
                await doneInteraction.deferUpdate();

                const currentRecord = await getTikTokVerification(
                    client,
                    doneInteraction.user.id
                );

                if (!currentRecord) {
                    return await doneInteraction.editReply({
                        embeds: [
                            infoEmbed(
                                "Verification Not Found",
                                "Your verification request could not be found. Click the original **Verify TikTok** button to start again."
                            )
                        ],
                        components: []
                    });
                }

                if (currentRecord.verified) {
                    const existingResult = await verifyUser(
                        client,
                        doneInteraction.guild.id,
                        doneInteraction.user.id,
                        {
                            source: "tiktok_bio",
                            moderatorId: null
                        }
                    );

                    collector.stop("verified");

                    return await doneInteraction.editReply({
                        embeds: [
                            successEmbed(
                                "✅ Already Verified",
                                `Your TikTok account **@${currentRecord.username}** is already verified.\n\nYou have the **${existingResult.roleName}** role.`
                            )
                        ],
                        components: []
                    });
                }

                await doneInteraction.editReply({
                    embeds: [
                        infoEmbed(
                            "🔍 Checking Your TikTok",
                            `Checking the bio of **@${currentRecord.username}** for code \`${currentRecord.verification_code}\`...`
                        )
                    ],
                    components: [
                        createDoneButton(doneInteraction.user.id, true)
                    ]
                });

                const bio = await getTikTokBio(currentRecord.username);

                const normalizedBio = String(bio || "").toUpperCase();
                const expectedCode =
                    currentRecord.verification_code.toUpperCase();

                if (!normalizedBio.includes(expectedCode)) {
                    return await doneInteraction.editReply({
                        embeds: [
                            infoEmbed(
                                "❌ Verification Failed",
                                [
                                    `The code was not found in **@${currentRecord.username}**'s TikTok bio.`,
                                    "",
                                    "Make sure this exact code is in the bio:",
                                    "",
                                    `\`${currentRecord.verification_code}\``,
                                    "",
                                    "Also make sure:",
                                    "• the TikTok username is correct",
                                    "• the account is public",
                                    "• the bio change was saved",
                                    "• TikTok has finished updating",
                                    "",
                                    "Then press **Done — Check My Bio** again."
                                ].join("\n")
                            )
                        ],
                        components: [
                            createDoneButton(doneInteraction.user.id)
                        ]
                    });
                }

                const verificationResult = await verifyUser(
                    client,
                    doneInteraction.guild.id,
                    doneInteraction.user.id,
                    {
                        source: "tiktok_bio",
                        moderatorId: null
                    }
                );

                await markTikTokVerified(
                    client,
                    doneInteraction.user.id
                );

                collector.stop("verified");

                logger.info("TikTok verification completed", {
                    guildId: doneInteraction.guild.id,
                    userId: doneInteraction.user.id,
                    username: currentRecord.username,
                    roleName: verificationResult.roleName
                });

                return await doneInteraction.editReply({
                    embeds: [
                        successEmbed(
                            "✅ TikTok Verification Successful",
                            [
                                `TikTok account: **@${currentRecord.username}**`,
                                "",
                                `Your code was found successfully.`,
                                `You received the **${verificationResult.roleName}** role.`,
                                "",
                                "You now have access to the server."
                            ].join("\n")
                        )
                    ],
                    components: []
                });

            } catch (error) {
                logger.error("TikTok bio check failed", {
                    error: error.message,
                    guildId: doneInteraction.guild?.id,
                    userId: doneInteraction.user?.id
                });

                await doneInteraction.editReply({
                    embeds: [
                        infoEmbed(
                            "❌ Could Not Check TikTok",
                            [
                                "Something went wrong while checking your TikTok profile.",
                                "",
                                "Your verification code is still valid.",
                                "Wait a moment and press **Done — Check My Bio** again."
                            ].join("\n")
                        )
                    ],
                    components: [
                        createDoneButton(doneInteraction.user.id)
                    ]
                }).catch(() => null);
            }
        });

        collector.on("end", async (_, reason) => {
            if (reason === "verified") {
                return;
            }

            await submitted.editReply({
                embeds: [
                    infoEmbed(
                        "Verification Session Expired",
                        "This verification session expired. Click the original **Verify TikTok** button to start again."
                    )
                ],
                components: []
            }).catch(() => null);
        });

    } catch (error) {
        logger.error("Error starting TikTok verification", {
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
