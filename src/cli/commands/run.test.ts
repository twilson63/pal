import { describe, expect, it } from "bun:test";
import type { AgentConfig } from "../../core/types.js";
import type { ToolMap } from "../../tools/index.js";
import {
  normalizeAgentModelConfig,
  selectEnabledTools,
} from "./run.js";

function makeAgentConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    name: "test-agent",
    description: "",
    provider: "anthropic",
    model: "claude-sonnet-4",
    tools: [],
    systemPrompt: "",
    ...overrides,
  };
}

describe("normalizeAgentModelConfig", () => {
  it("normalizes provider casing and strips duplicated provider prefixes", () => {
    const normalized = normalizeAgentModelConfig(
      makeAgentConfig({
        provider: "  Anthropic  ",
        model: "anthropic/anthropic/claude-sonnet-4",
      })
    );

    expect(normalized.provider).toBe("anthropic");
    expect(normalized.model).toBe("claude-sonnet-4");
  });

  it("throws when model resolves to empty after prefix stripping", () => {
    expect(() =>
      normalizeAgentModelConfig(
        makeAgentConfig({
          provider: "anthropic",
          model: "anthropic/anthropic/",
        })
      )
    ).toThrow("Agent configuration error: invalid model 'anthropic/anthropic/'.");
  });
});

describe("selectEnabledTools", () => {
  const allTools: ToolMap = {
    bash: {} as ToolMap["bash"],
    readFile: {} as ToolMap["readFile"],
    writeFile: {} as ToolMap["writeFile"],
    grep: {} as ToolMap["grep"],
    webSearch: {} as ToolMap["webSearch"],
  };

  it("uses all available tools when none are explicitly configured", () => {
    const selected = selectEnabledTools(makeAgentConfig({ tools: [] }), allTools);

    expect(Object.keys(selected).sort()).toEqual([
      "bash",
      "grep",
      "readFile",
      "webSearch",
      "writeFile",
    ]);
  });

  it("filters disabled tool configs and keeps enabled names", () => {
    const selected = selectEnabledTools(
      makeAgentConfig({
        tools: ["bash", { name: "grep", enabled: false }, { name: "webSearch", enabled: true }],
      }),
      allTools
    );

    expect(Object.keys(selected).sort()).toEqual(["bash", "webSearch"]);
  });

  it("throws when unknown tools are configured", () => {
    expect(() =>
      selectEnabledTools(
        makeAgentConfig({ tools: ["missingTool"] }),
        allTools
      )
    ).toThrow(
      "Agent configuration error: unknown tool(s): missingTool. Available tools: bash, readFile, writeFile, grep, webSearch"
    );
  });
});
