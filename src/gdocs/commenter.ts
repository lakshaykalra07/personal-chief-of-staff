import { google } from "googleapis";
import { getAuthenticatedClient } from "../gmail/auth.js";
import type { DocComment } from "./suggester.js";

export async function postComment(docId: string, item: DocComment): Promise<string> {
  const auth = await getAuthenticatedClient();
  const drive = google.drive({ version: "v3", auth });

  await drive.comments.create({
    fileId: docId,
    fields: "id",
    requestBody: {
      content: item.comment,
      anchor: JSON.stringify({ r: "head" }),
    },
  });

  return `https://docs.google.com/document/d/${docId}`;
}
