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
    const value = trimmed.slice(eq + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
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

  // Default sourceFile for projects that don't specify it
  config.content.sourceFile ??= "index.md";

  return config;
}
