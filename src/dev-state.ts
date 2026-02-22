import { log } from "./logger.js";
import { config } from "./config.js";
import { createCardStateStore } from "./card-state-store.js";

const store = createCardStateStore({
  dataDir: config.dataDir,
  processedFilename: "dev-processed-cards.json",
  attemptsFilename: "dev-failed-attempts.json",
  log,
  processedLabel: "dev-processed card IDs",
  emptyStateMessage: "No existing dev state file, starting fresh",
});

export async function loadDevProcessedCards(): Promise<void> {
  await store.load();
}

export function isDevCardProcessed(cardId: string): boolean {
  return store.isProcessed(cardId);
}

export async function markDevCardProcessed(cardId: string): Promise<void> {
  await store.markProcessed(cardId);
}

export async function unmarkDevCardProcessed(cardId: string): Promise<void> {
  await store.unmarkProcessed(cardId);
}

export function getDevCardAttempts(cardId: string): number {
  return store.getAttempts(cardId);
}

export async function incrementDevCardAttempts(cardId: string): Promise<number> {
  return store.incrementAttempts(cardId);
}

export async function clearDevCardAttempts(cardId: string): Promise<void> {
  await store.clearAttempts(cardId);
}
