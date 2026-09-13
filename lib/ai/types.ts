import type { ZodType } from "zod";

export type ProviderName = "anthropic" | "openai" | "scripted";
export type Effort = "low" | "medium" | "high";

export interface AIUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ToolSpec {
  name: string;
  description: string;
  /** JSON Schema of the tool input (type: object) */
  inputSchema: Record<string, unknown>;
}

export interface ToolExecutionResult {
  ok: boolean;
  output: unknown;
  error?: string | null;
}

export interface ToolCallRecord {
  id: string;
  name: string;
  input: unknown;
  output: unknown;
  ok: boolean;
  error: string | null;
  durationMs: number;
}

export interface GenerateTextParams {
  system: string;
  prompt: string;
  maxTokens?: number;
  effort?: Effort;
}

export interface GenerateObjectParams<T> {
  system: string;
  prompt: string;
  schema: ZodType<T>;
  schemaName: string;
  /** Raw PDF, for documents without selectable text */
  pdf?: Uint8Array;
  maxTokens?: number;
  effort?: Effort;
}

export interface RunToolsParams {
  system: string;
  messages: ChatMessage[];
  tools: ToolSpec[];
  executeTool: (name: string, input: unknown) => Promise<ToolExecutionResult>;
  maxIterations?: number;
  maxTokens?: number;
  effort?: Effort;
}

export interface RunToolsResult {
  text: string;
  toolCalls: ToolCallRecord[];
  usage: AIUsage;
  iterations: number;
}

/** Provider-neutral interface: the application never calls a vendor SDK directly. */
export interface AIProvider {
  readonly name: ProviderName;
  readonly model: string;
  /** Whether the provider is used by the document pipeline (classification/extraction). */
  readonly supportsDocumentAI: boolean;
  generateText(params: GenerateTextParams): Promise<{ text: string; usage: AIUsage }>;
  generateObject<T>(params: GenerateObjectParams<T>): Promise<{ object: T; raw: unknown; usage: AIUsage }>;
  runWithTools(params: RunToolsParams): Promise<RunToolsResult>;
}

export class AIOutputError extends Error {
  constructor(
    message: string,
    public readonly raw: unknown,
  ) {
    super(message);
    this.name = "AIOutputError";
  }
}

export const ZERO_USAGE: AIUsage = { inputTokens: 0, outputTokens: 0 };

export function addUsage(a: AIUsage, b: AIUsage): AIUsage {
  return { inputTokens: a.inputTokens + b.inputTokens, outputTokens: a.outputTokens + b.outputTokens };
}
