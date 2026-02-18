import fs from "fs/promises";
import path from "path";
import { config } from "./config.js";
import {
  getCardActions,
  getCardAttachments,
  moveCard,
  addComment,
  type TrelloCard,
  type TrelloComment,
  type TrelloAttachment,
} from "./trello.js";
import { markCardProcessed } from "./state.js";
import { runClaude } from "./claude.js";

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 80);
}

interface ProcessContext {
  sourceListId: string;
  destListId: string;
}

function formatCardData(
  card: TrelloCard,
  comments: TrelloComment[],
  attachments: TrelloAttachment[],
  ctx: ProcessContext
): string {
  const lines: string[] = [];

  lines.push(`Card ID: ${card.id}`);
  lines.push(`Card: ${card.name}`);
  lines.push(`URL: ${card.url}`);
  lines.push(`Board ID: ${config.trello.boardId}`);
  lines.push(`Source List ID: ${ctx.sourceListId}`);
  lines.push(`Destination List ID: ${ctx.destListId}`);
  lines.push("");
  lines.push("--- Description ---");
  lines.push(card.desc || "(no description)");
  lines.push("");

  lines.push("--- Comments ---");
  if (comments.length === 0) {
    lines.push("(no comments)");
  } else {
    for (const comment of comments) {
      lines.push(`[${comment.date}] ${comment.memberCreator.fullName}:`);
      lines.push(comment.data.text);
      lines.push("");
    }
  }

  lines.push("--- Attachments ---");
  if (attachments.length === 0) {
    lines.push("(no attachments)");
  } else {
    for (const att of attachments) {
      lines.push(`${att.name}: ${att.url}`);
    }
  }

  return lines.join("\n");
}

export async function processCard(
  card: TrelloCard,
  ctx: ProcessContext
): Promise<void> {
  console.log(`Processing card: ${card.name} (${card.id})`);

  // 1. Fetch comments + attachments
  const [comments, attachments] = await Promise.all([
    getCardActions(card.id),
    getCardAttachments(card.id),
  ]);

  // 2. Write enriched .txt file
  const content = formatCardData(card, comments, attachments, ctx);

  await fs.mkdir(config.logsDir, { recursive: true });
  const filename = `${card.id}-${sanitizeFilename(card.name)}.txt`;
  const filepath = path.join(config.logsDir, filename);
  await fs.writeFile(filepath, content);
  console.log(`  Wrote log: ${filename}`);

  // 3. Run Claude to generate implementation plan
  console.log(`  Running ${config.botName} against ${config.repoDir}...`);
  const plan = await runClaude(filepath, config.repoDir);
  console.log(`  ${config.botName} produced plan (${plan.length} chars)`);

  // 4. Post plan as comment on the Trello card
  await addComment(card.id, plan);
  console.log(`  Posted plan as comment on card`);

  // 5. Move card to reviewing list
  await moveCard(card.id, ctx.destListId);
  console.log(`  Moved to reviewing list`);

  // 6. Mark as processed
  await markCardProcessed(card.id);
}
