import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import matter from "gray-matter";
import type { ContentkeeperConfig } from "../src/types.ts";
import {
  ckListArticles,
  ckGetArticle,
  ckCreateArticle,
  ckUpdateArticle,
  ckSetStatus,
  ckDeleteArticle,
  ckListBundle,
} from "../src/tools/content.ts";

const tmpDir = join(tmpdir(), "ck-content-" + Date.now());

function makeConfig(): ContentkeeperConfig {
  return {
    project: { name: "TestSite" },
    content: { dir: join(tmpDir, "content"), extension: ".md", defaultStatus: "draft" },
    staging: { dir: join(tmpDir, "staging"), format: "svx", filenamePattern: "[slug]/+page.svx" },
    build: { adapter: "shell", command: "echo ok", outputDir: join(tmpDir, "build"), validationFiles: [] },
    deploy: { adapter: "ftp", host: "h", port: 21, user: "u", password: "p", remotePath: "/", sync: "additive" },
    statuses: ["pitch", "draft", "review", "ready", "scheduled", "published", "re-pub", "archived"],
  };
}

function writeBundle(contentDir: string, slug: string, fm: object, body: string) {
  const bPath = join(contentDir, slug);
  mkdirSync(join(bPath, "media"), { recursive: true });
  writeFileSync(join(bPath, "index.md"), matter.stringify(body, fm));
}

beforeAll(() => mkdirSync(join(tmpDir, "content"), { recursive: true }));
afterAll(() => rmSync(tmpDir, { recursive: true, force: true }));
beforeEach(() => {
  rmSync(join(tmpDir, "content"), { recursive: true, force: true });
  mkdirSync(join(tmpDir, "content"), { recursive: true });
});

describe("ck_list_articles", () => {
  it("returns empty list when no bundles", async () => {
    const result = await ckListArticles(makeConfig(), {});
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toHaveLength(0);
  });

  it("returns summaries for all bundles", async () => {
    const config = makeConfig();
    writeBundle(config.content.dir, "hello-world", {
      title: "Hello World", status: "draft",
      created: "2026-01-01T00:00:00.000Z", modified: "2026-01-01T00:00:00.000Z", tags: ["test"],
    }, "Body.");
    const result = await ckListArticles(config, {});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0].slug).toBe("hello-world");
      expect(result.data[0].status).toBe("draft");
    }
  });

  it("filters by status", async () => {
    const config = makeConfig();
    writeBundle(config.content.dir, "art-draft", { title: "Draft", status: "draft", created: "2026-01-01T00:00:00.000Z", modified: "2026-01-01T00:00:00.000Z" }, ".");
    writeBundle(config.content.dir, "art-ready", { title: "Ready", status: "ready", created: "2026-01-01T00:00:00.000Z", modified: "2026-01-01T00:00:00.000Z" }, ".");
    const result = await ckListArticles(config, { status: "ready" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0].slug).toBe("art-ready");
    }
  });
});

describe("ck_get_article", () => {
  it("returns article with frontmatter and body", async () => {
    const config = makeConfig();
    writeBundle(config.content.dir, "my-article", {
      title: "My Article", status: "draft",
      created: "2026-01-01T00:00:00.000Z", modified: "2026-01-01T00:00:00.000Z",
    }, "This is the body.");
    const result = await ckGetArticle(config, { slug: "my-article" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.frontmatter.title).toBe("My Article");
      expect(result.data.body).toContain("This is the body.");
    }
  });

  it("returns error for missing article", async () => {
    const result = await ckGetArticle(makeConfig(), { slug: "nonexistent" });
    expect(result.ok).toBe(false);
  });
});

describe("ck_create_article", () => {
  it("creates bundle with index.md and media/", async () => {
    const config = makeConfig();
    const result = await ckCreateArticle(config, { slug: "new-post", title: "New Post" });
    expect(result.ok).toBe(true);
    expect(existsSync(join(config.content.dir, "new-post", "index.md"))).toBe(true);
    expect(existsSync(join(config.content.dir, "new-post", "media"))).toBe(true);
  });

  it("errors if bundle already exists", async () => {
    const config = makeConfig();
    writeBundle(config.content.dir, "existing", { title: "E", status: "draft", created: "2026-01-01T00:00:00.000Z", modified: "2026-01-01T00:00:00.000Z" }, ".");
    const result = await ckCreateArticle(config, { slug: "existing", title: "E2" });
    expect(result.ok).toBe(false);
  });
});

describe("ck_update_article", () => {
  it("updates body without touching frontmatter fields other than modified", async () => {
    const config = makeConfig();
    writeBundle(config.content.dir, "update-body", {
      title: "Original", status: "draft",
      created: "2026-01-01T00:00:00.000Z", modified: "2000-01-01T00:00:00.000Z",
      custom: "preserved",
    }, "Old body.");
    const result = await ckUpdateArticle(config, { slug: "update-body", body: "New body." });
    expect(result.ok).toBe(true);
    const raw = readFileSync(join(config.content.dir, "update-body", "index.md"), "utf8");
    const parsed = matter(raw);
    expect(parsed.content.trim()).toBe("New body.");
    expect(parsed.data.title).toBe("Original");
    expect(parsed.data.custom).toBe("preserved");
    expect(new Date(parsed.data.modified as string).getTime()).toBeGreaterThan(
      new Date("2000-01-01").getTime()
    );
  });

  it("merges frontmatter fields", async () => {
    const config = makeConfig();
    writeBundle(config.content.dir, "update-fm", {
      title: "Old Title", status: "draft",
      created: "2026-01-01T00:00:00.000Z", modified: "2026-01-01T00:00:00.000Z",
    }, "Body.");
    const result = await ckUpdateArticle(config, {
      slug: "update-fm",
      frontmatter: { title: "New Title", tags: ["a", "b"] },
    });
    expect(result.ok).toBe(true);
    const raw = readFileSync(join(config.content.dir, "update-fm", "index.md"), "utf8");
    const parsed = matter(raw);
    expect(parsed.data.title).toBe("New Title");
    expect(parsed.data.tags).toEqual(["a", "b"]);
    expect(parsed.data.status).toBe("draft");
  });

  it("returns error for missing article", async () => {
    const result = await ckUpdateArticle(makeConfig(), { slug: "ghost" });
    expect(result.ok).toBe(false);
  });
});

describe("ck_set_status", () => {
  it("updates status and modified", async () => {
    const config = makeConfig();
    writeBundle(config.content.dir, "status-test", {
      title: "T", status: "draft", created: "2026-01-01T00:00:00.000Z", modified: "2000-01-01T00:00:00.000Z",
    }, "Body.");
    const before = Date.now();
    const result = await ckSetStatus(config, { slug: "status-test", status: "review" });
    expect(result.ok).toBe(true);
    const raw = readFileSync(join(config.content.dir, "status-test", "index.md"), "utf8");
    const fm = matter(raw).data;
    expect(fm.status).toBe("review");
    expect(new Date(fm.modified as string).getTime()).toBeGreaterThanOrEqual(before);
  });

  it("warns on unusual transition but still succeeds", async () => {
    const config = makeConfig();
    writeBundle(config.content.dir, "unusual", {
      title: "T", status: "pitch", created: "2026-01-01T00:00:00.000Z", modified: "2026-01-01T00:00:00.000Z",
    }, "Body.");
    const result = await ckSetStatus(config, { slug: "unusual", status: "published" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.warning).toBeDefined();
  });
});

describe("ck_delete_article", () => {
  it("moves bundle to .trash/", async () => {
    const config = makeConfig();
    writeBundle(config.content.dir, "to-delete", {
      title: "D", status: "draft", created: "2026-01-01T00:00:00.000Z", modified: "2026-01-01T00:00:00.000Z",
    }, "Delete me.");
    const result = await ckDeleteArticle(config, { slug: "to-delete" });
    expect(result.ok).toBe(true);
    expect(existsSync(join(config.content.dir, "to-delete"))).toBe(false);
    expect(existsSync(join(config.content.dir, ".trash", "to-delete"))).toBe(true);
  });
});

describe("ck_list_bundle", () => {
  it("lists index.md and media files", async () => {
    const config = makeConfig();
    writeBundle(config.content.dir, "media-test", {
      title: "M", status: "draft", created: "2026-01-01T00:00:00.000Z", modified: "2026-01-01T00:00:00.000Z",
    }, "Body.");
    writeFileSync(join(config.content.dir, "media-test", "media", "cover.jpg"), "img");
    const result = await ckListBundle(config, { slug: "media-test" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.files).toContain("index.md");
      expect(result.data.media).toContain("cover.jpg");
    }
  });
});
