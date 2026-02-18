import { config } from "./config.js";

const BASE_URL = "https://api.trello.com/1";

function authParams(): string {
  return `key=${config.apiKey}&token=${config.token}`;
}

async function trelloFetch(path: string, init?: RequestInit): Promise<any> {
  const separator = path.includes("?") ? "&" : "?";
  const url = `${BASE_URL}${path}${separator}${authParams()}`;
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Trello API error ${res.status}: ${body}`);
  }
  return res.json();
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
