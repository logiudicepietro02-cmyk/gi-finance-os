// Starts an isolated app instance for Playwright:
// dedicated database (E2E_DATABASE_URL) + fresh demo seed + test AI provider + separate build dir.
import "dotenv/config";
import { execSync, spawn } from "node:child_process";

const port = process.env.E2E_PORT || "3100";
if (!process.env.E2E_DATABASE_URL) {
  console.error("E2E_DATABASE_URL non impostata (vedi .env.example)");
  process.exit(1);
}

const env = {
  ...process.env,
  DATABASE_URL: process.env.E2E_DATABASE_URL,
  AI_PROVIDER: "scripted",
  ALLOW_SCRIPTED_AI: "1",
  STORAGE_DRIVER: "local",
  STORAGE_LOCAL_DIR: ".data/e2e-storage",
  NEXT_DIST_DIR: ".next-e2e",
  NEXT_TELEMETRY_DISABLED: "1",
};

execSync("npx prisma migrate deploy", { stdio: "inherit", env });
execSync("npx tsx prisma/seed.ts", { stdio: "inherit", env });

const child = spawn("npx", ["next", "dev", "--port", port], { stdio: "inherit", env, shell: process.platform === "win32" });
const stop = () => child.kill();
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
child.on("exit", (code) => process.exit(code ?? 0));
