/**
 * DNS resolution the way MongoDB does it, isolated so it can be unit-tested
 * with injected resolvers (no real network in tests).
 *
 * The key rule: a `mongodb+srv://` URI must be resolved with an SRV lookup on
 * `_mongodb._tcp.<host>`. Atlas SRV hosts have NO A record by design, so a
 * plain host lookup will always fail for them. A `mongodb://` URI uses a plain
 * host lookup.
 */

export interface DnsResolvers {
  resolveSrv: (name: string) => Promise<unknown[]>;
  lookup: (host: string) => Promise<unknown>;
}

export type DnsCheckResult =
  | { kind: "srv"; queryName: string; recordCount: number }
  | { kind: "plain"; host: string };

/** Host portion for DNS: first host, port stripped. */
export function dnsHostOf(host: string): string {
  return host.split(",")[0].replace(/:\d+$/, "");
}

/** Resolve DNS for a connection string. Throws if resolution fails. */
export async function resolveMongoDns(
  scheme: string,
  host: string,
  deps: DnsResolvers,
): Promise<DnsCheckResult> {
  const h = dnsHostOf(host);
  if (scheme.includes("+srv")) {
    const queryName = "_mongodb._tcp." + h;
    const records = await deps.resolveSrv(queryName);
    return { kind: "srv", queryName, recordCount: records.length };
  }
  await deps.lookup(h);
  return { kind: "plain", host: h };
}
