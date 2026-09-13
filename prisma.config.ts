import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // `prisma generate` does not need a connection; migrate/seed do.
    url: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:54329/gi_finance_os",
  },
});
