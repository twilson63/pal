import * as fs from "node:fs";
import * as path from "node:path";
import { homedir } from "node:os";
import { z } from "zod";
import { PalConfig, PalConfigSchema, ProviderConfig } from "./types.js";

/**
 * Configuration directory name
 */
const CONFIG_DIR_NAME = ".pal";

/**
 * Configuration file name
 */
const CONFIG_FILE_NAME = "config.json";

/**
 * Environment file name
 */
const ENV_FILE_NAME = ".env";

/**
 * Cached configuration
 */
let cachedConfig: PalConfig | null = null;

/**
 * Environment variables cache
 */
let envCache: Record<string, string> | null = null;

/**
 * Get the configuration directory path
 * @returns The path to ~/.pal
 */
export function getConfigDir(): string {
  return path.join(homedir(), CONFIG_DIR_NAME);
}

/**
 * Ensure the configuration directory exists
 * @throws Error if directory cannot be created
 */
function ensureConfigDir(): void {
  const configDir = getConfigDir();
  if (!fs.existsSync(configDir)) {
    try {
      fs.mkdirSync(configDir, { recursive: true });
    } catch (error) {
      throw new Error(
        `Failed to create config directory at ${configDir}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

/**
 * Get the path to the config file
 * @returns The path to ~/.pal/config.json
 */
function getConfigPath(): string {
  return path.join(getConfigDir(), CONFIG_FILE_NAME);
}

/**
 * Check if configuration exists
 * @returns True if config file exists
 */
export function ensureConfig(): boolean {
  try {
    const configPath = getConfigPath();
    return fs.existsSync(configPath);
  } catch {
    return false;
  }
}

/**
 * Parse environment file content
 * @param content - The content of the .env file
 * @returns Record of environment variables
 */
function parseEnvFile(content: string): Record<string, string> {
  const env: Record<string, string> = {};
  const lines = content.split("\n");

  for (const line of lines) {
    const trimmedLine = line.trim();

    // Skip empty lines and comments
    if (!trimmedLine || trimmedLine.startsWith("#")) {
      continue;
    }

    // Parse KEY=VALUE format
    const match = trimmedLine.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (match) {
      const [, key, value] = match;
      // Remove quotes if present
      const cleanValue = value.replace(/^["']|["']$/g, "");
      env[key] = cleanValue;
    }
  }

  return env;
}

/**
 * Load environment variables from process.env, then ./.env, then ~/.pal/.env
 * Later sources override earlier ones
 * @returns Record of environment variables
 */
export function loadEnv(): Record<string, string> {
  if (envCache) {
    return envCache;
  }

  const env: Record<string, string> = {};

  // 1. Load from process.env
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      env[key] = value;
    }
  }

  // 2. Load from ./.env (current working directory)
  const localEnvPath = path.join(process.cwd(), ENV_FILE_NAME);
  if (fs.existsSync(localEnvPath)) {
    try {
      const localEnvContent = fs.readFileSync(localEnvPath, "utf-8");
      const localEnv = parseEnvFile(localEnvContent);
      Object.assign(env, localEnv);
    } catch (error) {
      console.warn(
        `Warning: Failed to load local .env file: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // 3. Load from ~/.pal/.env (highest priority)
  const configEnvPath = path.join(getConfigDir(), ENV_FILE_NAME);
  if (fs.existsSync(configEnvPath)) {
    try {
      const configEnvContent = fs.readFileSync(configEnvPath, "utf-8");
      const configEnv = parseEnvFile(configEnvContent);
      Object.assign(env, configEnv);
    } catch (error) {
      console.warn(
        `Warning: Failed to load config .env file: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  envCache = env;
  return env;
}

/**
 * Get API key for a provider
 * Checks process.env first, then loads from .env files
 * @param provider - The provider name (e.g., "anthropic", "openai")
 * @returns The API key or undefined if not found
 */
export function getApiKey(provider: string): string | undefined {
  const env = loadEnv();

  // Try provider-specific environment variable
  const providerKeyVar = `${provider.toUpperCase()}_API_KEY`;
  if (env[providerKeyVar]) {
    return env[providerKeyVar];
  }

  // Try common API key names
  const commonKeyVars = [
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
    "OPENROUTER_API_KEY",
    "GEMINI_API_KEY",
  ];

  for (const keyVar of commonKeyVars) {
    if (env[keyVar]) {
      // Only return if it matches the provider
      const keyProvider = keyVar.replace("_API_KEY", "").toLowerCase();
      if (keyProvider === provider.toLowerCase()) {
        return env[keyVar];
      }
    }
  }

  return undefined;
}

/**
 * Load configuration from ~/.pal/config.json
 * Creates default config if it doesn't exist
 * @returns The loaded or default configuration
 * @throws Error if config file exists but cannot be read or parsed
 */
export function loadConfig(): PalConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const configPath = getConfigPath();

  if (!fs.existsSync(configPath)) {
    // Return default config without saving
    return {
      defaultProvider: "anthropic",
      defaultModel: "anthropic/claude-sonnet-4",
      providers: {},
    };
  }

  try {
    const configContent = fs.readFileSync(configPath, "utf-8");
    const parsedConfig = JSON.parse(configContent);

    // Validate with zod
    const result = PalConfigSchema.safeParse(parsedConfig);

    if (!result.success) {
      throw new Error(
        `Invalid configuration file at ${configPath}: ${result.error.message}`
      );
    }

    // Inject API keys from environment into provider configs
    const config = result.data as PalConfig;
    for (const [providerName, providerConfig] of Object.entries(
      config.providers
    )) {
      const typedProviderConfig = providerConfig as ProviderConfig;
      if (!typedProviderConfig.apiKey) {
        const apiKey = getApiKey(providerName);
        if (apiKey) {
          typedProviderConfig.apiKey = apiKey;
        }
      }
    }

    cachedConfig = config;
    return config;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(
        `Invalid JSON in config file at ${configPath}: ${error.message}`
      );
    }
    throw error;
  }
}

/**
 * Save configuration to ~/.pal/config.json
 * @param config - The configuration to save
 * @throws Error if config cannot be saved
 */
export function saveConfig(config: PalConfig): void {
  // Validate before saving
  const result = PalConfigSchema.safeParse(config);

  if (!result.success) {
    throw new Error(
      `Invalid configuration: ${result.error.message}`
    );
  }

  ensureConfigDir();
  const configPath = getConfigPath();

  try {
    // Create a copy without API keys (they should be in .env)
    const configToSave: PalConfig = {
      defaultProvider: config.defaultProvider,
      defaultModel: config.defaultModel,
      providers: {},
    };

    for (const [providerName, providerConfig] of Object.entries(
      config.providers
    )) {
      const typedProviderConfig = providerConfig as ProviderConfig;
      configToSave.providers[providerName] = {
        apiKey: undefined, // Don't save API keys to file
        baseUrl: typedProviderConfig.baseUrl,
        defaultModel: typedProviderConfig.defaultModel,
        options: typedProviderConfig.options,
      };
    }

    fs.writeFileSync(
      configPath,
      JSON.stringify(configToSave, null, 2),
      "utf-8"
    );

    // Update cache
    cachedConfig = config;
  } catch (error) {
    throw new Error(
      `Failed to save config to ${configPath}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Clear the configuration cache
 * Forces reload on next loadConfig() call
 */
export function clearConfigCache(): void {
  cachedConfig = null;
}

/**
 * Clear the environment cache
 * Forces reload on next loadEnv() call
 */
export function clearEnvCache(): void {
  envCache = null;
}

/**
 * Get provider configuration
 * @param provider - The provider name
 * @returns The provider config or undefined
 */
export function getProviderConfig(
  provider: string
): ProviderConfig | undefined {
  const config = loadConfig();
  return config.providers[provider];
}

/**
 * Set provider configuration
 * @param provider - The provider name
 * @param providerConfig - The provider configuration
 */
export function setProviderConfig(
  provider: string,
  providerConfig: ProviderConfig
): void {
  const config = loadConfig();
  config.providers[provider] = providerConfig;
  saveConfig(config);
}

/**
 * Get default provider name
 * @returns The default provider name
 */
export function getDefaultProvider(): string {
  const config = loadConfig();
  return config.defaultProvider;
}

/**
 * Get default model identifier
 * @returns The default model identifier
 */
export function getDefaultModel(): string {
  const config = loadConfig();
  return config.defaultModel;
}

/**
 * Set default provider
 * @param provider - The provider name
 */
export function setDefaultProvider(provider: string): void {
  const config = loadConfig();
  config.defaultProvider = provider;
  saveConfig(config);
}

/**
 * Set default model
 * @param model - The model identifier
 */
export function setDefaultModel(model: string): void {
  const config = loadConfig();
  config.defaultModel = model;
  saveConfig(config);
}

/**
 * Set API key for a provider
 * Saves to ~/.pal/.env
 * @param provider - The provider name
 * @param apiKey - The API key
 */
export function setApiKey(provider: string, apiKey: string): void {
  ensureConfigDir();
  const envPath = path.join(getConfigDir(), ENV_FILE_NAME);
  
  const envVarName = `${provider.toUpperCase()}_API_KEY`;
  
  let envContent = '';
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf-8');
  }
  
  // Check if key already exists and replace it
  const lines = envContent.split('\n');
  let found = false;
  const newLines = lines.map(line => {
    if (line.startsWith(`${envVarName}=`)) {
      found = true;
      return `${envVarName}=${apiKey}`;
    }
    return line;
  });
  
  if (!found) {
    newLines.push(`${envVarName}=${apiKey}`);
  }
  
  fs.writeFileSync(envPath, newLines.join('\n'), 'utf-8');
  
  // Clear cache to force reload
  clearEnvCache();
}

/**
 * Global config object for convenient access
 * Note: This is a proxy that always calls loadConfig()
 */
export const config = new Proxy({} as PalConfig, {
  get(target, prop) {
    const cfg = loadConfig();
    return cfg[prop as keyof PalConfig];
  },
  set(target, prop, value) {
    const cfg = loadConfig();
    (cfg as unknown as Record<string, unknown>)[prop as string] = value;
    saveConfig(cfg);
    return true;
  },
});
