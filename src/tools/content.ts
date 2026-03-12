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
