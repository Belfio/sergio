import fs from "fs/promises";
import path from "path";
import { log } from "./logger.js";
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
import { markCardProcessed, incrementCardAttempts, clearCardAttempts } from "./state.js";
import { runClaude } from "./claude.js";

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 80);
}

interface ProcessContext {
  sourceListId: string;
  reviewingListId: string;
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
  log.info(`Processing card: ${card.name} (${card.id})`);

  // 1. Move card to reviewing list immediately
  await moveCard(card.id, ctx.reviewingListId);
  log.info(`  Moved to reviewing list`);

  try {
    // 2. Fetch comments + attachments
    const [comments, attachments] = await Promise.all([
      getCardActions(card.id),
      getCardAttachments(card.id),
    ]);

    // 3. Write enriched .txt file
    const content = formatCardData(card, comments, attachments, ctx);

    await fs.mkdir(config.logsDir, { recursive: true });
    const filename = `${card.id}-${sanitizeFilename(card.name)}.txt`;
    const filepath = path.join(config.logsDir, filename);
    await fs.writeFile(filepath, content);
    log.info(`  Wrote log: ${filename}`);

    // 4. Run Claude to generate implementation plan
    log.info(`  Running ${config.botName} against ${config.repoDir}...`);
    const plan = await runClaude(filepath, config.repoDir);
    log.info(`  ${config.botName} produced plan (${plan.length} chars)`);

    // 5. Post plan as comment on the Trello card (truncated for Trello limit)
    const MAX_COMMENT_LENGTH = 15000;
    if (plan.length > MAX_COMMENT_LENGTH) {
      const planFilename = `${card.id}-plan.txt`;
      const planFilepath = path.join(config.logsDir, planFilename);
      await fs.writeFile(planFilepath, plan);
      log.info(`  Plan too long (${plan.length} chars), saved to ${planFilename}`);

      const truncated = plan.slice(0, MAX_COMMENT_LENGTH) +
        "\n\n... (plan truncated — full plan saved to logs)";
      await addComment(card.id, truncated);
    } else {
      await addComment(card.id, plan);
    }
    log.info(`  Posted plan as comment on card`);

    // 6. Move card to reviewed list
    await moveCard(card.id, ctx.destListId);
    log.info(`  Moved to reviewed list`);

    // 7. Mark as processed and clear attempts
    await markCardProcessed(card.id);
    await clearCardAttempts(card.id);
  } catch (err) {
    log.error(`[PLAN] Error processing card ${card.id}:`, err);
    const runId = `${Date.now()}-${card.id}`;
    const errMsg = err instanceof Error ? err.message : String(err);
    await addComment(
      card.id,
      `**${config.botName} error (run ${runId}):**\n\n${errMsg.slice(0, 5000)}`
    ).catch((e) => log.error("  Failed to post error comment:", e));
    const attempts = await incrementCardAttempts(card.id).catch(() => 0);
    const failedListId = config.trello.lists.failed;
    if (failedListId && attempts >= config.maxCardAttempts) {
      log.error(`  Card ${card.id} failed ${attempts} times, moving to failed list`);
      await moveCard(card.id, failedListId).catch((e) =>
        log.error("  Failed to move card to failed list:", e)
      );
    } else {
      await moveCard(card.id, ctx.sourceListId).catch((e) =>
        log.error("  Failed to move card back:", e)
      );
    }
  }
}
