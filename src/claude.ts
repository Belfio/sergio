import fs from "fs/promises";
import path from "path";
import { config } from "./config.js";
import { loadTemplate } from "./template.js";
import { buildUrlPolicy, runClaudeCommand } from "./claude-common.js";

const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export async function runClaude(
  cardTxtPath: string,
  repoDir: string
): Promise<string> {
  const cardContent = await fs.readFile(cardTxtPath, "utf-8");
  const urlPolicy = buildUrlPolicy(config.urlAllowList);

  const prompt = await loadTemplate(
    path.resolve(config.prompts.revisionTemplate),
    { botName: config.botName, cardContent, urlPolicy, baseBranch: config.baseBranch, baseRemote: config.baseRemote }
  );

  return await runClaudeCommand(
    prompt,
    repoDir,
    TIMEOUT_MS,
    "Claude CLI",
    config.mcpServers
  );
}
