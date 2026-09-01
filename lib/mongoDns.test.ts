import { describe, it, expect, vi } from "vitest";
import { resolveMongoDns, dnsHostOf } from "./mongoDns";

describe("resolveMongoDns — srv path", () => {
  it("does an SRV lookup on _mongodb._tcp.<host> and reports the record count", async () => {
    const resolveSrv = vi.fn().mockResolvedValue([{}, {}, {}]); // three shard records
    const lookup = vi.fn();

    const result = await resolveMongoDns(
      "mongodb+srv://",
      "portfolioadmin.b5nppww.mongodb.net",
      { resolveSrv, lookup },
    );

    // SRV, never an A-record lookup.
    expect(resolveSrv).toHaveBeenCalledWith(
      "_mongodb._tcp.portfolioadmin.b5nppww.mongodb.net",
    );
    expect(lookup).not.toHaveBeenCalled();
    expect(result).toEqual({
      kind: "srv",
      queryName: "_mongodb._tcp.portfolioadmin.b5nppww.mongodb.net",
      recordCount: 3,
    });
  });

  it("propagates an SRV resolution failure to the caller", async () => {
    const resolveSrv = vi
      .fn()
      .mockRejectedValue(
        Object.assign(new Error("querySrv ENOTFOUND"), { code: "ENOTFOUND" }),
      );
    await expect(
      resolveMongoDns("mongodb+srv://", "nope.mongodb.net", {
        resolveSrv,
        lookup: vi.fn(),
      }),
    ).rejects.toThrow();
  });
});

describe("resolveMongoDns — plain path", () => {
  it("does a plain host lookup for mongodb:// and no SRV query", async () => {
    const resolveSrv = vi.fn();
    const lookup = vi.fn().mockResolvedValue({ address: "127.0.0.1", family: 4 });

    const result = await resolveMongoDns("mongodb://", "localhost:27017", {
      resolveSrv,
      lookup,
    });

    expect(lookup).toHaveBeenCalledWith("localhost");
    expect(resolveSrv).not.toHaveBeenCalled();
    expect(result).toEqual({ kind: "plain", host: "localhost" });
  });
});

describe("dnsHostOf", () => {
  it("takes the first host and strips the port", () => {
    expect(dnsHostOf("h1.example.com:27017,h2.example.com:27017")).toBe(
      "h1.example.com",
    );
    expect(dnsHostOf("cluster0.ab12c.mongodb.net")).toBe(
      "cluster0.ab12c.mongodb.net",
    );
  });
});
