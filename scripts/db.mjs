// Local PostgreSQL for development without Docker.
// Starts a real Postgres (official binaries via `embedded-postgres`) matching DATABASE_URL
// and creates the app, test and e2e databases. Ctrl+C stops it; data persists.
import "dotenv/config";
import EmbeddedPostgres from "embedded-postgres";
import { existsSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const DEFAULT_URL = "postgresql://postgres:postgres@localhost:54329/gi_finance_os";

function parse(urlString) {
  const url = new URL(urlString);
  return {
    port: Number(url.port || 5432),
    user: decodeURIComponent(url.username || "postgres"),
    password: decodeURIComponent(url.password || "postgres"),
    database: url.pathname.replace(/^\//, ""),
    host: url.hostname,
  };
}

const main = parse(process.env.DATABASE_URL ?? DEFAULT_URL);
if (!["localhost", "127.0.0.1"].includes(main.host)) {
  console.error(`DATABASE_URL points to ${main.host}: db:start only manages a local database.`);
  process.exit(1);
}

const databases = [process.env.DATABASE_URL, process.env.TEST_DATABASE_URL, process.env.E2E_DATABASE_URL]
  .filter(Boolean)
  .map((u) => parse(u))
  .filter((d) => d.port === main.port)
  .map((d) => d.database);
if (databases.length === 0) databases.push(main.database);

const dataDir = path.resolve(process.env.PG_DATA_DIR || path.join(os.homedir(), ".gi-finance-os", "postgres"));
mkdirSync(path.dirname(dataDir), { recursive: true });

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: main.user,
  password: main.password,
  port: main.port,
  persistent: true,
  initdbFlags: ["--encoding=UTF8", "--no-locale"],
  onLog: () => {},
});

async function run() {
  if (!existsSync(path.join(dataDir, "PG_VERSION"))) {
    console.log(`Initialising Postgres cluster in ${dataDir} ...`);
    await pg.initialise();
  }
  await pg.start();

  const client = pg.getPgClient();
  await client.connect();
  for (const name of new Set(databases)) {
    const { rowCount } = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
    if (!rowCount) {
      await client.query(`CREATE DATABASE "${name.replace(/"/g, "")}"`);
      console.log(`Created database ${name}`);
    }
  }
  await client.end();

  console.log(`Postgres ready on localhost:${main.port} (databases: ${[...new Set(databases)].join(", ")})`);
  console.log("Press Ctrl+C to stop.");
}

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  console.log("\nStopping Postgres...");
  try {
    await pg.stop();
  } finally {
    process.exit(0);
  }
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

run().catch(async (err) => {
  console.error(err);
  try {
    await pg.stop();
  } catch {}
  process.exit(1);
});
