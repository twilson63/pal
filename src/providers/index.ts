import type { LanguageModel } from "ai";
import { getApiKey, getProviderConfig } from "../core/config.js";

/** Provider identifiers supported by PAL. */
export type SupportedProvider =
  | "anthropic"
  | "openai"
  | "openrouter"
  | "google"
  | "mistral"
  | "ollama";

/** Metadata and factory hooks for a model provider. */
export interface ProviderInfo {
  name: SupportedProvider;
  packageName: string;
  createModel: (modelName: string) => Promise<LanguageModel>;
}

const providerFactories: Record<
  SupportedProvider,
  (modelName: string) => Promise<LanguageModel>
> = {
  anthropic: async (modelName: string) => {
    try {
      const { anthropic } = await import("@ai-sdk/anthropic");
      return anthropic(modelName) as unknown as LanguageModel;
    } catch {
      throw new Error(
        `Provider 'anthropic' is not installed. Install it with: npm install @ai-sdk/anthropic`
      );
    }
  },

  openai: async (modelName: string) => {
    try {
      // @ts-ignore - Optional peer dependency
      const { createOpenAI } = await import("@ai-sdk/openai");
      const providerConfig = getProviderConfig("openai");
      const apiKey = getApiKey("openai") ?? providerConfig?.apiKey;
      const baseURL = providerConfig?.baseUrl;
      const openai = createOpenAI({ apiKey, baseURL });
      return openai(modelName) as unknown as LanguageModel;
    } catch {
      throw new Error(
        `Provider 'openai' is not installed. Install it with: npm install @ai-sdk/openai`
      );
    }
  },

  openrouter: async (modelName: string) => {
    try {
      // @ts-ignore - Optional peer dependency
      const { createOpenAI } = await import("@ai-sdk/openai");
      const providerConfig = getProviderConfig("openrouter");
      const apiKey = getApiKey("openrouter") ?? providerConfig?.apiKey;
      const baseURL =
        providerConfig?.baseUrl || "https://openrouter.ai/api/v1";

      if (!apiKey) {
        throw new Error(
          "Missing API key for openrouter. Set OPENROUTER_API_KEY in your environment or ~/.pal/.env"
        );
      }

      const openrouter = createOpenAI({
        apiKey,
        baseURL,
      });
      return openrouter(modelName) as unknown as LanguageModel;
    } catch (error) {
      if (error instanceof Error && error.message.includes("Missing API key")) {
        throw error;
      }
      throw new Error(
        `Provider 'openrouter' is not installed. Install it with: npm install @ai-sdk/openai`
      );
    }
  },

  google: async (modelName: string) => {
    try {
      // @ts-ignore - Optional peer dependency
      const { google } = await import("@ai-sdk/google");
      return google(modelName) as unknown as LanguageModel;
    } catch {
      throw new Error(
        `Provider 'google' is not installed. Install it with: npm install @ai-sdk/google`
      );
    }
  },

  mistral: async (modelName: string) => {
    try {
      // @ts-ignore - Optional peer dependency
      const { mistral } = await import("@ai-sdk/mistral");
      return mistral(modelName) as unknown as LanguageModel;
    } catch {
      throw new Error(
        `Provider 'mistral' is not installed. Install it with: npm install @ai-sdk/mistral`
      );
    }
  },

  ollama: async (modelName: string) => {
    try {
      // @ts-ignore - Optional peer dependency
      const { ollama } = await import("ai-sdk-ollama");
      return ollama(modelName) as unknown as LanguageModel;
    } catch {
      throw new Error(
        `Provider 'ollama' is not installed. Install it with: npm install ai-sdk-ollama`
      );
    }
  },
};

/**
 * Creates a language model instance for a provider/model pair.
 *
 * @param provider Provider name (case-insensitive).
 * @param modelName Model identifier accepted by the provider SDK.
 * @returns A configured `LanguageModel` instance.
 */
export async function createModel(
  provider: string,
  modelName: string
): Promise<LanguageModel> {
  const normalizedProvider = provider.toLowerCase() as SupportedProvider;

  if (!isSupportedProvider(normalizedProvider)) {
    throw new Error(
      `Unsupported provider: ${provider}. Supported providers: ${SUPPORTED_PROVIDERS.join(", ")}`
    );
  }

  try {
    return await providerFactories[normalizedProvider](modelName);
  } catch (error) {
    if (error instanceof Error && error.message.includes("is not installed")) {
      throw error;
    }
    throw new Error(
      `Failed to create model '${modelName}' for provider '${provider}': ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Check if a provider is supported
 */
function isSupportedProvider(
  provider: string
): provider is SupportedProvider {
  return SUPPORTED_PROVIDERS.includes(provider as SupportedProvider);
}

/** List of provider names supported by this runtime. */
export const SUPPORTED_PROVIDERS: SupportedProvider[] = [
  "anthropic",
  "openai",
  "openrouter",
  "google",
  "mistral",
  "ollama",
];

/**
 * Checks whether a provider integration package is available.
 *
 * @param provider Provider to probe.
 * @returns `true` when the provider appears installed, otherwise `false`.
 */
export async function isProviderInstalled(
  provider: SupportedProvider
): Promise<boolean> {
  try {
    await providerFactories[provider]("test");
    return true;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("is not installed")
    ) {
      return false;
    }
    return true;
  }
}
