import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

export interface Config {
  botName: string;
  apiKey: string;
  token: string;
  githubToken: string;
  trello: {
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
  };
  github: { repoUrl: string };
  repoDir: string;
  worktreeBaseDir: string;
  urlAllowList: string[];
  prompts: { revisionTemplate: string; developmentTemplate: string };
  timeouts: { claudeDevMs: number; sstDevMs: number; testMs: number };
  pollIntervalMs: number;
  logsDir: string;
  dataDir: string;
}

const CONFIG_FILE = path.resolve("sergio.config.json");

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

function loadConfig(): Config {
  if (!fs.existsSync(CONFIG_FILE)) {
    console.error(
      `Config file not found: ${CONFIG_FILE}\nRun "npm run setup" to create it.`
    );
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));

  const apiKey = requireEnv("TRELLO_API_KEY");
  const token = requireEnv("TRELLO_TOKEN");
  const githubToken = process.env.GITHUB_TOKEN || "";

  return {
    botName: raw.botName || "Sergio",
    apiKey,
    token,
    githubToken,
    trello: {
      boardId: raw.trello?.boardId || "",
      lists: {
        todo: raw.trello?.lists?.todo || "",
        taskRevision: raw.trello?.lists?.taskRevision || "",
        reviewing: raw.trello?.lists?.reviewing || "",
        todoReviewed: raw.trello?.lists?.todoReviewed || "",
        taskDevelopment: raw.trello?.lists?.taskDevelopment || "",
        developing: raw.trello?.lists?.developing || "",
        taskDeveloped: raw.trello?.lists?.taskDeveloped || "",
      },
    },
    github: { repoUrl: raw.github?.repoUrl || "" },
    repoDir: raw.repoDir || "/opt/gtb-platform",
    worktreeBaseDir: raw.worktreeBaseDir || "/opt/gtb-worktrees",
    urlAllowList: raw.urlAllowList || [],
    prompts: {
      revisionTemplate: raw.prompts?.revisionTemplate || "prompts/revision.md",
      developmentTemplate: raw.prompts?.developmentTemplate || "prompts/development.md",
    },
    timeouts: {
      claudeDevMs: raw.timeouts?.claudeDevMs || 20 * 60 * 1000,
      sstDevMs: raw.timeouts?.sstDevMs || 10 * 60 * 1000,
      testMs: raw.timeouts?.testMs || 10 * 60 * 1000,
    },
    pollIntervalMs: raw.pollIntervalMs || 60_000,
    logsDir: raw.logsDir || path.resolve("logs"),
    dataDir: raw.dataDir || path.resolve("data"),
  };
}

export const config: Config = loadConfig();
