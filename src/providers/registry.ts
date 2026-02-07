import { SupportedProvider } from "./index.js";

export interface ProviderMetadata {
  name: SupportedProvider;
  displayName: string;
  description: string;
  defaultModel: string;
  packageName: string;
  npmInstall: string;
  website: string;
  apiKeyUrl: string;
  envVarName: string;
}

/**
 * Registry of all supported providers with metadata
 */
export const PROVIDER_REGISTRY: Record<SupportedProvider, ProviderMetadata> = {
  anthropic: {
    name: "anthropic",
    displayName: "Anthropic",
    description: "Claude models from Anthropic",
    defaultModel: "claude-sonnet-4-20250514",
    packageName: "@ai-sdk/anthropic",
    npmInstall: "npm install @ai-sdk/anthropic",
    website: "https://anthropic.com",
    apiKeyUrl: "https://console.anthropic.com/settings/keys",
    envVarName: "ANTHROPIC_API_KEY",
  },
  openai: {
    name: "openai",
    displayName: "OpenAI",
    description: "GPT models from OpenAI",
    defaultModel: "gpt-4o",
    packageName: "@ai-sdk/openai",
    npmInstall: "npm install @ai-sdk/openai",
    website: "https://openai.com",
    apiKeyUrl: "https://platform.openai.com/api-keys",
    envVarName: "OPENAI_API_KEY",
  },
  openrouter: {
    name: "openrouter",
    displayName: "OpenRouter",
    description: "Aggregated models via OpenRouter",
    defaultModel: "moonshotai/kimi-k2.5",
    packageName: "@ai-sdk/openai",
    npmInstall: "npm install @ai-sdk/openai",
    website: "https://openrouter.ai",
    apiKeyUrl: "https://openrouter.ai/keys",
    envVarName: "OPENROUTER_API_KEY",
  },
  google: {
    name: "google",
    displayName: "Google",
    description: "Gemini models from Google",
    defaultModel: "gemini-2.0-flash-exp",
    packageName: "@ai-sdk/google",
    npmInstall: "npm install @ai-sdk/google",
    website: "https://ai.google.dev",
    apiKeyUrl: "https://aistudio.google.com/app/apikey",
    envVarName: "GOOGLE_API_KEY",
  },
  mistral: {
    name: "mistral",
    displayName: "Mistral AI",
    description: "Mistral models from Mistral AI",
    defaultModel: "mistral-large-latest",
    packageName: "@ai-sdk/mistral",
    npmInstall: "npm install @ai-sdk/mistral",
    website: "https://mistral.ai",
    apiKeyUrl: "https://console.mistral.ai/api-keys/",
    envVarName: "MISTRAL_API_KEY",
  },
  ollama: {
    name: "ollama",
    displayName: "Ollama",
    description: "Local models via Ollama",
    defaultModel: "llama3.2",
    packageName: "ollama-ai-provider",
    npmInstall: "npm install ollama-ai-provider",
    website: "https://ollama.com",
    apiKeyUrl: "https://ollama.com/download",
    envVarName: "OLLAMA_HOST",
  },
};

/**
 * Get provider metadata by name
 */
export function getProviderMetadata(
  provider: SupportedProvider
): ProviderMetadata {
  return PROVIDER_REGISTRY[provider];
}

/**
 * Get default model for a provider
 */
export function getDefaultModel(provider: SupportedProvider): string {
  return PROVIDER_REGISTRY[provider].defaultModel;
}

/**
 * Get all supported provider names
 */
export function getSupportedProviders(): SupportedProvider[] {
  return Object.keys(PROVIDER_REGISTRY) as SupportedProvider[];
}

/**
 * Check if a provider name is valid
 */
export function isValidProvider(provider: string): provider is SupportedProvider {
  return provider in PROVIDER_REGISTRY;
}

/**
 * Get installation info for a provider
 */
export function getProviderInstallInfo(
  provider: SupportedProvider
): { packageName: string; command: string; website: string } {
  const metadata = PROVIDER_REGISTRY[provider];
  return {
    packageName: metadata.packageName,
    command: metadata.npmInstall,
    website: metadata.website,
  };
}

/**
 * Get all installed providers
 * Note: This is a placeholder - actual installation check should be done in index.ts
 */
export async function getInstalledProviders(): Promise<SupportedProvider[]> {
  // Return all providers for now - implement actual check later
  return getSupportedProviders();
}

/**
 * Get all available providers (both installed and not installed)
 * Note: This is a placeholder - actual installation check should be done in index.ts
 */
export async function getAvailableProviders(): Promise<
  Array<ProviderMetadata & { installed: boolean }>
> {
  const providers = getSupportedProviders();
  const results: Array<ProviderMetadata & { installed: boolean }> = [];

  for (const provider of providers) {
    const metadata = PROVIDER_REGISTRY[provider];
    // Assume all providers are available for now
    results.push({ ...metadata, installed: true });
  }

  return results;
}
