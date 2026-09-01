import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep native/heavy Node packages out of the server bundle; require them at
  // runtime instead. Argon2 ships a platform-specific .node binary.
  serverExternalPackages: ["@node-rs/argon2", "mongodb"],
};

export default nextConfig;
