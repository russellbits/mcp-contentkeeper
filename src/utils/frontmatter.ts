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
