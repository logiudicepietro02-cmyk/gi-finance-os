import { db, toJson, type AIRunKind, type Prisma } from "@/lib/db";
import { errorMessage } from "@/lib/errors";
import { AIOutputError, type AIProvider, type AIUsage } from "./types";

const MAX_JSON_CHARS = 60_000;

function compact(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  const json = toJson(value);
  const text = JSON.stringify(json);
  if (text === undefined) return undefined;
  if (text.length <= MAX_JSON_CHARS) return json as Prisma.InputJsonValue;
  return { truncated: true, chars: text.length, preview: text.slice(0, MAX_JSON_CHARS) };
}

/**
 * Wraps every LLM invocation in an AIRun record (provider, model, input, output, tokens, duration, outcome).
 * The run id is passed to the callback so tool calls can be linked to it in the audit log.
 */
export async function runAI<T>(
  actor: { organizationId: string; userId?: string | null },
  meta: { kind: AIRunKind; companyId?: string | null; input: unknown },
  provider: AIProvider,
  fn: (runId: string) => Promise<{ result: T; output: unknown; usage?: AIUsage }>,
): Promise<{ result: T; runId: string }> {
  const started = Date.now();
  const run = await db.aIRun.create({
    data: {
      organizationId: actor.organizationId,
      userId: actor.userId ?? null,
      companyId: meta.companyId ?? null,
      kind: meta.kind,
      provider: provider.name,
      model: provider.model,
      status: "RUNNING",
      input: compact(meta.input),
    },
  });
  try {
    const { result, output, usage } = await fn(run.id);
    await db.aIRun.update({
      where: { id: run.id },
      data: {
        status: "SUCCEEDED",
        output: compact(output),
        inputTokens: usage?.inputTokens ?? null,
        outputTokens: usage?.outputTokens ?? null,
        durationMs: Date.now() - started,
      },
    });
    return { result, runId: run.id };
  } catch (error) {
    await db.aIRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        error: errorMessage(error).slice(0, 2000),
        output: error instanceof AIOutputError ? compact({ raw: error.raw }) : undefined,
        durationMs: Date.now() - started,
      },
    });
    throw error;
  }
}
