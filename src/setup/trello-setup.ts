const BASE_URL = "https://api.trello.com/1";

function authParams(apiKey: string, token: string): string {
  return `key=${apiKey}&token=${token}`;
}

async function trelloFetch(
  path: string,
  apiKey: string,
  token: string,
  init?: RequestInit
): Promise<any> {
  const separator = path.includes("?") ? "&" : "?";
  const url = `${BASE_URL}${path}${separator}${authParams(apiKey, token)}`;
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Trello API error ${res.status}: ${body}`);
  }
  return res.json();
}

export async function createBoard(
  name: string,
  apiKey: string,
  token: string
): Promise<string> {
  const board = await trelloFetch(
    `/boards?name=${encodeURIComponent(name)}&defaultLists=false`,
    apiKey,
    token,
    { method: "POST" }
  );
  return board.id;
}

export async function createList(
  boardId: string,
  name: string,
  pos: number,
  apiKey: string,
  token: string
): Promise<string> {
  const list = await trelloFetch(
    `/boards/${boardId}/lists`,
    apiKey,
    token,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, pos }),
    }
  );
  return list.id;
}

export interface BoardSetupResult {
  boardId: string;
  lists: {
    todo: string;
    taskRevision: string;
    reviewing: string;
    todoReviewed: string;
    taskDevelopment: string;
    developing: string;
    taskDeveloped: string;
  };
}

export async function setupTrelloBoard(
  botName: string,
  apiKey: string,
  token: string
): Promise<BoardSetupResult> {
  console.log(`\nCreating Trello board "${botName} Board"...`);
  const boardId = await createBoard(`${botName} Board`, apiKey, token);
  console.log(`  Board created: ${boardId}`);

  const listDefs = [
    { key: "todo", name: "TODO", pos: 1000 },
    { key: "taskRevision", name: `${botName} Task Revision`, pos: 2000 },
    { key: "reviewing", name: `${botName} Reviewing`, pos: 3000 },
    { key: "todoReviewed", name: "TODO Reviewed", pos: 4000 },
    { key: "taskDevelopment", name: `${botName} Task Development`, pos: 5000 },
    { key: "developing", name: `${botName} Developing`, pos: 6000 },
    { key: "taskDeveloped", name: "Task Developed", pos: 7000 },
  ] as const;

  const lists: Record<string, string> = {};

  for (const def of listDefs) {
    console.log(`  Creating list "${def.name}"...`);
    lists[def.key] = await createList(boardId, def.name, def.pos, apiKey, token);
  }

  return {
    boardId,
    lists: lists as BoardSetupResult["lists"],
  };
}
