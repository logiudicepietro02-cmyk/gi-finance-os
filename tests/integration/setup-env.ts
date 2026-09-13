import "dotenv/config";
import os from "node:os";
import path from "node:path";

// Runs before each integration test file imports the app modules.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.AI_PROVIDER = "none";
process.env.STORAGE_DRIVER = "local";
process.env.STORAGE_LOCAL_DIR = path.join(os.tmpdir(), "gi-finance-os-test-storage");
