import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "node",
    // proxy.test.ts is colocated with proxy.ts at the repo root (same
    // convention as lib/x.ts + lib/x.test.ts), not under lib/.
    include: ["lib/**/*.test.ts", "proxy.test.ts"],
  },
  resolve: {
    // Mirror tsconfig's "@/*" -> "./*" so tests can import modules that use the
    // alias (e.g. proxy.ts importing "@/lib/session").
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
});
