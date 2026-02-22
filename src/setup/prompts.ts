import path from "path";
import readline from "readline";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});
rl.on("close", () => process.exit(0));

function mask(value: string): string {
  if (value.length <= 8) return "****";
  return value.slice(0, 4) + "..." + value.slice(-4);
}

export function ask(question: string, defaultValue?: string, secret = false): Promise<string> {
  const display = defaultValue ? (secret ? mask(defaultValue) : defaultValue) : undefined;
  const suffix = display ? ` (${display})` : "";
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

export interface PreviousValues {
  botName?: string;
  anthropicApiKey?: string;
  trelloApiKey?: string;
  trelloToken?: string;
  githubToken?: string;
  repoUrl?: string;
  repoDir?: string;
  worktreeBaseDir?: string;
  baseBranch?: string;
  baseRemote?: string;
  devCommand?: string;
  devReadyPattern?: string;
  testCommands?: string[];
  urlAllowList?: string[];
  revisionTemplate?: string;
  developmentTemplate?: string;
}

export async function collectSetupAnswers(prev: PreviousValues = {}): Promise<SetupAnswers> {
  const cwd = process.cwd();

  const botName = await ask("Bot name", prev.botName || "Sergio");
  const anthropicApiKey = await ask("Anthropic API Key (for Claude CLI)", prev.anthropicApiKey, true);
  const trelloApiKey = await ask("Trello API Key", prev.trelloApiKey, true);
  const trelloToken = await ask("Trello Token", prev.trelloToken, true);
  const githubToken = await ask("GitHub Token (optional)", prev.githubToken, true);
  const repoUrl = await ask("GitHub repository URL", prev.repoUrl);
  const repoDir = await ask("Repo directory", prev.repoDir || cwd);
  const worktreeBaseDir = await ask("Worktree base directory", prev.worktreeBaseDir || path.resolve(cwd, "..", "worktrees"));
  const baseBranch = await ask("Base branch", prev.baseBranch || "main");
  const baseRemote = await ask("Base remote", prev.baseRemote || "origin");

  const devCommand = await ask("Dev server command (optional, e.g. 'npx sst dev', leave empty to skip)", prev.devCommand || "");
  let devReadyPattern = "";
  if (devCommand) {
    devReadyPattern = await ask("Dev server ready pattern (text to watch for)", prev.devReadyPattern || "Complete");
  }
  const testCommandsRaw = await ask(
    "Test commands (comma-separated, optional, e.g. 'npx jest,npx playwright test')",
    prev.testCommands?.join(", ") || ""
  );
  const testCommands = testCommandsRaw
    ? testCommandsRaw.split(",").map((c) => c.trim()).filter(Boolean)
    : [];

  const urlListRaw = await ask("URL allow list (comma-separated, or leave empty)", prev.urlAllowList?.join(", ") || undefined);
  const urlAllowList = urlListRaw
    ? urlListRaw.split(",").map((u) => u.trim()).filter(Boolean)
    : [];

  const revisionTemplate = await ask(
    "Revision prompt template path",
    prev.revisionTemplate || "prompts/revision.md"
  );
  const developmentTemplate = await ask(
    "Development prompt template path",
    prev.developmentTemplate || "prompts/development.md"
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
