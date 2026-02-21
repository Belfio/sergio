import path from "path";
import readline from "readline";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

export function ask(question: string, defaultValue?: string): Promise<string> {
  const suffix = defaultValue ? ` (${defaultValue})` : "";
  return new Promise((resolve) => {
    rl.question(`${question}${suffix}: `, (answer) => {
      resolve(answer.trim() || defaultValue || "");
    });
  });
}

export function closePrompts(): void {
  rl.close();
}

export interface SetupAnswers {
  botName: string;
  anthropicApiKey: string;
  trelloApiKey: string;
  trelloToken: string;
  githubToken: string;
  repoUrl: string;
  repoDir: string;
  worktreeBaseDir: string;
  baseBranch: string;
  baseRemote: string;
  devCommand: string;
  devReadyPattern: string;
  testCommands: string[];
  urlAllowList: string[];
  revisionTemplate: string;
  developmentTemplate: string;
}

export async function collectSetupAnswers(): Promise<SetupAnswers> {
  const botName = await ask("Bot name", "Sergio");
  const anthropicApiKey = await ask("Anthropic API Key (for Claude CLI)");
  const trelloApiKey = await ask("Trello API Key");
  const trelloToken = await ask("Trello Token");
  const githubToken = await ask("GitHub Token (optional)");
  const repoUrl = await ask("GitHub repository URL");
  const cwd = process.cwd();
  const repoDir = await ask("Repo directory", cwd);
  const worktreeBaseDir = await ask("Worktree base directory", path.resolve(cwd, "..", "worktrees"));
  const baseBranch = await ask("Base branch", "main");
  const baseRemote = await ask("Base remote", "origin");

  const devCommand = await ask("Dev server command (optional, e.g. 'npx sst dev', leave empty to skip)", "");
  let devReadyPattern = "";
  if (devCommand) {
    devReadyPattern = await ask("Dev server ready pattern (text to watch for)", "Complete");
  }
  const testCommandsRaw = await ask("Test commands (comma-separated, optional, e.g. 'npx jest,npx playwright test')", "");
  const testCommands = testCommandsRaw
    ? testCommandsRaw.split(",").map((c) => c.trim()).filter(Boolean)
    : [];

  const urlListRaw = await ask("URL allow list (comma-separated, or leave empty)");
  const urlAllowList = urlListRaw
    ? urlListRaw.split(",").map((u) => u.trim()).filter(Boolean)
    : [];

  const revisionTemplate = await ask(
    "Revision prompt template path",
    "prompts/revision.md"
  );
  const developmentTemplate = await ask(
    "Development prompt template path",
    "prompts/development.md"
  );

  return {
    botName,
    anthropicApiKey,
    trelloApiKey,
    trelloToken,
    githubToken,
    repoUrl,
    repoDir,
    worktreeBaseDir,
    baseBranch,
    baseRemote,
    devCommand,
    devReadyPattern,
    testCommands,
    urlAllowList,
    revisionTemplate,
    developmentTemplate,
  };
}
