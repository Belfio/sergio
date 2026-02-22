import fs from "fs/promises";
import path from "path";
import { log } from "./logger.js";
import { config } from "./config.js";

const BASE_URL = "https://api.trello.com/1";

function authParams(): string {
  return `key=${config.apiKey}&token=${config.token}`;
}

const MAX_RETRIES = 3;
const TIMEOUT_MS = 30_000;
const BASE_BACKOFF_MS = 1_000;

function isRetryable(err: unknown, status?: number): boolean {
  if (status === 429 || (status !== undefined && status >= 500)) return true;
  if (err instanceof Error) {
    const msg = err.message;
    if (msg.includes("abort") || msg.includes("ECONNRESET") || msg.includes("ETIMEDOUT") || msg.includes("ENOTFOUND")) {
      return true;
    }
  }
  return false;
}

async function trelloFetch(path: string, init?: RequestInit): Promise<any> {
  const separator = path.includes("?") ? "&" : "?";
  const url = `${BASE_URL}${path}${separator}${authParams()}`;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timer);

      if (res.ok) return res.json();

      const body = await res.text();
      if (!isRetryable(null, res.status) || attempt === MAX_RETRIES - 1) {
        throw new Error(`Trello API error ${res.status}: ${body}`);
      }
    } catch (err) {
      clearTimeout(timer);
      if (attempt === MAX_RETRIES - 1 || !isRetryable(err)) {
        throw err;
      }
    }

    await new Promise((r) => setTimeout(r, BASE_BACKOFF_MS * Math.pow(2, attempt)));
  }

  throw new Error("Trello API: max retries exceeded");
}

export interface TrelloList {
  id: string;
  name: string;
}

export interface TrelloCard {
  id: string;
  name: string;
  desc: string;
  url: string;
}

export interface TrelloComment {
  id: string;
  date: string;
  memberCreator: { fullName: string };
  data: { text: string };
}

export interface TrelloAttachment {
  id: string;
  name: string;
  url: string;
  mimeType: string | null;
  isUpload: boolean;
  bytes: number;
}

export interface DownloadedAttachment {
  name: string;
  localPath: string;
  mimeType: string | null;
}

export interface LinkAttachment {
  name: string;
  url: string;
}

export function getBoardLists(boardId: string): Promise<TrelloList[]> {
  return trelloFetch(`/boards/${boardId}/lists`);
}

export function getListCards(listId: string): Promise<TrelloCard[]> {
  return trelloFetch(`/lists/${listId}/cards`);
}

export function getCardActions(cardId: string): Promise<TrelloComment[]> {
  return trelloFetch(`/cards/${cardId}/actions?filter=commentCard`);
}

export function getCardAttachments(cardId: string): Promise<TrelloAttachment[]> {
  return trelloFetch(`/cards/${cardId}/attachments`);
}

export function moveCard(cardId: string, targetListId: string): Promise<void> {
  return trelloFetch(`/cards/${cardId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idList: targetListId }),
  });
}

export function addComment(cardId: string, text: string): Promise<void> {
  return trelloFetch(`/cards/${cardId}/actions/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
}

export function addAttachment(cardId: string, url: string, name: string): Promise<void> {
  return trelloFetch(`/cards/${cardId}/attachments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, name }),
  });
}

const MAX_DOWNLOAD_BYTES = 50 * 1024 * 1024; // 50 MB

async function downloadTrelloFile(url: string, destPath: string): Promise<void> {
  // Add Trello auth for Trello-hosted URLs (S3 URLs work without it)
  const downloadUrl = url.includes("trello.com")
    ? `${url}${url.includes("?") ? "&" : "?"}${authParams()}`
    : url;

  const res = await fetch(downloadUrl);
  if (!res.ok) {
    throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length > MAX_DOWNLOAD_BYTES) {
    throw new Error(`File too large: ${buffer.length} bytes (limit: ${MAX_DOWNLOAD_BYTES})`);
  }
  await fs.writeFile(destPath, buffer);
  await fs.chmod(destPath, 0o644);
}

/**
 * Download uploaded attachments to a local directory.
 * Returns categorized results: downloaded files and link-only attachments.
 */
export async function downloadCardAttachments(
  attachments: TrelloAttachment[],
  destDir: string
): Promise<{ downloaded: DownloadedAttachment[]; links: LinkAttachment[] }> {
  await fs.mkdir(destDir, { recursive: true });
  await fs.chmod(destDir, 0o755);

  const downloaded: DownloadedAttachment[] = [];
  const links: LinkAttachment[] = [];

  for (const att of attachments) {
    if (!att.isUpload) {
      links.push({ name: att.name, url: att.url });
      continue;
    }

    try {
      // Use att.id + original extension to avoid filename conflicts
      const ext = path.extname(att.name) || "";
      const localName = `${att.id}${ext}`;
      const localPath = path.join(destDir, localName);

      await downloadTrelloFile(att.url, localPath);
      downloaded.push({ name: att.name, localPath, mimeType: att.mimeType });
      log.info(`  Downloaded attachment: ${att.name} (${att.bytes} bytes)`);
    } catch (e) {
      log.error(`  Failed to download attachment ${att.name}:`, e);
      // Fall back to link reference
      links.push({ name: att.name, url: att.url });
    }
  }

  return { downloaded, links };
}

export async function cleanupAttachments(destDir: string): Promise<void> {
  try {
    await fs.rm(destDir, { recursive: true, force: true });
  } catch (e) {
    log.error(`  Failed to clean up attachment dir ${destDir}:`, e);
  }
}
