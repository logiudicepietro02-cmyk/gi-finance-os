import { z } from "zod";

/**
 * Shape of the infrastructure env vars every deployment must get right (see .env.example).
 * AI provider keys are deliberately excluded: missing them is a supported, tested degraded
 * mode (see lib/ai/index.ts getAIStatus()), not a misconfiguration to fail the boot on.
 */
const envSchema = z
  .object({
    DATABASE_URL: z.string().min(1, "mancante. Copia .env.example in .env."),
    APP_URL: z.url("non è un URL valido."),
    STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
    STORAGE_LOCAL_DIR: z.string().min(1).default("./storage"),
    MAX_UPLOAD_MB: z.coerce.number().positive("deve essere un numero positivo.").default(25),
    S3_BUCKET: z.string().optional(),
  })
  .check((ctx) => {
    if (ctx.value.STORAGE_DRIVER === "s3" && !ctx.value.S3_BUCKET) {
      ctx.issues.push({ code: "custom", message: "richiesto quando STORAGE_DRIVER=s3.", input: ctx.value.S3_BUCKET, path: ["S3_BUCKET"] });
    }
  });

/**
 * Fails fast at server boot (called from instrumentation.ts) instead of at the first request
 * that happens to touch a misconfigured variable.
 */
export function validateEnv(): void {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join(".") || "env"}: ${i.message}`).join("\n");
    throw new Error(`Configurazione ambiente non valida (vedi .env.example):\n${issues}`);
  }
}
