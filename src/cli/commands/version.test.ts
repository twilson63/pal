import { afterEach, describe, expect, it } from "bun:test";

describe("version command", () => {
  it("exists and can be imported", async () => {
    const { versionCommand } = await import("./version.js");
    expect(typeof versionCommand).toBe("function");
  });
});
