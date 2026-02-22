import dotenv from "dotenv";
import fs from "fs";
import os from "os";
import path from "path";
import { resolvePipelineConfig } from "./config-utils.js";

dotenv.config();

export interface Config {
  botName: string;
  apiKey: string;
  token: string;
  baseBranch: string;
  baseRemote: string;
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
      failed?: string;
    };
  };
  github: { repoUrl: string };
  repoDir: string;
  worktreeBaseDir: string;
  maxCardAttempts: number;
  urlAllowList: string[];
  prompts: { revisionTemplate: string; developmentTemplate: string };
  pipeline: {
    devCommand: string;
    devReadyPattern: string;
    testCommands: string[];
  };
  timeouts: { claudeDevMs: number; devServerMs: number; testMs: number };
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

function expandTilde(p: string): string {
  return p.startsWith("~/") ? path.join(os.homedir(), p.slice(2)) : p;
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
  const cfg: Config = {
    botName: raw.botName || "Sergio",
    apiKey,
    token,
    baseBranch: raw.baseBranch || "main",
    baseRemote: raw.baseRemote || "origin",
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
        failed: raw.trello?.lists?.failed || undefined,
      },
    },
    github: { repoUrl: raw.github?.repoUrl || "" },
    repoDir: expandTilde(raw.repoDir || process.cwd()),
    worktreeBaseDir: expandTilde(raw.worktreeBaseDir || path.resolve(process.cwd(), "..", "worktrees")),
    maxCardAttempts: raw.maxCardAttempts ?? 3,
    urlAllowList: raw.urlAllowList || [],
    prompts: {
      revisionTemplate: raw.prompts?.revisionTemplate || "prompts/revision.md",
      developmentTemplate: raw.prompts?.developmentTemplate || "prompts/development.md",
    },
    pipeline: resolvePipelineConfig(raw.pipeline),
    timeouts: {
      claudeDevMs: raw.timeouts?.claudeDevMs || 20 * 60 * 1000,
      devServerMs: raw.timeouts?.devServerMs || raw.timeouts?.sstDevMs || 10 * 60 * 1000,
      testMs: raw.timeouts?.testMs || 10 * 60 * 1000,
    },
    pollIntervalMs: raw.pollIntervalMs || 60_000,
    logsDir: raw.logsDir || path.resolve("logs"),
    dataDir: raw.dataDir || path.resolve("data"),
  };

  validateConfig(cfg);
  return cfg;
}

function validateConfig(cfg: Config): void {
  const errors: string[] = [];

  if (!cfg.trello.boardId) {
    errors.push("trello.boardId is required");
  }

  const requiredLists = ["todo", "taskRevision", "reviewing", "todoReviewed"] as const;
  for (const key of requiredLists) {
    if (!cfg.trello.lists[key]) {
      errors.push(`trello.lists.${key} is required`);
    }
  }

  if (!fs.existsSync(cfg.repoDir)) {
    errors.push(`repoDir does not exist: ${cfg.repoDir}`);
  }

  const revisionPath = path.resolve(cfg.prompts.revisionTemplate);
  if (!fs.existsSync(revisionPath)) {
    errors.push(`Revision template not found: ${revisionPath}`);
  }

  const devPath = path.resolve(cfg.prompts.developmentTemplate);
  if (!fs.existsSync(devPath)) {
    errors.push(`Development template not found: ${devPath}`);
  }

  if (cfg.pipeline.devCommand && !cfg.pipeline.devReadyPattern) {
    errors.push("pipeline.devReadyPattern is required when pipeline.devCommand is set");
  }

  if (cfg.timeouts.claudeDevMs <= 0 || cfg.timeouts.devServerMs <= 0 || cfg.timeouts.testMs <= 0) {
    errors.push("All timeout values must be positive numbers");
  }

  if (errors.length > 0) {
    console.error("Configuration errors:\n" + errors.map((e) => `  - ${e}`).join("\n"));
    console.error('\nFix these in sergio.config.json or run "npm run setup".');
    process.exit(1);
  }
}

export const config: Config = loadConfig();
