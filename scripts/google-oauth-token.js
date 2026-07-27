import http from "node:http";
import { google } from "googleapis";

const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
const clientSecret =
    process.env.GOOGLE_OAUTH_CLIENT_SECRET;

const redirectUri =
    "http://localhost:3000/oauth2callback";

if (!clientId || !clientSecret) {
    console.error(
        "Missing GOOGLE_OAUTH_CLIENT_ID or GOOGLE_OAUTH_CLIENT_SECRET."
    );
    process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri
);

const scopes = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive.file"
];

const authorizationUrl =
    oauth2Client.generateAuthUrl({
        access_type: "offline",
        prompt: "consent",
        include_granted_scopes: true,
        scope: scopes
    });

const server = http.createServer(
    async (request, response) => {
        try {
            const url = new URL(
                request.url,
                "http://localhost:3000"
            );

            if (
                url.pathname !==
                "/oauth2callback"
            ) {
                response.writeHead(404);
                response.end("Not found");
                return;
            }

            const error =
                url.searchParams.get("error");

            if (error) {
                throw new Error(
                    `Google authorization failed: ${error}`
                );
            }

            const code =
                url.searchParams.get("code");

            if (!code) {
                throw new Error(
                    "Google did not return an authorization code."
                );
            }

            const { tokens } =
                await oauth2Client.getToken(code);

            if (!tokens.refresh_token) {
                throw new Error(
                    "No refresh token was returned. Revoke the app's access in your Google Account and try again."
                );
            }

            console.log("\nGOOGLE_OAUTH_REFRESH_TOKEN:\n");
            console.log(tokens.refresh_token);
            console.log(
                "\nCopy it into Railway. Do not share it."
            );

            response.writeHead(200, {
                "Content-Type":
                    "text/plain; charset=utf-8"
            });

            response.end(
                "Authorization completed. Return to the Codespaces terminal."
            );
        } catch (error) {
            console.error(
                "OAuth callback failed:",
                error
            );

            response.writeHead(500, {
                "Content-Type":
                    "text/plain; charset=utf-8"
            });

            response.end(
                "Authorization failed. Check the Codespaces terminal."
            );
        } finally {
            setTimeout(
                () => server.close(),
                500
            );
        }
    }
);

server.listen(3000, "0.0.0.0", () => {
    console.log(
        "\nOpen this URL in your browser:\n"
    );

    console.log(authorizationUrl);

    console.log(
        "\nWaiting for Google authorization..."
    );
});
