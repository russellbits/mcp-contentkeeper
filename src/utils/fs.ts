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
