import "./logger.js";
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
        console.log(`  Card "${card.name}" moved back for revision, re-processing`);
        await unmarkCardProcessed(card.id);
      }
    }

    const newCards = cards.filter((c) => !isCardProcessed(c.id));

    if (newCards.length === 0) {
      console.log(`[${new Date().toISOString()}] No new cards in task revision`);
      return;
    }

    console.log(`[${new Date().toISOString()}] Found ${newCards.length} new card(s)`);

    for (const card of newCards) {
      try {
        await processCard(card, { sourceListId, reviewingListId, destListId });
      } catch (err) {
        console.error(`Error processing card ${card.id} (${card.name}):`, err);
      }
    }
  } catch (err) {
    console.error("Error during poll:", err);
  }
}

let devInProgress = false;

async function pollDev(
  devSourceListId: string,
  devProcessingListId: string,
  devDoneListId: string
) {
  if (devInProgress) {
    console.log(`[${new Date().toISOString()}] Dev already in progress, skipping`);
    return;
  }

  try {
    const cards = await getListCards(devSourceListId);

    for (const card of cards) {
      if (isDevCardProcessed(card.id)) {
        console.log(`  Dev card "${card.name}" moved back for re-processing`);
        await unmarkDevCardProcessed(card.id);
      }
    }

    const newCards = cards.filter((c) => !isDevCardProcessed(c.id));

    if (newCards.length === 0) {
      console.log(`[${new Date().toISOString()}] No new dev cards`);
      return;
    }

    console.log(`[${new Date().toISOString()}] Found ${newCards.length} dev card(s)`);

    const card = newCards[0];
    devInProgress = true;
    try {
      await processDevCard(card, {
        sourceListId: devSourceListId,
        processingListId: devProcessingListId,
        doneListId: devDoneListId,
      });
    } catch (err) {
      console.error(`Error processing dev card ${card.id} (${card.name}):`, err);
    } finally {
      devInProgress = false;
    }
  } catch (err) {
    console.error("Error during dev poll:", err);
  }
}

async function main() {
  console.log(`${config.botName} starting...`);

  await Promise.all([loadProcessedCards(), loadDevProcessedCards()]);

  const { lists } = config.trello;

  console.log(`Board ID: ${config.trello.boardId}`);
  console.log(`Repo dir: ${config.repoDir}`);
  console.log(`Worktree base dir: ${config.worktreeBaseDir}`);
  console.log(`Polling every ${config.pollIntervalMs / 1000}s\n`);

  await Promise.all([
    poll(lists.taskRevision, lists.reviewing, lists.todoReviewed),
    pollDev(lists.taskDevelopment, lists.developing, lists.taskDeveloped),
  ]);

  const interval = setInterval(() => {
    poll(lists.taskRevision, lists.reviewing, lists.todoReviewed);
    pollDev(lists.taskDevelopment, lists.developing, lists.taskDeveloped);
  }, config.pollIntervalMs);

  const shutdown = () => {
    console.log("\nShutting down...");
    clearInterval(interval);
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main();
