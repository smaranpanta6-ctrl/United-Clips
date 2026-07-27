import { google } from "googleapis";

function getGoogleClients() {
    const clientEmail =
        process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;

    const privateKey =
        process.env.GOOGLE_PRIVATE_KEY
            ?.replace(/\\n/g, "\n");

    const ownerEmail =
        process.env.GOOGLE_SHEET_OWNER_EMAIL;

    if (!clientEmail) {
        throw new Error(
            "GOOGLE_SERVICE_ACCOUNT_EMAIL is missing."
        );
    }

    if (!privateKey) {
        throw new Error(
            "GOOGLE_PRIVATE_KEY is missing."
        );
    }

    if (!ownerEmail) {
        throw new Error(
            "GOOGLE_SHEET_OWNER_EMAIL is missing."
        );
    }

    const auth = new google.auth.GoogleAuth({
        credentials: {
            client_email: clientEmail,
            private_key: privateKey
        },

        scopes: [
            "https://www.googleapis.com/auth/spreadsheets",
            "https://www.googleapis.com/auth/drive"
        ]
    });

    return {
        ownerEmail,

        sheets: google.sheets({
            version: "v4",
            auth
        }),

        drive: google.drive({
            version: "v3",
            auth
        })
    };
}

export async function createCampaignSpreadsheet(
    campaign
) {
    const {
        sheets,
        drive,
        ownerEmail
    } = getGoogleClients();

    const spreadsheetTitle =
        `United Clips — ${campaign.name}`.slice(
            0,
            100
        );

    const createResponse =
        await sheets.spreadsheets.create({
            requestBody: {
                properties: {
                    title: spreadsheetTitle
                },

                sheets: [
                    {
                        properties: {
                            title: "Reviews"
                        }
                    },
                    {
                        properties: {
                            title: "Payouts"
                        }
                    },
                    {
                        properties: {
                            title: "Leaderboard"
                        }
                    },
                    {
                        properties: {
                            title: "Campaign Stats"
                        }
                    }
                ]
            }
        });

    const spreadsheetId =
        createResponse.data.spreadsheetId;

    if (!spreadsheetId) {
        throw new Error(
            "Google did not return a spreadsheet ID."
        );
    }

    const spreadsheetUrl =
        createResponse.data.spreadsheetUrl ||
        `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

    await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,

        requestBody: {
            valueInputOption: "RAW",

            data: [
                {
                    range: "Reviews!A1:L1",
                    values: [
                        [
                            "Reviewed At",
                            "Campaign",
                            "Creator",
                            "Discord User ID",
                            "Video URL",
                            "Platform",
                            "Status",
                            "Rejection Reason",
                            "Staff Reviewer",
                            "Staff Notes",
                            "Submitted At",
                            "Submission ID"
                        ]
                    ]
                },

                {
                    range: "Payouts!A1:H1",
                    values: [
                        [
                            "Creator",
                            "Discord User ID",
                            "Approved Views",
                            "CPM",
                            "Earnings",
                            "Paid",
                            "Payment Date",
                            "Notes"
                        ]
                    ]
                },

                {
                    range: "Leaderboard!A1:F1",
                    values: [
                        [
                            "Rank",
                            "Creator",
                            "Discord User ID",
                            "Approved Clips",
                            "Approved Views",
                            "Earnings"
                        ]
                    ]
                },

                {
                    range: "Campaign Stats!A1:B9",
                    values: [
                        ["Campaign", campaign.name || ""],
                        ["Client", campaign.client || ""],
                        ["Budget", campaign.budget || ""],
                        ["CPM", campaign.cpm || ""],
                        ["Deadline", campaign.deadline || ""],
                        ["Total Submissions", 0],
                        ["Approved", 0],
                        ["Rejected", 0],
                        ["Pending", 0]
                    ]
                }
            ]
        }
    });

    await drive.permissions.create({
        fileId: spreadsheetId,

        requestBody: {
            type: "user",
            role: "writer",
            emailAddress: ownerEmail
        },

        sendNotificationEmail: false
    });

    return {
        spreadsheetId,
        spreadsheetUrl
    };
}

export async function appendSubmissionReview({
    spreadsheetId,
    reviewedAt,
    campaignName,
    creatorName,
    creatorId,
    videoUrl,
    platform,
    status,
    rejectionReason,
    reviewedBy,
    staffNotes,
    submittedAt,
    submissionId
}) {
    if (!spreadsheetId) {
        throw new Error(
            "No Google Sheet ID exists for this campaign."
        );
    }

    const {
        sheets
    } = getGoogleClients();

    await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: "Reviews!A:L",
        valueInputOption: "USER_ENTERED",
        insertDataOption: "INSERT_ROWS",

        requestBody: {
            values: [
                [
                    reviewedAt ||
                        new Date().toISOString(),

                    campaignName || "",
                    creatorName || "",
                    creatorId || "",
                    videoUrl || "",
                    platform || "",
                    status || "",
                    rejectionReason || "",
                    reviewedBy || "",
                    staffNotes || "",
                    submittedAt
                        ? new Date(
                              submittedAt
                          ).toISOString()
                        : "",
                    submissionId || ""
                ]
            ]
        }
    });
}
