import { google } from "googleapis";
import { getAuthenticatedClient } from "./auth.js";
import { config } from "../config.js";

export async function sendDigestEmail(subject: string, html: string, plainText: string) {
  const auth = await getAuthenticatedClient();
  const gmail = google.gmail({ version: "v1", auth });

  const message = buildMimeMessage({
    to: config.digest.to,
    subject,
    html,
    plainText,
  });

  const encoded = Buffer.from(message).toString("base64url");

  await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw: encoded },
  });
}

function buildMimeMessage({
  to,
  subject,
  html,
  plainText,
}: {
  to: string;
  subject: string;
  html: string;
  plainText: string;
}): string {
  const boundary = "cos_digest_boundary";

  return [
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    plainText,
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=utf-8",
    "",
    html,
    "",
    `--${boundary}--`,
  ].join("\r\n");
}
