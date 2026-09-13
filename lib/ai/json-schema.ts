import { z, type ZodType } from "zod";
import { AIOutputError } from "./types";

/**
 * Keywords not supported (or not reliably supported) by provider structured-output modes.
 * Constraints are still enforced: every response is validated with the original Zod schema.
 */
const UNSUPPORTED_KEYWORDS = new Set([
  "$schema",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "minLength",
  "maxLength",
  "pattern",
  "format",
  "minItems",
  "maxItems",
  "uniqueItems",
  "default",
  "examples",
]);

function sanitize(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(sanitize);
  if (!node || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (UNSUPPORTED_KEYWORDS.has(key)) continue;
    if (key === "properties" && value && typeof value === "object") {
      out[key] = Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, sanitize(v)]));
      continue;
    }
    out[key] = sanitize(value);
  }
  if (out.type === "object" && out.properties && typeof out.properties === "object") {
    out.additionalProperties = false;
    out.required = Object.keys(out.properties as object);
  }
  return out;
}

/** JSON Schema for structured outputs (strict: every property required, no additional properties). */
export function toStrictJsonSchema(schema: ZodType): Record<string, unknown> {
  const raw = z.toJSONSchema(schema, { io: "output", unrepresentable: "any" });
  return sanitize(raw) as Record<string, unknown>;
}

/** JSON Schema for tool inputs (keeps optional fields and constraints). */
export function toToolJsonSchema(schema: ZodType): Record<string, unknown> {
  const raw = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as Record<string, unknown>;
  delete raw.$schema;
  return raw;
}

export function parseStructuredOutput<T>(text: string, schema: ZodType<T>): { object: T; raw: unknown } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new AIOutputError("La risposta del modello non è JSON valido.", text.slice(0, 2000));
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`);
    throw new AIOutputError(`Output del modello non conforme allo schema (${issues.join("; ")}).`, raw);
  }
  return { object: parsed.data, raw };
}
