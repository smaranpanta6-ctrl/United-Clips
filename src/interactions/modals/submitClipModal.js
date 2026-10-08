import {
    EmbedBuilder,
    MessageFlags,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} from "discord.js";

import { getColor } from "../../config/bot.js";

import {
    createSubmission,
    DuplicateSubmissionError
} from "../../services/submissionService.js";

import {
    getCampaign
} from "../../utils/database.js";
import { validateClipUrl } from '../../utils/clipValidation.js';
import { submissionAccessError } from '../../utils/campaignAccess.js';

export default {
    name: "submit_clip_modal",

    async execute(interaction, client) {
        await interaction.deferReply({
            flags: MessageFlags.Ephemeral
        });

        try {
            const [, campaignId] =
                interaction.customId.split(":");

            if (!campaignId) {
                return interaction.editReply({
                    content:
                        "❌ This submission is missing its campaign ID."
                });
            }

            const videoUrl =
                interaction.fields
                    .getTextInputValue("video_url")
                    .trim();

            const platform =
                interaction.fields
                    .getTextInputValue("platform")
                    .trim();

            const notes =
                interaction.fields
                    .getTextInputValue(
                        "submission_notes"
                    )
                    .trim();

            const clip = validateClipUrl(videoUrl, platform);
            if (!clip) {
                return interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle(
                                "❌ Invalid Video Link"
                            )
                            .setDescription(
                                "Use an HTTPS TikTok, Instagram, or YouTube video link and select its matching platform. Profile links cannot be submitted."
                            )
                            .setColor(
                                getColor("error")
                            )
                    ]
                });
            }

            const campaign =
                await getCampaign(
                    client,
                    campaignId
                );

            if (!campaign) {
                return interaction.editReply({
                    content:
                        "❌ This campaign could not be found."
                });
            }

            const accessError = await submissionAccessError(interaction, client, campaign);
            if (accessError) return interaction.editReply({ content: accessError });

            const submission =
                await createSubmission(client, {
                    guildId:
                        interaction.guild.id,

                    campaignId,

                    userId:
                        interaction.user.id,

                    videoUrl: clip.videoUrl,

                    platform: clip.platform,

                    notes:
                        notes || null
                });

            /*
             * Send the submission to the campaign's
             * private staff review channel.
             */
            let reviewDelivered = false;
            try {
                let staffReviewChannel = null;

                if (campaign.staffReviewChannel) {
                    staffReviewChannel =
                        interaction.guild.channels.cache.get(
                            campaign.staffReviewChannel
                        );

                    if (!staffReviewChannel) {
                        staffReviewChannel =
                            await interaction.guild.channels
                                .fetch(
                                    campaign.staffReviewChannel
                                )
                                .catch(() => null);
                    }
                }

                /*
                 * Backup search in case an older campaign
                 * did not save staffReviewChannel correctly.
                 */
                if (
                    !staffReviewChannel &&
                    campaign.category
                ) {
                    staffReviewChannel =
                        interaction.guild.channels.cache.find(
                            channel =>
                                channel.parentId ===
                                    campaign.category &&
                                channel.type ===
                                    0 &&
                                channel.name ===
                                    "🛡️-staff-review"
                        );
                }

                if (
                    staffReviewChannel &&
                    staffReviewChannel.isTextBased()
                ) {
                    const reviewEmbed =
                        new EmbedBuilder()
                            .setColor(
                                getColor("warning")
                            )
                            .setTitle(
                                "🟡 New Clip Submission"
                            )
                            .setDescription(
                                "A creator submitted a clip for staff review."
                            )
                            .addFields(
                                {
                                    name: "Campaign",
                                    value:
                                        campaign.name ||
                                        campaignId,
                                    inline: true
                                },
                                {
                                    name:
                                        "Submission ID",
                                    value:
                                        `#${submission.id}`,
                                    inline: true
                                },
                                {
                                    name: "Status",
                                    value:
                                        "🟡 Pending",
                                    inline: true
                                },
                                {
                                    name: "Creator",
                                    value:
                                        `<@${interaction.user.id}>`,
                                    inline: true
                                },
                                {
                                    name:
                                        "Discord ID",
                                    value:
                                        interaction.user.id,
                                    inline: true
                                },
                                {
                                    name: "Platform",
                                    value:
                                        submission.platform ||
                                        platform,
                                    inline: true
                                },
                                {
                                    name: "Video",
                                    value:
                                        submission.video_url ||
                                        videoUrl,
                                    inline: false
                                },
                                {
                                    name: "Notes",
                                    value:
                                        notes ||
                                        "No notes provided.",
                                    inline: false
                                }
                            )
                            .setFooter({
                                text:
                                    `Campaign ID: ${campaignId}`
                            })
                            .setTimestamp();

                    const reviewButtons =
                        new ActionRowBuilder()
                            .addComponents(
                                new ButtonBuilder()
                                    .setCustomId(
                                        `submission_approve_${submission.id}`
                                    )
                                    .setLabel(
                                        "Approve"
                                    )
                                    .setEmoji("✅")
                                    .setStyle(
                                        ButtonStyle.Success
                                    ),

                                new ButtonBuilder()
                                    .setCustomId(
                                        `submission_reject_${submission.id}`
                                    )
                                    .setLabel(
                                        "Reject"
                                    )
                                    .setEmoji("❌")
                                    .setStyle(
                                        ButtonStyle.Danger
                                    )
                            );

                    await staffReviewChannel.send({
                        embeds: [reviewEmbed],
                        components: [reviewButtons]
                    });
                    reviewDelivered = true;
                } else {
                    console.error(
                        `Staff review channel not found for campaign ${campaignId}.`
                    );
                }
            } catch (reviewChannelError) {
                console.error(
                    "Failed to send submission to staff review channel:",
                    reviewChannelError
                );
            }

            return interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle(
                            "✅ Clip Submitted"
                        )
                        .setDescription(
                            reviewDelivered
                                ? "Your clip is saved and has been sent to staff for review."
                                : "Your clip is saved, but the staff review panel could not be delivered. Open a support ticket with your submission ID so staff can recover it. Do not submit it again."
                        )
                        .addFields(
                            {
                                name:
                                    "Submission ID",
                                value:
                                    `#${submission.id}`,
                                inline: true
                            },
                            {
                                name: "Platform",
                                value:
                                    submission.platform ||
                                    platform,
                                inline: true
                            },
                            {
                                name: "Status",
                                value:
                                    "🟡 Pending",
                                inline: true
                            },
                            {
                                name: "Video",
                                value:
                                    submission.video_url ||
                                    videoUrl,
                                inline: false
                            }
                        )
                        .setColor(
                            getColor("success")
                        )
                        .setTimestamp()
                ]
            });
        } catch (error) {
            if (error instanceof DuplicateSubmissionError) {
                return interaction.editReply({
                    content: `This clip is already submission #${error.submission.id} (${error.submission.status}). Check My Stats for your submission status.`
                });
            }
            console.error(
                "Clip submission failed:",
                error
            );

            return interaction.editReply({
                content:
                    "❌ Your clip could not be submitted. Check the Railway logs."
            });
        }
    }
};
