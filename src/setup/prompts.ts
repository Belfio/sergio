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
  const repoDir = await ask("Repo directory on server", "/opt/gtb-platform");
  const worktreeBaseDir = await ask("Worktree base directory", "/opt/gtb-worktrees");

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
    urlAllowList,
    revisionTemplate,
    developmentTemplate,
  };
}
