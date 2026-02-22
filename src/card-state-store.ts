import fs from "fs/promises";
import path from "path";

export interface CardStateStore {
  load(): Promise<void>;
  isProcessed(cardId: string): boolean;
  markProcessed(cardId: string): Promise<void>;
  unmarkProcessed(cardId: string): Promise<void>;
  getAttempts(cardId: string): number;
  incrementAttempts(cardId: string): Promise<number>;
  clearAttempts(cardId: string): Promise<void>;
}

export function createCardStateStore(opts: {
  dataDir: string;
  processedFilename: string;
  attemptsFilename: string;
  log: { info: (...args: unknown[]) => void };
  processedLabel: string;
  emptyStateMessage: string;
}): CardStateStore {
  const stateFile = path.join(opts.dataDir, opts.processedFilename);
  const attemptsFile = path.join(opts.dataDir, opts.attemptsFilename);

  let processedCards = new Set<string>();
  let failedAttempts = new Map<string, number>();

  async function saveProcessed(): Promise<void> {
    await fs.writeFile(stateFile, JSON.stringify([...processedCards], null, 2));
  }

  async function saveAttempts(): Promise<void> {
    await fs.writeFile(
      attemptsFile,
      JSON.stringify(Object.fromEntries(failedAttempts), null, 2)
    );
  }

  return {
    async load(): Promise<void> {
      await fs.mkdir(opts.dataDir, { recursive: true });
      try {
        const data = await fs.readFile(stateFile, "utf-8");
        const ids: string[] = JSON.parse(data);
        processedCards = new Set(ids);
        opts.log.info(`Loaded ${processedCards.size} ${opts.processedLabel}`);
      } catch (err: any) {
        if (err.code === "ENOENT") {
          processedCards = new Set();
          opts.log.info(opts.emptyStateMessage);
        } else {
          throw err;
        }
      }

      try {
        const data = await fs.readFile(attemptsFile, "utf-8");
        const entries: Record<string, number> = JSON.parse(data);
        failedAttempts = new Map(Object.entries(entries));
      } catch (err: any) {
        if (err.code !== "ENOENT") throw err;
      }
    },

    isProcessed(cardId: string): boolean {
      return processedCards.has(cardId);
    },

    async markProcessed(cardId: string): Promise<void> {
      processedCards.add(cardId);
      await saveProcessed();
    },

    async unmarkProcessed(cardId: string): Promise<void> {
      processedCards.delete(cardId);
      await saveProcessed();
    },

    getAttempts(cardId: string): number {
      return failedAttempts.get(cardId) || 0;
    },

    async incrementAttempts(cardId: string): Promise<number> {
      const count = (failedAttempts.get(cardId) || 0) + 1;
      failedAttempts.set(cardId, count);
      await saveAttempts();
      return count;
    },

    async clearAttempts(cardId: string): Promise<void> {
      failedAttempts.delete(cardId);
      await saveAttempts();
    },
  };
}
