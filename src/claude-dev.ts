import { spawn, execFileSync } from "child_process";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { config } from "./config.js";
import { loadTemplate } from "./template.js";

// Resolve claudeuser UID once at startup (no shell involved)
const claudeUserUid = parseInt(
  execFileSync("id", ["-u", "claudeuser"], { encoding: "utf-8" }).trim(),
  10
);

function buildUrlPolicy(urls: string[]): string {
  if (urls.length === 0) return "";
  return (
    "URL ACCESS POLICY: You are ONLY permitted to access these URLs:\n" +
    urls.map((u) => `- ${u}`).join("\n") +
    "\nDo NOT fetch, read, or access any URL not on this list."
  );
}

export async function runClaudeDev(
  cardContent: string,
  worktreeDir: string
): Promise<string> {
  const urlPolicy = buildUrlPolicy(config.urlAllowList);

  const prompt = await loadTemplate(
    path.resolve(config.prompts.developmentTemplate),
    { botName: config.botName, cardContent, urlPolicy, baseBranch: config.baseBranch, baseRemote: config.baseRemote }
  );

  const promptFile = path.join(os.tmpdir(), `claude-dev-prompt-${Date.now()}.txt`);
  await fs.writeFile(promptFile, prompt, { mode: 0o600 });
  await fs.chown(promptFile, claudeUserUid, -1);

  try {
    return await new Promise<string>((resolve, reject) => {
      // --dangerously-skip-permissions is required for non-interactive automation.
      // Mitigations: runs as sandboxed "claudeuser" with restricted network (firewall),
      // private prompt file (mode 0600), and no access to secrets or credentials.
      const child = spawn("sudo", [
        "-u", "claudeuser", "--", "bash", "-c",
        `claude -p --dangerously-skip-permissions < ${promptFile}`,
      ], {
        cwd: worktreeDir,
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
        reject(new Error(`Claude dev CLI timed out after ${config.timeouts.claudeDevMs / 1000}s`));
      }, config.timeouts.claudeDevMs);

      child.on("close", (code) => {
        clearTimeout(timer);
        if (code !== 0) {
          reject(
            new Error(`Claude dev CLI exited with code ${code}: ${stderr.slice(0, 500)}`)
          );
        } else {
          resolve(stdout.trim());
        }
      });

      child.on("error", (err) => {
        clearTimeout(timer);
        reject(new Error(`Failed to spawn Claude dev CLI: ${err.message}`));
      });
    });
  } finally {
    await fs.unlink(promptFile).catch(() => {});
  }
}
