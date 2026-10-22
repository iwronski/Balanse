import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { readFileSync } from "node:fs";
import type { Sample } from "./dataset";
import { buildUserText, mealSchema, systemPrompt } from "./prompt";

// List prices in USD per million tokens. Check them again before trusting the cost column:
// OpenAI https://developers.openai.com/api/docs/pricing, Anthropic https://platform.claude.com/docs/en/about-claude/pricing
export const PRICES: Record<string, { input: number; output: number }> = {
  "gpt-5.4-mini": { input: 0.75, output: 4.5 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-opus-5-5": { input: 4, output: 20 },
};

export type Effort = "low" | "medium" | "high";
export type ModelSpec = { label: string; model: string; effort?: Effort; provider: "openai" | "anthropic" };

// "claude-haiku-5-5:low" -> model claude-haiku-5-5 with effort low.
export function parseModelSpec(spec: string): ModelSpec {
  const [model, effort] = spec.split(":");
  if (effort && !["low", "medium", "high"].includes(effort)) throw new Error(`Ukjent effort «${effort}» i ${spec}`);
  const provider = model.startsWith("claude-") ? "anthropic" : "openai";
  return { label: spec, model, effort: effort as Effort | undefined, provider };
}

export type ModelAnswer = { raw: unknown; inputTokens: number; outputTokens: number };

export type CallOptions = { withWeight: boolean; withNotes: boolean };

let openaiClient: OpenAI | undefined;
let anthropicClient: Anthropic | undefined;

async function callOpenAI(spec: ModelSpec, sample: Sample, image: string, opts: CallOptions): Promise<ModelAnswer> {
  // Same request shape as artifacts/api-server/src/routes/karb.ts. Falls back to the Replit integration variables.
  openaiClient ??= new OpenAI({
    apiKey: process.env.OPENAI_API_KEY ?? process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL ?? process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  });
  const result = await openaiClient.chat.completions.create({
    model: spec.model,
    max_completion_tokens: 5000,
    response_format: { type: "json_object" },
    ...(spec.effort ? { reasoning_effort: spec.effort } : {}),
    messages: [
      { role: "system", content: systemPrompt(sample.carbDefinition) },
      { role: "user", content: [
        { type: "text", text: buildUserText(sample, opts) },
        { type: "image_url", image_url: { url: `data:${sample.mediaType};base64,${image}`, detail: "high" } },
      ] },
    ],
  }, { timeout: 90_000 });
  return {
    raw: JSON.parse(result.choices[0]?.message?.content ?? "{}"),
    inputTokens: result.usage?.prompt_tokens ?? 0,
    outputTokens: result.usage?.completion_tokens ?? 0,
  };
}

async function callAnthropic(spec: ModelSpec, sample: Sample, image: string, opts: CallOptions): Promise<ModelAnswer> {
  anthropicClient ??= new Anthropic();
  const response = await anthropicClient.messages.create({
    model: spec.model,
    max_tokens: 16000,
    system: systemPrompt(sample.carbDefinition),
    output_config: { format: { type: "json_schema", schema: mealSchema }, ...(spec.effort ? { effort: spec.effort } : {}) },
    messages: [{ role: "user", content: [
      { type: "image", source: { type: "base64", media_type: sample.mediaType, data: image } },
      { type: "text", text: buildUserText(sample, opts) },
    ] }],
  }, { timeout: 90_000 });
  if (response.stop_reason === "refusal") throw new Error("Modellen avviste forespørselen");
  const text = response.content.flatMap(b => (b.type === "text" ? [b.text] : [])).join("");
  return {
    raw: JSON.parse(text || "{}"),
    inputTokens: response.usage.input_tokens + (response.usage.cache_read_input_tokens ?? 0),
    outputTokens: response.usage.output_tokens,
  };
}

export function callModel(spec: ModelSpec, sample: Sample, opts: CallOptions): Promise<ModelAnswer> {
  const image = readFileSync(sample.imagePath).toString("base64");
  return spec.provider === "anthropic" ? callAnthropic(spec, sample, image, opts) : callOpenAI(spec, sample, image, opts);
}

export function costUsd(model: string, inputTokens: number, outputTokens: number): number | undefined {
  const price = PRICES[model];
  return price ? (inputTokens * price.input + outputTokens * price.output) / 1e6 : undefined;
}

// Rough upper estimate per photo, used for the dry run before any paid call:
// ~1500 input tokens (instructions + one 640x480 photo) and ~2500 output tokens (JSON plus reasoning).
export function estimateUsdPerPhoto(model: string): number | undefined {
  return costUsd(model, 1500, 2500);
}

export function hasKey(spec: ModelSpec): boolean {
  return spec.provider === "anthropic"
    ? Boolean(process.env.ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_AUTH_TOKEN)
    : Boolean(process.env.OPENAI_API_KEY ?? process.env.AI_INTEGRATIONS_OPENAI_API_KEY);
}
