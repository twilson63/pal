import { describe, expect, it } from "bun:test";
import { verifyHash } from "./arweave-client.js";
import { createHash } from "node:crypto";

describe("verifyHash", () => {
  it("returns true for matching hash", () => {
    const data = Buffer.from("test data");
    const expectedHash = createHash("sha256").update(data).digest("hex");

    expect(verifyHash(data, expectedHash)).toBe(true);
  });

  it("returns false for non-matching hash", () => {
    const data = Buffer.from("test data");
    const wrongHash = "0000000000000000000000000000000000000000000000000000000000000000";

    expect(verifyHash(data, wrongHash)).toBe(false);
  });

  it("handles uppercase hex strings", () => {
    const data = Buffer.from("test data");
    const expectedHash = createHash("sha256").update(data).digest("hex").toUpperCase();

    expect(verifyHash(data, expectedHash)).toBe(true);
  });
});

describe("semver validation", () => {
  it("accepts strict semver format", () => {
    const validVersions = ["1.0.0", "2.3.4", "0.0.1", "10.20.30"];
    for (const version of validVersions) {
      expect(/^\d+\.\d+\.\d+$/.test(version)).toBe(true);
    }
  });

  it("rejects semver with suffixes", () => {
    const invalidVersions = ["1.0.0-beta", "2.3.4-alpha.1", "1.0.0+build123", "v1.0.0"];
    for (const version of invalidVersions) {
      expect(/^\d+\.\d+\.\d+$/.test(version)).toBe(false);
    }
  });
});
