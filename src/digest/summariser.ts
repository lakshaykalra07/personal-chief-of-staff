import Anthropic from "@anthropic-ai/sdk";
import fs from "fs/promises";
import { config } from "../config.js";
import type { EmailMessage } from "../gmail/reader.js";

export interface SummaryItem {
  from: string;
  subject: string;
  gist: string;
  asks?: string;           // for needs-reply: what they are specifically asking for
  suggestedAction?: string;
  keyPoints?: string[];    // for fyi: 3-5 bullet takeaways
}

export interface DigestSummary {
  needsReply: SummaryItem[];
  urgent: SummaryItem[];
  fyi: SummaryItem[];
}

const client = new Anthropic({ apiKey: config.anthropic.apiKey });
const BATCH_SIZE = 30;
const BATCH_DELAY_MS = 5000;

export async function summariseEmails(emails: EmailMessage[]): Promise<DigestSummary> {
  const persona = await fs.readFile("persona.md", "utf-8").catch(() => "");

  // Split into batches to stay within rate limits
  const batches: EmailMessage[][] = [];
  for (let i = 0; i < emails.length; i += BATCH_SIZE) {
    batches.push(emails.slice(i, i + BATCH_SIZE));
  }

  const results: DigestSummary[] = [];
  for (let i = 0; i < batches.length; i++) {
    if (i > 0) await delay(BATCH_DELAY_MS);
    console.log(`  Batch ${i + 1}/${batches.length} (${batches[i].length} emails)...`);
    results.push(await summariseBatchWithRetry(batches[i], persona));
  }

  return {
    needsReply: results.flatMap((r) => r.needsReply),
    urgent: results.flatMap((r) => r.urgent),
    fyi: results.flatMap((r) => r.fyi),
  };
}

async function summariseBatch(emails: EmailMessage[], persona: string, attempt = 1): Promise<DigestSummary> {
  if (attempt > 5) throw new Error("Exceeded max retries on rate limit");

  // Send subject + snippet only — body is too expensive at scale; snippet captures the key info
  const emailsText = emails
    .map(
      (e, i) =>
        `--- Email ${i + 1} ---\nFrom: ${e.from}\nSubject: ${e.subject}\nDate: ${e.date}\nSnippet: ${e.snippet}`
    )
    .join("\n\n");

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8192,
    system: [
      {
        type: "text",
        text: `You are a Chief of Staff assistant. Your job is to read the user's emails and produce a crisp daily digest.

Here is the user's persona and preferences:
<persona>
${persona}
</persona>

Rules:
- Classify each email as one of: needs-reply, urgent, fyi
- "needs-reply": someone is waiting on the user — direct question, action item, meeting request, anything where silence is costly
- "urgent": time-sensitive or from a high-priority sender, but not necessarily waiting on a reply
- "fyi": informational, newsletters, articles, updates — no action needed
- Skip automated system notifications with no human sender and no content value
- For needs-reply items:
  - "gist": one sentence summary of the email
  - "asks": exactly what they are asking for (e.g. "Wants you to confirm the meeting time for Monday", "Asking for your CV and comp expectations")
  - "suggestedAction": the specific action to take (e.g. "Accept or decline calendar invite", "Reply with CV attached")
- For fyi items:
  - "gist": one sentence summary
  - "keyPoints": array of 3–5 short bullet takeaways (only for newsletters/articles with actual content — omit for automated notifications)

Respond with ONLY valid JSON matching this exact shape, no markdown fences:
{
  "needsReply": [{ "from": "Name", "subject": "...", "gist": "...", "asks": "...", "suggestedAction": "..." }],
  "urgent": [{ "from": "Name", "subject": "...", "gist": "..." }],
  "fyi": [{ "from": "Name", "subject": "...", "gist": "...", "keyPoints": ["...", "..."] }]
}`,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `Here are my emails from the last ${config.digest.lookbackHours} hours. Produce the digest.\n\n${emailsText}`,
      },
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";

  try {
    return JSON.parse(text) as DigestSummary;
  } catch {
    throw new Error(`Claude returned unparseable JSON in batch:\n${text}`);
  }
}

async function summariseBatchWithRetry(emails: EmailMessage[], persona: string): Promise<DigestSummary> {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      return await summariseBatch(emails, persona, attempt);
    } catch (err: any) {
      if (err?.status === 429) {
        const retryAfter = Number(err?.headers?.["retry-after"] ?? 65);
        console.log(`  Rate limited — waiting ${retryAfter}s before retry...`);
        await delay(retryAfter * 1000);
      } else {
        throw err;
      }
    }
  }
  throw new Error("Exceeded max retries on rate limit");
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
