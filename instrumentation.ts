/** Runs once when the Next.js server process starts (https://nextjs.org/docs/app/guides/instrumentation). */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateEnv } = await import("@/lib/config/env");
    validateEnv();
  }
}
