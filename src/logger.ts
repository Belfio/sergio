import fs from "fs";
import path from "path";
import { config } from "./config.js";

const logFile = path.join(config.logsDir, "sergio.log");

fs.mkdirSync(config.logsDir, { recursive: true });

const stream = fs.createWriteStream(logFile, { flags: "a" });

function timestamp(): string {
  return new Date().toISOString();
}

function safeStringify(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function formatArgs(args: unknown[]): string {
  return args.map(safeStringify).join(" ");
}

function write(level: string, args: unknown[]): void {
  const msg = formatArgs(args);
  const line = `${timestamp()} [${level}] ${msg}\n`;
  if (level === "ERROR" || level === "WARN") {
    process.stderr.write(line);
  } else {
    process.stdout.write(line);
  }
  stream.write(line);
}

export const log = {
  info(...args: unknown[]): void {
    write("INFO", args);
  },
  error(...args: unknown[]): void {
    write("ERROR", args);
  },
  warn(...args: unknown[]): void {
    write("WARN", args);
  },
};
