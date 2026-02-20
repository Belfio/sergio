import fs from "fs/promises";
import path from "path";
import { log } from "./logger.js";
import { config } from "./config.js";

const STATE_FILE = path.join(config.dataDir, "dev-processed-cards.json");
const ATTEMPTS_FILE = path.join(config.dataDir, "dev-failed-attempts.json");

let processedCards = new Set<string>();
let failedAttempts = new Map<string, number>();

export async function loadDevProcessedCards(): Promise<void> {
  await fs.mkdir(config.dataDir, { recursive: true });
  try {
    const data = await fs.readFile(STATE_FILE, "utf-8");
    const ids: string[] = JSON.parse(data);
    processedCards = new Set(ids);
    log.info(`Loaded ${processedCards.size} dev-processed card IDs`);
  } catch (err: any) {
    if (err.code === "ENOENT") {
      processedCards = new Set();
      log.info("No existing dev state file, starting fresh");
    } else {
      throw err;
    }
  }
  try {
    const data = await fs.readFile(ATTEMPTS_FILE, "utf-8");
    const entries: Record<string, number> = JSON.parse(data);
    failedAttempts = new Map(Object.entries(entries));
  } catch (err: any) {
    if (err.code !== "ENOENT") throw err;
  }
}

export function isDevCardProcessed(cardId: string): boolean {
  return processedCards.has(cardId);
}

export async function markDevCardProcessed(cardId: string): Promise<void> {
  processedCards.add(cardId);
  await fs.writeFile(STATE_FILE, JSON.stringify([...processedCards], null, 2));
}

export async function unmarkDevCardProcessed(cardId: string): Promise<void> {
  processedCards.delete(cardId);
  await fs.writeFile(STATE_FILE, JSON.stringify([...processedCards], null, 2));
}

async function saveAttempts(): Promise<void> {
  await fs.writeFile(ATTEMPTS_FILE, JSON.stringify(Object.fromEntries(failedAttempts), null, 2));
}

export function getDevCardAttempts(cardId: string): number {
  return failedAttempts.get(cardId) || 0;
}

export async function incrementDevCardAttempts(cardId: string): Promise<number> {
  const count = (failedAttempts.get(cardId) || 0) + 1;
  failedAttempts.set(cardId, count);
  await saveAttempts();
  return count;
}

export async function clearDevCardAttempts(cardId: string): Promise<void> {
  failedAttempts.delete(cardId);
  await saveAttempts();
}
