import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { config } from "./config.js";
import { getListCards, getBoardLists } from "./trello.js";

const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";
const RESET = "\x1b[0m";

function section(title: string) {
  console.log(`\n${BOLD}${CYAN}── ${title} ──${RESET}`);
}

function countProcesses(pattern: string): number {
  try {
    const out = execFileSync("pgrep", ["-f", pattern], { encoding: "utf-8" });
    return out.trim().split("\n").filter(Boolean).length;
  } catch {
    return 0;
  }
}

function readRecentLogs(n: number): string[] {
  const logFile = path.join(config.logsDir, "sergio.log");
  if (!fs.existsSync(logFile)) return [];
  const content = fs.readFileSync(logFile, "utf-8");
  const lines = content.trim().split("\n");
  return lines.slice(-n);
}

async function main() {
  console.log(`\n${BOLD}  SERGIO STATUS${RESET}  ${DIM}${new Date().toLocaleString()}${RESET}`);

  // --- Service & Processes ---
  section("Services");

  const sergioCount = countProcesses("src/index.ts");
  const claudeCount = countProcesses("claude -p");

  console.log(
    `  Sergio polling:  ${sergioCount > 0 ? `${GREEN}active${RESET}` : `${RED}stopped${RESET}`}`
  );
  console.log(
    `  Claude sessions: ${claudeCount > 0 ? `${YELLOW}${claudeCount} active${RESET}` : `${DIM}none${RESET}`}`
  );

  // --- Board ---
  section("Board");

  const lists = await getBoardLists(config.trello.boardId);
  const listMap = new Map(lists.map((l) => [l.id, l.name]));

  const listOrder = [
    config.trello.lists.todo,
    config.trello.lists.taskRevision,
    config.trello.lists.reviewing,
    config.trello.lists.todoReviewed,
    config.trello.lists.taskDevelopment,
    config.trello.lists.developing,
    config.trello.lists.taskDeveloped,
  ];

  let totalCards = 0;

  for (const listId of listOrder) {
    const name = listMap.get(listId) || listId;
    const cards = await getListCards(listId);
    totalCards += cards.length;

    const count = cards.length;
    const badge =
      count === 0
        ? `${DIM}  0${RESET}`
        : `${YELLOW}  ${count}${RESET}`;

    const cardNames =
      count > 0
        ? `  ${DIM}${cards.map((c) => c.name).join(", ")}${RESET}`
        : "";

    console.log(`  ${badge}  ${name}${cardNames}`);
  }

  console.log(`\n  ${DIM}Total: ${totalCards} card(s) across 7 lists${RESET}`);

  // --- Recent Logs ---
  section("Recent Activity");

  const lines = readRecentLogs(10);
  if (lines.length === 0) {
    console.log(`  ${DIM}No log file found${RESET}`);
  } else {
    for (const line of lines) {
      const colored = line
        .replace(/\[ERROR\]/g, `${RED}[ERROR]${RESET}`)
        .replace(/\[INFO\]/g, `${GREEN}[INFO]${RESET}`);
      console.log(`  ${colored}`);
    }
  }

  console.log("");
}

main().catch((err) => {
  console.error(`${RED}Error: ${err.message}${RESET}`);
  process.exit(1);
});
