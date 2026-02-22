import { spawn, ChildProcess } from "child_process";
import path from "path";
import os from "os";
import { log } from "./logger.js";
import { config } from "./config.js";
import {
  getCardActions,
  getCardAttachments,
  downloadCardAttachments,
  cleanupAttachments,
  moveCard,
  addComment,
  addAttachment,
  type TrelloCard,
  type TrelloComment,
  type DownloadedAttachment,
  type LinkAttachment,
} from "./trello.js";
import { markDevCardProcessed, incrementDevCardAttempts, clearDevCardAttempts } from "./dev-state.js";
import { runClaudeDev } from "./claude-dev.js";
import { sanitizeBranchName } from "./git-utils.js";

interface DevProcessContext {
  sourceListId: string;
  processingListId: string;
  doneListId: string;
}

function formatCardContent(
  card: TrelloCard,
  comments: TrelloComment[],
  downloaded: DownloadedAttachment[],
  links: LinkAttachment[]
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
  if (downloaded.length === 0 && links.length === 0) {
    lines.push("(no attachments)");
  } else {
    for (const att of downloaded) {
      const mime = att.mimeType ? ` (${att.mimeType})` : "";
      lines.push(`${att.name}${mime}: ${att.localPath}`);
      lines.push("  ^ This file has been downloaded locally. Use the Read tool to view it.");
    }
    for (const att of links) {
      lines.push(`${att.name} [link]: ${att.url}`);
    }
  }
  return lines.join("\n");
}

function runAsClaudeUser(
  argv: string[],
  cwd: string,
  timeoutMs: number
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("sudo", [
      "-u", "claudeuser", "--",
      "env", `GITHUB_TOKEN=${process.env.GITHUB_TOKEN || ""}`,
      ...argv,
    ], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
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
      reject(new Error(`Command timed out after ${timeoutMs / 1000}s: ${argv.join(" ").slice(0, 100)}`));
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
  await runAsClaudeUser(["git", "fetch", config.baseRemote], repoDir, 60_000);
  // Delete stale branch from a previous failed run (if any)
  try {
    await runAsClaudeUser(["git", "branch", "-D", branchName], repoDir, 30_000);
    log.info(`  Deleted stale branch ${branchName}`);
  } catch {
    // Branch doesn't exist — expected on first run
  }
  // Create worktree with new branch based on configured remote/branch
  await runAsClaudeUser(
    ["git", "worktree", "add", "-b", branchName, worktreeDir, `${config.baseRemote}/${config.baseBranch}`],
    repoDir,
    60_000
  );
  log.info(`  Created worktree at ${worktreeDir} on branch ${branchName}`);
}

async function cleanupWorktree(
  repoDir: string,
  worktreeDir: string,
  branchName: string
): Promise<void> {
  try {
    await runAsClaudeUser(
      ["git", "worktree", "remove", "--force", worktreeDir],
      repoDir,
      30_000
    );
  } catch {
    // Fallback: force remove directory and prune
    try {
      await runAsClaudeUser(["rm", "-rf", worktreeDir], repoDir, 30_000);
      await runAsClaudeUser(["git", "worktree", "prune"], repoDir, 30_000);
    } catch (e) {
      log.error(`  Failed to clean up worktree ${worktreeDir}:`, e);
    }
  }
  // Delete the dev branch so it doesn't block future runs for this card
  try {
    await runAsClaudeUser(["git", "branch", "-D", branchName], repoDir, 30_000);
  } catch {
    // Branch may already be gone or was pushed — not critical
  }
  log.info(`  Cleaned up worktree ${worktreeDir}`);
}

async function withDevServer<T>(
  worktreeDir: string,
  fn: () => Promise<T>
): Promise<T> {
  const devCmd = config.pipeline.devCommand;
  const readyPattern = config.pipeline.devReadyPattern;
  // Config-provided command (operator-controlled) -- shell interpretation needed
  log.info(`  Starting dev server: ${devCmd}...`);
  const devProcess: ChildProcess = spawn("sudo", [
    "-u", "claudeuser", "--", "bash", "-c", devCmd,
  ], {
    cwd: worktreeDir,
    stdio: ["ignore", "pipe", "pipe"],
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

  log.info("  Dev server is ready");

  try {
    return await fn();
  } finally {
    devProcess.kill("SIGTERM");
    // Give it a moment to clean up
    await new Promise((resolve) => setTimeout(resolve, 2000));
    if (!devProcess.killed) {
      devProcess.kill("SIGKILL");
    }
    log.info("  Dev server stopped");
  }
}

async function runTestCommands(worktreeDir: string): Promise<void> {
  const commands = config.pipeline.testCommands;
  if (commands.length === 0) {
    log.info("  No test commands configured, skipping tests");
    return;
  }
  for (const cmd of commands) {
    // Config-provided command (operator-controlled) -- shell interpretation needed
    log.info(`  Running: ${cmd}...`);
    await runAsClaudeUser(["bash", "-c", cmd], worktreeDir, config.timeouts.testMs);
    log.info(`  Passed: ${cmd}`);
  }
}

async function gitCommitAndPush(
  worktreeDir: string,
  branchName: string,
  cardName: string
): Promise<boolean> {
  await runAsClaudeUser(["git", "add", "-A"], worktreeDir, 30_000);
  const { stdout: stagedFiles } = await runAsClaudeUser(
    ["git", "diff", "--cached", "--name-only"],
    worktreeDir,
    30_000
  );
  if (!stagedFiles.trim()) {
    log.info("  No file changes to commit");
    return false;
  }

  const commitMsg = `feat: ${cardName}`;
  const author = `${config.botName} AI <${config.botName.toLowerCase()}-ai@noreply>`;
  await runAsClaudeUser(
    ["git", "commit", `--author=${author}`, "-m", commitMsg],
    worktreeDir,
    30_000
  );
  await runAsClaudeUser(
    ["git", "push", "-u", config.baseRemote, branchName],
    worktreeDir,
    60_000
  );
  log.info(`  Committed and pushed to ${branchName}`);
  return true;
}

async function createPullRequest(
  worktreeDir: string,
  branchName: string,
  card: TrelloCard
): Promise<string> {
  const title = card.name;
  const body = `Trello: ${card.url}`;
  const { stdout } = await runAsClaudeUser(
    [
      "gh", "pr", "create", "--draft",
      "--base", config.baseBranch,
      "--head", branchName,
      "--title", title,
      "--body", body,
    ],
    worktreeDir,
    60_000
  );
  const prUrl = stdout.trim();
  log.info(`  Created PR: ${prUrl}`);
  return prUrl;
}

export async function processDevCard(
  card: TrelloCard,
  ctx: DevProcessContext
): Promise<void> {
  const branchName = `${config.botName.toLowerCase()}-dev/${sanitizeBranchName(card.name)}`;
  const worktreeDir = `${config.worktreeBaseDir}/${card.id}`;

  log.info(`[DEV] Processing card: ${card.name} (${card.id})`);
  log.info(`  Branch: ${branchName}`);
  log.info(`  Worktree: ${worktreeDir}`);

  // 1. Move card to developing list immediately
  await moveCard(card.id, ctx.processingListId);
  log.info("  Moved to developing list");

  const attachDir = path.join(os.tmpdir(), `sergio-att-${card.id}`);

  try {
    // 2. Fetch comments and attachments
    const [comments, attachments] = await Promise.all([
      getCardActions(card.id),
      getCardAttachments(card.id),
    ]);

    // 3. Download uploaded attachments locally so Claude can read them
    const { downloaded, links } = await downloadCardAttachments(attachments, attachDir);
    if (downloaded.length > 0) {
      log.info(`  Downloaded ${downloaded.length} attachment(s)`);
    }
    const cardContent = formatCardContent(card, comments, downloaded, links);

    // 4. Create git worktree
    await createWorktree(config.repoDir, worktreeDir, branchName);

    // 4. Run dev implementation
    log.info(`  Running ${config.botName} dev...`);
    const claudeOutput = await runClaudeDev(cardContent, worktreeDir);
    log.info(`  ${config.botName} dev produced output (${claudeOutput.length} chars)`);

    // 5. Post Claude's output as comment (truncated for Trello limit)
    const truncatedOutput = claudeOutput.length > 15000
      ? claudeOutput.slice(0, 15000) + "\n\n... (output truncated)"
      : claudeOutput;
    await addComment(card.id, `**${config.botName} Dev Output:**\n\n${truncatedOutput}`);
    log.info("  Posted Claude output as comment");

    // 6. Run dev server (if configured) and tests
    if (config.pipeline.devCommand) {
      await withDevServer(worktreeDir, async () => {
        await runTestCommands(worktreeDir);
      });
    } else {
      await runTestCommands(worktreeDir);
    }

    // 8. Git commit + push (or mark as no-op if Claude made no code changes)
    const committed = await gitCommitAndPush(worktreeDir, branchName, card.name);
    if (!committed) {
      await addComment(
        card.id,
        `**${config.botName}: no code changes detected**\n\nClaude completed the run but did not produce file changes to commit.`
      );
      log.info("  Posted no-op result comment");
    } else {
      // 9. Create PR
      const prUrl = await createPullRequest(worktreeDir, branchName, card);

      // 10. Attach PR URL to card
      await addAttachment(card.id, prUrl, "Pull Request");
      log.info("  Attached PR to card");
    }

    // 11. Move card to done list
    await moveCard(card.id, ctx.doneListId);
    log.info("  Moved to task developed list");

    // 12. Mark as processed and clear attempts
    await markDevCardProcessed(card.id);
    await clearDevCardAttempts(card.id);
    log.info(`[DEV] Done: ${card.name}`);
  } catch (err) {
    log.error(`[DEV] Error processing card ${card.id}:`, err);
    const runId = `${Date.now()}-${card.id}`;
    const errMsg = err instanceof Error ? err.message : String(err);
    await addComment(
      card.id,
      `**${config.botName} error (run ${runId}):**\n\n${errMsg.slice(0, 5000)}`
    ).catch((e) => log.error("  Failed to post error comment:", e));
    const attempts = await incrementDevCardAttempts(card.id).catch(() => 0);
    const failedListId = config.trello.lists.failed;
    if (failedListId && attempts >= config.maxCardAttempts) {
      log.error(`  Card ${card.id} failed ${attempts} times, moving to failed list`);
      await moveCard(card.id, failedListId).catch((e) =>
        log.error("  Failed to move card to failed list:", e)
      );
    } else {
      await moveCard(card.id, ctx.sourceListId).catch((e) =>
        log.error("  Failed to move card back:", e)
      );
    }
  } finally {
    // Always clean up worktree and downloaded attachments
    await cleanupWorktree(config.repoDir, worktreeDir, branchName);
    await cleanupAttachments(attachDir);
  }
}
