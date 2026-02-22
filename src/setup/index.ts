import { execFileSync } from "child_process";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { collectSetupAnswers, ask, closePrompts, type PreviousValues } from "./prompts.js";
import { setupTrelloBoard, fetchBoardLists, type BoardSetupResult } from "./trello-setup.js";

const CONFIG_FILE = path.resolve("sergio.config.json");
const ENV_FILE = path.resolve(".env");

function parseBoardId(input: string): string {
  // Accept a Trello URL like https://trello.com/b/AbCdEfGh/board-name
  // or just a raw board ID
  const match = input.match(/trello\.com\/b\/([a-zA-Z0-9]+)/);
  return match ? match[1] : input.trim();
}

const BANNER = `
  ___  ____  ____   ___  ____  ___
 / __)( ___)(  _ \\ / __)(_  _)/ _ \\
 \\__ \\ )__)  )   /( (_-. _)(_( (_) )
 (___/(____)(__|\\_)\\___/(____)\\___ /

       Your AI-powered Trello bot
`;

function commandExists(cmd: string): boolean {
  try {
    execFileSync("which", [cmd], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function checkDependencies(): { missing: string[]; found: string[] } {
  const deps = [
    { cmd: "node", name: "Node.js" },
    { cmd: "npm", name: "npm" },
    { cmd: "git", name: "Git" },
    { cmd: "claude", name: "Claude CLI" },
    { cmd: "gh", name: "GitHub CLI" },
  ];

  const missing: string[] = [];
  const found: string[] = [];

  for (const dep of deps) {
    if (commandExists(dep.cmd)) {
      found.push(dep.name);
    } else {
      missing.push(dep.name);
    }
  }

  return { missing, found };
}

function installDependencies(missing: string[]): void {
  for (const dep of missing) {
    console.log(`\nInstalling ${dep}...`);

    switch (dep) {
      case "Node.js":
      case "npm":
        console.log("  Please install Node.js manually:");
        console.log("  curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo bash -");
        console.log("  sudo apt-get install -y nodejs");
        break;

      case "Git":
        console.log("  Installing Git...");
        try {
          execFileSync("sudo", ["apt-get", "install", "-y", "git"], { stdio: "inherit" });
        } catch {
          console.error("  Failed to install Git. Please install manually:");
          console.error("  sudo apt-get install -y git");
        }
        break;

      case "Claude CLI":
        console.log("  Installing Claude CLI via npm...");
        try {
          execFileSync("npm", ["install", "-g", "@anthropic-ai/claude-code"], { stdio: "inherit" });
        } catch {
          console.error("  Failed to install Claude CLI. Please install manually:");
          console.error("  npm install -g @anthropic-ai/claude-code");
        }
        break;

      case "GitHub CLI":
        console.log("  Please install GitHub CLI manually:");
        console.log("  https://cli.github.com/");
        console.log("  Or: sudo apt-get install -y gh");
        break;
    }
  }
}

function ensureClaudeUser(): void {
  try {
    execFileSync("id", ["claudeuser"], { stdio: "ignore" });
    console.log("  claudeuser already exists");
  } catch {
    console.log("  Creating claudeuser system account...");
    try {
      execFileSync("sudo", [
        "useradd", "--system", "--shell", "/bin/bash", "--create-home", "claudeuser",
      ], { stdio: "inherit" });
      console.log("  claudeuser created");
    } catch {
      console.error("  Failed to create claudeuser. Please create manually:");
      console.error("  sudo useradd --system --shell /bin/bash --create-home claudeuser");
    }
  }

  // Ensure the current user can sudo as claudeuser without a password
  const sudoersFile = "/etc/sudoers.d/sergio";
  const currentUser = process.env.USER || "sergio";
  const sudoersRule = `${currentUser} ALL=(claudeuser) NOPASSWD: ALL`;
  try {
    const existing = execFileSync("sudo", ["cat", sudoersFile], { encoding: "utf-8" }).trim();
    if (existing === sudoersRule) {
      console.log("  sudoers rule already configured");
      return;
    }
  } catch {
    // File doesn't exist yet
  }

  console.log(`  Configuring sudoers rule for ${currentUser} → claudeuser...`);
  try {
    execFileSync("bash", ["-c", `echo '${sudoersRule}' | sudo tee ${sudoersFile} > /dev/null && sudo chmod 0440 ${sudoersFile}`], { stdio: "inherit" });
    console.log("  sudoers rule created at /etc/sudoers.d/sergio");
  } catch {
    console.error("  Failed to create sudoers rule. Please run manually:");
    console.error(`  echo '${sudoersRule}' | sudo tee ${sudoersFile}`);
    console.error(`  sudo chmod 0440 ${sudoersFile}`);
  }
}

function grantClaudeUserAccess(repoDir: string): void {
  const home = os.homedir();

  // Allow claudeuser to traverse into the home directory (execute-only)
  console.log(`  chmod o+x ${home}`);
  try {
    execFileSync("chmod", ["o+x", home]);
  } catch {
    console.error(`  Failed to chmod ${home}. Run manually: chmod o+x ${home}`);
  }

  // Allow claudeuser to read the repo directory
  const resolved = path.resolve(repoDir);
  console.log(`  chmod -R o+rx ${resolved}`);
  try {
    execFileSync("chmod", ["-R", "o+rx", resolved]);
  } catch {
    console.error(`  Failed to chmod ${resolved}. Run manually: chmod -R o+rx ${resolved}`);
  }
}

async function loadExistingConfig(): Promise<any | null> {
  try {
    const data = await fs.readFile(CONFIG_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return null;
  }
}

async function loadExistingEnv(): Promise<Record<string, string>> {
  try {
    const data = await fs.readFile(ENV_FILE, "utf-8");
    const env: Record<string, string> = {};
    for (const line of data.split("\n")) {
      const match = line.match(/^([A-Z_]+)=(.*)$/);
      if (match) env[match[1]] = match[2];
    }
    return env;
  } catch {
    return {};
  }
}

function buildPreviousValues(config: any | null, env: Record<string, string>): PreviousValues {
  return {
    botName: config?.botName,
    anthropicApiKey: env.ANTHROPIC_API_KEY,
    trelloApiKey: env.TRELLO_API_KEY,
    trelloToken: env.TRELLO_TOKEN,
    githubToken: env.GITHUB_TOKEN,
    repoUrl: config?.github?.repoUrl,
    repoDir: config?.repoDir,
    worktreeBaseDir: config?.worktreeBaseDir,
    baseBranch: config?.baseBranch,
    baseRemote: config?.baseRemote,
    devCommand: config?.pipeline?.devCommand,
    devReadyPattern: config?.pipeline?.devReadyPattern,
    testCommands: config?.pipeline?.testCommands,
    urlAllowList: config?.urlAllowList,
    revisionTemplate: config?.prompts?.revisionTemplate,
    developmentTemplate: config?.prompts?.developmentTemplate,
  };
}

async function writeEnvFile(
  anthropicApiKey: string,
  apiKey: string,
  token: string,
  githubToken: string
): Promise<void> {
  const lines = [
    `ANTHROPIC_API_KEY=${anthropicApiKey}`,
    `TRELLO_API_KEY=${apiKey}`,
    `TRELLO_TOKEN=${token}`,
  ];
  if (githubToken) {
    lines.push(`GITHUB_TOKEN=${githubToken}`);
  }
  await fs.writeFile(ENV_FILE, lines.join("\n") + "\n");
  console.log(`  Wrote ${ENV_FILE}`);
}

async function writeConfigFile(config: Record<string, any>): Promise<void> {
  await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2) + "\n");
  console.log(`  Wrote ${CONFIG_FILE}`);
}

async function ensurePromptTemplates(
  revisionPath: string,
  developmentPath: string
): Promise<void> {
  const defaultDir = path.resolve("prompts");
  await fs.mkdir(defaultDir, { recursive: true });

  for (const tpl of [revisionPath, developmentPath]) {
    const fullPath = path.resolve(tpl);
    try {
      await fs.access(fullPath);
    } catch {
      const basename = path.basename(tpl);
      const defaultSrc = path.join(defaultDir, basename);
      try {
        await fs.access(defaultSrc);
        if (fullPath !== defaultSrc) {
          await fs.copyFile(defaultSrc, fullPath);
          console.log(`  Copied default template to ${fullPath}`);
        }
      } catch {
        console.log(`  Warning: template not found at ${fullPath}`);
      }
    }
  }
}

async function main() {
  console.log(BANNER);

  // Step 1: Check system dependencies
  console.log("Checking system dependencies...\n");
  const { missing, found } = checkDependencies();

  for (const dep of found) {
    console.log(`  [ok] ${dep}`);
  }
  for (const dep of missing) {
    console.log(`  [!!] ${dep} — not found`);
  }

  if (missing.length > 0) {
    const doInstall = await ask(
      `\n${missing.length} missing dependency(ies). Attempt install? (y/n)`,
      "y"
    );
    if (doInstall.toLowerCase() === "y") {
      installDependencies(missing);
    } else {
      console.log("Skipping installation. Some features may not work.\n");
    }
  } else {
    console.log("\nAll dependencies found.\n");
  }

  // Step 2: Ensure claudeuser exists
  console.log("Checking claudeuser account...");
  ensureClaudeUser();
  console.log("");

  // Step 3: Config setup
  const existing = await loadExistingConfig();
  const env = await loadExistingEnv();
  const prev = buildPreviousValues(existing, env);

  if (existing) {
    console.log("Existing sergio.config.json found.\n");
    const action = await ask(
      "What to reconfigure? (all / trello / github / urls / prompts)",
      "all"
    );

    if (action === "all") {
      await runFullSetup(prev);
    } else {
      await runPartialSetup(existing, action);
    }
  } else {
    console.log("No existing config found. Running full setup.\n");
    await runFullSetup(prev);
  }

  closePrompts();
}

async function runFullSetup(prev: PreviousValues = {}): Promise<void> {
  const answers = await collectSetupAnswers(prev);

  // Create Trello board
  const createBoard = await ask("Create a new Trello board? (y/n)", "y");
  let board: BoardSetupResult;

  if (createBoard.toLowerCase() === "y") {
    board = await setupTrelloBoard(
      answers.botName,
      answers.trelloApiKey,
      answers.trelloToken
    );
  } else {
    const boardInput = await ask("Existing board URL or ID");
    const boardId = parseBoardId(boardInput);

    console.log("\nFetching lists from board...");
    const existingLists = await fetchBoardLists(
      boardId,
      answers.trelloApiKey,
      answers.trelloToken
    );

    if (existingLists.length === 0) {
      console.log("  No lists found on this board. Creating them now...");
      board = await setupTrelloBoard(
        answers.botName,
        answers.trelloApiKey,
        answers.trelloToken
      );
      board.boardId = boardId;
    } else {
      console.log(`  Found ${existingLists.length} list(s):`);
      for (const list of existingLists) {
        console.log(`    - ${list.name} (${list.id})`);
      }

      function findList(keyword: string): string {
        const match = existingLists.find((l) =>
          l.name.toLowerCase().includes(keyword.toLowerCase())
        );
        return match?.id || "";
      }

      board = {
        boardId,
        lists: {
          todo: findList("TODO") || existingLists[0]?.id || "",
          taskRevision: findList("Task Revision") || findList("Revision"),
          reviewing: findList("Reviewing"),
          todoReviewed: findList("Reviewed"),
          taskDevelopment: findList("Task Development") || findList("Development"),
          developing: findList("Developing"),
          taskDeveloped: findList("Developed"),
        },
      };

      // Let user confirm or override each mapping
      console.log("\nList mapping (press Enter to accept, or paste a different list ID):");
      for (const [key, id] of Object.entries(board.lists)) {
        const listName = existingLists.find((l) => l.id === id)?.name || "(not found)";
        const override = await ask(`  ${key} → ${listName}`, id);
        (board.lists as Record<string, string>)[key] = override;
      }
    }
  }

  const configData: Record<string, any> = {
    botName: answers.botName,
    baseBranch: answers.baseBranch,
    baseRemote: answers.baseRemote,
    trello: {
      boardId: board.boardId,
      lists: board.lists,
    },
    github: { repoUrl: answers.repoUrl },
    repoDir: answers.repoDir,
    worktreeBaseDir: answers.worktreeBaseDir,
    urlAllowList: answers.urlAllowList,
    prompts: {
      revisionTemplate: answers.revisionTemplate,
      developmentTemplate: answers.developmentTemplate,
    },
    pipeline: {
      devCommand: answers.devCommand,
      devReadyPattern: answers.devReadyPattern,
      testCommands: answers.testCommands,
    },
    timeouts: {
      claudeDevMs: 1200000,
      devServerMs: 600000,
      testMs: 600000,
    },
    pollIntervalMs: 60000,
    logsDir: "logs",
    dataDir: "data",
  };

  console.log("\nWriting configuration...");
  await writeConfigFile(configData);
  await writeEnvFile(
    answers.anthropicApiKey,
    answers.trelloApiKey,
    answers.trelloToken,
    answers.githubToken
  );
  await ensurePromptTemplates(answers.revisionTemplate, answers.developmentTemplate);

  console.log("\nGranting claudeuser access to repo...");
  grantClaudeUserAccess(answers.repoDir);

  printSummary(configData);
}

async function runPartialSetup(
  existing: Record<string, any>,
  section: string
): Promise<void> {
  const updated = { ...existing };

  switch (section) {
    case "trello": {
      const createBoard = await ask("Create a new Trello board? (y/n)", "n");
      if (createBoard.toLowerCase() === "y") {
        const apiKey = await ask("Trello API Key");
        const token = await ask("Trello Token");
        const botName = existing.botName || "Sergio";
        const board = await setupTrelloBoard(botName, apiKey, token);
        updated.trello = { boardId: board.boardId, lists: board.lists };
      } else {
        const boardInput = await ask("Board URL or ID", existing.trello?.boardId);
        updated.trello.boardId = parseBoardId(boardInput);
      }
      break;
    }
    case "github": {
      updated.github = {
        repoUrl: await ask("GitHub repository URL", existing.github?.repoUrl),
      };
      const githubToken = await ask("GitHub Token", "");
      if (githubToken) {
        console.log("  Update GITHUB_TOKEN in .env manually or re-run full setup.");
      }
      break;
    }
    case "urls": {
      const urlListRaw = await ask(
        "URL allow list (comma-separated)",
        existing.urlAllowList?.join(", ")
      );
      updated.urlAllowList = urlListRaw
        ? urlListRaw.split(",").map((u: string) => u.trim()).filter(Boolean)
        : [];
      break;
    }
    case "prompts": {
      updated.prompts = {
        revisionTemplate: await ask(
          "Revision template path",
          existing.prompts?.revisionTemplate || "prompts/revision.md"
        ),
        developmentTemplate: await ask(
          "Development template path",
          existing.prompts?.developmentTemplate || "prompts/development.md"
        ),
      };
      break;
    }
    default:
      console.log(`Unknown section: ${section}. Running full setup.`);
      await runFullSetup();
      return;
  }

  console.log("\nUpdating configuration...");
  await writeConfigFile(updated);
  console.log("Done!");
}

function printSummary(config: Record<string, any>): void {
  console.log(`
Setup complete!

  Bot name:       ${config.botName}
  Board ID:       ${config.trello.boardId}
  Repo dir:       ${config.repoDir}
  Worktree dir:   ${config.worktreeBaseDir}
  URL allow list: ${config.urlAllowList.length > 0 ? config.urlAllowList.join(", ") : "(none)"}

Next steps:
  1. Review sergio.config.json and .env
  2. Start the bot: npm start
  3. (Optional) Set up systemd: sudo cp sergio.service /etc/systemd/system/
  4. (Optional) Harden network: sudo bash scripts/setup-firewall.sh
`);
}

main().catch((err) => {
  console.error("Setup failed:", err);
  process.exit(1);
});
