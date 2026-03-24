# contentkeeper — MCP Server Specification

**Version**: 0.4 (stack finalized)
**Status**: Ready for implementation
**Author**: Ruz-el / Banapana
**Runtime**: Bun
**Language**: TypeScript (native Bun execution)
**Transport**: stdio
**Prototype site**: Banapana (SvelteKit static, FTP deploy)

---

## 1. Purpose

contentkeeper is a local MCP server that manages the full content lifecycle for flat-file publishing sites — from raw draft to deployed production. It is designed to be:

- **Site-framework agnostic** in its content layer (markdown + frontmatter as the canonical format)
- **Configurable** per-project via a `contentkeeper.config.json` file in the site root
- **Composable** with any LLM client that speaks MCP (Claude Desktop, AnythingLLM, etc.)
- **Self-hostable** with no cloud dependency beyond the deployment target
- **Distributable** as a Bun-native package

The prototype implementation targets SvelteKit static sites deployed via FTP. Build and deploy steps use a swappable adapter model.

---

## 2. Core Concepts

### 2.1 Content Store

The content store is a directory of **content bundles** — one directory per article. Each bundle is named after the article's slug and contains exactly two things: the canonical markdown file (`index.md`) and a `media/` subdirectory for all assets.

```
content/
├── my-first-article/
│   ├── index.md
│   └── media/
│       └── cover.jpg
├── a-richer-piece/
│   ├── index.md
│   └── media/
│       ├── cover.jpg
│       └── diagram-01.png
└── interactive-essay/
    ├── index.md
    └── media/
        ├── cover.jpg
        ├── Widget.svelte     # framework-specific interactive component
        └── slideshow-01.jpg
```

**The bundle directory name is the canonical slug.** The `slug` frontmatter field is an optional override for legacy URLs.

**All assets live in `media/` — this is a hard convention, not a configuration option.** It keeps route directories uniform regardless of how asset-heavy an article is. The author references assets in markdown as `./media/filename`. contentkeeper does not inspect or filter `media/` contents; the entire directory copies through as-is.

The filesystem is the source of truth. No database is required.

### 2.2 Frontmatter Schema

All articles carry a standard YAML frontmatter block. The following fields are reserved:

| Field      | Type       | Required | Description                                                    |
|------------|------------|----------|----------------------------------------------------------------|
| `title`    | string     | yes      | Article title                                                  |
| `subtitle` | string     | no       | Secondary title                                                |
| `summary`  | string     | no       | Short description / meta description                           |
| `slug`     | string     | no       | URL slug override (defaults to bundle directory name)          |
| `tags`     | string[]   | no       | Taxonomy tags                                                  |
| `created`  | ISO date   | yes      | Creation date                                                  |
| `modified` | ISO date   | yes      | Last modified date (auto-updated by contentkeeper on write)    |
| `status`   | enum       | yes      | See §2.3                                                       |
| `author`   | string     | no       | Byline (defaults to project config value)                      |

Projects may add custom frontmatter fields; contentkeeper preserves them without modification.

### 2.3 Status Lifecycle

Articles move through a linear status pipeline. Transitions are always explicit — contentkeeper never auto-advances status. contentkeeper warns on questionable transitions (e.g., `pitch → published`) but does not block them. The LLM client is the workflow enforcer.

```
pitch → draft → review → ready → scheduled → published → archived
                                                       ↗
                                              re-pub ──
```

| Status      | Meaning                                              |
|-------------|------------------------------------------------------|
| `pitch`     | Idea captured, not yet written                       |
| `draft`     | In progress, not ready for review                    |
| `review`    | Complete draft, under editorial review               |
| `ready`     | Approved, waiting for publish slot                   |
| `scheduled` | Assigned a publish date/time                         |
| `published` | Live on primary platform                             |
| `re-pub`    | Being republished to secondary platforms             |
| `archived`  | Removed from active queue, preserved                 |

### 2.4 Staging

The **stage** is the build-time intermediate representation. Staging copies a bundle into the site's routes directory, renaming `index.md` to the framework's required filename (e.g., `+page.svx` for SvelteKit) and copying `media/` alongside it unchanged.

```
src/routes/articles/
└── my-first-article/
    ├── +page.svx         # renamed from index.md; no content transformation
    └── media/
        └── cover.jpg     # copied from content bundle verbatim
```

There is **no content transformation** during staging — `index.md` is renamed only. The framework's own toolchain (e.g., mdsvex, Vite) handles any format-specific processing at build time.

Staging is **atomic** (the whole bundle moves as a unit) and **reversible** (un-staging removes the route directory without touching the content store).

`ck_stage_article` accepts one or more slugs, enabling batch staging in a single operation.

### 2.5 Build & Deploy Adapters

contentkeeper uses a swappable **adapter** model for build and deploy:

- **Build adapter**: invokes the site's build toolchain
- **Deploy adapter**: pushes built output to the host

**v1 adapters:**
- Build: `shell` — runs a configurable shell command in the project root
- Deploy: `ftp` — uses `basic-ftp`; additive-only by default, full mirror sync opt-in

**Planned adapters:** `rsync`, `netlify`, `cloudflare-pages`, `github-pages`

**Future feature (post-v1):** Pre-deploy zip backup of remote directory before any full-sync/mirror operation.

---

## 3. Technology Stack

### Runtime: Bun

contentkeeper runs on Bun. Advantages for this use case:

- **14x faster startup than Node.js** — significant for stdio MCP servers that spin up fresh per session
- **Native `.env` loading** — no dotenv dependency needed
- **No compile step** — Bun executes `.ts` files directly; no `dist/` directory, no build phase
- **Fast package management** — `bun add` / `bun install`
- **Fully compatible with `@modelcontextprotocol/sdk`** — the SDK officially supports Bun

AnythingLLM / Claude Desktop MCP config entry:
```json
{
  "contentkeeper": {
    "command": "/Users/russell/.bun/bin/bun",
    "args": ["/Users/russell/tools/contentkeeper/src/index.ts"],
    "env": {
      "CK_PROJECT": "/Users/russell/Development/banapana"
    }
  }
}
```

> **Note:** Claude Desktop and other launchers do not inherit your shell `$PATH`, so `bun` must be specified as a full path (e.g. `/Users/russell/.bun/bin/bun`). Running `which bun` in your terminal will give you the correct path.

### Language: TypeScript

TypeScript, executed natively by Bun — no `tsc`, no `tsconfig.json` compile step, no `dist/` directory. Bun strips types at runtime. Source files are `.ts`, run directly with `bun src/index.ts`. Full type safety, zero build overhead.

### Validation: Zod

The MCP SDK has a required peer dependency on Zod for tool input schemas. Zod is used as a runtime validation library only — no TypeScript type inference. One unavoidable dependency.

### Dependencies

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "latest",
    "zod": "latest",
    "gray-matter": "latest",
    "basic-ftp": "latest"
  }
}
```

- `gray-matter` — frontmatter parsing and serialization
- `basic-ftp` — FTP deploy adapter
- No `dotenv` — Bun loads `.env` natively

### Dev Tooling: MCP Inspector

The MCP Inspector runs via npx with no installation. It provides an interactive UI for testing and debugging tools during development.

```json
"scripts": {
  "start": "bun src/index.ts",
  "inspect": "npx @modelcontextprotocol/inspector bun src/index.ts",
  "dev": "bun --watch src/index.ts"
}
```

Usage:
```bash
# Test tools interactively before wiring into AnythingLLM
bun run inspect
```

---

## 4. Project Structure

```
~/tools/contentkeeper/
├── package.json
├── README.md
├── .env.example
├── src/
│   ├── index.ts          # MCP server entry point, tool registration
│   ├── config.ts         # Config loading and validation
│   ├── tools/
│   │   ├── content.ts    # ck_list_articles, ck_get_article, etc.
│   │   ├── staging.ts    # ck_stage_article, ck_unstage_article, etc.
│   │   ├── build.ts      # ck_build, ck_build_status, ck_validate_build
│   │   └── deploy.ts     # ck_deploy, ck_deploy_status, ck_dry_run_deploy
│   ├── adapters/
│   │   ├── build-shell.ts  # shell build adapter
│   │   └── deploy-ftp.ts   # ftp deploy adapter
│   └── utils/
│       ├── frontmatter.ts  # gray-matter wrappers
│       ├── fs.ts           # filesystem helpers (copy bundle, etc.)
│       └── log.ts          # stderr logging (never stdout in stdio MCP)
└── contentkeeper.config.json  # example / reference config (not Banapana's)
```

---

## 5. Configuration

contentkeeper is configured per-project via `contentkeeper.config.json` in the site root, pointed to via `CK_PROJECT` environment variable.

### 5.1 Example Config (Banapana)

```json
{
  "project": {
    "name": "Banapana",
    "author": "Ruz-el",
    "baseUrl": "https://banapana.com"
  },
  "content": {
    "dir": "./content",
    "extension": ".md",
    "defaultStatus": "draft",
    "sourceFile": "article.md"
  },
  "staging": {
    "dir": "./src/routes/articles",
    "format": "svx",
    "filenamePattern": "[slug]/+page.svx"
  },
  "build": {
    "adapter": "shell",
    "command": "npm run build",
    "outputDir": "./build",
    "validationFiles": ["index.html"]
  },
  "deploy": {
    "adapter": "ftp",
    "host": "${FTP_HOST}",
    "port": 21,
    "user": "${FTP_USER}",
    "password": "${FTP_PASSWORD}",
    "remotePath": "/home/tropedc/domains/banapana.com/",
    "sync": "additive"
  },
  "statuses": ["pitch", "draft", "review", "ready", "scheduled", "published", "re-pub", "archived"]
}
```

Credentials use environment variable interpolation (`${VAR}`) — never stored in the config file directly.

### 5.2 Banapana Instance Setup

```
~/tools/contentkeeper/          ← MCP server
    src/
    package.json

~/Development/banapana/         ← site root (CK_PROJECT)
    contentkeeper.config.json
    .env                        ← FTP_HOST, FTP_USER, FTP_PASSWORD (gitignored)
    content/                    ← symlink →
        ↓
/Users/russell/Library/Mobile Documents/27N4MQEA55~pro~writer/
    Documents/Writing/Nonfiction/banapana/
        align-ai-align-humans/
            index.md
            media/
                cover.jpg
        this-ai-cannot-be-empire/
            index.md
            media/
                cover.jpg
```

Create the symlink on Searle:
```bash
ln -s "/Users/russell/Library/Mobile Documents/27N4MQEA55~pro~writer/Documents/Writing/Nonfiction/banapana" \
  ~/Development/banapana/content
```

---

## 6. Tool Surface

All tool names are prefixed `ck_` to avoid collisions when running alongside other MCP servers.

### 6.1 Content Tools

| Tool                 | Description                                              | Destructive |
|----------------------|----------------------------------------------------------|-------------|
| `ck_list_articles`   | List bundles, filterable by status, tag, date range      | no          |
| `ck_get_article`     | Read a single article (frontmatter + body) by slug       | no          |
| `ck_create_article`  | Create a new bundle directory with index.md + media/     | no          |
| `ck_update_article`  | Update article body and/or frontmatter fields            | yes         |
| `ck_set_status`      | Transition article to a new status (warns on odd jumps)  | yes         |
| `ck_delete_article`  | Soft-delete: move bundle to `.trash/`                    | yes         |
| `ck_search_articles` | Full-text search across article bodies                   | no          |

### 6.2 Staging Tools

| Tool                  | Description                                                         | Destructive |
|-----------------------|---------------------------------------------------------------------|-------------|
| `ck_stage_article`    | Copy bundle(s) to routes dir, renaming index.md to +page.svx       | no          |
| `ck_unstage_article`  | Remove bundle directory from routes dir                             | yes         |
| `ck_list_staged`      | List all currently staged bundles                                   | no          |
| `ck_diff_staged`      | Show diff between content store and staged index.md                 | no          |
| `ck_list_bundle`      | List files in a content bundle (index.md + media/ contents)         | no          |

### 6.3 Build Tools

| Tool                 | Description                                                          | Destructive |
|----------------------|----------------------------------------------------------------------|-------------|
| `ck_build`           | Run the configured build command                                     | no          |
| `ck_build_status`    | Return result of last build (exit code, stdout, stderr, timestamp)   | no          |
| `ck_validate_build`  | Check that outputDir contains expected validationFiles               | no          |

### 6.4 Deploy Tools

| Tool                 | Description                                                          | Destructive |
|----------------------|----------------------------------------------------------------------|-------------|
| `ck_deploy`          | Push build output to configured deploy target                        | yes         |
| `ck_deploy_status`   | Return result of last deploy (success, timestamp, files transferred) | no          |
| `ck_dry_run_deploy`  | Simulate deploy and list files that would be transferred             | no          |

### 6.5 Project Tools

| Tool                  | Description                                                         | Destructive |
|-----------------------|---------------------------------------------------------------------|-------------|
| `ck_project_info`     | Return project config summary (credentials redacted)                | no          |
| `ck_pipeline_status`  | Summary: staged count, last build, last deploy, articles by status  | no          |

---

## 7. Canonical Workflows

### 7.1 Create and draft an article
```
ck_create_article → [human writes in iA Writer] → ck_set_status(draft)
```

### 7.2 Publish one or more articles
```
ck_set_status(ready) → ck_stage_article(slugs[]) → ck_build
  → ck_build_status → ck_validate_build → ck_deploy → ck_set_status(published)
```

### 7.3 Check pipeline health
```
ck_pipeline_status → ck_list_staged → ck_build_status → ck_deploy_status
```

### 7.4 Update a live article
```
ck_get_article → [human edits in iA Writer] → ck_stage_article → ck_build → ck_deploy
```

---

## 8. Non-Goals (v1)

- **No media transformation** — assets are moved verbatim; no resizing, compression, or optimization
- **No scheduling daemon** — `scheduled` status is a marker only; contentkeeper does not wake itself up
- **No multi-site orchestration** — one MCP server instance per project root
- **No Git integration** — version control is the operator's responsibility (v2 candidate)
- **No cross-posting** — contentkeeper owns primary site deploy only; Substack, Medium, social are out of scope
- **No authentication layer** — local tool; assumes operator controls the host machine
- **No asset validation** — contentkeeper does not enforce presence of `cover.jpg` or any required file

---

## 9. Distribution

contentkeeper is published as a Bun-native TypeScript package:

```bash
bunx contentkeeper --project /path/to/site
```

The MCP server name exposed to clients: `contentkeeper`.

Multiple sites run as separate stdio processes, each with its own `CK_PROJECT` env var pointing at a different site root.

---

## 10. Resolved Design Decisions

1. **Runtime**: Bun. Faster startup, native .env, no compile step. MCP SDK is fully Bun-compatible.
2. **Language**: TypeScript, executed natively by Bun. No tsc, no tsconfig, no dist/. Bun runs .ts directly.
3. **Zod**: Required peer dependency of the MCP SDK. Used for runtime tool input validation only.
4. **MCP Inspector**: Dev tool, not a dependency. Invoked via `bun run inspect` → `npx @modelcontextprotocol/inspector bun src/index.ts`.
5. **svx conversion**: No content transformation. `index.md` renamed to `+page.svx`. `media/` copies verbatim.
6. **Slug derivation**: Bundle directory name is canonical. Frontmatter `slug` is an optional legacy override.
7. **Build validation**: Check for specific files in `validationFiles` config array.
8. **FTP sync**: Additive-only by default. Full mirror is opt-in via `"sync": "mirror"`. Pre-deploy zip backup is post-v1.
9. **Batch staging**: `ck_stage_article` accepts one or more slugs in a single call.
10. **Status guards**: Warn on unusual transitions, never block. LLM is the workflow enforcer.
11. **media/ convention**: Hard convention, not configurable. Entire directory copies through without inspection.

---

## 11. Implementation Phases

### Phase 1 — Content Layer
`ck_list_articles`, `ck_get_article`, `ck_create_article`, `ck_update_article`, `ck_set_status`, `ck_delete_article`, `ck_list_bundle`, `ck_pipeline_status`, `ck_project_info`

### Phase 2 — Staging
`ck_stage_article` (batch), `ck_unstage_article`, `ck_list_staged`, `ck_diff_staged`

### Phase 3 — Build & Deploy
`ck_build`, `ck_build_status`, `ck_validate_build`, `ck_deploy`, `ck_deploy_status`, `ck_dry_run_deploy`

### Phase 4 — Polish & Distribution
`ck_search_articles`, trash/restore, bunx packaging, README, example configs for Hugo/Astro/Jekyll/SvelteKit, staging adapter extension documentation, type definitions exported for downstream use
