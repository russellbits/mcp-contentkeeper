export type TransportMode = "stdio" | "http";

/** Returns true if the request is authorized to proceed.
 *  When no token is configured, all requests are allowed (Tailscale is the perimeter).
 *  When CK_TOKEN is set, the request must carry a matching Bearer token. */
export function isAuthorized(
  configuredToken: string | undefined,
  authHeader: string | undefined
): boolean {
  if (!configuredToken) return true;
  return authHeader === `Bearer ${configuredToken}`;
}

export function resolveTransport(
  argv: string[],
  env: Record<string, string | undefined>
): TransportMode {
  if (argv.includes("--http") || env.CK_TRANSPORT === "http") return "http";
  return "stdio";
}

export function resolvePort(env: Record<string, string | undefined>): number {
  const parsed = parseInt(env.CK_PORT ?? "", 10);
  return isNaN(parsed) ? 6070 : parsed;
}
