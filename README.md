# Contentkeeper

![Contentkeepers are coo coo for keeping content!](./contentkeeper.jpg)

An MCP server for managing the full content lifecycle of flat-file publishing sites. Contentkeeper gives AI coding agents (Claude, OpenCode, etc.) structured access to your content — create articles, update frontmatter, manage status transitions, and monitor your publishing pipeline — all through a clean set of `ck_`-prefixed tools.

Built with [Bun](https://bun.sh) and the [Model Context Protocol SDK](https://github.com/modelcontextprotocol/sdk). Banapana is the prototype publication.

---

## How It Works

Contentkeeper operates on a **bundle-based content model**: each article lives in its own directory (named after its slug) containing a source markdown file and a `media/` subdirectory for assets.

```
content/
  my-article-slug/
    index.md        ← frontmatter + body
    media/
      hero.jpg
  another-article/
    index.md
    media/
```

A `contentkeeper.config.json` file in your project root defines where content lives, what the staging directory is, how to build, and how to deploy. The server is pointed at a project via the `CK_PROJECT` environment variable.

---

## Installation

```bash
git clone https://github.com/russellbits/mcp-contentkeeper.git
cd mcp-contentkeeper
bun install
```

---

## Configuration

Contentkeeper reads a `contentkeeper.config.json` from the root of your publishing project (not from the server itself). Point the server at your project using the `CK_PROJECT` environment variable.

### Example `contentkeeper.config.json`

```json
{
  "project": {
    "name": "My Publication",
    "author": "Your Name",
    "baseUrl": "https://example.com"
  },
  "content": {
    "dir": "content",
    "extension": ".md",
    "defaultStatus": "pitch",
    "sourceFile": "index.md"
  },
  "staging": {
    "dir": "src/routes",
    "format": "svx",
    "filenamePattern": "[slug]/+page.svx"
  },
  "build": {
    "adapter": "shell",
    "command": "bun run build",
    "outputDir": "build",
    "validationFiles": ["index.html"]
  },
  "deploy": {
    "adapter": "ftp",
    "host": "ftp.example.com",
    "port": 21,
    "user": "${FTP_USER}",
    "password": "${FTP_PASSWORD}",
    "remotePath": "/public_html",
    "sync": "additive"
  },
  "statuses": ["pitch", "draft", "review", "ready", "scheduled", "published", "re-pub", "archived"]
}
```

Environment variable interpolation (`${VAR}`) is supported in config values. Variables are resolved from a `.env` file in the project root and from the process environment.

---

## Running the Server

### stdio (default — for MCP clients like Claude Desktop)

```bash
CK_PROJECT=/path/to/your/project bun src/index.ts
```

### HTTP (for remote access, e.g. over Tailscale)

```bash
CK_PROJECT=/path/to/your/project bun src/index.ts --http
```

HTTP mode listens on port `6070` by default. Set `CK_PORT` to override. Set `CK_TOKEN` to require Bearer token authentication.

### Inspector (development)

```bash
CK_PROJECT=/path/to/your/project bun run inspect
```

---

## Claude Desktop Configuration

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "contentkeeper": {
      "command": "/path/to/bun",
      "args": ["/path/to/mcp-contentkeeper/src/index.ts"],
      "env": {
        "CK_PROJECT": "/path/to/your/project"
      }
    }
  }
}
```

---

## Article Status Lifecycle

Articles move through a defined set of statuses. Unusual transitions (e.g. jumping from `pitch` directly to `published`) are warned about but never blocked.

```
pitch → draft → review → ready → scheduled → published
                                           ↓
                                        re-pub
                                           ↓
                                        archived
```

Valid statuses: `pitch`, `draft`, `review`, `ready`, `scheduled`, `published`, `re-pub`, `archived`

---

## MCP Tools

All tools return `{ ok: true, data: ... }` on success or `{ ok: false, error: "..." }` on failure.

| Tool | Description |
|------|-------------|
| `ck_list_articles` | List all articles, optionally filtered by `status`, `tag`, `dateFrom`, `dateTo` |
| `ck_get_article` | Read a single article (frontmatter + body) by slug |
| `ck_create_article` | Create a new article bundle with `index.md` and `media/` directory |
| `ck_update_article` | Update an article's body and/or frontmatter fields |
| `ck_set_status` | Transition an article to a new status |
| `ck_delete_article` | Soft-delete an article (moves to `.trash/` inside the content directory) |
| `ck_list_bundle` | List all files in an article bundle |
| `ck_project_info` | Return project configuration (credentials redacted) |
| `ck_pipeline_status` | Summary of article counts by status, staged count, and build/deploy state |

---

## Article Frontmatter

Each `index.md` begins with YAML frontmatter:

```yaml
---
title: My Article Title
status: draft
created: 2025-01-01T00:00:00.000Z
modified: 2025-01-15T12:00:00.000Z
subtitle: An optional subtitle
tags:
  - technology
  - media
author: Your Name
---

Article body begins here...
```

The `modified` field is automatically updated on every write.

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CK_PROJECT` | Yes | Absolute path to the publishing project root |
| `CK_TRANSPORT` | No | Set to `http` to use HTTP transport instead of stdio |
| `CK_PORT` | No | HTTP port (default: `6070`) |
| `CK_TOKEN` | No | Bearer token for HTTP authentication. If unset, all requests are allowed (rely on network-level security e.g. Tailscale) |

---

## Development

```bash
bun run dev        # watch mode
bun run typecheck  # type checking only
bun run inspect    # MCP inspector UI
```

---

## License

MIT
