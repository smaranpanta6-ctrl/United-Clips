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

async function safelyRespond(interaction, payload) {
    try {
        if (interaction.deferred) {
            return await interaction.editReply(payload);
        }

        if (interaction.replied) {
            return await interaction.followUp({
                ...payload,
                flags: MessageFlags.Ephemeral
            });
        }

        return await interaction.reply({
            ...payload,
            flags: MessageFlags.Ephemeral
        });
    } catch (error) {
        if (
            error?.code !== 40060 &&
            error?.code !== "InteractionAlreadyReplied"
        ) {
            console.error(
                "Failed to respond to review interaction:",
                error
            );
        }

        return null;
    }
}

function updatedReviewEmbed(
    message,
    submission,
    status,
    rejectionReason
) {
    const original = message.embeds?.[0];

    const embed = original
        ? EmbedBuilder.from(original)
        : new EmbedBuilder().setTitle(
            "Clip Submission"
        );

    const fields = [];

    let foundStatus = false;

    for (const field of original?.fields || []) {
        // Remove the old rejection reason so it does
        // not duplicate when staff changes the decision.
        if (field.name === "Rejection Reason") {
            continue;
        }

        if (field.name === "Status") {
            foundStatus = true;

            fields.push({
                name: "Status",
                value:
                    status === "approved"
                        ? "🟢 Approved"
                        : "🔴 Rejected",
                inline: field.inline
            });

            continue;
        }

        fields.push({
            name: field.name,
            value: field.value,
            inline: field.inline
        });
    }

    if (!foundStatus) {
        fields.push({
            name: "Status",
            value:
                status === "approved"
                    ? "🟢 Approved"
                    : "🔴 Rejected",
            inline: true
        });
    }

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
                status === "approved"
                    ? "Submission approved"
                    : "Submission rejected"
        })
        .setTimestamp();

    return embed;
}

function activeReviewButtons(submissionId, status) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(
                `submission_approve_${submissionId}`
            )
            .setLabel(
                status === "approved"
                    ? "Approved"
                    : "Approve"
            )
            .setEmoji("✅")
            .setStyle(ButtonStyle.Success)
            // Disable only the decision that is
            // already selected.
            .setDisabled(status === "approved"),

        new ButtonBuilder()
            .setCustomId(
                `submission_reject_${submissionId}`
            )
            .setLabel(
                status === "rejected"
                    ? "Rejected"
                    : "Reject"
            )
            .setEmoji("❌")
            .setStyle(ButtonStyle.Danger)
            // Staff can still change Approved to
            // Rejected and vice versa.
            .setDisabled(status === "rejected")
    );
}

async function sendCreatorReviewDm({
    client,
    submission,
    campaign,
    status,
    rejectionReason
}) {
    try {
        const creator = await client.users.fetch(
            submission.user_id
        );

        const embed = new EmbedBuilder()
            .setTitle(
                status === "approved"
                    ? "✅ Submission Approved"
                    : "❌ Submission Rejected"
            )
            .addFields(
                {
                    name: "Campaign",
                    value:
                        campaign?.name ||
                        `Campaign #${submission.campaign_id}`
                },
                {
                    name: "Submission",
                    value: `#${submission.id}`,
                    inline: true
                },
                {
                    name: "Platform",
                    value:
                        submission.platform ||
                        "Unknown",
                    inline: true
                }
            )
            .setColor(
                status === "approved"
                    ? 0x57f287
                    : 0xed4245
            )
            .setTimestamp();

        if (status === "approved") {
            embed.setDescription(
                "Congratulations! Your clip has been approved.\n\nThanks for participating in United Clips."
            );
        } else {
            embed
                .setDescription(
                    "Your clip was not approved. You may resubmit if the campaign is still active."
                )
                .addFields({
                    name: "Reason",
                    value:
                        rejectionReason ||
                        "No reason provided."
                });
        }

        await creator.send({
            embeds: [embed]
        });
    } catch {
        // Ignore closed DMs or unavailable users.
    }
}

function normalizeStatus(status) {
    return String(status || "")
        .trim()
        .toLowerCase();
}

function updateCampaignCounters({
    campaign,
    previousStatus,
    newStatus
}) {
    const previous = normalizeStatus(previousStatus);
    const next = normalizeStatus(newStatus);

    if (previous === next) {
        return;
    }

    // First review: Pending -> Approved/Rejected
    if (
        previous !== "approved" &&
        previous !== "rejected"
    ) {
        campaign.pendingSubmissions = Math.max(
            0,
            Number(
                campaign.pendingSubmissions || 0
            ) - 1
        );
    }

    // Remove the previous decision when staff
    // changes Approved <-> Rejected.
    if (previous === "approved") {
        campaign.approvedSubmissions = Math.max(
            0,
            Number(
                campaign.approvedSubmissions || 0
            ) - 1
        );
    }

    if (previous === "rejected") {
        campaign.rejectedSubmissions = Math.max(
            0,
            Number(
                campaign.rejectedSubmissions || 0
            ) - 1
        );
    }

    // Add the new decision.
    if (next === "approved") {
        campaign.approvedSubmissions =
            Number(
                campaign.approvedSubmissions || 0
            ) + 1;
    }

    if (next === "rejected") {
        campaign.rejectedSubmissions =
            Number(
                campaign.rejectedSubmissions || 0
            ) + 1;
    }
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
        await safelyRespond(interaction, {
            content:
                "❌ Only staff can review submissions."
        });

        return null;
    }

    const normalizedStatus =
        normalizeStatus(status);

    if (
        normalizedStatus !== "approved" &&
        normalizedStatus !== "rejected"
    ) {
        throw new Error(
            `Invalid review status: ${status}`
        );
    }

    const submission = await getSubmission(
        client,
        submissionId
    );

    if (!submission) {
        await safelyRespond(interaction, {
            content:
                `❌ Submission #${submissionId} was not found.`
        });

        return null;
    }

    const previousStatus =
        normalizeStatus(submission.status);

    if (previousStatus === normalizedStatus) {
        await safelyRespond(interaction, {
            content:
                normalizedStatus === "approved"
                    ? `⚠️ Submission #${submission.id} is already approved.`
                    : `⚠️ Submission #${submission.id} is already rejected.`
        });

        return null;
    }

    const reviewed = await reviewSubmission(client, {
        submissionId,
        status: normalizedStatus,
        reviewedBy: interaction.user.id,
        rejectionReason:
            normalizedStatus === "rejected"
                ? rejectionReason
                : null,
        staffNotes
    });

    if (!reviewed) {
        await safelyRespond(interaction, {
            content:
                "❌ The submission could not be updated."
        });

        return null;
    }

    const campaign = await getCampaign(
        client,
        submission.campaign_id
    );

    if (campaign) {
        updateCampaignCounters({
            campaign,
            previousStatus,
            newStatus: normalizedStatus
        });

        await saveCampaign(
            client,
            campaign.id,
            campaign
        );

        if (campaign.googleSheetId) {
            try {
                const creator =
                    await interaction.guild.members
                        .fetch(submission.user_id)
                        .catch(() => null);

                await appendSubmissionReview({
                    spreadsheetId:
                        campaign.googleSheetId,
                    reviewedAt:
                        reviewed.reviewed_at ||
                        new Date(),
                    campaignName:
                        campaign.name,
                    creatorName:
                        creator?.user?.tag ||
                        submission.user_id,
                    creatorId:
                        submission.user_id,
                    videoUrl:
                        submission.video_url,
                    platform:
                        submission.platform,
                    status:
                        normalizedStatus ===
                        "approved"
                            ? "Approved"
                            : "Rejected",
                    rejectionReason:
                        normalizedStatus ===
                        "rejected"
                            ? rejectionReason
                            : null,
                    reviewedBy:
                        interaction.user.tag,
                    staffNotes,
                    submittedAt:
                        submission.created_at,
                    submissionId:
                        submission.id
                });
            } catch (sheetError) {
                console.error(
                    "Failed to append submission review to Google Sheet:",
                    sheetError
                );
            }
        }
    }

    let reviewMessage =
        interaction.message || null;

    if (
        reviewChannelId &&
        reviewMessageId &&
        (
            !reviewMessage ||
            reviewMessage.id !== reviewMessageId
        )
    ) {
        const channel =
            await interaction.guild.channels
                .fetch(reviewChannelId)
                .catch(() => null);

        if (channel?.isTextBased()) {
            reviewMessage =
                await channel.messages
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
                    normalizedStatus,
                    rejectionReason
                )
            ],
            components: [
                activeReviewButtons(
                    submission.id,
                    normalizedStatus
                )
            ]
        });
    }

    await sendCreatorReviewDm({
        client,
        submission,
        campaign,
        status: normalizedStatus,
        rejectionReason
    });

    const confirmation =
        normalizedStatus === "approved"
            ? `✅ Submission #${submission.id} approved.`
            : `❌ Submission #${submission.id} rejected: ${
                rejectionReason ||
                "No reason provided"
            }`;

    await safelyRespond(interaction, {
        content: confirmation
    });

    return reviewed;
}
