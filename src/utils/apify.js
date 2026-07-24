import fetch from "node-fetch";

const TOKEN = process.env.APIFY_TOKEN;

export async function getTikTokBio(username) {

    const actorId = "HSRboivfuzudeG17b";

    const run = await fetch(
        `https://api.apify.com/v2/acts/${actorId}/runs?token=${TOKEN}`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                usernames: [username]
            })
        }
    );

    const runData = await run.json();

    const datasetId =
        runData.data.defaultDatasetId;

    await new Promise(r => setTimeout(r, 7000));

    const result = await fetch(
        `https://api.apify.com/v2/datasets/${datasetId}/items?token=${TOKEN}`
    );

    const items = await result.json();

    if (!items.length) return null;

    return items[0].bio || "";
}
