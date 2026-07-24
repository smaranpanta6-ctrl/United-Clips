import {
    SlashCommandBuilder,
    MessageFlags
} from "discord.js";

import {
    infoEmbed,
    successEmbed
} from "../../utils/embeds.js";

import { InteractionHelper } from "../../utils/interactionHelper.js";
import { verifyUser } from "../../services/verificationService.js";
import {
    createTikTokVerification,
    getTikTokVerification,
    markTikTokVerified
} from "../../services/tiktokVerificationService.js";
import { getTikTokBio } from "../../utils/apify.js";

export default {
    data: new SlashCommandBuilder()
        .setName("verify")
        .setDescription("Verify ownership of your TikTok account")

        .addSubcommand(subcommand =>
            subcommand
                .setName("start")
                .setDescription("Start TikTok verification")

                .addStringOption(option =>
                    option
                        .setName("username")
                        .setDescription("Your TikTok username, with or without @")
                        .setRequired(true)
                )
        )

        .addSubcommand(subcommand =>
            subcommand
                .setName("check")
                .setDescription("Check whether your TikTok bio contains your code")
        ),

    async execute(interaction, config, client) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === "start") {
            const username = interaction.options.getString(
                "username",
                true
            );

            const record = await createTikTokVerification(
                client,
                interaction.user.id,
                username
            );

            return InteractionHelper.safeReply(interaction, {
                embeds: [
                    infoEmbed(
                        "📱 Verify Your TikTok",
                        [
                            `TikTok account: **@${record.username}**`,
                            "",
                            "Put this exact code anywhere in your TikTok bio:",
                            "",
                            `\`${record.verification_code}\``,
                            "",
                            "After saving your TikTok bio, run:",
                            "",
                            "`/verify check`",
                            "",
                            "A new code is generated every time you run `/verify start`."
                        ].join("\n")
                    )
                ],
                flags: MessageFlags.Ephemeral
            });
        }

        if (subcommand === "check") {
            await InteractionHelper.safeDefer(interaction, {
                flags: MessageFlags.Ephemeral
            });

            const record = await getTikTokVerification(
                client,
                interaction.user.id
            );

            if (!record) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        infoEmbed(
                            "No Verification Started",
                            "Run `/verify start username:yourusername` first."
                        )
                    ]
                });
            }

            if (record.verified) {
                const result = await verifyUser(
                    client,
                    interaction.guild.id,
                    interaction.user.id,
                    {
                        source: "tiktok_bio",
                        moderatorId: null
                    }
                );

                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        successEmbed(
                            "Already Verified",
                            `Your TikTok **@${record.username}** is already verified and you have the **${result.roleName}** role.`
                        )
                    ]
                });
            }

            const bio = await getTikTokBio(record.username);

            const normalizedBio = bio.toUpperCase();
            const expectedCode =
                record.verification_code.toUpperCase();

            if (!normalizedBio.includes(expectedCode)) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        infoEmbed(
                            "❌ Code Not Found",
                            [
                                `I checked **@${record.username}**, but I could not find:`,
                                "",
                                `\`${record.verification_code}\``,
                                "",
                                "Make sure:",
                                "• the account is public",
                                "• the username is correct",
                                "• the code is saved in the TikTok bio",
                                "• TikTok has finished updating the profile",
                                "",
                                "Then run `/verify check` again."
                            ].join("\n")
                        )
                    ]
                });
            }

            await markTikTokVerified(
                client,
                interaction.user.id
            );

            const result = await verifyUser(
                client,
                interaction.guild.id,
                interaction.user.id,
                {
                    source: "tiktok_bio",
                    moderatorId: null
                }
            );

            return InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    successEmbed(
                        "✅ TikTok Verified",
                        [
                            `TikTok account: **@${record.username}**`,
                            "",
                            `You received the **${result.roleName}** role.`,
                            "You can now continue the rest of the onboarding process."
                        ].join("\n")
                    )
                ]
            });
        }
    }
};
