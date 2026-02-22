import { log } from "./logger.js";
import { config } from "./config.js";
import { createCardStateStore } from "./card-state-store.js";

const store = createCardStateStore({
  dataDir: config.dataDir,
  processedFilename: "processed-cards.json",
  attemptsFilename: "failed-attempts.json",
  log,
  processedLabel: "processed card IDs",
  emptyStateMessage: "No existing state file, starting fresh",
});

export async function loadProcessedCards(): Promise<void> {
  await store.load();
}

export function isCardProcessed(cardId: string): boolean {
  return store.isProcessed(cardId);
}

export async function markCardProcessed(cardId: string): Promise<void> {
  await store.markProcessed(cardId);
}

export async function unmarkCardProcessed(cardId: string): Promise<void> {
  await store.unmarkProcessed(cardId);
}

export function getCardAttempts(cardId: string): number {
  return store.getAttempts(cardId);
}

export async function incrementCardAttempts(cardId: string): Promise<number> {
  return store.incrementAttempts(cardId);
}

export async function clearCardAttempts(cardId: string): Promise<void> {
  await store.clearAttempts(cardId);
}
