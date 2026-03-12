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
import { VALID_STATUSES, type ArticleStatus } from "./types.ts";

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
    status: z.enum([...VALID_STATUSES] as [string, ...string[]]).optional().describe("Filter by status"),
    tag: z.string().optional().describe("Filter by tag"),
    dateFrom: z.string().optional().describe("ISO date — include articles created on/after"),
    dateTo: z.string().optional().describe("ISO date — include articles created on/before"),
  },
  async (args) => {
    const result = await ckListArticles(config, { ...args, status: args.status as ArticleStatus | undefined });
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
    frontmatter: z.record(z.string(), z.unknown()).optional().describe("Frontmatter fields to merge/update"),
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
    status: z.enum([...VALID_STATUSES] as [string, ...string[]]).describe("Target status"),
  },
  async (args) => {
    const result = await ckSetStatus(config, { slug: args.slug, status: args.status as ArticleStatus });
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
