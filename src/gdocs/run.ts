import readline from "readline";
import { readDoc } from "./reader.js";
import { generateComments, generateSingleComment } from "./suggester.js";
import { postComment } from "./commenter.js";
import { insertReviewAtTop } from "./inserter.js";

const CATEGORY_LABEL: Record<string, string> = {
  question: "❓ Question",
  risk:     "🔴 Risk",
  gap:      "⬜ Gap",
  suggestion: "💡 Suggestion",
};

async function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  const single = args.includes("--single");
  const filtered = args.filter((a) => a !== "--single");
  const [docUrl, instruction] = filtered;

  if (!docUrl) {
    console.error(
      "Usage: npm run comment -- <doc-url> [\"optional focus\"] [--single]"
    );
    process.exit(1);
  }

  console.log("\nReading document...");
  const doc = await readDoc(docUrl);
  console.log(`  "${doc.title}" (${doc.paragraphs.length} paragraphs)\n`);

  if (single) {
    console.log("Generating consolidated review comment...");
    if (instruction) console.log(`  Focus: ${instruction}`);
    const comment = await generateSingleComment(doc, instruction);

    console.log(`\n─────────────────────────────────────────`);
    console.log(comment);
    console.log(`─────────────────────────────────────────\n`);

    await insertReviewAtTop(doc.id, comment);
    console.log(`✓ Inserted at top of: https://docs.google.com/document/d/${doc.id}\n`);
    return;
  }

  // Multi-comment flow
  console.log("Generating strategic comments with Claude...");
  if (instruction) console.log(`  Focus: ${instruction}`);
  const comments = await generateComments(doc, instruction);
  console.log(`  Generated ${comments.length} comments.\n`);

  for (let i = 0; i < comments.length; i++) {
    const c = comments[i];
    const label = CATEGORY_LABEL[c.category] ?? c.category;
    console.log(`─────────────────────────────────────────`);
    console.log(`[${i + 1}] ${label}`);
    console.log(`\nQuoted text:\n  "${c.quotedText}"`);
    console.log(`\nComment:\n  ${c.comment}\n`);
  }

  console.log(`─────────────────────────────────────────`);
  const answer = await ask(
    `Post which comments? (all / comma-separated numbers e.g. 1,3,5 / none): `
  );

  let toPost: number[];
  if (answer === "none" || answer === "") {
    toPost = [];
  } else if (answer === "all") {
    toPost = comments.map((_, i) => i + 1);
  } else {
    toPost = answer
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n) && n >= 1 && n <= comments.length);
  }

  if (toPost.length === 0) {
    console.log("\nNothing posted.");
    return;
  }

  console.log(`\nPosting ${toPost.length} comment(s)...`);
  let posted = 0;
  for (const n of toPost) {
    const c = comments[n - 1];
    try {
      await postComment(doc.id, c);
      console.log(`  ✓ [${n}] posted`);
      posted++;
    } catch (err: any) {
      console.error(`  ✗ [${n}] failed: ${err.message}`);
    }
  }

  console.log(`\nDone. ${posted}/${toPost.length} posted.\n`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
