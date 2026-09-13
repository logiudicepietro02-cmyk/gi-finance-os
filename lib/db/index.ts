import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma as PrismaTypes } from "@/lib/generated/prisma/client";

export { Prisma } from "@/lib/generated/prisma/client";
export type * from "@/lib/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { __prisma?: PrismaClient };

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL non configurata. Copia .env.example in .env.");
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

/** Singleton Prisma client (reused across hot reloads in development). */
export const db: PrismaClient = globalForPrisma.__prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.__prisma = db;

/** Prisma JSON columns reject undefined, Decimal instances, Dates inside objects etc. */
export function toJson(value: unknown): PrismaTypes.InputJsonValue {
  return JSON.parse(
    JSON.stringify(value, (_key, v) => {
      if (v && typeof v === "object" && typeof (v as { toNumber?: unknown }).toNumber === "function") {
        return (v as { toNumber: () => number }).toNumber();
      }
      return v;
    }),
  );
}
