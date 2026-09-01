import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep native/heavy Node packages out of the server bundle; require them at
  // runtime instead. Argon2 ships a platform-specific .node binary.
  serverExternalPackages: ["@node-rs/argon2", "mongodb"],
  // CLAUDE.md is a hand-curated decisions file; don't let `next dev` append
  // its auto-generated agent-rules block to it on every run.
  agentRules: false,
};

export default nextConfig;
