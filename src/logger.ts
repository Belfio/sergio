import fs from "fs";
import path from "path";
import { config } from "./config.js";

const logFile = path.join(config.logsDir, "sergio.log");

fs.mkdirSync(config.logsDir, { recursive: true });

const stream = fs.createWriteStream(logFile, { flags: "a" });

const originalLog = console.log.bind(console);
const originalError = console.error.bind(console);

function timestamp(): string {
  return new Date().toISOString();
}

function formatArgs(args: unknown[]): string {
  return args
    .map((a) => (typeof a === "string" ? a : JSON.stringify(a, null, 2)))
    .join(" ");
}

console.log = (...args: unknown[]) => {
  originalLog(...args);
  stream.write(`${timestamp()} [INFO] ${formatArgs(args)}\n`);
};

console.error = (...args: unknown[]) => {
  originalError(...args);
  stream.write(`${timestamp()} [ERROR] ${formatArgs(args)}\n`);
};
