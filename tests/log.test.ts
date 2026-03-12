import { describe, it, expect, spyOn, beforeEach } from "bun:test";

describe("log", () => {
  let spy: any;

  beforeEach(() => {
    // Clear any previous spy
    if (spy) {
      spy.mockRestore();
    }
  });

  it("writes info to stderr", async () => {
    const { log } = await import("../src/utils/log.ts");
    spy = spyOn(process.stderr, "write");
    log.info("hello");
    const calls = spy.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[calls.length - 1][0]).toContain("[INFO]");
    expect(calls[calls.length - 1][0]).toContain("hello");
  });

  it("writes error to stderr", async () => {
    const { log } = await import("../src/utils/log.ts");
    spy = spyOn(process.stderr, "write");
    log.error("boom");
    const calls = spy.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[calls.length - 1][0]).toContain("[ERROR]");
    expect(calls[calls.length - 1][0]).toContain("boom");
  });
});
