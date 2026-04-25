import { fetchRecentEmails } from "../gmail/reader.js";
import { summariseEmails } from "./summariser.js";
import { formatDigestHtml, formatDigestPlainText } from "./formatter.js";
import { sendDigestEmail } from "../gmail/sender.js";
import { config } from "../config.js";

async function main() {
  const date = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  console.log(`\nFetching emails from the last ${config.digest.lookbackHours}h...`);
  const emails = await fetchRecentEmails();
  console.log(`Found ${emails.length} emails to process.`);

  if (emails.length === 0) {
    console.log("No emails to summarise. Sending inbox-zero digest.");
  }

  console.log("Summarising with Claude...");
  const summary = await summariseEmails(emails);

  const needsReplyCount = summary.needsReply.length;
  const urgentCount = summary.urgent.length;
  const fyiCount = summary.fyi.length;
  console.log(`  → ${needsReplyCount} needs reply, ${urgentCount} urgent, ${fyiCount} FYI`);

  const subject = needsReplyCount > 0
    ? `Daily Digest — ${needsReplyCount} need${needsReplyCount === 1 ? "s" : ""} your reply (${date})`
    : `Daily Digest — ${date}`;

  const html = formatDigestHtml(summary, date);
  const plainText = formatDigestPlainText(summary, date);

  console.log(`Sending digest to ${config.digest.to}...`);
  await sendDigestEmail(subject, html, plainText);

  console.log("Done. Digest sent.\n");
  console.log(plainText);
}

main().catch((err) => {
  console.error("Digest failed:", err);
  process.exit(1);
});
