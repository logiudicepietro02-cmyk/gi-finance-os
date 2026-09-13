/**
 * TEST-ONLY provider used by automated E2E tests (AI_PROVIDER=scripted + ALLOW_SCRIPTED_AI=1).
 * It never runs in production (see getAIStatus) and is labelled "Provider di test" in the UI.
 * It exercises the real plumbing (AIRun logging, tool authorization + audit, schema validation,
 * persistence, rendering) with deterministic outputs; it does not pretend to analyse anything.
 */
import { z } from "zod";
import {
  AIOutputError,
  ZERO_USAGE,
  type AIProvider,
  type GenerateObjectParams,
  type GenerateTextParams,
  type RunToolsParams,
  type RunToolsResult,
  type ToolCallRecord,
} from "../types";

type JsonNode = {
  type?: string | string[];
  anyOf?: JsonNode[];
  enum?: unknown[];
  const?: unknown;
  properties?: Record<string, JsonNode>;
  items?: JsonNode;
  minimum?: number;
  pattern?: string;
  format?: string;
};

function sample(node: JsonNode, key: string): unknown {
  if (node.anyOf?.length) {
    const nonNull = node.anyOf.find((n) => n.type !== "null");
    if (!nonNull || nonNull.pattern || nonNull.format) return null;
    return sample(nonNull, key);
  }
  if (node.const !== undefined) return node.const;
  if (node.enum?.length) return node.enum[0];
  switch (node.type) {
    case "object":
      return Object.fromEntries(Object.entries(node.properties ?? {}).map(([k, v]) => [k, sample(v, k)]));
    case "array":
      return node.items ? [sample(node.items, key)] : [];
    case "string":
      return `[Provider di test] ${key}`;
    case "integer":
      return typeof node.minimum === "number" && Math.abs(node.minimum) < 1e12 ? node.minimum : 1;
    case "number":
      return typeof node.minimum === "number" && Math.abs(node.minimum) < 1e12 ? node.minimum : 0.5;
    case "boolean":
      return false;
    default:
      return null;
  }
}

export class ScriptedProvider implements AIProvider {
  readonly name = "scripted" as const;
  readonly model = "scripted-test-v1";
  readonly supportsDocumentAI = false;

  async generateText(p: GenerateTextParams) {
    return { text: `[Provider di test] ${p.prompt.slice(0, 120)}`, usage: ZERO_USAGE };
  }

  async generateObject<T>(p: GenerateObjectParams<T>) {
    const jsonSchema = z.toJSONSchema(p.schema, { io: "output", unrepresentable: "any" }) as JsonNode;
    const raw = sample(jsonSchema, p.schemaName);
    const parsed = p.schema.safeParse(raw);
    if (!parsed.success) throw new AIOutputError("Provider di test: campione non conforme allo schema.", parsed.error.issues);
    return { object: parsed.data, raw, usage: ZERO_USAGE };
  }

  async runWithTools(p: RunToolsParams): Promise<RunToolsResult> {
    const toolCalls: ToolCallRecord[] = [];
    for (const name of ["get_company", "get_company_financials"]) {
      if (!p.tools.some((t) => t.name === name)) continue;
      const result = await p.executeTool(name, {});
      toolCalls.push({ id: `scripted-${name}`, name, input: {}, output: result.output, ok: result.ok, error: result.error ?? null, durationMs: 0 });
    }
    const companyName = (toolCalls[0]?.output as { company?: { name?: string } | null } | undefined)?.company?.name;
    const summary = toolCalls.map((c) => `${c.name} (${c.ok ? "ok" : "errore"})`).join(", ") || "nessuno";
    return {
      text: `[Provider di test] ${companyName ? `Azienda nel contesto: ${companyName}. ` : ""}Tool eseguiti: ${summary}.`,
      toolCalls,
      usage: ZERO_USAGE,
      iterations: 1,
    };
  }
}
