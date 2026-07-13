import Anthropic from "@anthropic-ai/sdk";
import OpenAI, { AzureOpenAI } from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { z } from "zod";

/**
 * Shared LLM client — the ONLY module in the app that talks to an LLM
 * backend. Every tool imports generateCompletion / generateStructured from
 * here, so swapping backends means changing this file only.
 *
 * Three backends are supported, selected automatically from env vars
 * (or forced with LLM_PROVIDER="azure" | "openai" | "anthropic"), checked
 * in this priority order:
 *
 *   1. Azure AI Foundry (Azure OpenAI-compatible) — the production target.
 *      Active when AZURE_OPENAI_ENDPOINT / AZURE_OPENAI_API_KEY /
 *      AZURE_OPENAI_API_VERSION / AZURE_OPENAI_DEPLOYMENT_NAME are all set.
 *
 *   2. OpenAI (api.openai.com) — active when OPENAI_API_KEY is set (and
 *      Azure is not fully configured). Model defaults to gpt-4.1-mini;
 *      override with OPENAI_MODEL.
 *
 *   3. Anthropic Claude API — active when ANTHROPIC_API_KEY is set (and
 *      neither Azure nor OpenAI is configured). Model defaults to
 *      claude-opus-4-8; override with ANTHROPIC_MODEL.
 */

export class LLMError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "LLMError";
  }
}

export interface CompletionParams {
  system: string;
  messages: { role: "user" | "assistant"; content: string }[];
  temperature?: number;
  maxTokens?: number;
}

export interface CompletionResult {
  text: string;
  usage: { promptTokens: number; completionTokens: number };
}

const REQUEST_TIMEOUT_MS = 90_000;
const DEFAULT_MAX_TOKENS = 4096;

type Provider = "azure" | "openai" | "anthropic";

function azureConfigured(): boolean {
  return Boolean(
    process.env.AZURE_OPENAI_ENDPOINT &&
      process.env.AZURE_OPENAI_API_KEY &&
      process.env.AZURE_OPENAI_API_VERSION &&
      process.env.AZURE_OPENAI_DEPLOYMENT_NAME,
  );
}

function resolveProvider(): Provider {
  const forced = process.env.LLM_PROVIDER;
  if (forced === "azure" || forced === "openai" || forced === "anthropic")
    return forced;
  if (azureConfigured()) return "azure";
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  throw new LLMError(
    "No LLM backend configured. Set the AZURE_OPENAI_* variables (Azure AI Foundry), OPENAI_API_KEY (OpenAI), or ANTHROPIC_API_KEY (Anthropic) in .env.local — see .env.example.",
  );
}

interface RawCallOptions {
  system: string;
  messages: { role: "user" | "assistant"; content: string }[];
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}

// ---------------------------------------------------------------------------
// Anthropic backend
// ---------------------------------------------------------------------------

let anthropicClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      timeout: REQUEST_TIMEOUT_MS, // milliseconds
      maxRetries: 2, // SDK retries 429s and transient 5xx with backoff
    });
  }
  return anthropicClient;
}

async function callAnthropic(options: RawCallOptions): Promise<CompletionResult> {
  const client = getAnthropicClient();
  const model = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";

  try {
    // Note: current Opus models reject temperature/top_p, so we never send
    // sampling params here — behavior is steered via prompts instead. JSON
    // mode is enforced by the prompt + Zod validation in generateStructured.
    const response = await client.messages.create({
      model,
      max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
      system: options.system,
      messages: options.messages,
    });

    if (response.stop_reason === "refusal") {
      throw new LLMError(
        "The model declined to answer this request. Rephrase and try again.",
      );
    }

    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");
    if (!text) {
      throw new LLMError("The model returned an empty response.");
    }

    return {
      text,
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
      },
    };
  } catch (error) {
    if (error instanceof LLMError) throw error;
    if (error instanceof Anthropic.AuthenticationError) {
      throw new LLMError(
        "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY in .env.local.",
        error,
      );
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw new LLMError(
        "The LLM backend is rate-limiting requests. Wait a moment and try again.",
        error,
      );
    }
    if (error instanceof Anthropic.APIError) {
      throw new LLMError(`LLM request failed: ${error.message}`, error);
    }
    const detail = error instanceof Error ? error.message : String(error);
    throw new LLMError(`LLM request failed: ${detail}`, error);
  }
}

// ---------------------------------------------------------------------------
// OpenAI backend
// ---------------------------------------------------------------------------

let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: REQUEST_TIMEOUT_MS,
      maxRetries: 2,
    });
  }
  return openaiClient;
}

async function callOpenAI(options: RawCallOptions): Promise<CompletionResult> {
  const client = getOpenAIClient();
  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: options.system },
    ...options.messages,
  ];

  try {
    const response = await client.chat.completions.create({
      model,
      messages,
      ...(options.temperature !== undefined
        ? { temperature: options.temperature }
        : {}),
      ...(options.maxTokens !== undefined
        ? { max_tokens: options.maxTokens }
        : {}),
      ...(options.jsonMode
        ? { response_format: { type: "json_object" as const } }
        : {}),
    });

    const text = response.choices[0]?.message?.content;
    if (typeof text !== "string" || !text) {
      throw new LLMError("The model returned an empty response.");
    }
    return {
      text,
      usage: {
        promptTokens: response.usage?.prompt_tokens ?? 0,
        completionTokens: response.usage?.completion_tokens ?? 0,
      },
    };
  } catch (error) {
    if (error instanceof LLMError) throw error;
    if (error instanceof OpenAI.AuthenticationError) {
      throw new LLMError(
        "The OpenAI API key was rejected. Check OPENAI_API_KEY in .env.local.",
        error,
      );
    }
    if (error instanceof OpenAI.RateLimitError) {
      throw new LLMError(
        "The LLM backend is rate-limiting requests. Wait a moment and try again.",
        error,
      );
    }
    if (error instanceof OpenAI.APIError) {
      throw new LLMError(`LLM request failed: ${error.message}`, error);
    }
    const detail = error instanceof Error ? error.message : String(error);
    throw new LLMError(`LLM request failed: ${detail}`, error);
  }
}

// ---------------------------------------------------------------------------
// Azure OpenAI backend
// ---------------------------------------------------------------------------

let azureClient: AzureOpenAI | null = null;
let azureDeployment: string | null = null;

function getAzureClient(): { client: AzureOpenAI; deployment: string } {
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT_NAME!;
  if (!azureClient || azureDeployment !== deployment) {
    azureClient = new AzureOpenAI({
      endpoint: process.env.AZURE_OPENAI_ENDPOINT!,
      apiKey: process.env.AZURE_OPENAI_API_KEY!,
      apiVersion: process.env.AZURE_OPENAI_API_VERSION!,
      deployment,
      timeout: REQUEST_TIMEOUT_MS,
      maxRetries: 2,
    });
    azureDeployment = deployment;
  }
  return { client: azureClient, deployment };
}

async function callAzure(options: RawCallOptions): Promise<CompletionResult> {
  const { client, deployment } = getAzureClient();

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: options.system },
    ...options.messages,
  ];

  // Newer reasoning models reject `max_tokens` (want `max_completion_tokens`)
  // and non-default `temperature`. Start with the widely supported params and
  // progressively swap/drop them if the deployment rejects them, so tool code
  // never needs to know which model is deployed.
  const attempts: Array<Record<string, unknown>> = [
    {
      ...(options.temperature !== undefined
        ? { temperature: options.temperature }
        : {}),
      ...(options.maxTokens !== undefined
        ? { max_tokens: options.maxTokens }
        : {}),
    },
    {
      ...(options.maxTokens !== undefined
        ? { max_completion_tokens: options.maxTokens }
        : {}),
    },
  ];

  let lastError: unknown;
  for (const paramOverrides of attempts) {
    try {
      const response = await client.chat.completions.create({
        model: deployment,
        messages,
        ...(options.jsonMode
          ? { response_format: { type: "json_object" as const } }
          : {}),
        ...paramOverrides,
      });

      const text = response.choices[0]?.message?.content;
      if (typeof text !== "string" || !text) {
        throw new LLMError("The model returned an empty response.");
      }
      return {
        text,
        usage: {
          promptTokens: response.usage?.prompt_tokens ?? 0,
          completionTokens: response.usage?.completion_tokens ?? 0,
        },
      };
    } catch (error: unknown) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const isParamError =
        message.includes("max_tokens") ||
        message.includes("max_completion_tokens") ||
        message.includes("temperature") ||
        message.includes("Unsupported parameter") ||
        message.includes("unsupported_parameter");
      if (!isParamError) break;
    }
  }

  if (lastError instanceof LLMError) throw lastError;
  const detail =
    lastError instanceof Error ? lastError.message : String(lastError);
  throw new LLMError(`LLM request failed: ${detail}`, lastError);
}

// ---------------------------------------------------------------------------
// Public interface (backend-agnostic — this is what tools import)
// ---------------------------------------------------------------------------

async function callChat(options: RawCallOptions): Promise<CompletionResult> {
  const provider = resolveProvider();
  if (provider === "azure") return callAzure(options);
  if (provider === "openai") return callOpenAI(options);
  return callAnthropic(options);
}

/**
 * Plain-text completion. All tools use this for prose output.
 */
export async function generateCompletion(
  params: CompletionParams,
): Promise<CompletionResult> {
  return callChat({
    system: params.system,
    messages: params.messages,
    temperature: params.temperature,
    maxTokens: params.maxTokens,
  });
}

/**
 * Structured completion: asks the model for strict JSON matching `schema`,
 * validates with Zod, and retries once with an error-correction message if
 * parsing/validation fails. Used for citation lists, stance classification,
 * and other machine-readable outputs.
 */
export async function generateStructured<T>(params: {
  system: string;
  messages: { role: "user" | "assistant"; content: string }[];
  schema: z.ZodType<T>;
  schemaDescription: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<{ data: T; usage: CompletionResult["usage"] }> {
  const system = `${params.system}

Respond with a single JSON object only — no markdown fences, no commentary. The JSON must match this shape:
${params.schemaDescription}`;

  const baseMessages = params.messages;
  let messages = baseMessages;
  let totalUsage = { promptTokens: 0, completionTokens: 0 };

  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await callChat({
      system,
      messages,
      temperature: params.temperature,
      maxTokens: params.maxTokens,
      jsonMode: true,
    });
    totalUsage = {
      promptTokens: totalUsage.promptTokens + result.usage.promptTokens,
      completionTokens:
        totalUsage.completionTokens + result.usage.completionTokens,
    };

    let parsed: unknown;
    let parseError = "";
    try {
      // Strip accidental markdown fences before parsing.
      const cleaned = result.text
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, "");
      parsed = JSON.parse(cleaned);
    } catch (error) {
      parseError = `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`;
    }

    if (!parseError) {
      const validated = params.schema.safeParse(parsed);
      if (validated.success) {
        return { data: validated.data, usage: totalUsage };
      }
      parseError = `JSON did not match the required shape: ${validated.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`;
    }

    // One correction round: show the model its output and the error.
    messages = [
      ...baseMessages,
      { role: "assistant", content: result.text },
      {
        role: "user",
        content: `Your previous response could not be used. ${parseError}. Respond again with ONLY a valid JSON object matching the required shape.`,
      },
    ];
  }

  throw new LLMError(
    "The model did not return valid structured output after a retry.",
  );
}
