import { spawn } from "child_process";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { config } from "./config.js";
import { loadTemplate } from "./template.js";

const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

function buildUrlPolicy(urls: string[]): string {
  if (urls.length === 0) return "";
  return (
    "URL ACCESS POLICY: You are ONLY permitted to access these URLs:\n" +
    urls.map((u) => `- ${u}`).join("\n") +
    "\nDo NOT fetch, read, or access any URL not on this list."
  );
}

export async function runClaude(
  cardTxtPath: string,
  repoDir: string
): Promise<string> {
  const cardContent = await fs.readFile(cardTxtPath, "utf-8");
  const urlPolicy = buildUrlPolicy(config.urlAllowList);

  const prompt = await loadTemplate(
    path.resolve(config.prompts.revisionTemplate),
    { botName: config.botName, cardContent, urlPolicy }
  );

  const promptFile = path.join(os.tmpdir(), `claude-prompt-${Date.now()}.txt`);
  await fs.writeFile(promptFile, prompt, { mode: 0o644 });

  try {
    return await new Promise<string>((resolve, reject) => {
      const child = spawn("su", [
        "-s", "/bin/bash", "claudeuser", "-c",
        `claude -p --dangerously-skip-permissions < ${promptFile}`,
      ], {
        cwd: repoDir,
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
        reject(new Error(`Claude CLI timed out after ${TIMEOUT_MS / 1000}s`));
      }, TIMEOUT_MS);

      child.on("close", (code) => {
        clearTimeout(timer);
        if (code !== 0) {
          reject(
            new Error(`Claude CLI exited with code ${code}: ${stderr.slice(0, 500)}`)
          );
        } else {
          resolve(stdout.trim());
        }
      });

      child.on("error", (err) => {
        clearTimeout(timer);
        reject(new Error(`Failed to spawn Claude CLI: ${err.message}`));
      });
    });
  } finally {
    await fs.unlink(promptFile).catch(() => {});
  }
}
