import { describe, expect, it } from "bun:test";
import {
  isNewerVersion,
  shouldSkipUpdateCheck,
} from "./update-manager.js";

describe("isNewerVersion", () => {
  it("returns true when a > b", () => {
    expect(isNewerVersion("2.0.0", "1.0.0")).toBe(true);
    expect(isNewerVersion("1.1.0", "1.0.0")).toBe(true);
    expect(isNewerVersion("1.0.1", "1.0.0")).toBe(true);
  });

  it("returns false when a <= b", () => {
    expect(isNewerVersion("1.0.0", "1.0.0")).toBe(false);
    expect(isNewerVersion("1.0.0", "2.0.0")).toBe(false);
    expect(isNewerVersion("1.0.0", "1.1.0")).toBe(false);
  });
});

describe("shouldSkipUpdateCheck", () => {
  it("returns true when skipUpdateCheck flag is set", () => {
    expect(shouldSkipUpdateCheck({ skipUpdateCheck: true })).toBe(true);
  });

  it("returns true when CI environment variable is set", () => {
    process.env.CI = "true";
    expect(shouldSkipUpdateCheck()).toBe(true);
    delete process.env.CI;
  });

  it("returns true when PAL_NO_UPDATE_CHECK is set", () => {
    process.env.PAL_NO_UPDATE_CHECK = "true";
    expect(shouldSkipUpdateCheck()).toBe(true);
    delete process.env.PAL_NO_UPDATE_CHECK;
  });

  it("returns false by default", () => {
    delete process.env.CI;
    delete process.env.PAL_NO_UPDATE_CHECK;
    expect(shouldSkipUpdateCheck()).toBe(false);
  });
});
