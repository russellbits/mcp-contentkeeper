import { existsSync, readdirSync } from "fs";
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
): Promise<Result<ContentkeeperConfig>> {
  const redacted = {
    ...config,
    deploy: {
      ...config.deploy,
      password: "[redacted]",
    },
  };
  return { ok: true, data: redacted as ContentkeeperConfig };
}

// ─── ck_pipeline_status ──────────────────────────────────────────────────────

interface PipelineStatus {
  byStatus: Partial<Record<ArticleStatus, number>>;
  totalArticles: number;
  stagedCount: number; // Phase 2: counts staged bundles in staging.dir
  lastBuild: null; // Phase 3
  lastDeploy: null; // Phase 3
}

export async function ckPipelineStatus(
  config: ContentkeeperConfig,
  _args: Record<string, never>
): Promise<Result<PipelineStatus>> {
  try {
    const slugs = listBundles(config.content.dir, config.content.sourceFile);
    const byStatus: Partial<Record<ArticleStatus, number>> = {};

    for (const slug of slugs) {
      try {
        const article = readArticle(bundlePath(config.content.dir, slug), config.content.sourceFile);
        const status = article.frontmatter.status;
        byStatus[status] = (byStatus[status] ?? 0) + 1;
      } catch (err) {
        log.error(`pipeline_status: skipping ${slug}: ${err}`);
      }
    }

    // Count staged articles (populated in Phase 2)
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
