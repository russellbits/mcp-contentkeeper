import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import matter from "gray-matter";
import type { ContentkeeperConfig } from "../src/types.ts";
import { ckProjectInfo, ckPipelineStatus } from "../src/tools/project.ts";

const tmpDir = join(tmpdir(), "ck-project-" + Date.now());

function makeConfig(): ContentkeeperConfig {
  return {
    project: { name: "TestSite", author: "tester" },
    content: { dir: join(tmpDir, "content"), extension: ".md", defaultStatus: "draft" },
    staging: { dir: join(tmpDir, "staging"), format: "svx", filenamePattern: "[slug]/+page.svx" },
    build: { adapter: "shell", command: "echo ok", outputDir: join(tmpDir, "build"), validationFiles: [] },
    deploy: { adapter: "ftp", host: "ftp.example.com", port: 21, user: "user", password: "secret", remotePath: "/", sync: "additive" },
    statuses: ["pitch", "draft", "review", "ready", "published", "archived"],
  };
}

beforeAll(() => mkdirSync(join(tmpDir, "content"), { recursive: true }));
afterAll(() => rmSync(tmpDir, { recursive: true, force: true }));

describe("ck_project_info", () => {
  it("returns config with credentials redacted", async () => {
    const result = await ckProjectInfo(makeConfig(), {});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.project.name).toBe("TestSite");
      expect(result.data.deploy.password).toBe("[redacted]");
      expect(result.data.deploy.host).toBe("ftp.example.com");
    }
  });

  it("does not mutate the original config", async () => {
    const config = makeConfig();
    await ckProjectInfo(config, {});
    expect(config.deploy.password).toBe("secret");
  });
});

describe("ck_pipeline_status", () => {
  it("returns article counts by status", async () => {
    const config = makeConfig();
    for (const [slug, status] of [["art1", "draft"], ["art2", "ready"]] as const) {
      const bPath = join(config.content.dir, slug);
      mkdirSync(join(bPath, "media"), { recursive: true });
      writeFileSync(join(bPath, "index.md"), matter.stringify("Body.", {
        title: slug, status, created: "2026-01-01T00:00:00.000Z", modified: "2026-01-01T00:00:00.000Z",
      }));
    }
    const result = await ckPipelineStatus(config, {});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.byStatus.draft).toBe(1);
      expect(result.data.byStatus.ready).toBe(1);
      expect(result.data.totalArticles).toBe(2);
      expect(result.data.stagedCount).toBe(0);
      expect(result.data.lastBuild).toBeNull();
      expect(result.data.lastDeploy).toBeNull();
    }
  });

  it("returns empty byStatus for empty content dir", async () => {
    const emptyConfig = makeConfig();
    emptyConfig.content.dir = join(tmpDir, "empty-content");
    mkdirSync(emptyConfig.content.dir, { recursive: true });
    const result = await ckPipelineStatus(emptyConfig, {});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.totalArticles).toBe(0);
      expect(result.data.byStatus).toEqual({});
    }
  });
});
