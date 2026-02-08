import { describe, expect, it } from "bun:test";

describe("update command", () => {
  it("exists and can be imported", async () => {
    const { updateCommand } = await import("./update.js");
    expect(typeof updateCommand).toBe("function");
  });
});
