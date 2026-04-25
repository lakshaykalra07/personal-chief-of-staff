import { google } from "googleapis";
import { getAuthenticatedClient } from "../gmail/auth.js";

export async function insertReviewAtTop(docId: string, reviewText: string): Promise<void> {
  const auth = await getAuthenticatedClient();
  const docs = google.docs({ version: "v1", auth });

  const border = "─".repeat(60);
  const block = `${border}\nSELF REVIEW — Chief of Staff Agent\n${border}\n\n${reviewText}\n\n${border}\n\n`;

  await docs.documents.batchUpdate({
    documentId: docId,
    requestBody: {
      requests: [
        {
          insertText: {
            location: { index: 1 },
            text: block,
          },
        },
      ],
    },
  });
}
