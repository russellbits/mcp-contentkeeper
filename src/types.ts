// ─── Article Status ──────────────────────────────────────────────────────────

export const VALID_STATUSES = [
    "pitch",
    "draft",
    "review",
    "ready",
    "scheduled",
    "published",
    "re-pub",
    "archived",
] as const;

export type ArticleStatus = (typeof VALID_STATUSES)[number];

// Transitions that are unusual enough to warrant a warning (but not blocked)
export const UNUSUAL_TRANSITIONS: Array<[ArticleStatus, ArticleStatus]> = [
    ["pitch", "published"],
    ["pitch", "scheduled"],
    ["draft", "published"],
    ["archived", "published"],
];

// ─── Frontmatter ─────────────────────────────────────────────────────────────

export interface ArticleFrontmatter {
    title: string;
    status: ArticleStatus;
    created: string; // ISO date string
    modified: string; // ISO date string — auto-updated on write
    subtitle?: string;
    summary?: string;
    slug?: string; // override; defaults to bundle directory name
    tags?: string[];
    author?: string;
    [key: string]: unknown; // preserve custom fields
}

// ─── Article Bundle ───────────────────────────────────────────────────────────

export interface Article {
    slug: string; // canonical slug (bundle dir name)
    frontmatter: ArticleFrontmatter;
    body: string; // markdown body (without frontmatter)
    bundlePath: string; // absolute path to bundle directory
    mediaFiles: string[]; // filenames in media/ (may be empty)
}

export interface ArticleSummary {
    slug: string;
    title: string;
    status: ArticleStatus;
    created: string;
    modified: string;
    tags: string[];
    hasMedia: boolean;
}

// ─── Config ───────────────────────────────────────────────────────────────────

export interface ProjectConfig {
    name: string;
    author?: string;
    baseUrl?: string;
}

export interface ContentConfig {
    dir: string; // relative to project root
    extension: string; // ".md"
    defaultStatus: ArticleStatus;
    sourceFile: string; // filename of the canonical article file — e.g. "index.md", "article.md", "essay.md"
}

export interface StagingConfig {
    dir: string; // relative to project root
    format: "svx" | "mdx" | "md";
    filenamePattern: string; // e.g. "[slug]/+page.svx"
}

export interface BuildConfig {
    adapter: "shell";
    command: string;
    outputDir: string;
    validationFiles: string[];
}

export type FtpSyncMode = "additive" | "mirror";

export interface DeployConfig {
    adapter: "ftp";
    host: string;
    port: number;
    user: string;
    password: string;
    remotePath: string;
    sync: FtpSyncMode;
}

export interface ContentkeeperConfig {
    project: ProjectConfig;
    content: ContentConfig;
    staging: StagingConfig;
    build: BuildConfig;
    deploy: DeployConfig;
    statuses: ArticleStatus[];
}

// ─── Build / Deploy State ─────────────────────────────────────────────────────

export interface BuildResult {
    success: boolean;
    exitCode: number;
    stdout: string;
    stderr: string;
    timestamp: string;
    durationMs: number;
}

export interface DeployResult {
    success: boolean;
    timestamp: string;
    filesTransferred: number;
    durationMs: number;
    error?: string;
}

// ─── Tool Response Helpers ────────────────────────────────────────────────────

export interface ToolSuccess<T = unknown> {
    ok: true;
    data: T;
}

export interface ToolError {
    ok: false;
    error: string;
}
