# contentkeeper Phase 1 — Content Layer Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working MCP server with all Phase 1 content layer tools (`ck_list_articles`, `ck_get_article`, `ck_create_article`, `ck_update_article`, `ck_set_status`, `ck_delete_article`, `ck_list_bundle`, `ck_project_info`, `ck_pipeline_status`) verified in MCP Inspector.

**Architecture:** Bun-native TypeScript stdio MCP server. Config loaded from `${CK_PROJECT}/contentkeeper.config.json` with env-var interpolation from `${CK_PROJECT}/.env`. All content tools operate on a flat directory of bundle folders (one dir per article, each containing `index.md` + `media/`). No database.

**Tech Stack:** Bun, TypeScript, `@modelcontextprotocol/sdk`, `zod`, `gray-matter`. Tests use `bun:test`.

---

## ⚠️ IMPORTANT: Existing Content Discrepancy

The existing Banapana iA Writer content does **not** match the spec format:

| | Spec | Existing Content |
|---|---|---|
| Article file | `index.md` | `article.md` |
| Bundle dir naming | `slug-name/` | `_slug-name/` (underscore prefix) |
| Frontmatter keys | lowercase (`title`, `status`) | titlecase (`Title`, `Status`) |

**contentkeeper will create new content in spec format only.** Existing articles are pre-contentkeeper content and will NOT be visible to the tools without migration. Migration is out of scope for Phase 1 — the tools will simply not find `article.md` files. Confirm with user before Phase 4 whether to add `article.md` detection or a migration tool.

---

## Project State (start of plan)

Already exists in `~/Development/mcp-contentkeeper/`:
- `package.json` ✅
- `tsconfig.json` ✅
- `src/types.ts` ✅
- `SPEC.md` ✅

Already exists in `~/Development/banapana/`:
- `contentkeeper.config.json` ✅
- `.env` ✅
- `content -> /Users/russell/Library/Mobile Documents/.../banapana` (symlink) ✅

**No `node_modules/` yet** — must run `bun install` first.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/index.ts` | Create | MCP server entry; registers all tools; calls `createServer()` |
| `src/config.ts` | Create | Loads + validates `contentkeeper.config.json`; interpolates `${VAR}` from project's `.env`; exports `loadConfig()` |
| `src/utils/log.ts` | Create | `log.info()`, `log.error()` — writes to **stderr only**, never stdout |
| `src/utils/frontmatter.ts` | Create | `readArticle(bundlePath)`, `writeArticle(bundlePath, fm, body)` — gray-matter wrappers |
| `src/utils/fs.ts` | Create | `listBundles(contentDir)`, `bundlePath(contentDir, slug)`, `ensureMediaDir(bundlePath)`, `moveBundle(src, dest)` |
| `src/tools/content.ts` | Create | All 7 content tools: `ck_list_articles`, `ck_get_article`, `ck_create_article`, `ck_update_article`, `ck_set_status`, `ck_delete_article`, `ck_list_bundle` |
| `src/tools/project.ts` | Create | `ck_project_info`, `ck_pipeline_status` |
| `tests/config.test.ts` | Create | Tests for config loading + env interpolation |
| `tests/frontmatter.test.ts` | Create | Tests for read/write round-trip, modified auto-update |
| `tests/content.test.ts` | Create | Integration tests using a temp content dir fixture |

---

## Chunk 1: Foundation (install + utils + config)

### Task 1: Install dependencies

**Files:**
- Run in: `~/Development/mcp-contentkeeper/`

- [ ] **Step 1: Install**

```bash
cd ~/Development/mcp-contentkeeper && bun install
```

Expected: `node_modules/` created, lockfile written, no errors.

- [ ] **Step 2: Typecheck baseline**

```bash
bun run typecheck
```

Expected: Pass (only `types.ts` exists, no errors).

---

### Task 2: Stderr logger

**Files:**
- Create: `src/utils/log.ts`
- Test: `tests/log.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/log.test.ts`:

```typescript
import { describe, it, expect, spyOn } from "bun:test";

describe("log", () => {
  it("writes info to stderr", async () => {
    const { log } = await import("../src/utils/log.ts");
    const spy = spyOn(process.stderr, "write");
    log.info("hello");
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("[INFO] hello")
    );
    spy.mockRestore();
  });

  it("writes error to stderr", async () => {
    const { log } = await import("../src/utils/log.ts");
    const spy = spyOn(process.stderr, "write");
    log.error("boom");
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("[ERROR] boom")
    );
    spy.mockRestore();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd ~/Development/mcp-contentkeeper && bun test tests/log.test.ts
```

Expected: FAIL — `../src/utils/log.ts` not found.

- [ ] **Step 3: Implement**

Create `src/utils/log.ts`:

```typescript
const ts = () => new Date().toISOString();

export const log = {
  info: (msg: string) => process.stderr.write(`[INFO]  ${ts()} ${msg}\n`),
  error: (msg: string) => process.stderr.write(`[ERROR] ${ts()} ${msg}\n`),
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun test tests/log.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/log.ts tests/log.test.ts
git commit -m "feat: add stderr logger"
```

---

### Task 3: Config loader

**Files:**
- Create: `src/config.ts`
- Test: `tests/config.test.ts`

The config loader must:
1. Read `${CK_PROJECT}/contentkeeper.config.json`
2. Parse `${CK_PROJECT}/.env` (if present) to get credential env vars
3. Interpolate `${VAR}` patterns in the JSON using parsed env + `process.env`
4. Return a typed `ContentkeeperConfig` with absolute paths resolved

- [ ] **Step 1: Write the failing test**

Create `tests/config.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { writeFileSync, mkdirSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const tmpProject = join(tmpdir(), "ck-test-" + Date.now());

beforeAll(() => {
  mkdirSync(tmpProject, { recursive: true });
  writeFileSync(
    join(tmpProject, "contentkeeper.config.json"),
    JSON.stringify({
      project: { name: "TestSite", author: "tester", baseUrl: "https://test.com" },
      content: { dir: "./content", extension: ".md", defaultStatus: "draft" },
      staging: { dir: "./src/routes/articles", format: "svx", filenamePattern: "[slug]/+page.svx" },
      build: { adapter: "shell", command: "npm run build", outputDir: "./build", validationFiles: ["index.html"] },
      deploy: {
        adapter: "ftp",
        host: "${FTP_HOST}",
        port: 21,
        user: "${FTP_USER}",
        password: "${FTP_PASSWORD}",
        remotePath: "/public/",
        sync: "additive",
      },
      statuses: ["pitch", "draft", "review", "ready", "published", "archived"],
    })
  );
  writeFileSync(join(tmpProject, ".env"), "FTP_HOST=ftp.example.com\nFTP_USER=user\nFTP_PASSWORD=secret\n");
});

afterAll(() => rmSync(tmpProject, { recursive: true, force: true }));

describe("loadConfig", () => {
  it("loads and interpolates config from CK_PROJECT", async () => {
    process.env["CK_PROJECT"] = tmpProject;
    const { loadConfig } = await import("../src/config.ts");
    const config = loadConfig();
    expect(config.project.name).toBe("TestSite");
    expect(config.deploy.host).toBe("ftp.example.com");
    expect(config.deploy.user).toBe("user");
    expect(config.deploy.password).toBe("secret");
  });

  it("throws if CK_PROJECT is not set", async () => {
    delete process.env["CK_PROJECT"];
    const { loadConfig } = await import("../src/config.ts");
    expect(() => loadConfig()).toThrow("CK_PROJECT");
  });

  it("resolves content dir as absolute path", async () => {
    process.env["CK_PROJECT"] = tmpProject;
    const { loadConfig } = await import("../src/config.ts");
    const config = loadConfig();
    expect(config.content.dir).toBe(join(tmpProject, "content"));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test tests/config.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/config.ts`:

```typescript
import { readFileSync, existsSync } from "fs";
import { join, resolve } from "path";
import type { ContentkeeperConfig } from "./types.ts";

function parseEnvFile(envPath: string): Record<string, string> {
  if (!existsSync(envPath)) return {};
  const lines = readFileSync(envPath, "utf8").split("\n");
  const vars: Record<string, string> = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    vars[key] = value;
  }
  return vars;
}

function interpolate(value: unknown, env: Record<string, string>): unknown {
  if (typeof value === "string") {
    return value.replace(/\$\{([^}]+)\}/g, (_, key) => env[key] ?? process.env[key] ?? "");
  }
  if (Array.isArray(value)) return value.map((v) => interpolate(v, env));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, interpolate(v, env)])
    );
  }
  return value;
}

export function loadConfig(): ContentkeeperConfig {
  const projectRoot = process.env["CK_PROJECT"];
  if (!projectRoot) throw new Error("CK_PROJECT environment variable is not set");

  const configPath = join(projectRoot, "contentkeeper.config.json");
  if (!existsSync(configPath)) {
    throw new Error(`contentkeeper.config.json not found at ${configPath}`);
  }

  const raw = JSON.parse(readFileSync(configPath, "utf8")) as ContentkeeperConfig;
  const envVars = parseEnvFile(join(projectRoot, ".env"));

  const config = interpolate(raw, envVars) as ContentkeeperConfig;

  // Resolve relative paths to absolute, anchored at projectRoot
  config.content.dir = resolve(projectRoot, config.content.dir);
  config.staging.dir = resolve(projectRoot, config.staging.dir);
  config.build.outputDir = resolve(projectRoot, config.build.outputDir);

  return config;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun test tests/config.test.ts
```

Expected: PASS.

> **Note:** Bun caches dynamic imports. If tests fail due to stale module cache, add `?v=${Date.now()}` to import URLs in tests, or restructure to use named imports at the top of the file.

- [ ] **Step 5: Commit**

```bash
git add src/config.ts tests/config.test.ts
git commit -m "feat: add config loader with env interpolation"
```

---

### Task 4: Frontmatter utils

**Files:**
- Create: `src/utils/frontmatter.ts`
- Test: `tests/frontmatter.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/frontmatter.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { writeFileSync, mkdirSync, rmSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const tmpDir = join(tmpdir(), "ck-fm-" + Date.now());

beforeAll(() => mkdirSync(tmpDir, { recursive: true }));
afterAll(() => rmSync(tmpDir, { recursive: true, force: true }));

describe("frontmatter utils", () => {
  it("readArticle parses frontmatter and body", async () => {
    const { readArticle } = await import("../src/utils/frontmatter.ts");
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

  it("writeArticle round-trips without data loss", async () => {
    const { readArticle, writeArticle } = await import("../src/utils/frontmatter.ts");
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

  it("writeArticle auto-updates modified timestamp", async () => {
    const { readArticle, writeArticle } = await import("../src/utils/frontmatter.ts");
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test tests/frontmatter.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/utils/frontmatter.ts`:

```typescript
import matter from "gray-matter";
import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join, basename } from "path";
import type { Article, ArticleFrontmatter } from "../types.ts";

const INDEX_FILE = "index.md";

export function readArticle(bundlePath: string): Article {
  const indexPath = join(bundlePath, INDEX_FILE);
  const raw = readFileSync(indexPath, "utf8");
  const parsed = matter(raw);
  const frontmatter = parsed.data as ArticleFrontmatter;
  const slug = basename(bundlePath);

  let mediaFiles: string[] = [];
  try {
    mediaFiles = readdirSync(join(bundlePath, "media")).filter(
      (f) => !f.startsWith(".")
    );
  } catch {
    // media/ doesn't exist — that's fine
  }

  return { slug, frontmatter, body: parsed.content, bundlePath, mediaFiles };
}

export function writeArticle(
  bundlePath: string,
  frontmatter: ArticleFrontmatter,
  body: string
): void {
  const withModified: ArticleFrontmatter = {
    ...frontmatter,
    modified: new Date().toISOString(),
  };
  writeFileSync(join(bundlePath, INDEX_FILE), matter.stringify(body, withModified), "utf8");
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun test tests/frontmatter.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/frontmatter.ts tests/frontmatter.test.ts
git commit -m "feat: add frontmatter read/write utils"
```

---

### Task 5: Filesystem utils

**Files:**
- Create: `src/utils/fs.ts`
- Test: `tests/fs.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/fs.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const tmpDir = join(tmpdir(), "ck-fs-" + Date.now());

beforeAll(() => {
  mkdirSync(join(tmpDir, "bundles", "my-article", "media"), { recursive: true });
  writeFileSync(join(tmpDir, "bundles", "my-article", "index.md"), "# hello");
  writeFileSync(join(tmpDir, "bundles", "my-article", "media", "cover.jpg"), "fake-img");
});

afterAll(() => rmSync(tmpDir, { recursive: true, force: true }));

describe("fs utils", () => {
  it("listBundles returns dir names with index.md", async () => {
    const { listBundles } = await import("../src/utils/fs.ts");
    const bundles = listBundles(join(tmpDir, "bundles"));
    expect(bundles).toContain("my-article");
  });

  it("listBundles excludes .trash and dotdirs", async () => {
    const { listBundles } = await import("../src/utils/fs.ts");
    mkdirSync(join(tmpDir, "bundles", ".trash"), { recursive: true });
    mkdirSync(join(tmpDir, "bundles", ".trash", "old-article", "media"), { recursive: true });
    writeFileSync(join(tmpDir, "bundles", ".trash", "old-article", "index.md"), "# old");
    const bundles = listBundles(join(tmpDir, "bundles"));
    expect(bundles).not.toContain(".trash");
  });

  it("bundlePath constructs path correctly", async () => {
    const { bundlePath } = await import("../src/utils/fs.ts");
    expect(bundlePath("/content", "my-article")).toBe("/content/my-article");
  });

  it("moveBundle moves directory atomically", async () => {
    const { moveBundle } = await import("../src/utils/fs.ts");
    const src = join(tmpDir, "bundles", "my-article");
    const dest = join(tmpDir, "bundles", ".trash", "my-article");
    moveBundle(src, dest);
    expect(existsSync(dest)).toBe(true);
    expect(existsSync(src)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test tests/fs.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement**

Create `src/utils/fs.ts`:

```typescript
import {
  readdirSync,
  mkdirSync,
  renameSync,
  existsSync,
  statSync,
} from "fs";
import { join, dirname } from "path";

/** List slug names (subdir names) that contain an index.md. Excludes dot-dirs. */
export function listBundles(contentDir: string): string[] {
  if (!existsSync(contentDir)) return [];
  return readdirSync(contentDir).filter((entry) => {
    if (entry.startsWith(".")) return false;
    const entryPath = join(contentDir, entry);
    try {
      return (
        statSync(entryPath).isDirectory() &&
        existsSync(join(entryPath, "index.md"))
      );
    } catch {
      return false;
    }
  });
}

/** Construct absolute path to a named bundle. */
export function bundlePath(contentDir: string, slug: string): string {
  return join(contentDir, slug);
}

/** Ensure media/ subdirectory exists inside bundlePath. */
export function ensureMediaDir(bPath: string): void {
  mkdirSync(join(bPath, "media"), { recursive: true });
}

/** Move a bundle directory from src to dest. Creates parent dirs as needed. */
export function moveBundle(src: string, dest: string): void {
  mkdirSync(dirname(dest), { recursive: true });
  renameSync(src, dest);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun test tests/fs.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/fs.ts tests/fs.test.ts
git commit -m "feat: add filesystem utils"
```

---

## Chunk 2: Content Tools

### Task 6: Content tools implementation

**Files:**
- Create: `src/tools/content.ts`
- Test: `tests/content.test.ts`

The content tools are pure functions that take `(config, args)` and return `ToolSuccess | ToolError`. The MCP registration in `index.ts` wires them to the SDK. This separation makes the logic testable without running the MCP server.

- [ ] **Step 1: Write the failing tests**

Create `tests/content.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import matter from "gray-matter";
import type { ContentkeeperConfig } from "../src/types.ts";

const tmpDir = join(tmpdir(), "ck-content-" + Date.now());

// Minimal config fixture pointing at tmpDir
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
  // reset content dir
  rmSync(join(tmpDir, "content"), { recursive: true, force: true });
  mkdirSync(join(tmpDir, "content"), { recursive: true });
});

describe("ck_list_articles", () => {
  it("returns empty list when no bundles", async () => {
    const { ckListArticles } = await import("../src/tools/content.ts");
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
    const { ckListArticles } = await import("../src/tools/content.ts");
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
    const { ckListArticles } = await import("../src/tools/content.ts");
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
    const { ckGetArticle } = await import("../src/tools/content.ts");
    const result = await ckGetArticle(config, { slug: "my-article" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.frontmatter.title).toBe("My Article");
      expect(result.data.body).toContain("This is the body.");
    }
  });

  it("returns error for missing article", async () => {
    const { ckGetArticle } = await import("../src/tools/content.ts");
    const result = await ckGetArticle(makeConfig(), { slug: "nonexistent" });
    expect(result.ok).toBe(false);
  });
});

describe("ck_create_article", () => {
  it("creates bundle with index.md and media/", async () => {
    const config = makeConfig();
    const { ckCreateArticle } = await import("../src/tools/content.ts");
    const result = await ckCreateArticle(config, { slug: "new-post", title: "New Post" });
    expect(result.ok).toBe(true);
    expect(existsSync(join(config.content.dir, "new-post", "index.md"))).toBe(true);
    expect(existsSync(join(config.content.dir, "new-post", "media"))).toBe(true);
  });

  it("errors if bundle already exists", async () => {
    const config = makeConfig();
    writeBundle(config.content.dir, "existing", { title: "E", status: "draft", created: "2026-01-01T00:00:00.000Z", modified: "2026-01-01T00:00:00.000Z" }, ".");
    const { ckCreateArticle } = await import("../src/tools/content.ts");
    const result = await ckCreateArticle(config, { slug: "existing", title: "E2" });
    expect(result.ok).toBe(false);
  });
});

describe("ck_set_status", () => {
  it("updates status and modified", async () => {
    const config = makeConfig();
    writeBundle(config.content.dir, "status-test", {
      title: "T", status: "draft", created: "2026-01-01T00:00:00.000Z", modified: "2000-01-01T00:00:00.000Z",
    }, "Body.");
    const { ckSetStatus } = await import("../src/tools/content.ts");
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
    const { ckSetStatus } = await import("../src/tools/content.ts");
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
    const { ckDeleteArticle } = await import("../src/tools/content.ts");
    const result = await ckDeleteArticle(config, { slug: "to-delete" });
    expect(result.ok).toBe(true);
    expect(existsSync(join(config.content.dir, "to-delete"))).toBe(false);
    expect(existsSync(join(config.content.dir, ".trash", "to-delete"))).toBe(true);
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
    const { ckUpdateArticle } = await import("../src/tools/content.ts");
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
    const { ckUpdateArticle } = await import("../src/tools/content.ts");
    const result = await ckUpdateArticle(config, {
      slug: "update-fm",
      frontmatter: { title: "New Title", tags: ["a", "b"] },
    });
    expect(result.ok).toBe(true);
    const raw = readFileSync(join(config.content.dir, "update-fm", "index.md"), "utf8");
    const parsed = matter(raw);
    expect(parsed.data.title).toBe("New Title");
    expect(parsed.data.tags).toEqual(["a", "b"]);
    expect(parsed.data.status).toBe("draft"); // unchanged
  });

  it("returns error for missing article", async () => {
    const { ckUpdateArticle } = await import("../src/tools/content.ts");
    const result = await ckUpdateArticle(makeConfig(), { slug: "ghost" });
    expect(result.ok).toBe(false);
  });
});

describe("ck_list_bundle", () => {
  it("lists index.md and media files", async () => {
    const config = makeConfig();
    writeBundle(config.content.dir, "media-test", {
      title: "M", status: "draft", created: "2026-01-01T00:00:00.000Z", modified: "2026-01-01T00:00:00.000Z",
    }, "Body.");
    writeFileSync(join(config.content.dir, "media-test", "media", "cover.jpg"), "img");
    const { ckListBundle } = await import("../src/tools/content.ts");
    const result = await ckListBundle(config, { slug: "media-test" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.files).toContain("index.md");
      expect(result.data.media).toContain("cover.jpg");
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test tests/content.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement content tools**

Create `src/tools/content.ts`:

```typescript
import { existsSync, mkdirSync, writeFileSync, readdirSync } from "fs";
import { join } from "path";
import matter from "gray-matter";
import { readArticle, writeArticle } from "../utils/frontmatter.ts";
import { listBundles, bundlePath, ensureMediaDir, moveBundle } from "../utils/fs.ts";
import { log } from "../utils/log.ts";
import {
  UNUSUAL_TRANSITIONS,
  type ArticleStatus,
  type ContentkeeperConfig,
  type ArticleSummary,
  type Article,
  type ToolSuccess,
  type ToolError,
} from "../types.ts";

type Result<T> = ToolSuccess<T> | ToolError;

// ─── ck_list_articles ─────────────────────────────────────────────────────────

interface ListArgs {
  status?: ArticleStatus;
  tag?: string;
  dateFrom?: string;
  dateTo?: string;
}

export async function ckListArticles(
  config: ContentkeeperConfig,
  args: ListArgs
): Promise<Result<ArticleSummary[]>> {
  try {
    const slugs = listBundles(config.content.dir);
    const summaries: ArticleSummary[] = [];

    for (const slug of slugs) {
      try {
        const article = readArticle(bundlePath(config.content.dir, slug));
        const fm = article.frontmatter;

        if (args.status && fm.status !== args.status) continue;
        if (args.tag && !fm.tags?.includes(args.tag)) continue;
        if (args.dateFrom && fm.created < args.dateFrom) continue;
        if (args.dateTo && fm.created > args.dateTo) continue;

        summaries.push({
          slug,
          title: fm.title,
          status: fm.status,
          created: fm.created,
          modified: fm.modified,
          tags: fm.tags ?? [],
          hasMedia: article.mediaFiles.length > 0,
        });
      } catch (err) {
        log.error(`Skipping bundle ${slug}: ${err}`);
      }
    }

    return { ok: true, data: summaries };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

// ─── ck_get_article ───────────────────────────────────────────────────────────

export async function ckGetArticle(
  config: ContentkeeperConfig,
  args: { slug: string }
): Promise<Result<Article>> {
  const bPath = bundlePath(config.content.dir, args.slug);
  if (!existsSync(join(bPath, "index.md"))) {
    return { ok: false, error: `Article not found: ${args.slug}` };
  }
  try {
    return { ok: true, data: readArticle(bPath) };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

// ─── ck_create_article ────────────────────────────────────────────────────────

interface CreateArgs {
  slug: string;
  title: string;
  subtitle?: string;
  tags?: string[];
  author?: string;
}

export async function ckCreateArticle(
  config: ContentkeeperConfig,
  args: CreateArgs
): Promise<Result<{ slug: string; bundlePath: string }>> {
  const bPath = bundlePath(config.content.dir, args.slug);
  if (existsSync(bPath)) {
    return { ok: false, error: `Bundle already exists: ${args.slug}` };
  }

  try {
    mkdirSync(bPath, { recursive: true });
    ensureMediaDir(bPath);

    const now = new Date().toISOString();
    const fm = {
      title: args.title,
      status: config.content.defaultStatus,
      created: now,
      modified: now,
      ...(args.subtitle && { subtitle: args.subtitle }),
      ...(args.tags && { tags: args.tags }),
      ...(args.author && { author: args.author }),
    };

    // Write directly — don't use writeArticle() as that would double-update modified
    writeFileSync(join(bPath, "index.md"), matter.stringify("", fm));

    return { ok: true, data: { slug: args.slug, bundlePath: bPath } };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

// ─── ck_update_article ────────────────────────────────────────────────────────

interface UpdateArgs {
  slug: string;
  body?: string;
  frontmatter?: Partial<Record<string, unknown>>;
}

export async function ckUpdateArticle(
  config: ContentkeeperConfig,
  args: UpdateArgs
): Promise<Result<{ slug: string }>> {
  const bPath = bundlePath(config.content.dir, args.slug);
  if (!existsSync(join(bPath, "index.md"))) {
    return { ok: false, error: `Article not found: ${args.slug}` };
  }
  try {
    const article = readArticle(bPath);
    const updatedFm = { ...article.frontmatter, ...(args.frontmatter ?? {}) };
    const updatedBody = args.body ?? article.body;
    writeArticle(bPath, updatedFm, updatedBody);
    return { ok: true, data: { slug: args.slug } };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

// ─── ck_set_status ────────────────────────────────────────────────────────────

export async function ckSetStatus(
  config: ContentkeeperConfig,
  args: { slug: string; status: ArticleStatus }
): Promise<Result<{ slug: string; oldStatus: ArticleStatus; newStatus: ArticleStatus; warning?: string }>> {
  const bPath = bundlePath(config.content.dir, args.slug);
  if (!existsSync(join(bPath, "index.md"))) {
    return { ok: false, error: `Article not found: ${args.slug}` };
  }
  try {
    const article = readArticle(bPath);
    const oldStatus = article.frontmatter.status;
    const newStatus = args.status;

    const isUnusual = UNUSUAL_TRANSITIONS.some(
      ([from, to]) => from === oldStatus && to === newStatus
    );

    writeArticle(bPath, { ...article.frontmatter, status: newStatus }, article.body);

    const result: { slug: string; oldStatus: ArticleStatus; newStatus: ArticleStatus; warning?: string } = {
      slug: args.slug,
      oldStatus,
      newStatus,
    };

    if (isUnusual) {
      result.warning = `Unusual transition: ${oldStatus} → ${newStatus}. Proceeding anyway.`;
    }

    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

// ─── ck_delete_article ────────────────────────────────────────────────────────

export async function ckDeleteArticle(
  config: ContentkeeperConfig,
  args: { slug: string }
): Promise<Result<{ slug: string; trashedTo: string }>> {
  const bPath = bundlePath(config.content.dir, args.slug);
  if (!existsSync(bPath)) {
    return { ok: false, error: `Article not found: ${args.slug}` };
  }
  try {
    const trashPath = join(config.content.dir, ".trash", args.slug);
    moveBundle(bPath, trashPath);
    return { ok: true, data: { slug: args.slug, trashedTo: trashPath } };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

// ─── ck_list_bundle ───────────────────────────────────────────────────────────

export async function ckListBundle(
  config: ContentkeeperConfig,
  args: { slug: string }
): Promise<Result<{ slug: string; files: string[]; media: string[] }>> {
  const bPath = bundlePath(config.content.dir, args.slug);
  if (!existsSync(bPath)) {
    return { ok: false, error: `Bundle not found: ${args.slug}` };
  }
  try {
    const topFiles = readdirSync(bPath).filter((f) => !f.startsWith("."));
    let media: string[] = [];
    const mediaDir = join(bPath, "media");
    if (existsSync(mediaDir)) {
      media = readdirSync(mediaDir).filter((f) => !f.startsWith("."));
    }
    return { ok: true, data: { slug: args.slug, files: topFiles, media } };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun test tests/content.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tools/content.ts tests/content.test.ts
git commit -m "feat: implement Phase 1 content tools"
```

---

## Chunk 3: Project Tools + Server Entry

### Task 7: Project tools

**Files:**
- Create: `src/tools/project.ts`
- Test: `tests/project.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/project.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import matter from "gray-matter";
import type { ContentkeeperConfig } from "../src/types.ts";

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
    const { ckProjectInfo } = await import("../src/tools/project.ts");
    const result = await ckProjectInfo(makeConfig(), {});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.project.name).toBe("TestSite");
      expect(result.data.deploy.password).toBe("[redacted]");
      expect(result.data.deploy.host).toBe("ftp.example.com");
    }
  });
});

describe("ck_pipeline_status", () => {
  it("returns article counts by status", async () => {
    const config = makeConfig();
    // Write two articles
    for (const [slug, status] of [["art1", "draft"], ["art2", "ready"]] as const) {
      const bPath = join(config.content.dir, slug);
      mkdirSync(join(bPath, "media"), { recursive: true });
      writeFileSync(join(bPath, "index.md"), matter.stringify("Body.", {
        title: slug, status, created: "2026-01-01T00:00:00.000Z", modified: "2026-01-01T00:00:00.000Z",
      }));
    }
    const { ckPipelineStatus } = await import("../src/tools/project.ts");
    const result = await ckPipelineStatus(config, {});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.byStatus.draft).toBe(1);
      expect(result.data.byStatus.ready).toBe(1);
      expect(result.data.stagedCount).toBe(0); // Phase 2
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test tests/project.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement**

Create `src/tools/project.ts`:

```typescript
import { existsSync, readdirSync } from "fs";
import { join } from "path";
import { readArticle } from "../utils/frontmatter.ts";
import { listBundles, bundlePath } from "../utils/fs.ts";
import { log } from "../utils/log.ts";
import type {
  ContentkeeperConfig,
  ArticleStatus,
  ToolSuccess,
  ToolError,
} from "../types.ts";

type Result<T> = ToolSuccess<T> | ToolError;

// ─── ck_project_info ─────────────────────────────────────────────────────────

export async function ckProjectInfo(
  config: ContentkeeperConfig,
  _args: Record<string, never>
): Promise<Result<ContentkeeperConfig & { deploy: { password: string } }>> {
  const redacted = {
    ...config,
    deploy: {
      ...config.deploy,
      password: "[redacted]",
    },
  };
  return { ok: true, data: redacted as ContentkeeperConfig & { deploy: { password: string } } };
}

// ─── ck_pipeline_status ──────────────────────────────────────────────────────

interface PipelineStatus {
  byStatus: Partial<Record<ArticleStatus, number>>;
  totalArticles: number;
  stagedCount: number; // Phase 2: always 0 for now
  lastBuild: null; // Phase 3
  lastDeploy: null; // Phase 3
}

export async function ckPipelineStatus(
  config: ContentkeeperConfig,
  _args: Record<string, never>
): Promise<Result<PipelineStatus>> {
  try {
    const slugs = listBundles(config.content.dir);
    const byStatus: Partial<Record<ArticleStatus, number>> = {};

    for (const slug of slugs) {
      try {
        const article = readArticle(bundlePath(config.content.dir, slug));
        const status = article.frontmatter.status;
        byStatus[status] = (byStatus[status] ?? 0) + 1;
      } catch (err) {
        log.error(`pipeline_status: skipping ${slug}: ${err}`);
      }
    }

    // Phase 2: count staged articles
    let stagedCount = 0;
    if (existsSync(config.staging.dir)) {
      stagedCount = readdirSync(config.staging.dir).filter((e) => !e.startsWith(".")).length;
    }

    return {
      ok: true,
      data: {
        byStatus,
        totalArticles: slugs.length,
        stagedCount,
        lastBuild: null,
        lastDeploy: null,
      },
    };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun test tests/project.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tools/project.ts tests/project.test.ts
git commit -m "feat: implement project info and pipeline status tools"
```

---

### Task 8: MCP server entry point

**Files:**
- Create: `src/index.ts`

This wires all tools into the MCP SDK. No tests (the server entry is thin glue — integration verified via Inspector).

- [ ] **Step 1: Implement**

Create `src/index.ts`:

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadConfig } from "./config.ts";
import { log } from "./utils/log.ts";
import {
  ckListArticles,
  ckGetArticle,
  ckCreateArticle,
  ckUpdateArticle,
  ckSetStatus,
  ckDeleteArticle,
  ckListBundle,
} from "./tools/content.ts";
import { ckProjectInfo, ckPipelineStatus } from "./tools/project.ts";
import { VALID_STATUSES } from "./types.ts";

const config = loadConfig();
log.info(`contentkeeper starting for project: ${config.project.name}`);

const server = new McpServer({
  name: "contentkeeper",
  version: "0.1.0",
});

// ─── Content Tools ────────────────────────────────────────────────────────────

server.tool(
  "ck_list_articles",
  "List content bundles, optionally filtered by status, tag, or date range",
  {
    status: z.enum(VALID_STATUSES).optional().describe("Filter by status"),
    tag: z.string().optional().describe("Filter by tag"),
    dateFrom: z.string().optional().describe("ISO date — include articles created on/after"),
    dateTo: z.string().optional().describe("ISO date — include articles created on/before"),
  },
  async (args) => {
    const result = await ckListArticles(config, args);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "ck_get_article",
  "Read a single article (frontmatter + body) by slug",
  { slug: z.string().describe("Bundle directory name (canonical slug)") },
  async (args) => {
    const result = await ckGetArticle(config, args);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "ck_create_article",
  "Create a new content bundle with index.md and media/ directory",
  {
    slug: z.string().describe("URL slug — becomes the bundle directory name"),
    title: z.string().describe("Article title"),
    subtitle: z.string().optional(),
    tags: z.array(z.string()).optional(),
    author: z.string().optional(),
  },
  async (args) => {
    const result = await ckCreateArticle(config, args);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "ck_update_article",
  "Update an article's body and/or frontmatter fields. Auto-updates modified timestamp.",
  {
    slug: z.string(),
    body: z.string().optional().describe("Replace the markdown body (leave undefined to keep existing)"),
    frontmatter: z.record(z.unknown()).optional().describe("Frontmatter fields to merge/update"),
  },
  async (args) => {
    const result = await ckUpdateArticle(config, args);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "ck_set_status",
  "Transition an article to a new status. Warns on unusual transitions but never blocks.",
  {
    slug: z.string(),
    status: z.enum(VALID_STATUSES).describe("Target status"),
  },
  async (args) => {
    const result = await ckSetStatus(config, args);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "ck_delete_article",
  "Soft-delete an article bundle by moving it to .trash/ inside the content directory",
  { slug: z.string() },
  async (args) => {
    const result = await ckDeleteArticle(config, args);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "ck_list_bundle",
  "List all files in a content bundle (index.md and media/ contents)",
  { slug: z.string() },
  async (args) => {
    const result = await ckListBundle(config, args);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// ─── Project Tools ────────────────────────────────────────────────────────────

server.tool(
  "ck_project_info",
  "Return project configuration summary (credentials redacted)",
  {},
  async () => {
    const result = await ckProjectInfo(config, {});
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "ck_pipeline_status",
  "Summary of all articles by status, staged count, last build, last deploy",
  {},
  async () => {
    const result = await ckPipelineStatus(config, {});
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// ─── Start ────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
log.info("contentkeeper ready");
```

- [ ] **Step 2: Typecheck**

```bash
cd ~/Development/mcp-contentkeeper && bun run typecheck
```

Fix any type errors before proceeding.

- [ ] **Step 3: Run all tests**

```bash
bun test
```

Expected: All PASS.

- [ ] **Step 4: Smoke test with direct Bun invocation**

```bash
CK_PROJECT=/Users/russell/Development/banapana bun src/index.ts &
sleep 1 && kill %1
```

Expected: No crash. Log lines like `[INFO] contentkeeper starting for project: Banapana` on stderr.

- [ ] **Step 5: Commit**

```bash
git add src/index.ts
git commit -m "feat: wire MCP server entry point with all Phase 1 tools"
```

---

### Task 9: Inspector verification

**Files:**
- No file changes

- [ ] **Step 1: Launch Inspector**

```bash
cd ~/Development/mcp-contentkeeper && CK_PROJECT=/Users/russell/Development/banapana bun run inspect
```

Expected: Browser opens at `http://localhost:5173` (or printed URL). MCP Inspector UI loads.

- [ ] **Step 2: Verify all tools register**

In Inspector, check the **Tools** panel. All 9 tools must appear:
- `ck_list_articles`
- `ck_get_article`
- `ck_create_article`
- `ck_update_article`
- `ck_set_status`
- `ck_delete_article`
- `ck_list_bundle`
- `ck_project_info`
- `ck_pipeline_status`

- [ ] **Step 3: Spot-check ck_project_info**

Call `ck_project_info` with no arguments. Expected: JSON showing Banapana config with `deploy.password` as `[redacted]`.

- [ ] **Step 4: Spot-check ck_pipeline_status**

Call `ck_pipeline_status`. Expected: `byStatus` with any articles found (may be empty since existing content uses `article.md`, not `index.md`).

- [ ] **Step 5: Spot-check remaining tools**

Create a test article first: call `ck_create_article` with `{ "slug": "test-inspector-article", "title": "Inspector Test" }`.
Expected: `{ ok: true, data: { slug: "test-inspector-article", ... } }`.

Call `ck_list_articles` — the new article should appear with status `draft`.

Call `ck_get_article` with `{ "slug": "test-inspector-article" }`. Expected: frontmatter + empty body.

Call `ck_update_article` with `{ "slug": "test-inspector-article", "body": "Test body." }`. Expected: `{ ok: true }`.

Call `ck_set_status` with `{ "slug": "test-inspector-article", "status": "review" }`. Expected: `{ ok: true, data: { oldStatus: "draft", newStatus: "review" } }`.

Call `ck_list_bundle` with `{ "slug": "test-inspector-article" }`. Expected: `{ files: ["index.md", "media"], media: [] }`.

Call `ck_delete_article` with `{ "slug": "test-inspector-article" }` to clean up. Expected: `{ ok: true }`.

- [ ] **Step 6: Final commit**

If Inspector verification surfaced any fixes, commit those. Otherwise, commit the plan doc:

```bash
git add docs/superpowers/plans/2026-03-12-contentkeeper-phase1.md
git commit -m "docs: add Phase 1 implementation plan"
```

---

## AnythingLLM Config (post-Phase 1)

Add to AnythingLLM MCP configuration after Inspector verification passes:

```json
{
  "contentkeeper": {
    "command": "bun",
    "args": ["/Users/russell/Development/mcp-contentkeeper/src/index.ts"],
    "env": {
      "CK_PROJECT": "/Users/russell/Development/banapana"
    }
  }
}
```

> Note: The handoff document specifies `~/tools/contentkeeper/` as the install location, but the actual project is at `~/Development/mcp-contentkeeper/`. Use the actual path above.

---

## Phase 2 Preview

Phase 2 will add staging tools: `ck_stage_article` (batch), `ck_unstage_article`, `ck_list_staged`, `ck_diff_staged`. These copy bundles from the content dir into `src/routes/articles/`, renaming `index.md` → `+page.svx` with no content transformation.
