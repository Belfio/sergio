import { spawn, ChildProcess } from "child_process";
import { config } from "./config.js";
import {
  getCardActions,
  getCardAttachments,
  moveCard,
  addComment,
  addAttachment,
  type TrelloCard,
  type TrelloComment,
  type TrelloAttachment,
} from "./trello.js";
import { markDevCardProcessed } from "./dev-state.js";
import { runClaudeDev } from "./claude-dev.js";

interface DevProcessContext {
  sourceListId: string;
  processingListId: string;
  doneListId: string;
}

export function sanitizeBranchName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 50);
}

function formatCardContent(
  card: TrelloCard,
  comments: TrelloComment[],
  attachments: TrelloAttachment[]
): string {
  const lines: string[] = [];
  lines.push(`Card: ${card.name}`);
  lines.push(`URL: ${card.url}`);
  lines.push("");
  lines.push("--- Description ---");
  lines.push(card.desc || "(no description)");
  lines.push("");
  lines.push("--- Comments ---");
  if (comments.length === 0) {
    lines.push("(no comments)");
  } else {
    for (const comment of comments) {
      lines.push(`[${comment.date}] ${comment.memberCreator.fullName}:`);
      lines.push(comment.data.text);
      lines.push("");
    }
  }
  lines.push("--- Attachments ---");
  if (attachments.length === 0) {
    lines.push("(no attachments)");
  } else {
    for (const att of attachments) {
      lines.push(`${att.name}: ${att.url}`);
    }
  }
  return lines.join("\n");
}

function runAsClaudeUser(
  command: string,
  cwd: string,
  timeoutMs: number
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("sudo", [
      "-u", "claudeuser", "--", "bash", "-c", command,
    ], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Command timed out after ${timeoutMs / 1000}s: ${command.slice(0, 100)}`));
    }, timeoutMs);

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`Command exited with code ${code}: ${stderr.slice(0, 1000)}`));
      } else {
        resolve({ stdout, stderr });
      }
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`Failed to spawn command: ${err.message}`));
    });
  });
}

async function createWorktree(
  repoDir: string,
  worktreeDir: string,
  branchName: string
): Promise<void> {
  // Fetch latest from remote
  await runAsClaudeUser(`git fetch ${config.baseRemote}`, repoDir, 60_000);
  // Create worktree with new branch based on configured remote/branch
  await runAsClaudeUser(
    `git worktree add -b ${branchName} ${worktreeDir} ${config.baseRemote}/${config.baseBranch}`,
    repoDir,
    60_000
  );
  console.log(`  Created worktree at ${worktreeDir} on branch ${branchName}`);
}

async function cleanupWorktree(
  repoDir: string,
  worktreeDir: string
): Promise<void> {
  try {
    await runAsClaudeUser(
      `git worktree remove --force ${worktreeDir}`,
      repoDir,
      30_000
    );
  } catch {
    // Fallback: force remove directory and prune
    try {
      await runAsClaudeUser(`rm -rf ${worktreeDir}`, repoDir, 30_000);
      await runAsClaudeUser("git worktree prune", repoDir, 30_000);
    } catch (e) {
      console.error(`  Failed to clean up worktree ${worktreeDir}:`, e);
    }
  }
  console.log(`  Cleaned up worktree ${worktreeDir}`);
}

async function withDevServer<T>(
  worktreeDir: string,
  fn: () => Promise<T>
): Promise<T> {
  const devCmd = config.pipeline.devCommand;
  const readyPattern = config.pipeline.devReadyPattern;
  console.log(`  Starting dev server: ${devCmd}...`);
  const devProcess: ChildProcess = spawn("sudo", [
    "-u", "claudeuser", "--", "bash", "-c", devCmd,
  ], {
    cwd: worktreeDir,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env },
  });

  let serverReady = false;

  // Wait for dev server to be ready
  await new Promise<void>((resolve, reject) => {
    let output = "";

    const onData = (chunk: Buffer) => {
      output += chunk.toString();
      if (readyPattern && output.includes(readyPattern)) {
        serverReady = true;
        clearTimeout(timer);
        resolve();
      }
    };

    devProcess.stdout?.on("data", onData);
    devProcess.stderr?.on("data", onData);

    const timer = setTimeout(() => {
      if (!serverReady) {
        devProcess.kill("SIGTERM");
        reject(new Error(`Dev server did not become ready within ${config.timeouts.devServerMs / 1000}s`));
      }
    }, config.timeouts.devServerMs);

    devProcess.on("close", (code) => {
      clearTimeout(timer);
      if (!serverReady) {
        reject(new Error(`Dev server exited with code ${code} before becoming ready`));
      }
    });

    devProcess.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`Failed to start dev server: ${err.message}`));
    });
  });

  console.log("  Dev server is ready");

  try {
    return await fn();
  } finally {
    devProcess.kill("SIGTERM");
    // Give it a moment to clean up
    await new Promise((resolve) => setTimeout(resolve, 2000));
    if (!devProcess.killed) {
      devProcess.kill("SIGKILL");
    }
    console.log("  Dev server stopped");
  }
}

async function runTestCommands(worktreeDir: string): Promise<void> {
  const commands = config.pipeline.testCommands;
  if (commands.length === 0) {
    console.log("  No test commands configured, skipping tests");
    return;
  }
  for (const cmd of commands) {
    console.log(`  Running: ${cmd}...`);
    await runAsClaudeUser(cmd, worktreeDir, config.timeouts.testMs);
    console.log(`  Passed: ${cmd}`);
  }
}

async function gitCommitAndPush(
  worktreeDir: string,
  branchName: string,
  cardName: string
): Promise<void> {
  await runAsClaudeUser("git add -A", worktreeDir, 30_000);
  const commitMsg = `feat: ${cardName}`;
  const author = `${config.botName} AI <${config.botName.toLowerCase()}-ai@noreply>`;
  await runAsClaudeUser(
    `git commit --author="${author}" -m "${commitMsg.replace(/"/g, '\\"')}"`,
    worktreeDir,
    30_000
  );
  await runAsClaudeUser(
    `git push -u ${config.baseRemote} ${branchName}`,
    worktreeDir,
    60_000
  );
  console.log(`  Committed and pushed to ${branchName}`);
}

async function createPullRequest(
  worktreeDir: string,
  branchName: string,
  card: TrelloCard
): Promise<string> {
  const title = card.name;
  const body = `Trello: ${card.url}`;
  const { stdout } = await runAsClaudeUser(
    `gh pr create --title "${title.replace(/"/g, '\\"')}" --body "${body.replace(/"/g, '\\"')}"`,
    worktreeDir,
    60_000
  );
  const prUrl = stdout.trim();
  console.log(`  Created PR: ${prUrl}`);
  return prUrl;
}

export async function processDevCard(
  card: TrelloCard,
  ctx: DevProcessContext
): Promise<void> {
  const branchName = `${config.botName.toLowerCase()}-dev/${sanitizeBranchName(card.name)}`;
  const worktreeDir = `${config.worktreeBaseDir}/${card.id}`;

  console.log(`[DEV] Processing card: ${card.name} (${card.id})`);
  console.log(`  Branch: ${branchName}`);
  console.log(`  Worktree: ${worktreeDir}`);

  // 1. Move card to developing list immediately
  await moveCard(card.id, ctx.processingListId);
  console.log("  Moved to developing list");

  try {
    // 2. Fetch comments and attachments
    const [comments, attachments] = await Promise.all([
      getCardActions(card.id),
      getCardAttachments(card.id),
    ]);
    const cardContent = formatCardContent(card, comments, attachments);

    // 3. Create git worktree
    await createWorktree(config.repoDir, worktreeDir, branchName);

    // 4. Run dev implementation
    console.log(`  Running ${config.botName} dev...`);
    const claudeOutput = await runClaudeDev(cardContent, worktreeDir);
    console.log(`  ${config.botName} dev produced output (${claudeOutput.length} chars)`);

    // 5. Post Claude's output as comment (truncated for Trello limit)
    const truncatedOutput = claudeOutput.length > 15000
      ? claudeOutput.slice(0, 15000) + "\n\n... (output truncated)"
      : claudeOutput;
    await addComment(card.id, `**${config.botName} Dev Output:**\n\n${truncatedOutput}`);
    console.log("  Posted Claude output as comment");

    // 6. Run dev server (if configured) and tests
    if (config.pipeline.devCommand) {
      await withDevServer(worktreeDir, async () => {
        await runTestCommands(worktreeDir);
      });
    } else {
      await runTestCommands(worktreeDir);
    }

    // 8. Git commit + push
    await gitCommitAndPush(worktreeDir, branchName, card.name);

    // 9. Create PR
    const prUrl = await createPullRequest(worktreeDir, branchName, card);

    // 10. Attach PR URL to card
    await addAttachment(card.id, prUrl, "Pull Request");
    console.log("  Attached PR to card");

    // 11. Move card to done list
    await moveCard(card.id, ctx.doneListId);
    console.log("  Moved to task developed list");

    // 12. Mark as processed
    await markDevCardProcessed(card.id);
    console.log(`[DEV] Done: ${card.name}`);
  } catch (err) {
    console.error(`[DEV] Error processing card ${card.id}:`, err);
    const errMsg = err instanceof Error ? err.message : String(err);
    await addComment(
      card.id,
      `**${config.botName} error:**\n\n${errMsg.slice(0, 5000)}`
    ).catch((e) => console.error("  Failed to post error comment:", e));
    // Move card back to source list so it can be retried
    await moveCard(card.id, ctx.sourceListId).catch((e) =>
      console.error("  Failed to move card back:", e)
    );
  } finally {
    // Always clean up worktree
    await cleanupWorktree(config.repoDir, worktreeDir);
  }
}
