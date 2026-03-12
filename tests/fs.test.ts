import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { listBundles, bundlePath, ensureMediaDir, moveBundle } from "../src/utils/fs.ts";

const tmpDir = join(tmpdir(), "ck-fs-" + Date.now());

beforeAll(() => {
  mkdirSync(join(tmpDir, "bundles", "my-article", "media"), { recursive: true });
  writeFileSync(join(tmpDir, "bundles", "my-article", "index.md"), "# hello");
  writeFileSync(join(tmpDir, "bundles", "my-article", "media", "cover.jpg"), "fake-img");

  // Create a separate bundle for the moveBundle test
  mkdirSync(join(tmpDir, "bundles", "move-me"), { recursive: true });
  writeFileSync(join(tmpDir, "bundles", "move-me", "index.md"), "# move me");
});

afterAll(() => rmSync(tmpDir, { recursive: true, force: true }));

describe("fs utils", () => {
  it("listBundles returns dir names with index.md", () => {
    const bundles = listBundles(join(tmpDir, "bundles"));
    expect(bundles).toContain("my-article");
  });

  it("listBundles excludes .trash and dotdirs", () => {
    mkdirSync(join(tmpDir, "bundles", ".trash", "old-article", "media"), { recursive: true });
    writeFileSync(join(tmpDir, "bundles", ".trash", "old-article", "index.md"), "# old");
    const bundles = listBundles(join(tmpDir, "bundles"));
    expect(bundles).not.toContain(".trash");
  });

  it("bundlePath constructs path correctly", () => {
    expect(bundlePath("/content", "my-article")).toBe("/content/my-article");
  });

  it("moveBundle moves directory atomically", () => {
    const src = join(tmpDir, "bundles", "move-me");
    const dest = join(tmpDir, "bundles", ".trash", "move-me");
    moveBundle(src, dest);
    expect(existsSync(dest)).toBe(true);
    expect(existsSync(src)).toBe(false);
  });
});
