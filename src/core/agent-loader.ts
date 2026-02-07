import { z } from "zod";
import * as YAML from "yaml";
import { readFile } from "fs/promises";
import { AgentConfig, AgentConfigSchema } from "./types.js";

/**
 * Parse YAML frontmatter and markdown body from content
 */
export function parseAgentMd(content: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return {
      frontmatter: {},
      body: content.trim(),
    };
  }

  const [, yamlContent, bodyContent] = match;
  const frontmatter = YAML.parse(yamlContent) as Record<string, unknown>;

  return {
    frontmatter,
    body: bodyContent.trim(),
  };
}

/**
 * Load and parse agent configuration from agent.md file
 */
export async function loadAgentConfig(path: string): Promise<AgentConfig> {
  try {
    const content = await readFile(path, "utf-8");
    const { frontmatter, body } = parseAgentMd(content);

    const config: Record<string, unknown> = {
      ...frontmatter,
    };

    if (body && body.length > 0) {
      const existingPrompt = (config.systemPrompt as string) || "";
      config.systemPrompt = existingPrompt
        ? `${existingPrompt}\n\n${body}`
        : body;
    }

    const validatedConfig = validateAgentConfig(config);
    return validatedConfig;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`Agent configuration file not found: ${path}`);
    }
    if (error instanceof z.ZodError) {
      throw new Error(
        `Invalid agent configuration: ${error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ")}`
      );
    }
    throw new Error(
      `Failed to load agent configuration: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Validate agent configuration has required fields
 */
export function validateAgentConfig(
  config: Record<string, unknown>
): AgentConfig {
  try {
    return AgentConfigSchema.parse(config) as AgentConfig;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingFields = error.errors
        .filter((e) => e.message.includes("Required"))
        .map((e) => e.path.join("."));

      if (missingFields.length > 0) {
        throw new Error(
          `Missing required fields in agent configuration: ${missingFields.join(", ")}`
        );
      }

      throw new Error(
        `Invalid agent configuration: ${error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ")}`
      );
    }
    throw error;
  }
}
