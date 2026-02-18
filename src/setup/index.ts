import { execFileSync } from "child_process";
import fs from "fs/promises";
import path from "path";
import { collectSetupAnswers, ask, closePrompts } from "./prompts.js";
import { setupTrelloBoard, type BoardSetupResult } from "./trello-setup.js";

const CONFIG_FILE = path.resolve("sergio.config.json");
const ENV_FILE = path.resolve(".env");

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
}

async function loadExistingConfig(): Promise<any | null> {
  try {
    const data = await fs.readFile(CONFIG_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return null;
  }
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

  if (existing) {
    console.log("Existing sergio.config.json found.\n");
    const action = await ask(
      "What to reconfigure? (all / trello / github / urls / prompts)",
      "all"
    );

    if (action === "all") {
      await runFullSetup();
    } else {
      await runPartialSetup(existing, action);
    }
  } else {
    console.log("No existing config found. Running full setup.\n");
    await runFullSetup();
  }

  closePrompts();
}

async function runFullSetup(): Promise<void> {
  const answers = await collectSetupAnswers();

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
    const boardId = await ask("Existing board ID");
    const todoId = await ask("TODO list ID");
    const taskRevisionId = await ask("Task Revision list ID");
    const reviewingId = await ask("Reviewing list ID");
    const todoReviewedId = await ask("TODO Reviewed list ID");
    const taskDevelopmentId = await ask("Task Development list ID");
    const developingId = await ask("Developing list ID");
    const taskDevelopedId = await ask("Task Developed list ID");

    board = {
      boardId,
      lists: {
        todo: todoId,
        taskRevision: taskRevisionId,
        reviewing: reviewingId,
        todoReviewed: todoReviewedId,
        taskDevelopment: taskDevelopmentId,
        developing: developingId,
        taskDeveloped: taskDevelopedId,
      },
    };
  }

  const configData = {
    botName: answers.botName,
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
    timeouts: {
      claudeDevMs: 1200000,
      sstDevMs: 600000,
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
        updated.trello.boardId = await ask("Board ID", existing.trello?.boardId);
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
