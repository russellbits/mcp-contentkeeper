import { describe, it, expect } from "bun:test";
import { resolveTransport, resolvePort, isAuthorized } from "../src/transport.ts";

describe("resolveTransport", () => {
  it("returns stdio by default", () => {
    expect(resolveTransport([], {})).toBe("stdio");
  });

  it("returns http when --http flag is present", () => {
    expect(resolveTransport(["--http"], {})).toBe("http");
  });

  it("returns http when CK_TRANSPORT=http env var is set", () => {
    expect(resolveTransport([], { CK_TRANSPORT: "http" })).toBe("http");
  });

  it("ignores unrelated flags", () => {
    expect(resolveTransport(["--watch", "--verbose"], {})).toBe("stdio");
  });
});

describe("isAuthorized", () => {
  it("allows all requests when no token is configured", () => {
    expect(isAuthorized(undefined, undefined)).toBe(true);
    expect(isAuthorized(undefined, "Bearer anything")).toBe(true);
  });

  it("rejects requests with no Authorization header when token is set", () => {
    expect(isAuthorized("secret", undefined)).toBe(false);
  });

  it("rejects requests with wrong token", () => {
    expect(isAuthorized("secret", "Bearer wrongtoken")).toBe(false);
  });

  it("allows requests with correct bearer token", () => {
    expect(isAuthorized("secret", "Bearer secret")).toBe(true);
  });
});

describe("resolvePort", () => {
  it("returns 6070 by default", () => {
    expect(resolvePort({})).toBe(6070);
  });

  it("returns parsed CK_PORT when set", () => {
    expect(resolvePort({ CK_PORT: "4000" })).toBe(4000);
  });

  it("falls back to 6070 when CK_PORT is not a number", () => {
    expect(resolvePort({ CK_PORT: "banana" })).toBe(6070);
  });
});
