import matter from "gray-matter";
import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join, basename } from "path";
import type { Article, ArticleFrontmatter } from "../types.ts";

export function readArticle(bundlePath: string, sourceFile = "index.md"): Article {
  const articlePath = join(bundlePath, sourceFile);
  const raw = readFileSync(articlePath, "utf8");
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

export function createArticleFile(
  bundlePath: string,
  frontmatter: Record<string, unknown>,
  body = "",
  sourceFile = "index.md"
): void {
  writeFileSync(join(bundlePath, sourceFile), matter.stringify(body, frontmatter), "utf8");
}

export function writeArticle(
  bundlePath: string,
  frontmatter: ArticleFrontmatter,
  body: string,
  sourceFile = "index.md"
): void {
  const withModified: ArticleFrontmatter = {
    ...frontmatter,
    modified: new Date().toISOString(),
  };
  writeFileSync(join(bundlePath, sourceFile), matter.stringify(body, withModified), "utf8");
}
