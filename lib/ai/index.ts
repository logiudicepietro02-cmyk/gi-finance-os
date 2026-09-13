import { unavailable } from "@/lib/errors";
import { AnthropicProvider } from "./providers/anthropic";
import { OpenAIProvider } from "./providers/openai";
import { ScriptedProvider } from "./providers/scripted";
import type { AIProvider, ProviderName } from "./types";

export interface AIStatus {
  configured: boolean;
  provider: ProviderName | null;
  model: string | null;
  reason: string | null;
  isTestProvider: boolean;
}

export function getAIStatus(): AIStatus {
  const requested = (process.env.AI_PROVIDER ?? "anthropic").trim().toLowerCase();
  switch (requested) {
    case "none":
      return { configured: false, provider: null, model: null, reason: "AI disattivata (AI_PROVIDER=none).", isTestProvider: false };
    case "anthropic": {
      const model = process.env.ANTHROPIC_MODEL || "claude-opus-5";
      const hasKey = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
      return hasKey
        ? { configured: true, provider: "anthropic", model, reason: null, isTestProvider: false }
        : { configured: false, provider: "anthropic", model, reason: "ANTHROPIC_API_KEY non impostata.", isTestProvider: false };
    }
    case "openai": {
      const model = process.env.OPENAI_MODEL || "gpt-5";
      return process.env.OPENAI_API_KEY
        ? { configured: true, provider: "openai", model, reason: null, isTestProvider: false }
        : { configured: false, provider: "openai", model, reason: "OPENAI_API_KEY non impostata.", isTestProvider: false };
    }
    case "scripted": {
      const allowed = process.env.ALLOW_SCRIPTED_AI === "1" && process.env.NODE_ENV !== "production";
      return allowed
        ? { configured: true, provider: "scripted", model: "scripted-test-v1", reason: null, isTestProvider: true }
        : {
            configured: false,
            provider: "scripted",
            model: null,
            reason: "Il provider di test è utilizzabile solo nei test automatici (ALLOW_SCRIPTED_AI=1, non in produzione).",
            isTestProvider: true,
          };
    }
    default:
      return { configured: false, provider: null, model: null, reason: `AI_PROVIDER sconosciuto: ${requested}.`, isTestProvider: false };
  }
}

let cached: { key: string; provider: AIProvider | null } | null = null;

export function getAIProvider(): AIProvider | null {
  const status = getAIStatus();
  const key = `${status.provider}:${status.model}:${status.configured}:${process.env.ANTHROPIC_FALLBACKS ?? ""}`;
  if (cached?.key === key) return cached.provider;
  let provider: AIProvider | null = null;
  if (status.configured && status.model) {
    if (status.provider === "anthropic") provider = new AnthropicProvider(status.model, process.env.ANTHROPIC_FALLBACKS !== "off");
    else if (status.provider === "openai") provider = new OpenAIProvider(status.model);
    else if (status.provider === "scripted") provider = new ScriptedProvider();
  }
  cached = { key, provider };
  return provider;
}

export function requireAIProvider(): AIProvider {
  const provider = getAIProvider();
  if (!provider) throw unavailable(`Nessun provider AI configurato. ${getAIStatus().reason ?? ""}`.trim());
  return provider;
}

export type { AIProvider } from "./types";
