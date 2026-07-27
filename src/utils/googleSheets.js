import { google } from "googleapis";

export function getGoogleErrorSummary(error) {
    return {
        message: error?.message || "Unknown Google API error",
        code: error?.code || error?.response?.status || null,
        error: error?.response?.data?.error || null,
        description:
            error?.response?.data?.error_description ||
            error?.response?.data?.error?.message ||
            null
    };
}

/*
|--------------------------------------------------------------------------
| GOOGLE OAUTH CLIENT
|--------------------------------------------------------------------------
|
| This authenticates as your personal Gmail account.
| It replaces the old service-account authentication.
|
*/

function getGoogleClients() {
    const clientId =
        process.env.GOOGLE_OAUTH_CLIENT_ID;

    const clientSecret =
        process.env.GOOGLE_OAUTH_CLIENT_SECRET;

    const refreshToken =
        process.env.GOOGLE_OAUTH_REFRESH_TOKEN;

    if (!clientId) {
        throw new Error(
            "GOOGLE_OAUTH_CLIENT_ID is missing."
        );
    }

    if (!clientSecret) {
        throw new Error(
            "GOOGLE_OAUTH_CLIENT_SECRET is missing."
        );
    }

    if (!refreshToken) {
        throw new Error(
            "GOOGLE_OAUTH_REFRESH_TOKEN is missing."
        );
    }

    const auth = new google.auth.OAuth2(
        clientId,
        clientSecret
    );

    auth.setCredentials({
        refresh_token: refreshToken
    });

    return {
        sheets: google.sheets({
            version: "v4",
            auth
        })
    };
}

/*
|--------------------------------------------------------------------------
| CREATE CAMPAIGN SPREADSHEET
|--------------------------------------------------------------------------
*/

export async function createCampaignSpreadsheet(
    campaign
) {
    if (!campaign?.name) {
        throw new Error(
            "Campaign name is required to create a spreadsheet."
        );
    }

    const { sheets } = getGoogleClients();

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
            },

            fields:
                "spreadsheetId,spreadsheetUrl"
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
                        [
                            "Campaign",
                            campaign.name || ""
                        ],
                        [
                            "Client",
                            campaign.client || ""
                        ],
                        [
                            "Budget",
                            campaign.budget || ""
                        ],
                        [
                            "CPM",
                            campaign.cpm || ""
                        ],
                        [
                            "Deadline",
                            campaign.deadline || ""
                        ],
                        [
                            "Total Submissions",
                            0
                        ],
                        [
                            "Approved",
                            0
                        ],
                        [
                            "Rejected",
                            0
                        ],
                        [
                            "Pending",
                            0
                        ]
                    ]
                }
            ]
        }
    });

    return {
        spreadsheetId,
        spreadsheetUrl
    };
}

/*
|--------------------------------------------------------------------------
| APPEND REVIEW
|--------------------------------------------------------------------------
*/

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

    const { sheets } = getGoogleClients();

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
