import fs from "fs/promises";
import path from "path";
import { config } from "./config.js";

const STATE_FILE = path.join(config.dataDir, "dev-processed-cards.json");

let processedCards = new Set<string>();

export async function loadDevProcessedCards(): Promise<void> {
  await fs.mkdir(config.dataDir, { recursive: true });
  try {
    const data = await fs.readFile(STATE_FILE, "utf-8");
    const ids: string[] = JSON.parse(data);
    processedCards = new Set(ids);
    console.log(`Loaded ${processedCards.size} dev-processed card IDs`);
  } catch (err: any) {
    if (err.code === "ENOENT") {
      processedCards = new Set();
      console.log("No existing dev state file, starting fresh");
    } else {
      throw err;
    }
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
