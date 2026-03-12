import { describe, it, expect, spyOn, beforeAll, beforeEach } from "bun:test";

describe("log", () => {
  let log: any;
  let spy: any;

  beforeAll(async () => {
    // Hoist module import to capture any initialization writes
    const imported = await import("../src/utils/log.ts");
    log = imported.log;
  });

  beforeEach(() => {
    // Clear any previous spy
    if (spy) {
      spy.mockRestore();
    }
  });

  it("writes info to stderr", () => {
    spy = spyOn(process.stderr, "write");
    log.info("hello");
    const calls = spy.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[calls.length - 1][0]).toContain("[INFO]");
    expect(calls[calls.length - 1][0]).toContain("hello");
  });

  it("writes error to stderr", () => {
    spy = spyOn(process.stderr, "write");
    log.error("boom");
    const calls = spy.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[calls.length - 1][0]).toContain("[ERROR]");
    expect(calls[calls.length - 1][0]).toContain("boom");
  });
});
