import { google } from "googleapis";
import { getAuthenticatedClient } from "./auth.js";
import { config } from "../config.js";

export interface EmailMessage {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
  body: string;
  labels: string[];
}

// Only skip Promotions, Social, and Forums — Primary and Updates are included
const SKIP_LABEL_IDS = new Set([
  "CATEGORY_PROMOTIONS",
  "CATEGORY_SOCIAL",
  "CATEGORY_FORUMS",
]);

export async function fetchRecentEmails(): Promise<EmailMessage[]> {
  const auth = await getAuthenticatedClient();
  const gmail = google.gmail({ version: "v1", auth });

  const cutoff = new Date();
  cutoff.setHours(cutoff.getHours() - config.digest.lookbackHours);
  const after = Math.floor(cutoff.getTime() / 1000);

  // Include Primary and Updates tabs; exclude Promotions, Social, Forums, Sent, Drafts
  const query = `after:${after} -in:sent -in:drafts -category:promotions -category:social -category:forums`;

  const listRes = await gmail.users.messages.list({
    userId: "me",
    q: query,
    maxResults: 500,
  });

  const messages = listRes.data.messages ?? [];
  if (messages.length === 0) return [];

  const emails = await Promise.all(
    messages.map((m) => fetchMessage(gmail, m.id!))
  );

  return emails.filter((e): e is EmailMessage => e !== null);
}

async function fetchMessage(
  gmail: ReturnType<typeof google.gmail>,
  id: string
): Promise<EmailMessage | null> {
  try {
    const res = await gmail.users.messages.get({
      userId: "me",
      id,
      format: "full",
    });

    const msg = res.data;
    const headers = msg.payload?.headers ?? [];

    const get = (name: string) =>
      headers.find((h) => h.name?.toLowerCase() === name)?.value ?? "";

    const labels = msg.labelIds ?? [];
    if (labels.some((l) => SKIP_LABEL_IDS.has(l))) return null;

    const body = extractBody(msg.payload);

    return {
      id: msg.id!,
      threadId: msg.threadId!,
      from: fixMojibake(get("from")),
      subject: fixMojibake(get("subject")),
      date: get("date"),
      snippet: fixMojibake(msg.snippet ?? ""),
      body: fixMojibake(body).slice(0, 500),
      labels,
    };
  } catch {
    return null;
  }
}

function extractBody(payload: any): string {
  if (!payload) return "";

  if (payload.body?.data) {
    const buf = Buffer.from(payload.body.data, "base64");
    const charset = getCharset(payload.headers ?? []);
    // Decode using the charset declared in the MIME part
    if (/iso-8859-1|latin-?1/i.test(charset)) return buf.toString("latin1");
    if (/windows-1252|cp-?1252/i.test(charset)) return decodeWindows1252(buf);
    return buf.toString("utf-8");
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain") {
        const text = extractBody(part);
        if (text) return text;
      }
    }
    for (const part of payload.parts) {
      const text = extractBody(part);
      if (text) return text;
    }
  }

  return "";
}

function getCharset(headers: Array<{ name?: string; value?: string }>): string {
  const ct = headers.find((h) => h.name?.toLowerCase() === "content-type")?.value ?? "";
  return ct.match(/charset=["']?([^"';\s]+)/i)?.[1] ?? "utf-8";
}

// Maps Windows-1252 special bytes (0x80–0x9F) to their Unicode code points
const WIN1252: Record<number, number> = {
  0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x0192, 0x84: 0x201e, 0x85: 0x2026,
  0x86: 0x2020, 0x87: 0x2021, 0x88: 0x02c6, 0x89: 0x2030, 0x8a: 0x0160,
  0x8b: 0x2039, 0x8c: 0x0152, 0x8e: 0x017d, 0x91: 0x2018, 0x92: 0x2019,
  0x93: 0x201c, 0x94: 0x201d, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014,
  0x98: 0x02dc, 0x99: 0x2122, 0x9a: 0x0161, 0x9b: 0x203a, 0x9c: 0x0153,
  0x9e: 0x017e, 0x9f: 0x0178,
};

function decodeWindows1252(buf: Buffer): string {
  return Array.from(buf)
    .map((b) => String.fromCodePoint(WIN1252[b] ?? b))
    .join("");
}

// Reverses the WIN1252 map: Unicode code point → byte value
const WIN1252_REVERSE = Object.fromEntries(
  Object.entries(WIN1252).map(([byte, cp]) => [cp, Number(byte)])
) as Record<number, number>;

/**
 * Fixes mojibake caused by UTF-8 bytes being decoded as Windows-1252/Latin-1.
 * Applies up to 2 rounds so it handles double-encoded content.
 */
function fixMojibake(str: string): string {
  let current = str;
  for (let round = 0; round < 2; round++) {
    // Only attempt if the string contains Latin-1 extended chars
    if (!/[\xc0-\xff]/.test(current)) break;
    try {
      const bytes = new Uint8Array(current.length);
      for (let i = 0; i < current.length; i++) {
        const cp = current.codePointAt(i)!;
        bytes[i] = WIN1252_REVERSE[cp] ?? (cp & 0xff);
      }
      const decoded = Buffer.from(bytes).toString("utf-8");
      if (decoded.includes("�")) break; // not valid UTF-8, stop
      current = decoded;
    } catch {
      break;
    }
  }
  return current;
}
