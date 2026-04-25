import Anthropic from "@anthropic-ai/sdk";
import fs from "fs/promises";
import { config } from "../config.js";
import type { DocContent } from "./reader.js";

export interface DocComment {
  quotedText: string;
  comment: string;
  category: "question" | "risk" | "gap" | "suggestion";
}

const client = new Anthropic({ apiKey: config.anthropic.apiKey });

export async function generateComments(
  doc: DocContent,
  instruction?: string
): Promise<DocComment[]> {
  const persona = await fs.readFile("persona.md", "utf-8").catch(() => "");
  const content = doc.fullText.slice(0, 30_000);
  const focusInstruction = instruction
    ? `\nThe user has a specific focus for this review: "${instruction}"\n`
    : "";

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: [
      {
        type: "text",
        text: `You are acting as a strategic reviewer on behalf of the document's author. Your job is to add high-quality inline comments — the kind a sharp VP of Product, a board member, or an experienced investor would leave when reviewing a strategy doc.

Here is context about the author:
<persona>
${persona}
</persona>
${focusInstruction}
Focus your comments on:
- **Strategic questions**: missing assumptions, unclear rationale, "why this vs. that", unstated dependencies
- **Risk flags**: delivery risks, market risks, resourcing constraints, competitor response
- **Gaps**: topics that belong in a strategy doc but aren't addressed (metrics, rollback plans, stakeholder alignment, build-vs-buy decisions)
- **Quantification challenges**: estimates or projections that need better backing or sensitivity analysis
- **Roadmap concerns**: sequencing issues, unrealistic timelines, missing milestones

Rules:
- Generate 8–12 comments — enough to be thorough, not so many they overwhelm
- Each "quotedText" must be VERBATIM from the document (15–60 words) — copy it exactly as it appears
- Each "comment" should be 1–3 sentences, direct and specific — not generic filler
- Spread comments across different sections of the document
- Prioritise quality over quantity — skip obvious things, focus on non-obvious strategic gaps

Respond with ONLY a valid JSON array, no markdown fences:
[{"quotedText": "...", "comment": "...", "category": "question|risk|gap|suggestion"}]`,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `Document title: "${doc.title}"\n\nDocument content:\n\n${content}`,
      },
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  try {
    return JSON.parse(cleaned) as DocComment[];
  } catch {
    throw new Error(`Claude returned unparseable JSON:\n${text}`);
  }
}

export async function generateSingleComment(
  doc: DocContent,
  instruction?: string
): Promise<string> {
  const persona = await fs.readFile("persona.md", "utf-8").catch(() => "");
  const content = doc.fullText.slice(0, 30_000);
  const focusInstruction = instruction
    ? `\nPay particular attention to: "${instruction}"\n`
    : "";

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    system: [
      {
        type: "text",
        text: `You are helping the author review their own strategy document. Write a single, consolidated review comment as if the author is giving themselves candid feedback after stepping back from the doc.

Here is context about the author:
<persona>
${persona}
</persona>
${focusInstruction}
Rules:
- Start exactly with: "Thanks for writing this document."
- Write in first person as the author (e.g. "I need to strengthen...", "The savings figures I've quoted...")
- Cover: strongest parts worth keeping, key strategic gaps, risks that need addressing, quantification issues, and any roadmap concerns
- Be specific — name the actual figures, pillars, and initiatives from the doc
- Tone: direct, constructive, like a senior peer review — not harsh, not sycophantic
- Length: 200–350 words, flowing prose with light structure (no headers, minimal bullets)
- Do NOT use markdown formatting — plain text only, this will appear in a Google Doc comment`,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `Document title: "${doc.title}"\n\nDocument content:\n\n${content}`,
      },
    ],
  });

  return response.content[0].type === "text" ? response.content[0].text : "";
}
