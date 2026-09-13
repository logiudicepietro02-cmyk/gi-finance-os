import { execSync } from "node:child_process";
import "dotenv/config";

/** Applies migrations to the dedicated test database before the integration suite. */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL non impostata: vedi .env.example");
  execSync("npx prisma migrate deploy", { stdio: "inherit", env: { ...process.env, DATABASE_URL: url } });
}
