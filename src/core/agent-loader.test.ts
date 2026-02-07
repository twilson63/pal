import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadAgentConfig,
  parseAgentMd,
  validateAgentConfig,
} from "./agent-loader.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});

describe("parseAgentMd", () => {
  it("parses frontmatter and trims markdown body", () => {
    const { frontmatter, body } = parseAgentMd(`---
name: Helper
provider: anthropic
model: anthropic/claude-sonnet-4
---

  Prompt body  
`);

    expect(frontmatter).toEqual({
      name: "Helper",
      provider: "anthropic",
      model: "anthropic/claude-sonnet-4",
    });
    expect(body).toBe("Prompt body");
  });

  it("returns empty frontmatter when file has no YAML block", () => {
    const { frontmatter, body } = parseAgentMd("\n  just markdown body \n");

    expect(frontmatter).toEqual({});
    expect(body).toBe("just markdown body");
  });
});

describe("validateAgentConfig", () => {
  it("throws a focused message for missing required fields", () => {
    expect(() => validateAgentConfig({})).toThrow(
      "Missing required fields in agent configuration: name, model, provider"
    );
  });
});

describe("loadAgentConfig", () => {
  it("merges systemPrompt frontmatter with markdown body", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pal-agent-loader-test-"));
    tempDirs.push(dir);

    const agentMdPath = join(dir, "agent.md");
    await writeFile(
      agentMdPath,
      `---
name: Helper
provider: anthropic
model: anthropic/claude-sonnet-4
tools:
  - bash
systemPrompt: Base prompt
---

Extra markdown instructions.
`,
      "utf-8"
    );

    const config = await loadAgentConfig(agentMdPath);

    expect(config.systemPrompt).toBe(
      "Base prompt\n\nExtra markdown instructions."
    );
    expect(config.tools).toEqual(["bash"]);
  });

  it("throws a clear error when file does not exist", async () => {
    await expect(loadAgentConfig("/definitely/missing/agent.md")).rejects.toThrow(
      "Agent configuration file not found: /definitely/missing/agent.md"
    );
  });
});
