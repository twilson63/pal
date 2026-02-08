import { z } from "zod";

/**
 * Zod schema for tool configuration
 */
export const ToolConfigSchema = z.object({
  name: z.string(),
  enabled: z.boolean().default(true),
  config: z.record(z.unknown()).optional(),
});

/**
 * Tool configuration type
 */
export type ToolConfig = z.infer<typeof ToolConfigSchema>;

/**
 * Zod schema for provider configuration
 */
export const ProviderConfigSchema = z.object({
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  defaultModel: z.string().optional(),
  options: z.record(z.unknown()).optional(),
});

/**
 * Provider configuration interface
 */
export interface ProviderConfig extends z.infer<typeof ProviderConfigSchema> {
  /** API key for the provider */
  apiKey?: string;
  /** Base URL for API requests */
  baseUrl?: string;
  /** Default model for this provider */
  defaultModel?: string;
  /** Additional provider-specific options */
  options?: Record<string, unknown>;
}

/**
 * Zod schema for agent configuration
 */
export const AgentConfigSchema = z.object({
  name: z.string(),
  description: z.string().default(""),
  model: z.string(),
  provider: z.string(),
  tools: z.array(z.union([z.string(), ToolConfigSchema])).default([]),
  systemPrompt: z.string().default(""),
});

/**
 * Agent configuration interface
 */
export interface AgentConfig extends z.infer<typeof AgentConfigSchema> {
  /** Agent name/identifier */
  name: string;
  /** Description of the agent's purpose */
  description: string;
  /** Model identifier (e.g., "anthropic/claude-sonnet-4.5") */
  model: string;
  /** Provider name (e.g., "anthropic", "openai") */
  provider: string;
  /** List of tool names or tool configurations */
  tools: Array<string | ToolConfig>;
  /** System prompt for the agent */
  systemPrompt: string;
}

/**
 * Zod schema for global PAL configuration
 */
export const PalConfigSchema = z.object({
  defaultProvider: z.string().default("anthropic"),
  defaultModel: z.string().default("anthropic/claude-sonnet-4"),
  providers: z.record(ProviderConfigSchema).default({}),
});

/**
 * Global PAL configuration interface
 */
export interface PalConfig extends z.infer<typeof PalConfigSchema> {
  /** Default provider to use */
  defaultProvider: string;
  /** Default model to use */
  defaultModel: string;
  /** Map of provider names to their configurations */
  providers: Record<string, ProviderConfig>;
}

/**
 * Message role type
 */
export type MessageRole = "user" | "assistant" | "system" | "tool";

/**
 * Zod schema for message
 */
export const MessageSchema = z.object({
  role: z.enum(["user", "assistant", "system", "tool"]),
  content: z.string(),
  name: z.string().optional(),
  toolCalls: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        arguments: z.record(z.unknown()),
      })
    )
    .optional(),
  toolCallId: z.string().optional(),
  timestamp: z.number().optional(),
});

/**
 * Message type for conversation
 */
export interface Message extends z.infer<typeof MessageSchema> {
  /** Role of the message sender */
  role: MessageRole;
  /** Content of the message */
  content: string;
  /** Optional name identifier */
  name?: string;
  /** Tool calls made by the assistant */
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  }>;
  /** ID of the tool call this message is responding to */
  toolCallId?: string;
  /** Unix timestamp of the message */
  timestamp?: number;
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: PalConfig = {
  defaultProvider: "anthropic",
  defaultModel: "anthropic/claude-sonnet-4",
  providers: {},
};

/**
 * Default agent configuration values
 */
export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  name: "assistant",
  description: "A helpful AI assistant",
  model: "anthropic/claude-sonnet-4",
  provider: "anthropic",
  tools: ["bash", "readFile", "writeFile", "grep", "webSearch"],
  systemPrompt:
    "You are a helpful AI assistant. You can help with coding tasks, file operations, and web searches. Always be concise and helpful.",
};

/**
 * Zod schema for cron job
 */
export const CronJobSchema = z.object({
  id: z.string(),
  name: z.string(),
  schedule: z.string(),
  prompt: z.string(),
  workingDir: z.string(),
  enabled: z.boolean().default(true),
  createdAt: z.string(),
});

/**
 * Cron job interface
 */
export interface CronJob extends z.infer<typeof CronJobSchema> {
  /** Unique identifier (opaque, immutable, e.g. c_<random>) */
  id: string;
  /** Display name for the job */
  name: string;
  /** Cron schedule expression */
  schedule: string;
  /** Prompt to execute when job runs */
  prompt: string;
  /** Working directory for job execution */
  workingDir: string;
  /** Whether the job is enabled */
  enabled: boolean;
  /** ISO timestamp when job was created */
  createdAt: string;
}

/**
 * Cron job with runtime status
 */
export interface CronJobWithStatus extends CronJob {
  /** ISO timestamp of last execution */
  lastRun?: string;
}

/**
 * Zod schema for cron store
 */
export const CronStoreSchema = z.object({
  jobs: z.array(CronJobSchema).default([]),
});
