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
