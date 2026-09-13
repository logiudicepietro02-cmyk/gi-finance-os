import OpenAI from "openai";
import type { Response, ResponseFunctionToolCall, ResponseInputItem } from "openai/resources/responses/responses";
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

function usageOf(response: Response): AIUsage {
  return { inputTokens: response.usage?.input_tokens ?? 0, outputTokens: response.usage?.output_tokens ?? 0 };
}

export class OpenAIProvider implements AIProvider {
  readonly name = "openai" as const;
  readonly supportsDocumentAI = true;
  private readonly client: OpenAI;

  constructor(readonly model: string) {
    this.client = new OpenAI({ maxRetries: 2 });
  }

  async generateText(p: GenerateTextParams) {
    const response = await this.client.responses.create({
      model: this.model,
      instructions: p.system,
      input: p.prompt,
      max_output_tokens: p.maxTokens ?? 16000,
    });
    return { text: response.output_text, usage: usageOf(response) };
  }

  async generateObject<T>(p: GenerateObjectParams<T>) {
    const input: ResponseInputItem[] = [
      {
        role: "user",
        content: p.pdf
          ? [
              { type: "input_file", filename: "documento.pdf", file_data: `data:application/pdf;base64,${Buffer.from(p.pdf).toString("base64")}` },
              { type: "input_text", text: p.prompt },
            ]
          : [{ type: "input_text", text: p.prompt }],
      },
    ];
    const response = await this.client.responses.create({
      model: this.model,
      instructions: p.system,
      input,
      max_output_tokens: p.maxTokens ?? 16000,
      text: { format: { type: "json_schema", name: p.schemaName, schema: toStrictJsonSchema(p.schema), strict: true } },
    });
    if (response.status === "incomplete") {
      throw new AIOutputError("Risposta del modello incompleta.", response.incomplete_details ?? null);
    }
    const { object, raw } = parseStructuredOutput(response.output_text, p.schema);
    return { object, raw, usage: usageOf(response) };
  }

  async runWithTools(p: RunToolsParams): Promise<RunToolsResult> {
    const input: ResponseInputItem[] = p.messages.map((m) => ({ role: m.role, content: m.content }));
    const tools = p.tools.map((t) => ({
      type: "function" as const,
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
      strict: false,
    }));
    const toolCalls: ToolCallRecord[] = [];
    let usage = ZERO_USAGE;
    const maxIterations = p.maxIterations ?? 8;

    for (let iteration = 1; iteration <= maxIterations; iteration++) {
      const response = await this.client.responses.create({
        model: this.model,
        instructions: p.system,
        input,
        tools,
        max_output_tokens: p.maxTokens ?? 16000,
      });
      usage = addUsage(usage, usageOf(response));
      const calls = response.output.filter((o): o is ResponseFunctionToolCall => o.type === "function_call");
      if (calls.length === 0) return { text: response.output_text, toolCalls, usage, iterations: iteration };

      input.push(...(response.output as unknown as ResponseInputItem[]));
      for (const call of calls) {
        const started = Date.now();
        let args: unknown = {};
        try {
          args = call.arguments ? JSON.parse(call.arguments) : {};
        } catch {
          args = {};
        }
        const result = await p.executeTool(call.name, args);
        toolCalls.push({
          id: call.call_id,
          name: call.name,
          input: args,
          output: result.output,
          ok: result.ok,
          error: result.error ?? null,
          durationMs: Date.now() - started,
        });
        input.push({
          type: "function_call_output",
          call_id: call.call_id,
          output: JSON.stringify(result.ok ? result.output : { error: result.error }),
        });
      }
    }

    input.push({ role: "user", content: "Hai raggiunto il limite di chiamate ai tool: rispondi ora usando solo le informazioni già raccolte." });
    const final = await this.client.responses.create({ model: this.model, instructions: p.system, input, max_output_tokens: p.maxTokens ?? 16000 });
    usage = addUsage(usage, usageOf(final));
    return { text: final.output_text, toolCalls, usage, iterations: maxIterations + 1 };
  }
}
