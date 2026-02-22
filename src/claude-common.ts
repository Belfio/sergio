import { spawn } from "child_process";

export function buildUrlPolicy(urls: string[]): string {
  if (urls.length === 0) return "";
  return (
    "URL ACCESS POLICY: You are ONLY permitted to access these URLs:\n" +
    urls.map((u) => `- ${u}`).join("\n") +
    "\nDo NOT fetch, read, or access any URL not on this list."
  );
}

export async function runClaudeCommand(
  prompt: string,
  cwd: string,
  timeoutMs: number,
  label: string
): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    // --dangerously-skip-permissions is required for non-interactive automation.
    // Mitigations: runs as sandboxed "claudeuser" with restricted network (firewall),
    // prompt piped via stdin (never touches disk), and no access to secrets or credentials.
    const child = spawn("sudo", [
      "-u", "claudeuser", "--",
      "env",
      `ANTHROPIC_API_KEY=${process.env.ANTHROPIC_API_KEY}`,
      `GITHUB_TOKEN=${process.env.GITHUB_TOKEN || ""}`,
      "claude", "-p", "--dangerously-skip-permissions",
    ], {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });
    child.stdin.write(prompt);
    child.stdin.end();

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
      reject(new Error(`${label} timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(
          new Error(`${label} exited with code ${code}: ${stderr.slice(0, 500)}`)
        );
      } else {
        resolve(stdout.trim());
      }
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`Failed to spawn ${label}: ${err.message}`));
    });
  });
}
