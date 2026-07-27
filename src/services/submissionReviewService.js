import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    MessageFlags,
    PermissionFlagsBits
} from "discord.js";

import {
    getCampaign,
    saveCampaign
} from "../utils/database.js";

import {
    getSubmission,
    reviewSubmission
} from "./submissionService.js";

import {
    appendSubmissionReview
} from "../utils/googleSheets.js";

const STAFF_ROLE_ID =
    process.env.STAFF_ROLE_ID ||
    "1529961495402778771";

function isStaff(interaction) {
    return Boolean(
        interaction.memberPermissions?.has(
            PermissionFlagsBits.ManageGuild
        ) ||
        interaction.member?.roles?.cache?.has(
            STAFF_ROLE_ID
        )
    );
}

function updatedReviewEmbed(message, submission, status, rejectionReason) {
    const original = message.embeds?.[0];
    const embed = original
        ? EmbedBuilder.from(original)
        : new EmbedBuilder().setTitle("Clip Submission");

    const fields = (original?.fields || []).map(field => {
        if (field.name === "Status") {
            return {
                ...field,
                value:
                    status === "approved"
                        ? "🟢 Approved"
                        : "🔴 Rejected"
            };
        }

        return {
            name: field.name,
            value: field.value,
            inline: field.inline
        };
    });

    if (
        status === "rejected" &&
        rejectionReason
    ) {
        fields.push({
            name: "Rejection Reason",
            value: rejectionReason,
            inline: false
        });
    }

    embed
        .setFields(fields)
        .setColor(
            status === "approved"
                ? 0x57f287
                : 0xed4245
        )
        .setFooter({
            text:
                `${status === "approved" ? "Approved" : "Rejected"} by ${message.guild?.members?.me?.displayName || "staff"}`
        })
        .setTimestamp();

    return embed;
}

function disabledReviewButtons(submissionId, status) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`submission_approve_${submissionId}`)
            .setLabel(
                status === "approved"
                    ? "Approved"
                    : "Approve"
            )
            .setEmoji("✅")
            .setStyle(ButtonStyle.Success)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId(`submission_reject_${submissionId}`)
            .setLabel(
                status === "rejected"
                    ? "Rejected"
                    : "Reject"
            )
            .setEmoji("❌")
            .setStyle(ButtonStyle.Danger)
            .setDisabled(true)
    );
}

export async function finalizeSubmissionReview({
    interaction,
    client,
    submissionId,
    status,
    rejectionReason = null,
    staffNotes = null,
    reviewChannelId = null,
    reviewMessageId = null
}) {
    if (!isStaff(interaction)) {
        const payload = {
            content: "❌ Only staff can review submissions.",
            flags: MessageFlags.Ephemeral
        };

        if (interaction.deferred || interaction.replied) {
            await interaction.followUp(payload);
        } else {
            await interaction.reply(payload);
        }
        return null;
    }

    const submission = await getSubmission(
        client,
        submissionId
    );

    if (!submission) {
        throw new Error(
            `Submission #${submissionId} was not found.`
        );
    }

    const reviewed = await reviewSubmission(client, {
        submissionId,
        status,
        reviewedBy: interaction.user.id,
        rejectionReason,
        staffNotes
    });

    if (!reviewed) {
        const payload = {
            content:
                "⚠️ This submission was already reviewed.",
            flags: MessageFlags.Ephemeral
        };

        if (interaction.deferred || interaction.replied) {
            await interaction.followUp(payload);
        } else {
            await interaction.reply(payload);
        }
        return null;
    }

    const campaign = await getCampaign(
        client,
        submission.campaign_id
    );

    if (campaign) {
        campaign.pendingSubmissions = Math.max(
            0,
            Number(campaign.pendingSubmissions || 0) - 1
        );

        if (status === "approved") {
            campaign.approvedSubmissions =
                Number(campaign.approvedSubmissions || 0) + 1;
        } else {
            campaign.rejectedSubmissions =
                Number(campaign.rejectedSubmissions || 0) + 1;
        }

        await saveCampaign(
            client,
            campaign.id,
            campaign
        );

        if (campaign.googleSheetId) {
            try {
                const creator = await interaction.guild.members
                    .fetch(submission.user_id)
                    .catch(() => null);

                await appendSubmissionReview({
                    spreadsheetId: campaign.googleSheetId,
                    reviewedAt: reviewed.reviewed_at,
                    campaignName: campaign.name,
                    creatorName:
                        creator?.user?.tag ||
                        submission.user_id,
                    creatorId: submission.user_id,
                    videoUrl: submission.video_url,
                    platform: submission.platform,
                    status:
                        status === "approved"
                            ? "Approved"
                            : "Rejected",
                    rejectionReason,
                    reviewedBy: interaction.user.tag,
                    staffNotes,
                    submittedAt: submission.created_at,
                    submissionId: submission.id
                });
            } catch (sheetError) {
                console.error(
                    "Failed to append submission review to Google Sheet:",
                    sheetError
                );
            }
        }
    }

    let reviewMessage = interaction.message || null;

    if (
        reviewChannelId &&
        reviewMessageId &&
        (!reviewMessage || reviewMessage.id !== reviewMessageId)
    ) {
        const channel = await interaction.guild.channels
            .fetch(reviewChannelId)
            .catch(() => null);

        if (channel?.isTextBased()) {
            reviewMessage = await channel.messages
                .fetch(reviewMessageId)
                .catch(() => null);
        }
    }

    if (reviewMessage) {
        await reviewMessage.edit({
            embeds: [
                updatedReviewEmbed(
                    reviewMessage,
                    submission,
                    status,
                    rejectionReason
                )
            ],
            components: [
                disabledReviewButtons(
                    submission.id,
                    status
                )
            ]
        });
    }

    const confirmation =
        status === "approved"
            ? `✅ Submission #${submission.id} approved.`
            : `❌ Submission #${submission.id} rejected: ${rejectionReason}`;

    await interaction.followUp({
        content: confirmation,
        flags: MessageFlags.Ephemeral
    });

    return reviewed;
}
