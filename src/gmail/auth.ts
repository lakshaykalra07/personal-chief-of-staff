import { google } from "googleapis";
import fs from "fs/promises";
import http from "http";
import { URL } from "url";
import open from "open";
import { config } from "../config.js";

const TOKEN_PATH = "token.json";

export function buildOAuthClient() {
  return new google.auth.OAuth2(
    config.gmail.clientId,
    config.gmail.clientSecret,
    config.gmail.redirectUri
  );
}

export async function getAuthenticatedClient() {
  const oauth2Client = buildOAuthClient();

  // Try loading a saved token first
  try {
    const raw = await fs.readFile(TOKEN_PATH, "utf-8");
    oauth2Client.setCredentials(JSON.parse(raw));
    return oauth2Client;
  } catch {
    // No token yet — run the OAuth flow
    return runOAuthFlow(oauth2Client);
  }
}

async function runOAuthFlow(oauth2Client: ReturnType<typeof buildOAuthClient>) {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/documents.readonly",
      "https://www.googleapis.com/auth/drive",
    ],
  });

  console.log("\nOpening browser for authorization (Gmail + Google Docs + Drive)...");
  console.log("If the browser doesn't open, visit this URL manually:\n");
  console.log(authUrl, "\n");

  await open(authUrl);

  // Spin up a temporary local server to catch the redirect
  const code = await waitForOAuthCode();

  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);

  await fs.writeFile(TOKEN_PATH, JSON.stringify(tokens, null, 2));
  console.log("Token saved to token.json — you won't need to authorize again.");

  return oauth2Client;
}

function waitForOAuthCode(): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://localhost:3000");
      const code = url.searchParams.get("code");

      if (code) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<h2>Authorization complete — you can close this tab.</h2>");
        server.close();
        resolve(code);
      } else {
        res.writeHead(400);
        res.end("No code received.");
        server.close();
        reject(new Error("OAuth callback did not contain a code"));
      }
    });

    server.listen(3000, () => {
      console.log("Waiting for OAuth callback on http://localhost:3000 ...");
    });

    server.on("error", reject);
  });
}

// Run directly: tsx src/gmail/auth.ts
if (process.argv[1]?.endsWith("auth.ts") || process.argv[1]?.endsWith("auth.js")) {
  getAuthenticatedClient()
    .then(() => console.log("Authentication successful."))
    .catch(console.error);
}
