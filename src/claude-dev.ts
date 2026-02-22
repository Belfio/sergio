import path from "path";
import { config } from "./config.js";
import { loadTemplate } from "./template.js";
import { buildUrlPolicy, runClaudeCommand } from "./claude-common.js";

export async function runClaudeDev(
  cardContent: string,
  worktreeDir: string
): Promise<string> {
  const urlPolicy = buildUrlPolicy(config.urlAllowList);

  const prompt = await loadTemplate(
    path.resolve(config.prompts.developmentTemplate),
    { botName: config.botName, cardContent, urlPolicy, baseBranch: config.baseBranch, baseRemote: config.baseRemote }
  );

  return await runClaudeCommand(
    prompt,
    worktreeDir,
    config.timeouts.claudeDevMs,
    "Claude dev CLI"
  );
}
