import Anthropic from "@anthropic-ai/sdk";
import type {
  BetaMessage,
  BetaMessageParam,
  BetaToolUseBlock,
  MessageCreateParamsBase,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { parseStructuredOutput, toStrictJsonSchema } from "../json-schema";
import {
  AIOutputError,
  ZERO_USAGE,
  addUsage,
  type AIProvider,
  type AIUsage,
  type GenerateObjectParams,
  type GenerateTextParams,
  type RunToolsParams,
  type RunToolsResult,
  type ToolCallRecord,
} from "../types";

type StreamParams = MessageCreateParamsBase;
type MessageParam = BetaMessageParam;
type FinalMessage = BetaMessage;
type ToolUseBlock = BetaToolUseBlock;
type SendParams = Omit<StreamParams, "model" | "betas" | "fallbacks">;

/** Server-side refusal fallback (routes a declined request to a fallback model within the same call). */
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

function usageOf(message: FinalMessage): AIUsage {
  const u = message.usage;
  return {
    inputTokens: (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
    outputTokens: u.output_tokens ?? 0,
  };
}

function textOf(message: FinalMessage): string {
  return message.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .filter(Boolean)
    .join("\n")
    .trim();
}

export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic" as const;
  readonly supportsDocumentAI = true;
  private readonly client: Anthropic;

  constructor(
    readonly model: string,
    private readonly useFallbacks: boolean,
  ) {
    this.client = new Anthropic({ maxRetries: 2 });
  }

  /** Streams and collects the final message (avoids HTTP timeouts on long outputs). */
  private async send(params: SendParams): Promise<FinalMessage> {
    const request = {
      ...params,
      model: this.model,
      ...(this.useFallbacks ? { betas: [FALLBACK_BETA], fallbacks: "default" as const } : {}),
    } as StreamParams;
    const message = await this.client.beta.messages.stream(request).finalMessage();
    if (message.stop_reason === "refusal") {
      throw new AIOutputError("Il modello ha declinato la richiesta.", (message as { stop_details?: unknown }).stop_details ?? null);
    }
    return message;
  }

  async generateText(p: GenerateTextParams) {
    const message = await this.send({
      max_tokens: p.maxTokens ?? 16000,
      system: p.system,
      messages: [{ role: "user", content: p.prompt }],
      ...(p.effort ? { output_config: { effort: p.effort } } : {}),
    });
    return { text: textOf(message), usage: usageOf(message) };
  }

  async generateObject<T>(p: GenerateObjectParams<T>) {
    const content: MessageParam["content"] = p.pdf
      ? [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: Buffer.from(p.pdf).toString("base64") },
          },
          { type: "text", text: p.prompt },
        ]
      : p.prompt;
    const message = await this.send({
      max_tokens: p.maxTokens ?? 16000,
      system: p.system,
      messages: [{ role: "user", content }],
      output_config: {
        ...(p.effort ? { effort: p.effort } : {}),
        format: { type: "json_schema", schema: toStrictJsonSchema(p.schema) },
      },
    });
    if (message.stop_reason === "max_tokens") {
      throw new AIOutputError("Risposta del modello troncata (limite di token raggiunto).", textOf(message).slice(0, 2000));
    }
    const { object, raw } = parseStructuredOutput(textOf(message), p.schema);
    return { object, raw, usage: usageOf(message) };
  }

  async runWithTools(p: RunToolsParams): Promise<RunToolsResult> {
    const messages: MessageParam[] = p.messages.map((m) => ({ role: m.role, content: m.content }));
    const tools = p.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema as { type: "object"; [key: string]: unknown },
    }));
    const toolCalls: ToolCallRecord[] = [];
    let usage = ZERO_USAGE;
    const maxIterations = p.maxIterations ?? 8;
    const base = {
      max_tokens: p.maxTokens ?? 16000,
      system: p.system,
      ...(p.effort ? { output_config: { effort: p.effort } } : {}),
    };

    for (let iteration = 1; iteration <= maxIterations; iteration++) {
      const message = await this.send({ ...base, messages, tools });
      usage = addUsage(usage, usageOf(message));

      if (message.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: message.content as MessageParam["content"] });
        continue;
      }
      const toolUses = message.content.filter((b): b is ToolUseBlock => b.type === "tool_use");
      if (message.stop_reason !== "tool_use" || toolUses.length === 0) {
        return { text: textOf(message), toolCalls, usage, iterations: iteration };
      }

      messages.push({ role: "assistant", content: message.content as MessageParam["content"] });
      const results = await Promise.all(
        toolUses.map(async (use) => {
          const started = Date.now();
          const result = await p.executeTool(use.name, use.input);
          toolCalls.push({
            id: use.id,
            name: use.name,
            input: use.input,
            output: result.output,
            ok: result.ok,
            error: result.error ?? null,
            durationMs: Date.now() - started,
          });
          return {
            type: "tool_result" as const,
            tool_use_id: use.id,
            content: JSON.stringify(result.ok ? result.output : { error: result.error }),
            is_error: !result.ok,
          };
        }),
      );
      // All results of one assistant turn go back in a single user message.
      messages.push({ role: "user", content: results });
    }

    messages.push({ role: "user", content: "Hai raggiunto il limite di chiamate ai tool: rispondi ora usando solo le informazioni già raccolte." });
    const final = await this.send({ ...base, messages, tools, tool_choice: { type: "none" } });
    usage = addUsage(usage, usageOf(final));
    return { text: textOf(final), toolCalls, usage, iterations: maxIterations + 1 };
  }
}
