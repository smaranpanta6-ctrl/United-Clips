import fetch from "node-fetch";

const APIFY_TOKEN = process.env.APIFY_TOKEN;
const APIFY_ACTOR_ID = process.env.APIFY_ACTOR_ID;

function cleanUsername(value) {
    return String(value || "")
        .trim()
        .replace(/^https?:\/\/(www\.)?tiktok\.com\/@/i, "")
        .replace(/^@/, "")
        .split(/[/?#]/)[0]
        .trim();
}

export async function getTikTokProfile(username) {
    if (!APIFY_TOKEN) {
        throw new Error("APIFY_TOKEN is missing from Railway Variables.");
    }

    if (!APIFY_ACTOR_ID) {
        throw new Error("APIFY_ACTOR_ID is missing from Railway Variables.");
    }

    const clean = cleanUsername(username);

    if (!clean) {
        throw new Error("Invalid TikTok username.");
    }

    const runResponse = await fetch(
        `https://api.apify.com/v2/acts/${encodeURIComponent(APIFY_ACTOR_ID)}/runs?token=${encodeURIComponent(APIFY_TOKEN)}&waitForFinish=60`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },

            // This matches the Profile(s) input shown in your Actor.
            body: JSON.stringify({
                profiles: [`@${clean}`]
            })
        }
    );

    const runPayload = await runResponse.json();

    if (!runResponse.ok) {
        throw new Error(
            runPayload?.error?.message ||
            `Apify run failed with status ${runResponse.status}`
        );
    }

    const run = runPayload?.data;

    if (!run?.id) {
        throw new Error("Apify did not return a run ID.");
    }

    let finishedRun = run;

    // waitForFinish may return while the run is still processing.
    for (let attempt = 0; attempt < 30; attempt += 1) {
        if (
            finishedRun.status === "SUCCEEDED" ||
            finishedRun.status === "FAILED" ||
            finishedRun.status === "ABORTED" ||
            finishedRun.status === "TIMED-OUT"
        ) {
            break;
        }

        await new Promise(resolve => setTimeout(resolve, 2000));

        const statusResponse = await fetch(
            `https://api.apify.com/v2/actor-runs/${run.id}?token=${encodeURIComponent(APIFY_TOKEN)}`
        );

        const statusPayload = await statusResponse.json();

        if (!statusResponse.ok) {
            throw new Error(
                statusPayload?.error?.message ||
                "Could not check Apify run status."
            );
        }

        finishedRun = statusPayload.data;
    }

    if (finishedRun.status !== "SUCCEEDED") {
        throw new Error(
            `TikTok profile lookup did not finish successfully (${finishedRun.status}).`
        );
    }

    const datasetId = finishedRun.defaultDatasetId;

    if (!datasetId) {
        throw new Error("Apify did not return a dataset.");
    }

    const itemsResponse = await fetch(
        `https://api.apify.com/v2/datasets/${datasetId}/items?clean=true&format=json&token=${encodeURIComponent(APIFY_TOKEN)}`
    );

    const items = await itemsResponse.json();

    if (!itemsResponse.ok) {
        throw new Error(
            items?.error?.message ||
            "Could not retrieve TikTok profile results."
        );
    }

    if (!Array.isArray(items) || items.length === 0) {
        return null;
    }

    return items[0];
}

export async function getTikTokBio(username) {
    const profile = await getTikTokProfile(username);
    return String(profile?.bio || "");
}
