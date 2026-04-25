import { google, docs_v1 } from "googleapis";
import { getAuthenticatedClient } from "../gmail/auth.js";

export interface DocContent {
  id: string;
  title: string;
  fullText: string;
  paragraphs: string[];
}

export function extractDocId(urlOrId: string): string {
  const match = urlOrId.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  // Assume it's already a raw ID
  if (/^[a-zA-Z0-9_-]+$/.test(urlOrId)) return urlOrId;
  throw new Error(`Could not extract doc ID from: ${urlOrId}`);
}

export async function readDoc(urlOrId: string): Promise<DocContent> {
  const auth = await getAuthenticatedClient();
  const docsApi = google.docs({ version: "v1", auth });

  const id = extractDocId(urlOrId);
  const res = await docsApi.documents.get({ documentId: id });
  const doc = res.data;

  const { fullText, paragraphs } = extractText(doc);

  return { id, title: doc.title ?? "Untitled", fullText, paragraphs };
}

function extractText(doc: docs_v1.Schema$Document): { fullText: string; paragraphs: string[] } {
  const paragraphs: string[] = [];

  for (const element of doc.body?.content ?? []) {
    if (element.paragraph) {
      const text = (element.paragraph.elements ?? [])
        .map((e) => e.textRun?.content ?? "")
        .join("")
        .replace(/\n$/, "");
      if (text.trim()) paragraphs.push(text);
    } else if (element.table) {
      // Flatten table cells into paragraph-like text
      for (const row of element.table.tableRows ?? []) {
        for (const cell of row.tableCells ?? []) {
          for (const cellEl of cell.content ?? []) {
            if (cellEl.paragraph) {
              const text = (cellEl.paragraph.elements ?? [])
                .map((e) => e.textRun?.content ?? "")
                .join("")
                .replace(/\n$/, "");
              if (text.trim()) paragraphs.push(text);
            }
          }
        }
      }
    }
  }

  return { fullText: paragraphs.join("\n"), paragraphs };
}
