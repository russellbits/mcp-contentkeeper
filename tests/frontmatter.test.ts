import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { writeFileSync, mkdirSync, rmSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const tmpDir = join(tmpdir(), "ck-fm-" + Date.now());

beforeAll(() => mkdirSync(tmpDir, { recursive: true }));
afterAll(() => rmSync(tmpDir, { recursive: true, force: true }));

describe("frontmatter utils", () => {
  it("readArticle parses frontmatter and body", () => {
    const { readArticle } = require("../src/utils/frontmatter.ts");
    const bundlePath = join(tmpDir, "test-bundle");
    mkdirSync(bundlePath, { recursive: true });
    writeFileSync(
      join(bundlePath, "index.md"),
      `---\ntitle: Hello\nstatus: draft\ncreated: 2026-01-01T00:00:00.000Z\nmodified: 2026-01-01T00:00:00.000Z\n---\n\n# Hello\n\nBody text.\n`
    );
    const article = readArticle(bundlePath);
    expect(article.frontmatter.title).toBe("Hello");
    expect(article.frontmatter.status).toBe("draft");
    expect(article.body.trim()).toContain("# Hello");
    expect(article.slug).toBe("test-bundle");
  });

  it("writeArticle round-trips without data loss", () => {
    const { readArticle, writeArticle } = require("../src/utils/frontmatter.ts");
    const bundlePath = join(tmpDir, "test-bundle2");
    mkdirSync(bundlePath, { recursive: true });
    writeFileSync(
      join(bundlePath, "index.md"),
      `---\ntitle: RoundTrip\nstatus: draft\ncreated: 2026-01-01T00:00:00.000Z\nmodified: 2026-01-01T00:00:00.000Z\ncustom: preserved\n---\n\nOriginal body.\n`
    );
    const original = readArticle(bundlePath);
    writeArticle(bundlePath, original.frontmatter, original.body);
    const reread = readArticle(bundlePath);
    expect(reread.frontmatter.title).toBe("RoundTrip");
    expect(reread.frontmatter.custom).toBe("preserved");
    expect(reread.body.trim()).toBe("Original body.");
  });

  it("writeArticle auto-updates modified timestamp", () => {
    const { readArticle, writeArticle } = require("../src/utils/frontmatter.ts");
    const bundlePath = join(tmpDir, "test-bundle3");
    mkdirSync(bundlePath, { recursive: true });
    writeFileSync(
      join(bundlePath, "index.md"),
      `---\ntitle: ModTest\nstatus: draft\ncreated: 2026-01-01T00:00:00.000Z\nmodified: 2000-01-01T00:00:00.000Z\n---\n\nBody.\n`
    );
    const article = readArticle(bundlePath);
    const before = Date.now();
    writeArticle(bundlePath, article.frontmatter, article.body);
    const reread = readArticle(bundlePath);
    const modifiedMs = new Date(reread.frontmatter.modified).getTime();
    expect(modifiedMs).toBeGreaterThanOrEqual(before);
  });
});
