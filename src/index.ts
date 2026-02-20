import { log } from "./logger.js";
import { config } from "./config.js";
import { getListCards } from "./trello.js";
import { loadProcessedCards, isCardProcessed, unmarkCardProcessed } from "./state.js";
import { loadDevProcessedCards, isDevCardProcessed, unmarkDevCardProcessed } from "./dev-state.js";
import { processCard } from "./processor.js";
import { processDevCard } from "./dev-processor.js";

async function poll(sourceListId: string, reviewingListId: string, destListId: string) {
  try {
    const cards = await getListCards(sourceListId);

    for (const card of cards) {
      if (isCardProcessed(card.id)) {
        log.info(`  Card "${card.name}" moved back for revision, re-processing`);
        await unmarkCardProcessed(card.id);
      }
    }

    const newCards = cards.filter((c) => !isCardProcessed(c.id));

    if (newCards.length === 0) {
      log.info(`[${new Date().toISOString()}] No new cards in task revision`);
      return;
    }

    log.info(`[${new Date().toISOString()}] Found ${newCards.length} new card(s)`);

    for (const card of newCards) {
      try {
        await processCard(card, { sourceListId, reviewingListId, destListId });
      } catch (err) {
        log.error(`Error processing card ${card.id} (${card.name}):`, err);
      }
    }
  } catch (err) {
    log.error("Error during poll:", err);
  }
}

let devInProgress = false;

async function pollDev(
  devSourceListId: string,
  devProcessingListId: string,
  devDoneListId: string
) {
  if (devInProgress) {
    log.info(`[${new Date().toISOString()}] Dev already in progress, skipping`);
    return;
  }

  try {
    const cards = await getListCards(devSourceListId);

    for (const card of cards) {
      if (isDevCardProcessed(card.id)) {
        log.info(`  Dev card "${card.name}" moved back for re-processing`);
        await unmarkDevCardProcessed(card.id);
      }
    }

    const newCards = cards.filter((c) => !isDevCardProcessed(c.id));

    if (newCards.length === 0) {
      log.info(`[${new Date().toISOString()}] No new dev cards`);
      return;
    }

    log.info(`[${new Date().toISOString()}] Found ${newCards.length} dev card(s)`);

    const card = newCards[0];
    devInProgress = true;
    try {
      await processDevCard(card, {
        sourceListId: devSourceListId,
        processingListId: devProcessingListId,
        doneListId: devDoneListId,
      });
    } catch (err) {
      log.error(`Error processing dev card ${card.id} (${card.name}):`, err);
    } finally {
      devInProgress = false;
    }
  } catch (err) {
    log.error("Error during dev poll:", err);
  }
}

async function main() {
  log.info(`${config.botName} starting...`);

  await Promise.all([loadProcessedCards(), loadDevProcessedCards()]);

  const { lists } = config.trello;

  log.info(`Board ID: ${config.trello.boardId}`);
  log.info(`Repo dir: ${config.repoDir}`);
  log.info(`Worktree base dir: ${config.worktreeBaseDir}`);
  log.info(`Polling every ${config.pollIntervalMs / 1000}s\n`);

  await Promise.all([
    poll(lists.taskRevision, lists.reviewing, lists.todoReviewed),
    pollDev(lists.taskDevelopment, lists.developing, lists.taskDeveloped),
  ]);

  const interval = setInterval(() => {
    poll(lists.taskRevision, lists.reviewing, lists.todoReviewed);
    pollDev(lists.taskDevelopment, lists.developing, lists.taskDeveloped);
  }, config.pollIntervalMs);

  const shutdown = () => {
    log.info("\nShutting down...");
    clearInterval(interval);
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main();
